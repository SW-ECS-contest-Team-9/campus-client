// 방식 C(선택): 미세조정한 Gemma 3 270M 이 문장을 조건 JSON 으로. campus-nlp llm/common.py 를 그대로 옮김
// (SYSTEM, build_prompt 의 장소 상위 8개, json_schema(places), to_route_request). 모델은 목록 안 이름만 고르고 key 는 여기서 찾는다.
// 규칙 방식 A 와 합칠 때 A 의 필수 조건을 절대 덮어쓰지 않는다(합집합, AI 만 "계단 없이"를 더하면 사용자에게 묻는다).
// 화면·RN 에 의존하지 않음(시험 가능). 실행은 gemmaRuntime.ts(llama.rn).
import type { MapPackage, Mandatory, RouteRequest, Target } from './types';

export const TOP_K_PLACES = 8;

export const SYSTEM =
  '너는 캠퍼스 길찾기 요청을 조건 JSON 으로 바꾼다. 길은 만들지 않는다.\n' +
  '- 장소는 아래 목록의 이름만 쓴다. 목록에 없으면 dest 를 null 로 두고 unsupported 에 {"text":그 장소,"reason":"지도에 그 장소가 아직 없음"}.\n' +
  '- 같은 말이 여러 장소에 맞으면 clarify 에 짧은 질문.\n' +
  '- mandatory: 계단을 못 쓰는 사정(계단 없이, 휠체어, 유모차, 목발, 다리 다침)이면 "avoidStairs". 휠체어면 "wheelchairNeeded" 도.\n' +
  '- "계단으로", "계단 괜찮아"면 mandatory 는 비운다.\n' +
  '- preferences: 짐·피곤 → "fewerStairs", 실내로·추움 → "indoor".\n' +
  '- 지붕(비)·조용함·붐빔·경치·그늘·오르막·조명·흡연 은 지도에 자료가 없으므로 preferences 에 넣지 말고 unsupported 에 reason "지도에 그 정보가 아직 없음".\n' +
  '- 휠체어면 unsupported 에 {"text":"휠체어","reason":"휠체어 통행 가능 여부가 지도에 아직 없음"} 도 넣는다.\n' +
  '- mode: 엘리베이터 언급 → preferElevator, 계단 피하기/짐 → avoidStairs, 그 외 shortest.\n' +
  '- floor 는 "3F", "B1" 형식. 출발지를 말하지 않았으면 origin.current=true.';

const bigrams = (s: string): Set<string> => {
  const t = s.replace(/\s+/g, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};
const overlap = (a: Set<string>, b: Set<string>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
};

/** 글자 2-gram 겹침으로 장소 이름 상위 k 개(겹침 0 은 뺌). common.places_subset 과 같음(안정 정렬). */
export function placesSubset(text: string, pkg: MapPackage, k = TOP_K_PLACES): string[] {
  const q = bigrams(text);
  return pkg.places
    .map((p, i) => ({ name: p.name, i, n: overlap(q, bigrams(p.name)) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, k)
    .filter((x) => x.n > 0)
    .map((x) => x.name);
}

export function buildPrompt(text: string, pkg: MapPackage): { ctx: string; places: string[] } {
  const buildings = pkg.buildings.map((b) => b.name + (b.aliases.length ? ' (별칭: ' + b.aliases.join(', ') + ')' : ''));
  const places = placesSubset(text, pkg);
  return { ctx: '건물: ' + buildings.join(' | ') + '\n장소: ' + (places.length ? places.join(' | ') : '(없음)'), places };
}

export function jsonSchema(places: string[], pkg: MapPackage): object {
  const names = [...pkg.buildings.map((b) => b.name), ...places];
  const tgt = {
    type: 'object',
    properties: { name: { enum: [...names, null] }, floor: { type: ['string', 'null'] } },
    required: ['name', 'floor'],
  };
  return {
    type: 'object',
    properties: {
      dest: tgt,
      origin: {
        type: 'object',
        properties: { current: { type: 'boolean' }, name: { enum: [...names, null] }, floor: { type: ['string', 'null'] } },
        required: ['current', 'name', 'floor'],
      },
      waypoints: { type: 'array', items: { enum: names }, maxItems: 3 },
      mode: { enum: ['shortest', 'avoidStairs', 'preferElevator'] },
      mandatory: { type: 'array', items: { enum: ['avoidStairs', 'wheelchairNeeded'] }, maxItems: 2 },
      preferences: { type: 'array', items: { enum: ['indoor', 'fewerStairs'] }, maxItems: 2 },
      timeLimitMin: { type: ['integer', 'null'] },
      unsupported: {
        type: 'array',
        items: { type: 'object', properties: { text: { type: 'string' }, reason: { type: 'string' } }, required: ['text', 'reason'] },
        maxItems: 4,
      },
      clarify: { type: ['string', 'null'] },
    },
    required: ['dest', 'origin', 'waypoints', 'mode', 'mandatory', 'preferences', 'timeLimitMin', 'unsupported', 'clarify'],
  };
}

/** 모델 메시지(llama.rn completion 의 messages) */
export function messages(text: string, pkg: MapPackage) {
  const { ctx, places } = buildPrompt(text, pkg);
  return {
    places,
    messages: [
      { role: 'system' as const, content: SYSTEM + '\n\n' + ctx },
      { role: 'user' as const, content: text },
    ],
  };
}

interface ModelTarget {
  name?: string | null;
  floor?: string | null;
}
export interface ModelOutput {
  dest?: ModelTarget | null;
  origin?: (ModelTarget & { current?: boolean }) | null;
  waypoints?: string[] | null;
  mode?: RouteRequest['mode'];
  mandatory?: Mandatory[] | null;
  preferences?: RouteRequest['preferences'] | null;
  timeLimitMin?: number | null;
  unsupported?: { text: string; reason: string }[] | null;
  clarify?: string | null;
}

function lookup(pkg: MapPackage, name: string | null | undefined, floor: string | null | undefined): Target {
  const t: Target = { text: name ?? null, placeKey: null, buildingKey: null, floorKey: null, candidates: [] };
  if (!name) return t;
  for (const b of pkg.buildings) if (b.name === name) t.buildingKey = b.key;
  for (const p of pkg.places)
    if (p.name === name) {
      t.placeKey = p.key;
      t.buildingKey = p.buildingKey;
    }
  if (floor && t.buildingKey) {
    const code = String(floor).toUpperCase().replace('층', 'F');
    for (const f of pkg.floors) if (f.buildingKey === t.buildingKey && f.code === code) t.floorKey = f.key;
  }
  return t;
}

/** 모델 출력(이름) → 요청 v1(key). common.to_route_request 와 같음. 해석 못 한 것은 버리지 않고 unsupported/되물음으로. */
export function toRouteRequest(o: ModelOutput, pkg: MapPackage): RouteRequest {
  const unsupported = [...(o.unsupported ?? [])];
  const d = o.dest ?? {};
  const dest = lookup(pkg, d.name, d.floor);
  if (d.floor && dest.buildingKey && !dest.floorKey) unsupported.push({ text: String(d.floor), reason: '지도에 그 층이 없음' });
  const og = o.origin ?? {};
  const origin = {
    ...lookup(pkg, og.current ? null : og.name, og.floor),
    useCurrentLocation: (og.current ?? true) || !og.name,
  };
  let clar = o.clarify ?? null;
  if (!dest.text && !clar) clar = '어디로 갈까요?';
  return {
    v: 1,
    destination: dest,
    origin,
    waypoints: (o.waypoints ?? []).map((w) => lookup(pkg, w, null)),
    mode: o.mode ?? 'shortest',
    secondaryModes: [],
    mandatory: o.mandatory ?? [],
    preferences: o.preferences ?? [],
    timeLimitMin: o.timeLimitMin ?? null,
    unsupported,
    needsClarification: clar ? { question: clar } : null,
  };
}

/** AI 를 부를 때: 규칙이 목적지를 못 찾았거나, 후보 없이 되물을 때(계단 충돌 질문은 사람이 답할 일이라 빼고). */
export function shouldAskGemma(a: RouteRequest): boolean {
  const d = a.destination;
  if (!d.text && !d.placeKey && !d.buildingKey) return true;
  const q = a.needsClarification?.question;
  return !!q && !q.startsWith('계단을 피할까요') && d.candidates.length === 0 && a.origin.candidates.length === 0;
}

export const AI_STAIRS_QUESTION = 'AI가 "계단 없이"로 알아들었어요. 계단 없는 길로 찾을까요?';

/**
 * 규칙(A) + AI(G). 목적지·출발지는 A 가 찾았으면 A, 아니면 G. 필수 조건은 합집합(A 를 줄이지 않음).
 * A 에 없던 "계단 없이"를 G 만 더했으면 되물음(AI_STAIRS_QUESTION). 지원 안 함은 둘 다.
 */
export function mergeWithGemma(a: RouteRequest, g: RouteRequest): RouteRequest {
  const has = (t: Target) => !!(t.placeKey || t.buildingKey);
  const destination = has(a.destination) ? a.destination : g.destination;
  const origin = !a.origin.useCurrentLocation && has(a.origin) ? a.origin : g.origin;
  const mandatory = [...a.mandatory];
  for (const m of g.mandatory) if (!mandatory.includes(m)) mandatory.push(m);
  const aiAddedStairs = mandatory.includes('avoidStairs') && !a.mandatory.includes('avoidStairs');
  const unsupported = [...a.unsupported];
  for (const u of g.unsupported) if (!unsupported.some((x) => x.text === u.text && x.reason === u.reason)) unsupported.push(u);
  const preferences = [...a.preferences];
  for (const p of g.preferences) if (!preferences.includes(p)) preferences.push(p);
  // 방식: 규칙의 휠체어·유모차(accessible)는 그대로, 필수 계단 없이면 avoidStairs, 아니면 규칙 → AI. 밀린 규칙 방식은 보조로 남김
  const mode =
    a.mode === 'accessible' ? 'accessible' : mandatory.includes('avoidStairs') ? 'avoidStairs' : a.mode !== 'shortest' ? a.mode : g.mode;
  const secondaryModes = [a.mode, ...a.secondaryModes].filter((x, i, l) => x !== mode && x !== 'shortest' && l.indexOf(x) === i);
  let needsClarification = aiAddedStairs ? { question: AI_STAIRS_QUESTION } : null;
  if (!needsClarification && !has(destination)) needsClarification = g.needsClarification ?? { question: '어디로 갈까요?' };
  return {
    v: 1,
    destination,
    origin,
    waypoints: a.waypoints.length ? a.waypoints : g.waypoints,
    mode,
    secondaryModes,
    mandatory,
    preferences,
    timeLimitMin: a.timeLimitMin ?? g.timeLimitMin,
    unsupported,
    needsClarification,
  };
}
