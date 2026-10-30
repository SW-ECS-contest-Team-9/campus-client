// 출발점: 사용자가 고른 장소, 또는 현재 위치(확실할 때만).
import type { MapPackage } from '../map/package';
import { pointStart, type Graph } from '../route/route';
import { currentLocationLabel, startNodeForFix, type Fix } from './fix';

export type StartPoint =
  | { type: 'place'; placeKey: string }
  | { type: 'node'; nodeKey: string; label: string }
  /** 걷는 면·열린 면 위 현재 위치(면 높이): 노드가 아니라 그 점에서 면을 가로질러 출발 */
  | { type: 'point'; x: number; y: number; z: number; label: string };

/** 현재 위치에서 출발: 걷는 면·열린 면 위면 그 점(면을 가로질러 출발), 아니면 맞춘 길의 가까운 끝 노드(50 m 안 바깥 노드). */
export function startFromFix(pkg: MapPackage, graph: Graph | null, fix: Fix, label: string): StartPoint | null {
  const p = graph ? pointStart(graph, fix.x, fix.y, fix.match?.z ?? null) : null;
  if (p) return { type: 'point', x: p[0], y: p[1], z: p[2], label };
  const n = startNodeForFix(pkg, fix);
  return n ? { type: 'node', nodeKey: n.key, label } : null;
}

/** 지금 위치가 확실할 때만 출발점으로(불확실·없음이면 null → 사용자가 고름, 제품 규칙 02). */
export function startFromCurrentFix(pkg: MapPackage, graph: Graph | null, fix: Fix | null): StartPoint | null {
  if (!fix || fix.uncertain) return null;
  return startFromFix(pkg, graph, fix, currentLocationLabel(pkg, fix));
}
