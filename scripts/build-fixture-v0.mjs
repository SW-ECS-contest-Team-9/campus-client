// 옛 방식(v0): 도로망 pg_dump(schema mobility) → 지도 꾸러미 v1(경로 지표 없음). 앱 내장 지도가 아니라 옛 꾸러미 호환 시험용.
// 사용: node scripts/build-fixture-v0.mjs <dump.sql> <출력 폴더>  → route-v0-package.json, route-v0-report.json
// 내장 지도(campus-fixture.json)는 scripts/build-fixture.mjs(백엔드 공개 꾸러미)로 만든다. 둘 다 빠지면 멈춘다(덮어쓰기 방지).
// 편집기 표(editor_*, edits)는 읽지 않는다. 사람·이동 자료는 넣지 않는다.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

const [src, outDir] = process.argv.slice(2);
if (!src || !outDir) {
  console.error('사용: node scripts/build-fixture-v0.mjs <dump.sql> <출력 폴더>');
  process.exit(2);
}
const text = fs.readFileSync(src, 'utf8');

// ---- COPY 블록 읽기 ----
function readCopy(table) {
  const re = new RegExp(`^COPY mobility\\.${table} \\(([^)]*)\\) FROM stdin;\\r?\\n`, 'm');
  const m = re.exec(text);
  if (!m) throw new Error(`COPY ${table} 없음`);
  const cols = m[1].split(',').map((s) => s.trim());
  const start = m.index + m[0].length;
  const end = text.indexOf('\n\\.', start - 1);
  const body = text.slice(start, end).replace(/\r/g, '');
  if (!body.trim()) return [];
  return body
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const vals = line.split('\t').map(unescapeCopy);
      return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
    });
}
function unescapeCopy(v) {
  if (v === '\\N') return null;
  return v.replace(/\\(.)/g, (_, c) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' })[c] ?? c);
}

// ---- 16진 EWKB 풀기 ----
function parseEwkb(hex) {
  const buf = Buffer.from(hex, 'hex');
  let o = 0;
  function geom() {
    const le = buf[o] === 1;
    o += 1;
    const u32 = () => {
      const v = le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
      o += 4;
      return v;
    };
    const f64 = () => {
      const v = le ? buf.readDoubleLE(o) : buf.readDoubleBE(o);
      o += 8;
      return v;
    };
    const t = u32();
    const hasZ = (t & 0x80000000) !== 0;
    const hasM = (t & 0x40000000) !== 0;
    const hasSrid = (t & 0x20000000) !== 0;
    const base = t & 0xffff;
    const srid = hasSrid ? u32() : null;
    const pt = () => {
      const x = f64(),
        y = f64();
      const z = hasZ ? f64() : null;
      if (hasM) f64();
      return z == null ? [x, y] : [x, y, z];
    };
    const pts = () => {
      const n = u32();
      const a = [];
      for (let i = 0; i < n; i++) a.push(pt());
      return a;
    };
    if (base === 1) return { type: 'Point', srid, coords: pt() };
    if (base === 2) return { type: 'LineString', srid, coords: pts() };
    if (base === 3) {
      const n = u32();
      const rings = [];
      for (let i = 0; i < n; i++) rings.push(pts());
      return { type: 'Polygon', srid, coords: rings };
    }
    if (base >= 4 && base <= 6) {
      const n = u32();
      const parts = [];
      for (let i = 0; i < n; i++) parts.push(geom());
      return { type: ['MultiPoint', 'MultiLineString', 'MultiPolygon'][base - 4], srid, parts };
    }
    throw new Error(`지원 안 하는 도형 ${base}`);
  }
  return geom();
}

const report = { source: path.basename(src), counts: {}, unmapped: [], notes: [] };
const unmapped = (what, id, why) => report.unmapped.push({ what, id, why });
const r2 = (v) => Math.round(v * 100) / 100;

const rawNodes = readCopy('network_nodes');
const rawRoads = readCopy('road_segments');
const rawPlaces = readCopy('places');
const rawAreas = readCopy('open_areas');
for (const t of ['corridors', 'portals']) {
  const n = readCopy(t).length;
  if (n) report.notes.push(`${t} ${n}행은 꾸러미에 넣지 않음`);
}

// ---- 층 이름 풀기: "북악관_5F_추정" → {building, code} ----
function parseLevel(levelId) {
  if (!levelId) return null;
  const m = /^(.+?)_(B\d+|\d+F)(_추정)?$/.exec(levelId);
  if (!m) return { bad: true };
  return { building: m[1], code: m[2], estimated: !!m[3] };
}
const sortOrderOf = (code) => (code.startsWith('B') ? -Number(code.slice(1)) : Number(code.slice(0, -1)));

const buildings = new Map(); // key → building
const BUILDING_NAMES = { '은주관#2관': '은주2관', '추가-상승관': '상승관' };
const BUILDING_ALIASES = { 은주관: ['은주1관'], '은주관#2관': ['은주관 2관'] };
function building(id) {
  if (!id) return null;
  const key = `b:${id}`;
  if (!buildings.has(key)) {
    buildings.set(key, { key, name: BUILDING_NAMES[id] ?? id, aliases: BUILDING_ALIASES[id] ?? [], center: null, footprint: null });
  }
  return key;
}
const floors = new Map();
function floor(bId, code, estimated) {
  const bKey = building(bId);
  const key = `f:${bId}:${code}`;
  if (!floors.has(key))
    floors.set(key, {
      key,
      buildingKey: bKey,
      code,
      sortOrder: sortOrderOf(code),
      floorZ: null,
      zEstimated: true,
      _est: estimated,
      _z: [],
    });
  return key;
}

// ---- 길 ----
const ACTIVE = new Set(['DRAFT', 'APPROVED']);
const roads = rawRoads.filter((r) => ACTIVE.has(r.status));
report.counts.roadSegmentsTotal = rawRoads.length;
report.counts.roadSegmentsActive = roads.length;
function kindOf(r) {
  switch (r.structure) {
    case 'stairs':
      return 'stairs';
    case 'elevator':
      return 'elevator';
    case 'indoor_corridor':
      return 'corridor';
    case 'sidewalk':
      return 'sidewalk';
    case 'crossing':
      return 'crossing';
    case 'ramp':
      return 'ramp';
  }
  if (r.road_class === 'vehicle' && r.structure === 'ordinary') return 'vehicle_road';
  if (r.structure !== 'ordinary') unmapped('road_segment.structure', r.id, `structure ${r.structure} → walkway 로 둠`);
  return 'walkway';
}
const dirOf = (d) => (d === 'forward' || d === 'backward' ? d : 'both');
const accessOf = (a) => (a === 'allowed' || a === 'prohibited' ? a : 'unknown');

const nodeById = new Map(rawNodes.map((n) => [n.id, n]));
const edges = [];
const incident = new Map(); // node id → road[]
for (const r of roads) {
  if (!nodeById.has(r.from_node_id) || !nodeById.has(r.to_node_id)) {
    unmapped('road_segment', r.id, '끝 노드가 network_nodes 에 없음');
    continue;
  }
  if (r.from_node_id === r.to_node_id) {
    unmapped('road_segment', r.id, '양 끝 노드가 같음');
    continue;
  }
  const g = parseEwkb(r.geom);
  if (g.type !== 'LineString') {
    unmapped('road_segment', r.id, `도형 ${g.type}`);
    continue;
  }
  const geometry = g.coords.map(([x, y, z]) => [r2(x), r2(y), r2(z ?? 0)]);
  let len = 0;
  for (let i = 1; i < g.coords.length; i++) {
    const [a, b] = [g.coords[i - 1], g.coords[i]];
    len += Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] ?? 0) - (a[2] ?? 0));
  }
  if (!(len > 0)) {
    unmapped('road_segment', r.id, '길이 0');
    continue;
  }
  const lvl = parseLevel(r.level_id);
  if (lvl?.bad) unmapped('road_segment.level_id', r.id, `층 이름 해석 못 함 ${r.level_id}`);
  r._lvl = lvl && !lvl.bad ? lvl : null;
  for (const nid of [r.from_node_id, r.to_node_id]) {
    if (!incident.has(nid)) incident.set(nid, []);
    incident.get(nid).push(r);
  }
  building(r.building_id);
  edges.push({
    key: `e:${r.id}`,
    from: `n:${r.from_node_id}`,
    to: `n:${r.to_node_id}`,
    name: r.name,
    kind: kindOf(r),
    direction: dirOf(r.pedestrian_direction),
    pedestrianAccess: accessOf(r.pedestrian_access),
    wheelchairAccess: accessOf(r.wheelchair_access),
    lengthM: r2(len),
    stepCount: null,
    widthM: r.width_m == null ? null : Number(r.width_m),
    geometry,
    estimated: (r.level_id ?? '').includes('추정') || r.status === 'DRAFT',
  });
}
report.notes.push('status DRAFT 길도 넣음(원천이 거의 DRAFT). estimated=true 로 표시');

// ---- 노드: 이어진 길에서 건물·층을 정함 ----
const nodes = [];
for (const [nid, rs] of incident) {
  const n = nodeById.get(nid);
  const g = parseEwkb(n.geom);
  const [x, y, z] = g.coords;
  const bIds = [...new Set(rs.map((r) => r.building_id).filter(Boolean))];
  let location = 'outdoor',
    bKey = null,
    fKey = null;
  if (bIds.length > 0) {
    location = 'indoor';
    if (bIds.length > 1) unmapped('network_node', nid, `여러 건물 길이 만남 ${bIds.join(',')} → 첫 건물`);
    bKey = building(bIds[0]);
    let lvl = parseLevel(n.level_id);
    if (lvl?.bad) {
      unmapped('network_node.level_id', nid, `층 이름 해석 못 함 ${n.level_id} → 층 모름`);
      lvl = null;
    }
    if (!lvl) {
      // 노드에 층이 없으면, 이어진 수평 길(계단·승강기 아님)이 한 층으로 모이면 그 층
      const lv = [
        ...new Set(
          rs
            .filter((r) => r.structure !== 'stairs' && r.structure !== 'elevator' && r._lvl)
            .map((r) => `${r._lvl.building}|${r._lvl.code}`),
        ),
      ];
      if (lv.length === 1) {
        const [b, c] = lv[0].split('|');
        lvl = { building: b, code: c, estimated: true };
      }
    }
    if (lvl) {
      fKey = floor(lvl.building, lvl.code, lvl.estimated);
      floors.get(fKey)._z.push(z ?? 0);
      if (lvl.building !== bIds[0]) bKey = building(lvl.building);
    }
  } else if (n.level_id) {
    unmapped('network_node', nid, `건물 길이 없는데 level_id ${n.level_id} → outdoor`);
  }
  nodes.push({
    key: `n:${nid}`,
    location,
    buildingKey: bKey,
    floorKey: fKey,
    kind: n.kind ?? 'junction',
    x: r2(x),
    y: r2(y),
    z: r2(z ?? 0),
    estimated: (n.level_id ?? '').includes('추정'),
  });
}
report.counts.networkNodesTotal = rawNodes.length;
report.counts.networkNodesOrphan = rawNodes.length - nodes.length;
// 길 없는 노드는 넣지 않음(경로에 못 씀)

for (const f of floors.values()) {
  f.floorZ = f._z.length ? r2(f._z.reduce((a, b) => a + b, 0) / f._z.length) : null;
  f.zEstimated = true;
  delete f._z;
  delete f._est;
}

// ---- 장소 ----
const walkableNode = new Set();
for (const e of edges)
  if (e.pedestrianAccess !== 'prohibited') {
    walkableNode.add(e.from);
    walkableNode.add(e.to);
  }
const places = [];
for (const p of rawPlaces) {
  if (p.status && !ACTIVE.has(p.status)) continue;
  const g = parseEwkb(p.geom);
  if (g.type !== 'Point') {
    unmapped('place', p.id, `도형 ${g.type}`);
    continue;
  }
  const [x, y, z] = g.coords;
  const bKey = building(p.building_id);
  const lvl = parseLevel(p.level_id);
  const fKey = lvl && !lvl.bad ? floor(lvl.building, lvl.code, lvl.estimated) : null;
  let best = null,
    bestD = Infinity;
  for (const n of nodes) {
    if (!walkableNode.has(n.key)) continue;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  const nodeKey = best && bestD <= 25 ? best.key : null;
  if (!nodeKey) unmapped('place.node', p.id, `${p.name}: 25 m 안에 걸을 수 있는 노드 없음 (가장 가까움 ${r2(bestD)} m)`);
  places.push({
    key: `p:${p.id}`,
    location: bKey ? 'indoor' : 'outdoor',
    buildingKey: bKey,
    floorKey: fKey,
    nodeKey,
    name: p.name,
    aliases: [],
    category: p.category ?? 'other',
    x: r2(x),
    y: r2(y),
    z: r2(z ?? 0),
  });
}
report.notes.push('places 에 층(level_id)이 하나도 없음 → 장소 층은 전부 모름. 건물 있는 장소는 indoor 로 둠(입구 포함)');

// ---- 걷는 면 ----
const AREA_KIND = { field: 'field', plaza: 'plaza', parking: 'parking_aisle' };
const walkAreas = [],
  walkAreaNodes = [];
function inPoly(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distToRing(x, y, ring) {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1],
      [bx, by] = ring[i];
    const dx = bx - ax,
      dy = by - ay,
      L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
  }
  return best;
}
for (const a of rawAreas) {
  const g = parseEwkb(a.geom);
  if (g.type !== 'Polygon') {
    unmapped('open_area', a.id, `도형 ${g.type}`);
    continue;
  }
  const ring = g.coords[0].map(([x, y]) => [r2(x), r2(y)]);
  const key = `a:${a.id}`;
  const zA = a.elevation_m == null ? null : Number(a.elevation_m);
  if (!AREA_KIND[a.kind]) report.notes.push(`open_area ${a.id} kind ${a.kind} → other`);
  walkAreas.push({
    key,
    location: 'outdoor',
    floorKey: null,
    name: a.name,
    kind: AREA_KIND[a.kind] ?? 'other',
    polygon: ring,
    z: zA,
    estimated: true,
  });
  for (const n of nodes) {
    if (n.location !== 'outdoor') continue;
    if (zA != null && Math.abs(n.z - zA) > 3) continue;
    if (inPoly(n.x, n.y, ring) || distToRing(n.x, n.y, ring) <= 3) walkAreaNodes.push({ areaKey: key, nodeKey: n.key });
  }
}
report.notes.push(
  'open_areas 는 건물 없음 → 지하 주차장 면도 outdoor 로 둠(층 없음). 면-노드 연결 = 면 안 또는 경계 3 m 안 + 높이차 3 m 안',
);

const pkg = {
  schemaVersion: 1,
  release: { version: 0, createdAt: new Date().toISOString().slice(0, 10), source: `fixture:${path.basename(src)}` },
  campus: { code: 'skuniv', name: '서경대학교', crs: 5186 },
  buildings: [...buildings.values()].sort((a, b) => a.key.localeCompare(b.key)),
  floors: [...floors.values()].sort((a, b) => a.key.localeCompare(b.key)),
  nodes,
  edges,
  places,
  walkAreas,
  walkAreaNodes,
};
// 건물 중심 = 그 건물 노드·장소 평균 (외곽선은 원천에 없음)
for (const b of pkg.buildings) {
  const pts = [...nodes.filter((n) => n.buildingKey === b.key), ...places.filter((p) => p.buildingKey === b.key)];
  b.center = pts.length ? [r2(pts.reduce((s, p) => s + p.x, 0) / pts.length), r2(pts.reduce((s, p) => s + p.y, 0) / pts.length)] : null;
}
report.notes.push('건물 외곽선(footprint)은 이 덤프에 없음 → null');

const countBy = (arr, f) => arr.reduce((m, o) => ((m[f(o)] = (m[f(o)] ?? 0) + 1), m), {});
Object.assign(report.counts, {
  buildings: pkg.buildings.length,
  floors: pkg.floors.length,
  nodes: nodes.length,
  edges: edges.length,
  places: places.length,
  placesWithoutNode: places.filter((p) => !p.nodeKey).length,
  walkAreas: walkAreas.length,
  walkAreaNodes: walkAreaNodes.length,
  edgesByKind: countBy(edges, (e) => e.kind),
  nodesByLocation: countBy(nodes, (n) =>
    n.location === 'outdoor' ? 'outdoor' : n.floorKey ? 'indoor_floor_known' : 'indoor_floor_unknown',
  ),
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'route-v0-package.json'), JSON.stringify(pkg));
fs.writeFileSync(path.join(outDir, 'route-v0-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.counts, null, 2));
console.log(`unmapped ${report.unmapped.length}건`);
