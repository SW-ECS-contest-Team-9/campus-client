// 앱 내장 지도: 백엔드 공개 꾸러미(경로 지표·routeModes 포함) → src/map/fixture/campus-fixture.json + fixture-report.json.
// 사용: node scripts/build-fixture.mjs [공개 꾸러미 JSON]
//   빼면 ../campus-backend/data/releases 의 skuniv-v*.json 중 version 이 가장 큰 것.
// 지표나 routeModes 가 없는 꾸러미(옛 v0 형식)는 받지 않는다. 꾸러미는 바이트 그대로 복사(sha256 이 서버와 같게).
// 옛 도로망 덤프 변환은 scripts/build-fixture-v0.mjs(시험용, 출력 폴더 필수).
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'src/map/fixture';
const RELEASES = '../campus-backend/data/releases';

function latestRelease() {
  const files = fs.existsSync(RELEASES) ? fs.readdirSync(RELEASES).filter((f) => /^skuniv-v\d+-.*\.json$/.test(f)) : [];
  if (!files.length) throw new Error(`${RELEASES} 에 공개 꾸러미가 없음. 경로를 직접 주세요.`);
  const ver = (f) => Number(/-v(\d+)-/.exec(f)[1]);
  return path.join(RELEASES, files.sort((a, b) => ver(b) - ver(a))[0]);
}

const src = process.argv[2] ?? latestRelease();
const text = fs.readFileSync(src, 'utf8');
const pkg = JSON.parse(text);
const fail = (m) => {
  console.error(`${src}: ${m} — 내장 지도를 바꾸지 않음`);
  process.exit(1);
};
if (pkg.schemaVersion !== 1) fail(`schemaVersion ${pkg.schemaVersion}`);
for (const k of ['buildings', 'floors', 'nodes', 'edges', 'places', 'walkAreas', 'walkAreaNodes'])
  if (!Array.isArray(pkg[k])) fail(`${k} 없음`);
if (!pkg.routeModes) fail('routeModes 없음(옛 형식)');
const withInd = pkg.edges.filter((e) => e.indicators).length;
if (withInd < pkg.edges.length) fail(`지표 없는 길 ${pkg.edges.length - withInd}개`);

const countBy = (arr, f) => arr.reduce((m, o) => ((m[f(o)] = (m[f(o)] ?? 0) + 1), m), {});
const known = (f) => pkg.edges.filter((e) => e.indicators[f] !== null && e.indicators[f] !== undefined).length;
const report = {
  source: path.basename(src),
  release: pkg.release,
  counts: {
    buildings: pkg.buildings.length,
    floors: pkg.floors.length,
    nodes: pkg.nodes.length,
    edges: pkg.edges.length,
    places: pkg.places.length,
    placesWithoutNode: pkg.places.filter((p) => !p.nodeKey).length,
    walkAreas: pkg.walkAreas.length,
    walkAreaNodes: pkg.walkAreaNodes.length,
    edgesByKind: countBy(pkg.edges, (e) => e.kind),
    nodesByLocation: countBy(pkg.nodes, (n) =>
      n.location === 'outdoor' ? 'outdoor' : n.floorKey ? 'indoor_floor_known' : 'indoor_floor_unknown',
    ),
    floorsByBuilding: Object.fromEntries(
      pkg.buildings.map((b) => [
        b.name,
        pkg.floors
          .filter((f) => f.buildingKey === b.key)
          .sort((x, y) => x.sortOrder - y.sortOrder)
          .map((f) => f.code),
      ]),
    ),
  },
  // 경로 지표 중 값이 있는 길 수(없음 = 모름)
  indicators: {
    edges: withInd,
    coveredRatio: known('coveredRatio'),
    litRatio: known('litRatio'),
    maxSlopePct: known('maxSlopePct'),
    vehicle: known('vehicle'),
    wheelchair: countBy(pkg.edges, (e) => e.indicators.wheelchair ?? 'unknown'),
  },
  routeModes: Object.keys(pkg.routeModes),
};

fs.copyFileSync(src, path.join(OUT, 'campus-fixture.json'));
fs.writeFileSync(path.join(OUT, 'fixture-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.source} (v${pkg.release.version}) → ${OUT}/campus-fixture.json`);
console.log(JSON.stringify(report.counts.edgesByKind));
