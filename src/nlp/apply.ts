// 자연어 경로 요청(방식 A, parse.ts)의 결과를 앱 흐름으로: 되물을지(질문 + 후보 단추) / 경로 옵션으로 갈지.
// 원칙(campus-nlp 통합 안내): 장소를 지어내지 않음, 지원 안 하는 조건은 늘 알림, 필수 조건(계단 없이)은 하드 필터라 스스로 풀지 않음.
// 화면·RN 에 의존하지 않음(시험 가능).
import type { MapPackage } from '../map/package';
import type { RouteCondition } from '../route/route';
import type { Mandatory, RouteRequest, Target } from './types';

export interface Choice {
  label: string;
  /** 고르면 요청을 이렇게 고침 */
  apply: (r: RouteRequest) => RouteRequest;
}
export type Plan =
  | { kind: 'ask'; question: string; choices: Choice[] }
  | {
      kind: 'go';
      destKey: string;
      origin: { type: 'current' } | { type: 'place'; placeKey: string };
      condition: RouteCondition;
      mandatory: Mandatory[];
      /** 짧은 알림(지원 안 함·경로에 못 쓰는 조건) */
      notes: string[];
    };

/** 단추·칩용 짧은 이름: "= 설명"과 숫자가 아닌 괄호 설명을 뺌("북악관 입구(4) = GS25 출입구" → "북악관 입구(4)"). */
export function shortName(name: string): string {
  return (
    name
      .split('=')[0]
      .replace(/\s*\((?!\d+\))[^)]*\)/g, '')
      .trim() || name
  );
}

/** 필수 조건이 있으면 이동 방식보다 앞섬(계단 없이 = 계단 완전 제외). */
export function effectiveCondition(condition: RouteCondition, mandatory: readonly Mandatory[]): RouteCondition {
  return mandatory.includes('avoidStairs') ? 'avoidStairs' : condition;
}

/** 말에서 고른 이동 방식. "짐이 많아서"(계단 적게, 선호)는 계단을 빼지 않고 승강기 우선으로. */
export function conditionOf(r: RouteRequest): RouteCondition {
  if (r.mandatory.includes('avoidStairs')) return 'avoidStairs';
  if (r.mode === 'preferElevator' || r.mode === 'avoidStairs' || r.preferences.includes('fewerStairs')) return 'preferElevator';
  return 'shortest';
}

/** 알아들은 것(칩으로 보여 줌) */
export function describe(r: RouteRequest, pkg: MapPackage): string[] {
  const name = (t: Target) =>
    t.placeKey
      ? shortName(pkg.places.find((p) => p.key === t.placeKey)?.name ?? t.text ?? '')
      : t.buildingKey
        ? `${pkg.buildings.find((b) => b.key === t.buildingKey)?.name ?? t.text}${t.floorKey ? ` ${pkg.floors.find((f) => f.key === t.floorKey)?.code ?? ''}` : ''}`
        : t.text;
  const out: string[] = [];
  if (r.destination.text) out.push(`도착 · ${name(r.destination)}`);
  out.push(`출발 · ${r.origin.useCurrentLocation ? '현재 위치' : name(r.origin)}`);
  for (const w of r.waypoints) out.push(`경유 · ${name(w)}`);
  if (r.mandatory.includes('avoidStairs')) out.push('필수 · 계단 없이');
  else if (conditionOf(r) === 'preferElevator') out.push(r.mode === 'preferElevator' ? '승강기 우선' : '계단 적게(선호)');
  if (r.preferences.includes('indoor')) out.push('실내 선호');
  if (r.timeLimitMin != null) out.push(`${r.timeLimitMin}분 안`);
  return out;
}

const clear = (r: RouteRequest): RouteRequest => ({ ...r, needsClarification: null });
const pickTarget = (t: Target, placeKey: string | null, buildingKey: string | null): Target => ({
  ...t,
  placeKey,
  buildingKey,
  candidates: [],
});

/** 건물만 말했을 때 갈 수 있는 장소(길에 붙은 것). 층을 말했으면 그 층 장소 먼저. 입구 먼저. */
function placesIn(pkg: MapPackage, buildingKey: string, floorKey: string | null) {
  const all = pkg.places.filter((p) => p.buildingKey === buildingKey && p.nodeKey);
  const onFloor = floorKey ? all.filter((p) => p.floorKey === floorKey) : [];
  const list = onFloor.length ? onFloor : all;
  return {
    list: [...list].sort(
      (a, b) => Number(b.category.includes('entrance')) - Number(a.category.includes('entrance')) || a.name.localeCompare(b.name),
    ),
    floorMissed: !!floorKey && !onFloor.length,
  };
}

export function planFromRequest(r: RouteRequest, pkg: MapPackage): Plan {
  const q = r.needsClarification?.question;
  if (q) {
    if (q.startsWith('계단을 피할까요'))
      return {
        kind: 'ask',
        question: q,
        choices: [
          { label: '계단 피하기', apply: (x) => clear(x) },
          {
            label: '계단으로 가기',
            apply: (x) => ({ ...clear(x), mandatory: x.mandatory.filter((m) => m !== 'avoidStairs'), mode: 'shortest' }),
          },
        ],
      };
    const d = r.destination;
    if (d.text && !d.placeKey && !d.buildingKey && d.candidates.length)
      return {
        kind: 'ask',
        question: q,
        choices: d.candidates.map((c) => ({
          label: shortName(c.name),
          apply: (x) => ({ ...clear(x), destination: pickTarget(x.destination, c.placeKey, c.buildingKey) }),
        })),
      };
    const o = r.origin;
    if (!o.useCurrentLocation && !o.placeKey && !o.buildingKey && o.candidates.length)
      return {
        kind: 'ask',
        question: q,
        choices: o.candidates.map((c) => ({
          label: shortName(c.name),
          apply: (x) => ({ ...clear(x), origin: { ...pickTarget(x.origin, c.placeKey, c.buildingKey), useCurrentLocation: false } }),
        })),
      };
    // "말한 장소가 지도에 없습니다. X(으)로 갈까요?" → 확인 단추. 목적지가 없으면 질문만.
    if (d.placeKey || d.buildingKey)
      return { kind: 'ask', question: q, choices: [{ label: `네, ${describe(r, pkg)[0].replace('도착 · ', '')}(으)로`, apply: clear }] };
    return { kind: 'ask', question: q, choices: [] };
  }

  const notes = r.unsupported.map((u) => `${u.text}: ${u.reason}`);
  // 목적지: 장소 → 그대로, 건물(+층)만 → 그 건물의 길에 붙은 장소 하나로 좁히거나 되물음
  let destKey = r.destination.placeKey;
  if (!destKey && r.destination.buildingKey) {
    const b = pkg.buildings.find((x) => x.key === r.destination.buildingKey);
    const { list, floorMissed } = placesIn(pkg, r.destination.buildingKey, r.destination.floorKey);
    if (floorMissed) notes.push('그 층 자체로는 길 안내가 아직 안 돼요(층 안 장소 자료 없음)');
    if (list.length === 1) destKey = list[0].key;
    else if (!list.length)
      return { kind: 'ask', question: `${b?.name ?? '그 건물'}에는 길이 이어진 곳이 아직 없어요. 다른 곳을 말해 주세요.`, choices: [] };
    else
      return {
        kind: 'ask',
        question: `${b?.name ?? '그 건물'}의 어디로 갈까요?`,
        choices: list.slice(0, 6).map((p) => ({
          label: shortName(p.name),
          apply: (x) => ({ ...x, destination: pickTarget(x.destination, p.key, p.buildingKey) }),
        })),
      };
  }
  if (!destKey) return { kind: 'ask', question: '어디로 갈까요?', choices: [] };

  // 출발: 현재 위치 / 장소 / 건물만 → 되물음
  let origin: Extract<Plan, { kind: 'go' }>['origin'] = { type: 'current' };
  if (!r.origin.useCurrentLocation) {
    if (r.origin.placeKey) origin = { type: 'place', placeKey: r.origin.placeKey };
    else if (r.origin.buildingKey) {
      const b = pkg.buildings.find((x) => x.key === r.origin.buildingKey);
      const { list } = placesIn(pkg, r.origin.buildingKey, r.origin.floorKey);
      if (list.length === 1) origin = { type: 'place', placeKey: list[0].key };
      else if (list.length)
        return {
          kind: 'ask',
          question: `${b?.name ?? '그 건물'}의 어디에서 출발하나요?`,
          choices: list.slice(0, 6).map((p) => ({
            label: shortName(p.name),
            apply: (x) => ({ ...x, origin: { ...pickTarget(x.origin, p.key, p.buildingKey), useCurrentLocation: false } }),
          })),
        };
    }
  }
  // 경로 계산에 아직 못 쓰는 것은 버리지 않고 알림
  if (r.waypoints.length) notes.push(`경유(${r.waypoints.map((w) => w.text).join(', ')})는 아직 경로에 넣지 못해요`);
  if (r.preferences.includes('indoor')) notes.push('실내 선호는 아직 경로 계산에 반영하지 못해요');
  if (r.timeLimitMin != null) notes.push(`${r.timeLimitMin}분 안: 경로 미리보기의 예상 시간을 확인해 주세요`);
  return { kind: 'go', destKey, origin, condition: conditionOf(r), mandatory: r.mandatory.slice(), notes };
}
