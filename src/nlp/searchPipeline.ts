import type { MapPackage } from '../map/package';
import type { RouteRequest, Target } from './types';
import type { SearchIntent } from './searchIntent';
import { emptyIntent } from './searchIntent';
import { buildSearchIndex, resolveSearchIntent } from './resolveIntent';
import { parseRouteRequest } from './parse';
import { mergeWithGemma } from './gemma';
import type { Language } from '../i18n/translations';

export type SearchIndex = ReturnType<typeof buildSearchIndex>;
export type ResolvedCandidate = ReturnType<typeof resolveSearchIntent>['candidates'][number];
const normalize = (s: string) => s.toLowerCase().replace(/[\s()[\]{}·.,=\-–_/#'"]/g, '');
const target = (text: string | null = null): Target => ({ text, placeKey: null, buildingKey: null, floorKey: null, candidates: [] });

function routeTarget(candidate: ResolvedCandidate, pkg: MapPackage, floor: string | null): Target | null {
  if (candidate.kind === 'building' && candidate.buildingKey) {
    const building = pkg.buildings.find((b) => b.key === candidate.buildingKey);
    if (!building || !pkg.places.some((p) => p.buildingKey === building.key && p.nodeKey)) return null;
    const floorKey =
      candidate.floorKey ??
      (floor ? pkg.floors.find((f) => f.buildingKey === building.key && f.code.toUpperCase() === floor.toUpperCase())?.key : null);
    if (floor && (!floorKey || !pkg.places.some((p) => p.floorKey === floorKey && p.nodeKey))) return null;
    return { ...target(candidate.name), buildingKey: building.key, floorKey: floorKey ?? null };
  }
  const place = pkg.places.find((p) => p.key === candidate.routePlaceKey);
  if (!place?.nodeKey || !pkg.nodes.some((n) => n.key === place.nodeKey)) return null;
  return { ...target(candidate.name), placeKey: place.key, buildingKey: place.buildingKey, floorKey: place.floorKey };
}

/** Only validated existing graph references become route targets. Rules preserve hard conditions, not guessed destinations. */
export function routeRequestForIntent(
  intent: SearchIntent,
  selected: ResolvedCandidate,
  pkg: MapPackage,
  text: string,
  index: SearchIndex,
) {
  const destination = routeTarget(selected, pkg, intent.dest.floor);
  if (!destination) return { request: null, originIssue: false };
  let origin: RouteRequest['origin'] = { ...target(), useCurrentLocation: true };
  if (!intent.origin.current) {
    const name = intent.origin.name;
    if (!name || !normalize(text).includes(normalize(name))) return { request: null, originIssue: true };
    const originIntent = emptyIntent();
    originIntent.dest = { ...originIntent.dest, kind: 'place', name, floor: intent.origin.floor };
    const found = resolveSearchIntent(originIntent, index, name);
    const targets = found.valid
      ? found.candidates.map((c) => routeTarget(c, pkg, intent.origin.floor)).filter((t): t is Target => t !== null)
      : [];
    if (!targets.length) return { request: null, originIssue: true };
    origin =
      targets.length === 1
        ? { ...targets[0], useCurrentLocation: false }
        : {
            ...target(name),
            useCurrentLocation: false,
            candidates: targets.map((t) => ({ name: t.text ?? name, placeKey: t.placeKey, buildingKey: t.buildingKey })),
          };
  }
  const rules = parseRouteRequest(text, pkg);
  const base: RouteRequest = {
    ...rules,
    destination,
    origin,
    waypoints: [],
    mode: rules.mandatory.includes('wheelchairNeeded') ? 'accessible' : 'shortest',
    secondaryModes: intent.secondaryModes,
    unsupported: rules.unsupported.filter(
      (u) => !u.reason.includes('장소') && !u.reason.includes('입구 번호') && !u.reason.includes('층이 없음'),
    ),
    needsClarification: null,
  };
  const model: RouteRequest = {
    ...base,
    mode: intent.mode,
    mandatory: intent.mandatory,
    preferences: intent.preferences,
    timeLimitMin: intent.timeLimitMin,
    unsupported: [],
  };
  const request = mergeWithGemma(base, model);
  if (origin.candidates.length) request.needsClarification = { question: '출발지를 확인해 주세요.' };
  if (request.mode === 'rainProtected' || request.secondaryModes.includes('rainProtected')) {
    request.unsupported.push({ text: '비 회피', reason: '실내·coveredRatio 기반 비용이며 비 노출 완전 차단은 확인되지 않음' });
  }
  if (intent.waypoints.length) request.waypoints = intent.waypoints.map((name) => target(name));
  return { request, originIssue: false };
}

export function runSearchPipeline(text: string, intent: SearchIntent, pkg: MapPackage, language: Language = 'ko') {
  const index = buildSearchIndex(pkg);
  const resolved = resolveSearchIntent(intent, index, text, language);
  const resolution =
    intent.dest.floor &&
    resolved.valid &&
    resolved.candidates.length &&
    resolved.candidates.every((c) => !routeTarget(c, pkg, intent.dest.floor))
      ? { ...resolved, status: 'unroutable' as const }
      : resolved;
  const route =
    resolution.valid && resolution.candidates.length === 1
      ? routeRequestForIntent(intent, resolution.candidates[0], pkg, text, index)
      : { request: null, originIssue: false };
  return { intent, resolution, ...route };
}
