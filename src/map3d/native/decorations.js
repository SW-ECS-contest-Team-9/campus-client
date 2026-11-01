// Native port of the reviewed ship prototypes. No DOM, network, or renderer ownership.
import * as THREE from 'three';
import { createOcean } from './ocean';
import islandData from './islandGeometry.json';
import skuLogo from './skuLogo.json';

import { normalizeMapTheme } from './mapTheme';
export { normalizeMapTheme } from './mapTheme';
export function createDecorations(scene,root,{lowSpec=false}={}) {
 const box=new THREE.Box3().setFromObject(root),C=box.getCenter(new THREE.Vector3());
 const R=Math.max(20,box.max.x-box.min.x,box.max.z-box.min.z)/2,bottom=box.min.y;
 const originalBackground=scene.background,originalFog=scene.fog;
 const lights=scene.children.filter(n=>n.isHemisphereLight||n.isDirectionalLight);
 const originals=lights.map(l=>({light:l,color:l.color.clone(),ground:l.groundColor?.clone(),intensity:l.intensity,position:l.position.clone()}));
 function light(sky,ground,hi,sun,si,pos){for(const l of lights){if(l.isHemisphereLight){l.color.setHex(sky);l.groundColor.setHex(ground);l.intensity=hi;}else{l.color.setHex(sun);l.intensity=si;l.position.copy(pos);}}}
 const rand=(a,b)=>a+Math.random()*(b-a);
 let EDGE=[],theme=null,current='default',motion=false,last=-Infinity,elapsed=0;
 const holder=new THREE.Group();holder.name='campus-decoration';holder.userData.decorationOnly=true;scene.add(holder);
function computeEdge(root, N = 120) {
  const r = new Float32Array(N), y = new Float32Array(N).fill(Infinity), v = new THREE.Vector3(), pts = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !/^(structures|surfaces)$/.test(o.name)) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const d = Math.hypot(v.x - C.x, v.z - C.z);
      const k = Math.floor(((Math.atan2(v.z - C.z, v.x - C.x) + Math.PI) / (Math.PI * 2)) * N) % N;
      pts.push(k, d, v.y); if (d > r[k]) r[k] = d;
    }
  });
  for (let i = 0; i < pts.length; i += 3) { const k = pts[i]; if (pts[i + 1] >= r[k] - 4 && pts[i + 2] < y[k]) y[k] = pts[i + 2]; }
  const out = [];
  for (let k = 0; k < N; k++) {
    const rr = [r[(k + N - 1) % N], r[k], r[(k + 1) % N]].sort((a, b) => a - b)[1];
    const a = ((k + 0.5) / N) * Math.PI * 2 - Math.PI;
    out.push({ x: C.x + Math.cos(a) * rr, z: C.z + Math.sin(a) * rr, y: Number.isFinite(y[k]) ? y[k] : bottom, a });
  }
  return out;
}
/** 외곽선 위치(가로 비율 s, 깊이 f) → 점. 각 가장자리의 땅 높이에서 바로 내려감 */
function hullPoint(e, s, f, depth) {
  return new THREE.Vector3(C.x + (e.x - C.x) * s, e.y - f * depth, C.z + (e.z - C.z) * s);
}
let EDGE_LOW = 0;  // 외곽선 땅 높이 중 가장 낮은 값
/** 외곽선을 따라 내려가는 선체. rings: [{ f(깊이 비율), s(가로 비율), color }] 위에서 아래로 */
function hull(rings, depth) {
  const N = EDGE.length, pos = [], col = [], idx = [], c = new THREE.Color();
  rings.forEach((rg) => EDGE.forEach((e) => { const p = hullPoint(e, rg.s, rg.f, depth); pos.push(p.x, p.y, p.z); c.setHex(rg.color); col.push(c.r, c.g, c.b); }));
  for (let l = 0; l < rings.length - 1; l++) for (let k = 0; k < N; k++) {
    const a = l * N + k, b = l * N + ((k + 1) % N); idx.push(a, a + N, b, b, a + N, b + N);
  }
  const L = rings.length - 1, tip = pos.length / 3, last = rings[L];
  pos.push(C.x, EDGE_LOW - last.f * depth - depth * 0.08, C.z); c.setHex(last.color); col.push(c.r, c.g, c.b);
  for (let k = 0; k < N; k++) idx.push(L * N + ((k + 1) % N), L * N + k, tip);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed(); g.dispose(); ng.computeVertexNormals();
  return new THREE.Mesh(ng, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
}
/** 외곽선에서 방향 a(라디안)에 가장 가까운 점 */
const angDiff = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
const edgeAt = (a) => EDGE.reduce((b, e) => (angDiff(e.a, a) < angDiff(b.a, a) ? e : b));
function clouds(n, spread, y, color = 0xffffff, opacity = 0.9) {
  const grp = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity });
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(rand(12, 26), 10, 8), mat); s.position.set(rand(-35, 35), rand(-6, 8), rand(-18, 18)); c.add(s); }
    const a = rand(0, Math.PI * 2), d = rand(R * 1.6, spread);
    c.position.set(C.x + Math.cos(a) * d, y + rand(-40, 40), C.z + Math.sin(a) * d); c.userData.speed = rand(0.03, 0.08); grp.add(c);
  }
  return grp;
}

const metal = (c = 0xc4ccd5) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 });
/** 두 점 사이를 잇는 상자(기둥·목) */
function strut(a, b, w, h, mat) {
  const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
  return m;
}
/** 함선형: 캠퍼스 = 원반, 아래 목 → 기관부 동체(앞 디플렉터), 뒤 위로 워프 나셀 둘 */
function trekParts(deco, D, flames, glows) {
  const yHull = EDGE_LOW - D * 1.55, xHull = C.x - R * 0.75, hullLen = R * 1.3, hr = R * 0.17;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(hr, hullLen, 6, 16), metal(0xb9c2cc));
  body.rotation.z = Math.PI / 2; body.position.set(xHull, yHull, C.z); deco.add(body);
  const dish = new THREE.Mesh(new THREE.CircleGeometry(hr * 0.8, 24), glowMat(0x7fd8ff));
  dish.rotation.y = Math.PI / 2; dish.position.set(xHull + hullLen / 2 + hr * 0.75, yHull, C.z); deco.add(dish); glows.push(dish);
  deco.add(strut(new THREE.Vector3(C.x - R * 0.2, EDGE_LOW - D * 0.75, C.z), new THREE.Vector3(xHull + R * 0.2, yHull + hr * 0.6, C.z), R * 0.07, R * 0.18, metal(0xa9b2bc)));
  for (const s of [-1, 1]) {
    const nx = C.x - R * 1.45, ny = EDGE_LOW - D * 0.35, nz = C.z + s * R * 0.62, nl = R * 1.5, nr = R * 0.075;
    const nac = new THREE.Mesh(new THREE.CapsuleGeometry(nr, nl, 6, 12), metal(0xc8d0d8)); nac.rotation.z = Math.PI / 2; nac.position.set(nx, ny, nz); deco.add(nac);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(nr * 1.02, 16, 12), glowMat(0xff4a3a)); cap.position.set(nx + nl / 2 + nr * 0.3, ny, nz); deco.add(cap); glows.push(cap);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(nl * 0.85, nr * 0.5, nr * 2.15), glowMat(0x5fb7ff)); strip.position.set(nx - nl * 0.05, ny, nz); deco.add(strip); glows.push(strip);
    deco.add(strut(new THREE.Vector3(xHull - R * 0.25, yHull + hr * 0.5, C.z + s * hr * 0.5), new THREE.Vector3(nx + R * 0.1, ny - nr, nz), R * 0.05, R * 0.03, metal(0xa9b2bc)));
  }
}
// ================= 테마 1: 캠퍼스 우주선 =================
function space() {
  const bg = new THREE.Group(), deco = new THREE.Group();
  scene.background = new THREE.Color(0x02030a); scene.fog = null;
  light(0xb8c6ff, 0x3a3050, 1.1, 0xffe2c0, 1.6, new THREE.Vector3(C.x - R * 5, C.y + R * 2, C.z - R * 6));
  // 선체: 밝은 금속 띠 → 어두운 아랫면, 위가 조금 넓은 접시 모양
  const D = R * 0.45;
  deco.add(hull([
    { f: 0, s: 1.0, color: 0xd5dbe2 }, { f: 0.04, s: 1.05, color: 0xd5dbe2 }, { f: 0.12, s: 1.04, color: 0x9aa4b0 },
    { f: 0.3, s: 0.94, color: 0xb7c0ca }, { f: 0.55, s: 0.76, color: 0x7d8692 }, { f: 0.8, s: 0.5, color: 0x5c6470 }, { f: 1, s: 0.22, color: 0x454b55 },
  ], D));
  // 가장자리 빛 띠(작은 등 120개, 물결치듯 깜박임)
  const lamps = [];
  EDGE.forEach((e, k) => {
    if (k % (lowSpec ? 12 : 4)) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), new THREE.MeshBasicMaterial({ color: 0x5ff3ff }));
    m.position.copy(hullPoint(e, 1.055, 0.08, D)); lamps.push(m); deco.add(m);
  });
  // 추진부: 기관부 동체·워프 나셀(함선형)
  const flames = [], glows = [];
  trekParts(deco, D, flames, glows);
  // 아랫면 돔(빛남)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 0.16, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8ff0ff }));
  dome.position.set(C.x, EDGE_LOW - D * 1.05, C.z); deco.add(dome);
  // 한림관 지붕: 안테나 깃대 + 깜박이는 빨간 등 + 잎사귀 깃발
  const fixed = new THREE.Group(), flagsAll = campusFlags(fixed, { poleColor: 0xcfd6de, height: 40, antenna: true }), hf = flagsAll[0];
  // 배경: 별, 고리 행성, 뒤로 흘러가는 소행성
  const n = lowSpec ? 180 : 700, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(1600, 3800)); pos.set([v.x + C.x, v.y + C.y, v.z + C.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 6 })); bg.add(stars);
  const planet = new THREE.Mesh(new THREE.SphereGeometry(R * 1.6, 20, 12), new THREE.MeshLambertMaterial({ color: 0xd98b4a }));
  planet.position.set(C.x - R * 6, C.y - R * 1.5, C.z - R * 7);
  const ring = new THREE.Mesh(new THREE.RingGeometry(R * 2.1, R * 3, 64), new THREE.MeshBasicMaterial({ color: 0xe8d3a8, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
  ring.rotation.x = Math.PI / 2.6; planet.add(ring); bg.add(planet);
  const rocks = new THREE.Group();
  for (let i = 0; i < (lowSpec ? 3 : 10); i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(3, 12)), new THREE.MeshLambertMaterial({ color: 0x6b6f7a, flatShading: true }));
    r.position.set(C.x + rand(-R * 4, R * 4), C.y + rand(-R, R), C.z + rand(-R * 3, R * 3)); rocks.add(r);
  }
  bg.add(rocks);
  return { group: bg, deco, fixed, tick(t) {
    waveFlags(flagsAll, t);
    lamps.forEach((m, k) => m.material.color.setHSL(0.5, 1, 0.45 + 0.25 * Math.sin(t * 4 - k * 0.3)));
    flames.forEach((f) => { f.scale.y = 0.8 + Math.random() * 0.45; f.material.opacity = 0.6 + Math.random() * 0.3; });
    hf.tip.visible = Math.floor(t * 2) % 2 === 0;
    glows.forEach((g, i) => (g.material.opacity = 0.65 + 0.3 * Math.sin(t * 3 + i)));
    stars.rotation.y = t * 0.01; planet.rotation.y = t * 0.03;
    rocks.children.forEach((r, i) => { r.position.x = C.x + ((t * 12 + i * 97) % (R * 8)) - R * 4; r.rotation.x = t * 0.4 + i; if (r.position.x > C.x + R * 4) r.position.x = C.x - R * 4; });
  } };
}

// ================= 테마 2: 캠퍼스 해적선(만화풍) =================
/** 캔버스로 그린 무늬 텍스처 */
function pattern(kind) {
 const isLogo=kind==='leaf'||kind==='flag',w=isLogo?512:64,h=kind==='flag'?320:w,data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const colored=kind==='stripe'&&Math.floor(x/8)%2===0;
  const c=colored?[113,191,68]:[246,239,220];const i=(y*w+x)*4;data.set([...c,255],i);
 }
 if(isLogo){let pixel=0;const offset=Math.floor((h-skuLogo.height)/2);for(let r=0;r<skuLogo.runs.length;r+=2){const count=skuLogo.runs[r],a=skuLogo.runs[r+1]/255;for(let j=0;j<count;j++,pixel++){const x=pixel%skuLogo.width,y=Math.floor(pixel/skuLogo.width)+offset,i=((h-1-y)*w+x)*4;for(let c=0;c<3;c++)data[i+c]=Math.round([246,239,220][c]*(1-a)+[111,186,44][c]*a);}}}
 const texture=new THREE.DataTexture(data,w,h);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
const SKULL_SAIL=()=>pattern('leaf'),STRIPE_SAIL=()=>pattern('stripe'),PLAIN_SAIL=()=>pattern('plain'),FLAG=()=>pattern('flag');
function sail(w, h, map) {
  const g = new THREE.PlaneGeometry(w, h, 8, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) / h + 0.5) * Math.PI) * Math.cos((p.getX(i) / w) * Math.PI) * w * 0.14); // 바람에 부푼 돛
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide }));
}
/** 매끄러운 외곽선: 반경을 이웃 최댓값으로 감싼 뒤 이웃 평균(급하게 꺾이지 않게), 높이도 평균 */
function smoothEdge(edges, wMax = 3, wAvg = 6) {
  const N = edges.length, r = edges.map((e) => Math.hypot(e.x - C.x, e.z - C.z));
  const rMax = r.map((_, k) => { let m = 0; for (let j = -wMax; j <= wMax; j++) m = Math.max(m, r[(k + j + N) % N]); return m; });
  return edges.map((e, k) => {
    let rs = 0, ys = 0;
    for (let j = -wAvg; j <= wAvg; j++) { rs += rMax[(k + j + N) % N]; ys += edges[(k + j + N) % N].y; }
    const rr = Math.max(rs / (2 * wAvg + 1), r[k]), a = Math.atan2(e.z - C.z, e.x - C.x);
    return { x: C.x + Math.cos(a) * rr, z: C.z + Math.sin(a) * rr, y: ys / (2 * wAvg + 1), a: e.a };
  });
}
/** 실제 캠퍼스 가장자리와 매끄러운 선 사이를 메우는 갑판 띠 */
function deckStrip(inner, outer, color) {
  const pos = [], idx = [], N = inner.length;
  inner.forEach((e) => pos.push(e.x, e.y - 0.3, e.z)); outer.forEach((e) => pos.push(e.x, e.y, e.z));
  for (let k = 0; k < N; k++) { const a = k, b = (k + 1) % N; idx.push(a, b, N + a, b, N + b, N + a); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}
function pirate() {
  const rawEdge = EDGE; EDGE = smoothEdge(rawEdge);
  try { return pirateBuild(rawEdge); } finally { EDGE = rawEdge; }
}
function pirateBuild(rawEdge) {
  const bg = new THREE.Group(), deco = new THREE.Group();
  scene.background = new THREE.Color(0x8fd0ff); scene.fog = new THREE.Fog(0x8fd0ff, R * 5, R * 16);
  light(0xffffff, 0x3a6a8a, 1.25, 0xfff2d6, 1.4, new THREE.Vector3(C.x + R * 3, C.y + R * 4, C.z + R * 2));
  // 선체: 흰 난간 → 연두 띠(학교 색, 둥근 창) → 금 띠 → 나무 → 짙은 아랫부분, 아래로 둥글게 좁아짐
  const D = R * 0.5;
  deco.add(hull([
    { f: 0, s: 1.0, color: 0xf4efe4 }, { f: 0.025, s: 1.06, color: 0xf4efe4 }, { f: 0.05, s: 1.06, color: 0x8cc63f },
    { f: 0.28, s: 1.05, color: 0x8cc63f }, { f: 0.31, s: 1.04, color: 0xe2b23c }, { f: 0.34, s: 1.03, color: 0x8b5a2b },
    { f: 0.5, s: 0.96, color: 0x7a4b22 }, { f: 0.7, s: 0.8, color: 0x6b4423 }, { f: 0.88, s: 0.55, color: 0x4e311a }, { f: 1, s: 0.28, color: 0x3b2614 },
  ], D));
  deco.add(deckStrip(rawEdge, EDGE, 0xb07a45));
  // 금테 두른 둥근 창(연두 띠)
  const gold = new THREE.MeshLambertMaterial({ color: 0xe2b23c }), glassM = new THREE.MeshLambertMaterial({ color: 0x2b3a4a });
  EDGE.forEach((e, k) => {
    if (k % (lowSpec ? 12 : 6)) return;
    const p = hullPoint(e, 1.065, 0.165, D), out = new THREE.Vector3(e.x - C.x, 0, e.z - C.z).normalize();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 1.1, 8, 20), gold), win = new THREE.Mesh(new THREE.CircleGeometry(4, 20), glassM);
    for (const m of [ring, win]) { m.position.copy(p).addScaledVector(out, m === win ? 0.3 : 0.6); m.lookAt(m.position.clone().add(out)); deco.add(m); }
  });
  // 돛대: 앞(줄무늬 돛) · 가운데(큰 잎사귀 돛 + 망대 + 깃발) · 뒤(작은 흰 돛)
  const wood = new THREE.MeshLambertMaterial({ color: 0x8b5a2b }), sails = [];
  [[0.15, 0.95, STRIPE_SAIL], [Math.PI / 2, 1.3, SKULL_SAIL], [Math.PI - 0.1, 0.85, PLAIN_SAIL]].forEach(([a, k, tex]) => {
    const base = hullPoint(edgeAt(a), 0.82, 0, D), h = R * 0.95 * k;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.8, h, 10), wood); mast.position.set(base.x, base.y + h / 2, base.z); deco.add(mast);
    const sw = R * 0.42 * k, sh = R * 0.32 * k;
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, sw * 1.1, 8), wood); yard.rotation.x = Math.PI / 2; yard.position.set(base.x, base.y + h * 0.82, base.z); deco.add(yard);
    const s = sail(sw, sh, tex());
    s.rotation.y = Math.PI / 2; s.position.set(base.x + 3, base.y + h * 0.82 - sh / 2, base.z); sails.push(s); deco.add(s);
    if (tex === SKULL_SAIL) {
      const nest = new THREE.Mesh(new THREE.CylinderGeometry(7, 5.5, 7, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0xa0693a, side: THREE.DoubleSide }));
      nest.position.set(base.x, base.y + h * 0.93, base.z); deco.add(nest);
    }
  });
  // 뱃머리 장식: 서경 초록 마스코트(흰 동그란 머리 + 고양이 귀 + 얼굴의 초록 전원 단추)
  const bow = hullPoint(edgeAt(0), 1.08, 0.05, D), head = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff }), green = new THREE.MeshBasicMaterial({ color: 0x2fbf4a });
  const ink = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide });
  const skullM = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 18), white); head.add(skullM);
  const outline = new THREE.Mesh(new THREE.SphereGeometry(14.6, 24, 18), ink); head.add(outline); // 검은 테두리 느낌
  for (const z of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(5, 9, 4), white); ear.position.set(-1, 13, z * 8); ear.rotation.x = z * 0.35; head.add(ear);
    const earO = new THREE.Mesh(new THREE.ConeGeometry(5.6, 9.8, 4), ink); earO.position.copy(ear.position); earO.rotation.copy(ear.rotation); head.add(earO);
  }
  // 전원 단추: 위가 트인 고리 + 세로 막대, 얼굴(+X)에 붙임
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 1.5, 8, 28, Math.PI * 1.6), green);
  ring.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.2); ring.position.set(13.6, -1, 0); head.add(ring);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7.5, 2.6), green); bar.position.set(14.2, 3, 0); head.add(bar);
  head.scale.setScalar(1.6); head.position.set(bow.x + 18, bow.y + 22, bow.z); deco.add(head);
  // 머리와 선체를 잇는 목(아래가 굵고 위가 가는 흰 기둥, 뱃머리 안쪽에서 시작)
  const neckA = hullPoint(edgeAt(0), 0.97, 0.12, D), neckB = head.position.clone().add(new THREE.Vector3(-6, -12, 0));
  const neckLen = neckA.distanceTo(neckB);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, neckLen, 16), new THREE.MeshLambertMaterial({ color: 0xf4efe4 }));
  neck.position.copy(neckA).add(neckB).multiplyScalar(0.5);
  neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), neckB.clone().sub(neckA).normalize());
  deco.add(neck);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(10.5, 2, 8, 20), new THREE.MeshLambertMaterial({ color: 0x8cc63f }));
  collar.position.copy(neckB).lerp(neckA, 0.15); collar.quaternion.copy(neck.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  deco.add(collar);
  // 배경: 맑은 하늘, 출렁이는 바다, 흰 구름
  const seaY = EDGE_LOW - D * 0.6;
  const sea = createOcean(C,R,seaY,lowSpec); bg.add(sea);
  const sky = clouds(lowSpec ? 2 : 5, R * 6, C.y + R * 2); bg.add(sky);
  const fixed = new THREE.Group(), flagsAll = campusFlags(fixed, {});
  return { group: bg, deco, fixed, tick(t) {
    sea.material.uniforms.time.value=t;
    sails.forEach((s, i) => (s.scale.z = 1 + Math.sin(t * 1.3 + i) * 0.15));
    head.rotation.x = Math.sin(t * 1.1) * 0.08;
    waveFlags(flagsAll, t);
    sky.children.forEach((c) => { c.position.x = C.x + ((t * c.userData.speed * 45 + c.id * 41) % (R * 12)) - R * 6; if (c.position.x > C.x + R * 6) c.position.x = C.x - R * 6; });
  } };
}

const THEMES = { trek: space, pirate };
// 앞(뱃머리·우주선 앞)은 정문 쪽. 정문 = EPSG:5186 (201134, 557105) → 장면 (x 16, z 157)
const GATE = new THREE.Vector3(16, 0, 157);
let FRONT = 0;
let HANLIM = null;  // 한림관(둥근 탑) 지붕 가운데: 주 깃발 꽂는 곳
let TOPS = [];       // 위 건물들의 가장 높은 덩어리 지붕 가운데
/** 한림관 지붕 깃대 + 잎사귀 깃발(캠퍼스 실제 좌표, 정문 방향 회전과 무관). 깃발 펄럭임용 정점 원본을 돌려줌 */
function hanlimFlag(group, { poleColor = 0x8b5a2b, height = 34, antenna = false, at = null, size = 1 } = {}) {
  const top = at ?? HANLIM ?? new THREE.Vector3(C.x, C.y, C.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, height, 8), new THREE.MeshLambertMaterial({ color: poleColor }));
  pole.position.set(top.x, top.y + height / 2, top.z); group.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(26, 16, 8, 1), new THREE.MeshBasicMaterial({ map: FLAG(), side: THREE.DoubleSide }));
  flag.scale.setScalar(size); flag.position.set(top.x - 13 * size, top.y + height - 8 * size, top.z); group.add(flag);
  let tip = null;
  if (antenna) {
    tip = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3355 }));
    tip.position.set(top.x, top.y + height + 1.5, top.z); group.add(tip);
  }
  return { flag, base: flag.geometry.attributes.position.array.slice(), tip };
}
/** 한림관 주 깃발 + 다른 건물 작은 깃발들. 돌려준 목록을 waveFlags 로 펄럭임 */
function campusFlags(group, main) {
  return [hanlimFlag(group, main), ...TOPS.map((at) => hanlimFlag(group, { poleColor: main.poleColor, height: 20, at, size: 0.7 }))];
}
function waveFlags(list, t) { list.forEach((f) => waveFlag(f, t)); }
function waveFlag(f, t) {
  const fp = f.flag.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(f.base[i * 3] * 0.35 + t * 5) * 1.8 * ((f.base[i * 3] + 13) / 26));
  fp.needsUpdate = true;
}
/** 선체·장식은 '앞 = +X' 로 짜여 있음 → 외곽선을 정문 방향만큼 돌려 만든 뒤, 결과를 되돌려 붙임(캠퍼스는 안 돌림) */
function facingGate(build) {
  const real = EDGE, c = Math.cos(FRONT), s = Math.sin(FRONT);
  EDGE = real.map((e) => {
    const dx = e.x - C.x, dz = e.z - C.z;
    return { x: C.x + dx * c + dz * s, z: C.z - dx * s + dz * c, y: e.y, a: Math.atan2(Math.sin(e.a - FRONT), Math.cos(e.a - FRONT)) };
  });
  try { return build(); } finally { EDGE = real; }
}

 function island(){
  const group=new THREE.Group(),deco=new THREE.Group();scene.background=new THREE.Color(0xa9d9ef);scene.fog=new THREE.Fog(0xa9d9ef,R*5,R*15);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(islandData.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(islandData.colors,3));
  const rock=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));deco.add(rock);
  const rockMat=metal(0x686758),green=metal(0x4d6833);
  for(let i=0;i<(lowSpec?2:5);i++){const a=i*1.256+.4,r=R*(.13+i*.018),h=r*2.7;
   const sub=new THREE.Group(),stone=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),rockMat);stone.scale.y=1.9;sub.add(stone);
   const top=new THREE.Mesh(new THREE.CylinderGeometry(r*.72,r*.87,r*.2,7),green);top.position.y=h*.45;sub.add(top);
   for(let j=0;j<(lowSpec?2:4);j++){const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(r*.24,0),green);const angle=j*Math.PI*.5;crown.position.set(Math.cos(angle)*r*.42,h*.45+r*.27,Math.sin(angle)*r*.42);crown.scale.y=1.5;sub.add(crown);}
   sub.position.set(C.x+Math.cos(a)*R*2.9,C.y-60+i*19,C.z+Math.sin(a)*R*2.9);group.add(sub);
  }
  const mist=clouds(lowSpec?1:3,R*4,C.y-80,0xeaf5f3,.18);group.add(mist);
  return {group,deco,tick(t){mist.rotation.y=t*.006;}};
 }
 function traffic(name){
  const group=new THREE.Group();group.name='decoration-traffic';const actors=[];
  const mat=new THREE.MeshLambertMaterial({color:name==='trek'?0xb5c7df:name==='pirate'?0xf1eee1:0x435b38});
  for(let i=0;i<(lowSpec?2:6);i++){
   const actor=new THREE.Group();
   if(name==='trek'){
    const body=new THREE.Mesh(new THREE.ConeGeometry(3,14,5),mat);body.rotation.x=Math.PI/2;actor.add(body);
    const wing=new THREE.Mesh(new THREE.BoxGeometry(15,1,5),mat);actor.add(wing);
   }else if(name==='pirate'&&i%3===0){
    const boat=new THREE.Mesh(new THREE.BoxGeometry(17,5,7),mat);actor.add(boat);
    const sail=new THREE.Mesh(new THREE.ConeGeometry(7,16,3),mat);sail.position.y=10;actor.add(sail);
   }else{
    for(const sign of [-1,1]){const wing=new THREE.Mesh(new THREE.BoxGeometry(name==='island'?12:6,.7,2),mat);wing.position.x=sign*4;wing.rotation.z=sign*.3;actor.add(wing);}
   }
   actors.push(actor);group.add(actor);
  }
  return {group,tick(t){actors.forEach((a,i)=>{const phase=t*(.018+i*.003)+i*1.047,d=R*(2.4+i*.17);a.position.set(C.x+Math.cos(phase)*d,name==='pirate'&&i%3===0?EDGE_LOW-R*.3+3:C.y+20+i*11+Math.sin(phase*3)*6,C.z+Math.sin(phase)*d);a.rotation.y=-phase;a.rotation.z=Math.sin(t*1.2+i)*.05;});}};
 }
 function release(){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  holder.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
  holder.clear();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
  scene.background=originalBackground;scene.fog=originalFog;
  for(const o of originals){o.light.color.copy(o.color);if(o.ground)o.light.groundColor.copy(o.ground);o.light.intensity=o.intensity;o.light.position.copy(o.position);}
  theme=null;
 }
 function setTheme(value){
  const name=normalizeMapTheme(value);if(name===current)return;release();current=name;elapsed=0;last=-Infinity;
  if(name==='default')return;
  if(!EDGE.length){EDGE=computeEdge(root);EDGE_LOW=Math.min(...EDGE.map(e=>e.y));FRONT=Math.atan2(GATE.z-C.z,GATE.x-C.x);
   root.traverse(o=>{if(o.name?.startsWith('b|한림관')){const b=new THREE.Box3().setFromObject(o);HANLIM=b.getCenter(new THREE.Vector3());HANLIM.y=b.max.y;}});
  }
  theme=name==='island'?island():facingGate(THEMES[name]);
  if(name==='island')holder.add(theme.deco);else{const wrap=new THREE.Group(),back=new THREE.Group();wrap.position.set(C.x,0,C.z);wrap.rotation.y=-FRONT;back.position.set(-C.x,0,-C.z);back.add(theme.deco);wrap.add(back);holder.add(wrap);}
  holder.add(theme.group);if(theme.fixed)holder.add(theme.fixed);
  theme.traffic=traffic(name);holder.add(theme.traffic.group);theme.tick(0);theme.traffic.tick(0);
 }
 function setMotion(enabled){motion=!!enabled&&!lowSpec;last=-Infinity;}
 function tick(nowMs){
  if(!theme||!motion)return false;if(Number.isFinite(last)&&nowMs-last<1000/30)return false;
  const dt=Number.isFinite(last)?Math.min((nowMs-last)/1000,.1):1/30;last=nowMs;elapsed+=dt;
  theme.tick(elapsed);theme.traffic.tick(elapsed);return true;
 }
 function dispose(){release();holder.removeFromParent();current='default';}
 return {setTheme,setMotion,tick,dispose};
}
