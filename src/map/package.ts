// 지도 꾸러미 형식 v1 (schemaVersion 1). 설명: docs/map-package-v1.md
// 좌표는 EPSG:5186 미터 (x 동, y 북, z 해발 m). 꾸러미 안의 참조는 모두 문자열 key.

export const SCHEMA_VERSION = 1 as const;

export type Location = 'outdoor' | 'indoor';
export type EdgeKind =
  | 'walkway'
  | 'sidewalk'
  | 'crossing'
  | 'corridor'
  | 'stairs'
  | 'ramp'
  | 'elevator'
  | 'vehicle_road';
export type Direction = 'both' | 'forward' | 'backward';
export type Access = 'allowed' | 'prohibited' | 'unknown';
export type XYZ = [number, number, number];
export type XY = [number, number];

export interface Release {
  version: number;
  createdAt: string;
  source: string;
}
export interface Campus {
  code: string;
  name: string;
  crs: 5186;
}
export interface Building {
  key: string;
  name: string;
  aliases: string[];
  center: XY | null;
  footprint: XY[] | null;
}
export interface Floor {
  key: string;
  buildingKey: string;
  code: string; // "B1", "1F"
  sortOrder: number; // 아래층일수록 작음
  floorZ: number | null;
  zEstimated: boolean;
}
export interface MapNode {
  key: string;
  location: Location;
  buildingKey: string | null; // indoor 면 필수
  floorKey: string | null; // outdoor 면 null, indoor 인데 층 모르면 null
  kind: string;
  x: number;
  y: number;
  z: number;
  estimated: boolean;
}
export interface Edge {
  key: string;
  from: string;
  to: string;
  name: string | null;
  kind: EdgeKind;
  direction: Direction;
  pedestrianAccess: Access;
  wheelchairAccess: Access;
  lengthM: number;
  stepCount: number | null;
  widthM: number | null;
  geometry: XYZ[];
  estimated: boolean;
}
export interface Place {
  key: string;
  location: Location;
  buildingKey: string | null;
  floorKey: string | null;
  nodeKey: string | null; // 경로가 붙는 노드. null 이면 경로 못 냄
  name: string;
  aliases: string[];
  category: string;
  x: number;
  y: number;
  z: number;
}
export interface WalkArea {
  key: string;
  location: Location;
  floorKey: string | null;
  name: string;
  kind: 'field' | 'plaza' | 'parking_aisle' | 'other';
  polygon: XY[];
  z: number | null;
  estimated: boolean;
}
export interface WalkAreaNode {
  areaKey: string;
  nodeKey: string;
}
export interface MapPackage {
  schemaVersion: 1;
  release: Release;
  campus: Campus;
  buildings: Building[];
  floors: Floor[];
  nodes: MapNode[];
  edges: Edge[];
  places: Place[];
  walkAreas: WalkArea[];
  walkAreaNodes: WalkAreaNode[];
}

export type ValidationResult = { ok: true; pkg: MapPackage } | { ok: false; errors: string[] };

const EDGE_KINDS: EdgeKind[] = ['walkway', 'sidewalk', 'crossing', 'corridor', 'stairs', 'ramp', 'elevator', 'vehicle_road'];
const DIRECTIONS: Direction[] = ['both', 'forward', 'backward'];
const ACCESS: Access[] = ['allowed', 'prohibited', 'unknown'];
const LOCATIONS: Location[] = ['outdoor', 'indoor'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isArr = Array.isArray;

/** 받은 JSON 이 형식 v1 을 지키는지 확인한다. 오류는 최대 50개까지 모은다. */
export function validatePackage(input: unknown): ValidationResult {
  const errors: string[] = [];
  const err = (m: string) => {
    if (errors.length < 50) errors.push(m);
  };
  const p = input as Record<string, any>;
  if (!p || typeof p !== 'object') return { ok: false, errors: ['꾸러미가 객체가 아님'] };
  if (p.schemaVersion !== SCHEMA_VERSION) return { ok: false, errors: [`schemaVersion ${p.schemaVersion} 지원 안 함`] };
  if (!p.release || !isNum(p.release.version) || !isStr(p.release.createdAt)) err('release 형식 오류');
  if (!p.campus || !isStr(p.campus.code) || p.campus.crs !== 5186) err('campus 형식 오류 (crs 5186)');
  for (const k of ['buildings', 'floors', 'nodes', 'edges', 'places', 'walkAreas', 'walkAreaNodes']) {
    if (!isArr(p[k])) err(`${k} 가 배열이 아님`);
  }
  if (errors.length) return { ok: false, errors };

  const uniq = (list: any[], name: string) => {
    const s = new Set<string>();
    for (const o of list) {
      if (!isStr(o.key)) err(`${name}: key 없음`);
      else if (s.has(o.key)) err(`${name}: key 중복 ${o.key}`);
      else s.add(o.key);
    }
    return s;
  };
  const bKeys = uniq(p.buildings, 'building');
  const fKeys = uniq(p.floors, 'floor');
  const nKeys = uniq(p.nodes, 'node');
  uniq(p.edges, 'edge');
  uniq(p.places, 'place');
  const aKeys = uniq(p.walkAreas, 'walkArea');

  const floorCodes = new Set<string>();
  for (const f of p.floors) {
    if (!bKeys.has(f.buildingKey)) err(`floor ${f.key}: 건물 없음 ${f.buildingKey}`);
    const c = `${f.buildingKey}/${f.code}`;
    if (floorCodes.has(c)) err(`floor ${f.key}: 같은 건물에 층 코드 중복 ${f.code}`);
    floorCodes.add(c);
    if (!isNum(f.sortOrder)) err(`floor ${f.key}: sortOrder`);
  }
  const located = (o: any, name: string) => {
    if (!LOCATIONS.includes(o.location)) err(`${name} ${o.key}: location`);
    if (o.location === 'outdoor' && (o.floorKey != null || o.buildingKey != null))
      err(`${name} ${o.key}: outdoor 인데 건물·층 있음`);
    if (o.location === 'indoor' && !bKeys.has(o.buildingKey)) err(`${name} ${o.key}: indoor 인데 건물 없음`);
    if (o.floorKey != null && !fKeys.has(o.floorKey)) err(`${name} ${o.key}: 층 없음 ${o.floorKey}`);
    if (!isNum(o.x) || !isNum(o.y) || !isNum(o.z)) err(`${name} ${o.key}: 좌표`);
  };
  for (const n of p.nodes) located(n, 'node');
  for (const pl of p.places) {
    located(pl, 'place');
    if (!isStr(pl.name)) err(`place ${pl.key}: name`);
    if (!isArr(pl.aliases)) err(`place ${pl.key}: aliases`);
    if (pl.nodeKey != null && !nKeys.has(pl.nodeKey)) err(`place ${pl.key}: 노드 없음 ${pl.nodeKey}`);
  }
  for (const e of p.edges) {
    if (!nKeys.has(e.from) || !nKeys.has(e.to)) err(`edge ${e.key}: 끝 노드 없음`);
    if (e.from === e.to) err(`edge ${e.key}: 양 끝이 같음`);
    if (!EDGE_KINDS.includes(e.kind)) err(`edge ${e.key}: kind ${e.kind}`);
    if (!DIRECTIONS.includes(e.direction)) err(`edge ${e.key}: direction ${e.direction}`);
    if (!ACCESS.includes(e.pedestrianAccess)) err(`edge ${e.key}: pedestrianAccess`);
    if (!isNum(e.lengthM) || e.lengthM <= 0) err(`edge ${e.key}: lengthM`);
    if (!isArr(e.geometry) || e.geometry.length < 2) err(`edge ${e.key}: geometry`);
  }
  for (const a of p.walkAreas) {
    if (!isArr(a.polygon) || a.polygon.length < 3) err(`walkArea ${a.key}: polygon`);
  }
  for (const wn of p.walkAreaNodes) {
    if (!aKeys.has(wn.areaKey) || !nKeys.has(wn.nodeKey)) err(`walkAreaNode ${wn.areaKey}/${wn.nodeKey}: 참조 오류`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, pkg: p as MapPackage };
}
