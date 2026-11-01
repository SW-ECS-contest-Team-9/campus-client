// 자연어 경로 요청(방식 A, parse.ts)의 결과를 앱 흐름으로: 되물을지(질문 + 후보 단추) / 경로 옵션으로 갈지.
// 원칙(campus-nlp 통합 안내): 장소를 지어내지 않음, 지원 안 하는 조건은 늘 알림, 필수 조건(계단 없이)은 하드 필터라 스스로 풀지 않음.
// 화면·RN 에 의존하지 않음(시험 가능).
import type { MapPackage } from '../map/package';
import { cleanMapName, localizedEntityName, localizedMapName } from '../map/names-i18n';
import { translate, type Language, type MessageKey } from '../i18n/translations';
import { modeInfo } from '../route/modes';
import type { RouteCondition } from '../route/route';
import { AI_STAIRS_QUESTION } from './gemma';
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
    cleanMapName(name)
      .split('=')[0]
      .replace(/\s*\((?!\d+\))[^)]*\)/g, '')
      .trim() || name
  );
}

/** 필수 조건이 있으면 이동 방식보다 앞섬(계단 없이 = 계단 완전 제외, 휠체어 = 휠체어·유모차 길). 휠체어·유모차는 계단 없이보다 엄격해 그대로 둠. */
export function effectiveCondition(condition: RouteCondition, mandatory: readonly Mandatory[]): RouteCondition {
  if (mandatory.includes('wheelchairNeeded') || (mandatory.includes('avoidStairs') && condition === 'accessible')) return 'accessible';
  return mandatory.includes('avoidStairs') ? 'avoidStairs' : condition;
}

const isMandatory = (r: RouteRequest) => r.mandatory.includes('avoidStairs') || r.mandatory.includes('wheelchairNeeded');

/** 말에서 고른 이동 방식(주 방식). "짐이 많아서"(계단 적게, 선호)는 계단을 빼지 않고 승강기 우선으로. */
export function conditionOf(r: RouteRequest): RouteCondition {
  if (isMandatory(r)) return effectiveCondition(r.mode, r.mandatory);
  if (r.mode === 'avoidStairs' || (r.mode === 'shortest' && r.preferences.includes('fewerStairs'))) return 'preferElevator';
  return r.mode;
}

/** 주 방식에 밀린 방식(경로에는 한 방식만 넣음). 선호로 남은 계단 피하기는 "계단 적게". */
function secondaryLabels(r: RouteRequest, language: Language): string[] {
  const c = conditionOf(r);
  return (r.secondaryModes ?? [])
    .filter((m) => m !== c)
    .map((m) =>
      m === 'avoidStairs'
        ? translate(language, 'nlpFewerStairs')
        : m === 'rainProtected'
          ? translate(language, 'rainAvoidance')
          : modeInfo(m, language).label,
    );
}

function targetName(target: Target, pkg: MapPackage, language: Language): string {
  if (target.placeKey) {
    const place = pkg.places.find((p) => p.key === target.placeKey);
    if (place) return localizedEntityName(place, language);
    return shortName(target.text ?? '');
  }
  if (target.buildingKey) {
    const building = pkg.buildings.find((b) => b.key === target.buildingKey);
    const name = building ? localizedEntityName(building, language) : (target.text ?? '');
    const floor = target.floorKey ? pkg.floors.find((f) => f.key === target.floorKey)?.code : null;
    return [name, floor].filter(Boolean).join(' ');
  }
  return target.text ?? '';
}

/** 알아들은 것(칩으로 보여 줌) */
export function describe(r: RouteRequest, pkg: MapPackage, language: Language = 'ko'): string[] {
  const t = (key: MessageKey, values?: Record<string, string>) => translate(language, key, values);
  const name = (target: Target) => targetName(target, pkg, language);
  const out: string[] = [];
  if (r.destination.text) out.push(t('nlpDestination', { value: name(r.destination) }));
  out.push(t('nlpOrigin', { value: r.origin.useCurrentLocation ? t('currentLocation') : name(r.origin) }));
  for (const w of r.waypoints) out.push(t('nlpWaypoint', { value: name(w) }));
  const cond = conditionOf(r);
  if (isMandatory(r))
    out.push(
      language === 'ko'
        ? cond === 'accessible'
          ? '필수: 휠체어, 유모차'
          : '필수: 계단 없이'
        : t('nlpRequired', { value: modeInfo(cond === 'accessible' ? 'accessible' : 'avoidStairs', language).label }),
    );
  else if (cond === 'preferElevator')
    out.push(r.mode === 'preferElevator' ? modeInfo('preferElevator', language).label : t('nlpFewerStairsPref'));
  else if (cond !== 'shortest') out.push(cond === 'rainProtected' ? t('rainAvoidance') : modeInfo(cond, language).label);
  for (const l of secondaryLabels(r, language)) out.push(t('nlpAlso', { value: l }));
  if (r.preferences.includes('indoor')) out.push(t('nlpIndoor'));
  if (r.timeLimitMin != null) out.push(t('nlpWithinMinutes', { minutes: String(r.timeLimitMin) }));
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

const unsupportedLabels: Record<string, MessageKey> = {
  '조용한 길': 'nlpQuiet',
  '사람 적은 길': 'nlpLessCrowded',
  '경치 좋은 길': 'nlpScenic',
  휠체어: 'nlpWheelchair',
  그늘: 'nlpShade',
  '오르막 피하기': 'nlpAvoidUphill',
  '흡연 구역': 'nlpSmoking',
  '편의시설 경유': 'nlpFacilities',
};
export function describeUnsupported(u: RouteRequest['unsupported'][number], language: Language = 'ko'): string {
  if (language === 'ko') return `${u.text}: ${u.reason}`;
  const text = unsupportedLabels[u.text] ? translate(language, unsupportedLabels[u.text]) : localizedMapName(u.text, language);
  const key: MessageKey = u.reason.startsWith('지도에 그 정보가 아직 없음')
    ? 'nlpNoData'
    : u.reason === '지도에 그 장소가 아직 없음'
      ? 'nlpNoPlace'
      : u.reason === '지도에 그 입구 번호가 없음'
        ? 'nlpNoEntrance'
        : u.reason === '지도에 그 층이 없음'
          ? 'nlpNoFloor'
          : u.reason === '오르막만 피하는 경로 방식이 아직 없음'
            ? 'nlpNoSlopeRoute'
            : u.reason === '휠체어 통행 가능 여부가 지도에 아직 없음'
              ? 'nlpWheelchairUnverified'
              : 'nlpUnsupportedGeneric';
  return `${text}: ${translate(language, key)}${key === 'nlpUnsupportedGeneric' && u.reason ? ` (${u.reason})` : ''}`;
}

/** 결과에는 경로 선택에 필요한 짧은 제한만. 내부 사유는 개발자 진단에서 확인. */
export function publicSearchWarnings(r: RouteRequest, language: Language = 'ko'): string[] {
  const rain = r.unsupported.filter((u) => /비|지붕|rain|roof|雨/i.test(u.text) && !u.reason.includes('장소'));
  const warnings: string[] = [];
  if (rain.length) warnings.push(translate(language, 'rainInfoLimited'));
  if (r.unsupported.length > rain.length) warnings.push(translate(language, 'searchRequestLimited'));
  return warnings;
}

export function planFromRequest(r: RouteRequest, pkg: MapPackage, language: Language = 'ko'): Plan {
  const t = (key: MessageKey, values?: Record<string, string>) => translate(language, key, values);
  const candidateName = (candidate: { name: string; placeKey: string | null; buildingKey: string | null }) => {
    const entity = candidate.placeKey
      ? pkg.places.find((p) => p.key === candidate.placeKey)
      : pkg.buildings.find((b) => b.key === candidate.buildingKey);
    return entity ? localizedEntityName(entity, language) : shortName(candidate.name);
  };
  const q = r.needsClarification?.question;
  if (q) {
    // AI(Gemma)만 "계단 없이"로 알아들었을 때: 사용자가 정함(아니요면 AI 가 더한 필수 조건만 뺌 — 규칙에는 없던 것)
    if (q === AI_STAIRS_QUESTION)
      return {
        kind: 'ask',
        question: language === 'ko' ? q : t('nlpAIStairsQuestion'),
        choices: [
          { label: t('nlpYesNoStairs'), apply: (x) => clear(x) },
          { label: t('nlpNoStairsOk'), apply: (x) => ({ ...clear(x), mandatory: [], mode: 'shortest' }) },
        ],
      };
    if (q.startsWith('계단을 피할까요'))
      return {
        kind: 'ask',
        question: language === 'ko' ? q : t('nlpStairsQuestion'),
        choices: [
          { label: modeInfo('avoidStairs', language).label, apply: (x) => clear(x) },
          {
            label: t('nlpUseStairs'),
            apply: (x) => ({ ...clear(x), mandatory: x.mandatory.filter((m) => m !== 'avoidStairs'), mode: 'shortest' }),
          },
        ],
      };
    const d = r.destination;
    if (d.text && !d.placeKey && !d.buildingKey && d.candidates.length)
      return {
        kind: 'ask',
        question: t('nlpChooseDestination'),
        choices: d.candidates.map((c) => ({
          label: candidateName(c),
          apply: (x) => ({ ...clear(x), destination: pickTarget(x.destination, c.placeKey, c.buildingKey) }),
        })),
      };
    const o = r.origin;
    if (!o.useCurrentLocation && !o.placeKey && !o.buildingKey && o.candidates.length)
      return {
        kind: 'ask',
        question: t('nlpChooseOrigin'),
        choices: o.candidates.map((c) => ({
          label: candidateName(c),
          apply: (x) => ({ ...clear(x), origin: { ...pickTarget(x.origin, c.placeKey, c.buildingKey), useCurrentLocation: false } }),
        })),
      };
    // "말한 장소가 지도에 없습니다. X(으)로 갈까요?" → 확인 단추. 목적지가 없으면 질문만.
    if (d.placeKey || d.buildingKey) {
      const name = targetName(d, pkg, language);
      return {
        kind: 'ask',
        question: t('nlpConfirmDestination', { name }),
        choices: [{ label: t('nlpYesDestination', { name }), apply: clear }],
      };
    }
    return {
      kind: 'ask',
      question: t(q.includes('지도에 아직 없습니다') ? 'nlpMissingPlace' : 'whereTo'),
      choices: [],
    };
  }

  const notes = r.unsupported.map((u) => describeUnsupported(u, language));
  // 목적지: 장소 → 그대로, 건물(+층)만 → 그 건물의 길에 붙은 장소 하나로 좁히거나 되물음
  let destKey = r.destination.placeKey;
  if (!destKey && r.destination.buildingKey) {
    const b = pkg.buildings.find((x) => x.key === r.destination.buildingKey);
    const { list, floorMissed } = placesIn(pkg, r.destination.buildingKey, r.destination.floorKey);
    if (floorMissed) notes.push(t('nlpFloorMissing'));
    if (list.length === 1) destKey = list[0].key;
    else if (!list.length)
      return {
        kind: 'ask',
        question: t('nlpNoBuildingRoute', { name: b ? localizedEntityName(b, language) : t('nlpThatBuilding') }),
        choices: [],
      };
    else
      return {
        kind: 'ask',
        question: t('nlpWhereInBuilding', { name: b ? localizedEntityName(b, language) : t('nlpThatBuilding') }),
        choices: list.slice(0, 6).map((p) => ({
          label: localizedEntityName(p, language),
          apply: (x) => ({ ...x, destination: pickTarget(x.destination, p.key, p.buildingKey) }),
        })),
      };
  }
  if (!destKey) return { kind: 'ask', question: t('whereTo'), choices: [] };

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
          question: t('nlpFromBuilding', { name: b ? localizedEntityName(b, language) : t('nlpThatBuilding') }),
          choices: list.slice(0, 6).map((p) => ({
            label: localizedEntityName(p, language),
            apply: (x) => ({ ...x, origin: { ...pickTarget(x.origin, p.key, p.buildingKey), useCurrentLocation: false } }),
          })),
        };
    }
  }
  // 경로 계산에 아직 못 쓰는 것은 버리지 않고 알림
  if (r.waypoints.length) notes.push(t('nlpWaypointUnsupported', { value: r.waypoints.map((w) => w.text).join(', ') }));
  const condition = conditionOf(r);
  if (r.preferences.includes('indoor') && condition !== 'rainProtected') notes.push(t('nlpIndoorUnsupported'));
  if (r.timeLimitMin != null) notes.push(t('nlpTimeNotice', { minutes: String(r.timeLimitMin) }));
  const sec = secondaryLabels(r, language);
  if (sec.length) notes.push(t('nlpSecondaryNotice', { conditions: sec.join(', '), mode: modeInfo(condition, language).label }));
  if (condition === 'accessible') notes.push(t('nlpAccessibleNotice'));
  return { kind: 'go', destKey, origin, condition, mandatory: r.mandatory.slice(), notes };
}
