import directory from '../data/facility-directory.draft.json';
import type { Language } from '../i18n/translations';
import { localizedEntityName } from '../map/names-i18n';
import type { LocalizedNames, MapPackage } from '../map/package';
import type { SearchIntent } from './searchIntent.types';
import { normalize } from '../search/search';

export interface SearchCandidate {
  id: string;
  sourceIds: string[];
  kind: 'building' | 'place' | 'facility';
  name: string;
  sourceName: string;
  category: string;
  buildingKey: string | null;
  floorKey: string | null;
  floorCode?: string | null;
  room?: string | null;
  routePlaceKey?: string;
  nodeKey?: string;
  notice?: string;
  personNames?: string[];
}
interface IndexEntry extends SearchCandidate {
  aliases: string[];
  buildingAliases: string[];
  localizedNames?: LocalizedNames;
  routable: boolean;
}
export interface SearchIndex {
  entries: IndexEntry[];
  floors: { key: string; buildingKey: string; code: string }[];
}
export interface SearchResolution {
  valid: boolean;
  status: 'candidates' | 'ambiguous' | 'insufficientData' | 'unroutable';
  candidates: SearchCandidate[];
  ambiguous: boolean;
  ranking: 'unavailable' | 'notRequested';
  issues?: string[];
}

// Catalog relationships, never per-facility routing guesses.
const needs: Record<string, string[]> = {
  food: ['cafeteria', 'restaurant', 'convenience_store'],
  coffee: ['cafe'],
  rest: ['lounge'],
  toilet: ['restroom'],
  study: ['library', 'reading_room', 'study_room'],
  print: ['printer', 'copy_room'],
  health: ['health_room'],
};
const needAliases: Record<string, string[]> = {
  food: ['hungry', '배고파', '배고픔', '밥', '식사', 'お腹が空いた', '饿了', '吃饭'],
  coffee: ['커피', 'コーヒー', '咖啡'],
  rest: ['rest', '쉬고 싶어', '쉬기', '휴식', '休憩', '休息'],
  toilet: ['toilet'],
  study: ['study', '공부', '勉強', '学习'],
  print: ['print', '인쇄', '복사', '印刷', '打印'],
  health: ['health', '아파', '보건', '医务'],
};
const categoryAliases: Record<string, string[]> = {
  restroom: ['toilet', 'bathroom', '화장실', 'トイレ', '洗手间', '卫生间'],
  cafeteria: ['student cafeteria', '학생식당', '학식', '学生食堂'],
  restaurant: ['dining hall', '식당', '餐厅', '食堂'],
  convenience_store: ['convenience store', '편의점', '매점', 'コンビニ', '便利店'],
  cafe: ['café', 'coffee shop', '카페', 'カフェ', '咖啡厅'],
  lounge: ['rest area', '라운지', '휴게실', 'ラウンジ', '休息室'],
  faculty_office: ['professor office', 'faculty office', '교수실', '교수연구실', '教授室', '教員研究室', '教授办公室', '教师办公室'],
};
const languages = ['ko', 'en', 'ja', 'zh'] as const;
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const same = (a: string, b: string) => normalize(a) === normalize(b);
const namesOf = (entity: { name: string; aliases?: string[]; localizedNames?: LocalizedNames }) =>
  unique([entity.name, ...(entity.aliases ?? []), ...languages.map((lang) => localizedEntityName(entity, lang))]);
const categoryOf = (name: string) =>
  Object.entries(categoryAliases).find(([key, aliases]) => [key, ...aliases].some((a) => same(a, name)))?.[0] ?? name;

/** Match a full mention, allowing grammatical suffixes but not a name fragment. */
function mentioned(text: string, alias: string): boolean {
  const hay = normalize(text),
    needle = normalize(alias);
  if (!needle) return false;
  let at = hay.indexOf(needle);
  while (at >= 0) {
    const before = hay.slice(0, at),
      after = hay.slice(at + needle.length);
    // Retain word boundaries from the original text for Latin names.
    if (/^[a-z0-9]/i.test(alias)) {
      const escaped = alias
        .trim()
        .split(/\s+/)
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*');
      return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
    }
    const start =
      !before || !/[가-힣a-z]$/i.test(before) || /(?:가자|가는|에서|말고|아닌|대신|으로|부터|까지|근처|찾아|위치)$/.test(before);
    const end =
      !after ||
      !/^[가-힣a-z]/i.test(after) ||
      /^(?:으로|에서|까지|부터|에게|교수|선생|연구실|위치|근처|말고|아닌|대신|가자|가는|은|는|이|가|을|를|에|로|와|과|좀)/.test(after);
    if (start && end) return true;
    // Whitespace or punctuation before a Korean name is a real boundary.
    const escaped = alias.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(
        `(^|[\\s.,!?。，！？:;()（）「」])${escaped}(?=$|[\\s.,!?。，！？:;()（）「」]|으로|에서|까지|부터|교수|은|는|을|를|에|로)`,
      ).test(text)
    )
      return true;
    at = hay.indexOf(needle, at + 1);
  }
  return false;
}

function professorNames(labels: string[]): string[] {
  return unique(
    labels.flatMap((label) => {
      // Source format: "601호 - 채성준 교수", including comma-separated full names.
      const match = /(?:^|\s-\s)([^\d]+?)\s*교수(?:님)?\s*$/.exec(label);
      return match
        ? match[1]
            .split(/[,，]/)
            .map((name) => name.trim())
            .filter(Boolean)
        : [];
    }),
  );
}

export function buildSearchIndex(pkg: MapPackage): SearchIndex {
  const buildings = new Map(pkg.buildings.map((b) => [b.key, b]));
  const floors = new Map(pkg.floors.map((f) => [f.key, f]));
  const nodes = new Set(pkg.nodes.map((n) => n.key));
  const entries: IndexEntry[] = pkg.places.map((p) => {
    const building = p.buildingKey ? buildings.get(p.buildingKey) : undefined;
    const routable = !!p.nodeKey && nodes.has(p.nodeKey);
    return {
      id: p.key,
      sourceIds: [p.key],
      kind: 'place',
      name: p.name,
      sourceName: p.name,
      category: p.category,
      buildingKey: p.buildingKey,
      floorKey: p.floorKey,
      floorCode: p.floorKey ? (floors.get(p.floorKey)?.code ?? null) : null,
      ...(routable ? { routePlaceKey: p.key, nodeKey: p.nodeKey! } : {}),
      aliases: namesOf(p),
      buildingAliases: building ? namesOf(building) : [],
      localizedNames: p.localizedNames,
      routable,
    };
  });
  const byPlace = new Map(entries.map((e) => [e.id, e]));
  for (const f of directory.entries) {
    const sharedAliases = [...f.buildingAliases, ...f.floorAliases, ...Object.values(f.searchTags).flat()];
    const aliases = unique([
      f.displayName,
      ...f.sourceLabels,
      ...f.aliases.filter((a) => !sharedAliases.some((shared) => same(a, shared))),
    ]);
    const personNames = f.category === 'faculty_office' ? professorNames([...f.sourceLabels, ...f.aliases]) : [];
    const existing = f.placeKey ? byPlace.get(f.placeKey) : undefined;
    if (existing) {
      existing.sourceIds.push(f.id);
      existing.aliases = unique([...existing.aliases, ...aliases]);
      existing.category = f.category;
      existing.room = f.room;
      existing.personNames = personNames;
      existing.notice = f.notice;
    } else {
      entries.push({
        id: f.id,
        sourceIds: [f.id],
        kind: 'facility',
        name: f.displayName,
        sourceName: f.displayName,
        category: f.category,
        buildingKey: f.buildingKey,
        floorKey: f.floorKey,
        floorCode: f.floorCode,
        room: f.room,
        notice: f.notice,
        personNames,
        aliases,
        buildingAliases: f.buildingAliases,
        ...(f.nodeKey && nodes.has(f.nodeKey) ? { nodeKey: f.nodeKey } : {}),
        routable: !!f.nodeKey && nodes.has(f.nodeKey),
      });
    }
  }
  for (const b of pkg.buildings)
    entries.push({
      id: b.key,
      sourceIds: [b.key],
      kind: 'building',
      name: b.name,
      sourceName: b.name,
      category: 'building',
      buildingKey: b.key,
      floorKey: null,
      aliases: namesOf(b),
      buildingAliases: namesOf(b),
      localizedNames: b.localizedNames,
      routable: entries.some((e) => e.buildingKey === b.key && e.routable),
    });
  return { entries, floors: pkg.floors.map(({ key, buildingKey, code }) => ({ key, buildingKey, code })) };
}

function floorCode(value: string): string {
  const compact = normalize(value);
  const basement = /^(?:b|지하|地下|basement)(\d+)(?:f|층|楼|層|层|階)?$/.exec(compact);
  if (basement) return `B${basement[1]}`;
  const above = /^(?:floor)?(\d+)(?:f|층|楼|層|层|階)?$/.exec(compact);
  return above ? `${above[1]}F` : value.toUpperCase();
}

export function resolveSearchIntent(
  intent: SearchIntent,
  index: SearchIndex,
  originalText: string,
  language: Language = 'ko',
): SearchResolution {
  const issues: string[] = [];
  const ranking = intent.nearest ? 'unavailable' : 'notRequested';
  if (intent.nearest) issues.push('nearestRankingUnavailable');
  if (intent.currentInfo) issues.push('currentInfoUnavailable');
  const finish = (matches: IndexEntry[], valid = true): SearchResolution => {
    const candidates = matches.map(
      ({ aliases: _aliases, buildingAliases: _buildings, localizedNames, routable: _routable, ...candidate }) => ({
        ...candidate,
        name: localizedEntityName({ name: candidate.sourceName, localizedNames }, language),
      }),
    );
    const ambiguous = candidates.length > 1;
    const status = !candidates.length
      ? 'insufficientData'
      : matches.every((c) => !c.routable)
        ? 'unroutable'
        : ambiguous
          ? 'ambiguous'
          : 'candidates';
    return { valid, status, candidates, ambiguous, ranking, ...(issues.length ? { issues } : {}) };
  };
  let { dest } = intent;
  const personText = categoryAliases.faculty_office.reduce(
    (text, alias) => text.split(alias.toLowerCase()).join(' '),
    originalText.toLowerCase(),
  );
  const explicitPerson =
    /[가-힣]{2,5}\s*교수(?!실|연구실)|(?:professor|prof\.)\s+[a-z][a-z .]+|[a-z][a-z .]+\s+professor|[가-힣]{2,5}\s*(?:教授|先生)/i.test(
      personText,
    );
  if (dest.kind === 'unknown' && dest.name) {
    const query = dest.name;
    const category = Object.entries(categoryAliases).find(([key, aliases]) => [key, ...aliases].some((a) => same(a, query)))?.[0];
    const need = Object.entries(needAliases).find(([key, aliases]) => [key, ...aliases].some((a) => same(a, query)))?.[0];
    dest = {
      ...dest,
      kind: category ? 'category' : need ? 'need' : explicitPerson ? 'person' : 'place',
      categories: category ? [category] : dest.categories,
      needs: need ? [need] : dest.needs,
    };
  }
  if (dest.kind !== 'person' && explicitPerson) {
    issues.push('personDestinationMismatch');
    return finish([], false);
  }
  let matches: IndexEntry[];
  if ((dest.kind === 'place' || dest.kind === 'person') && dest.name) {
    const query = dest.name;
    matches = index.entries.filter((e) =>
      (dest.kind === 'person' ? (e.personNames ?? []) : [e.id, ...e.sourceIds, ...e.aliases]).some((a) => same(a, query)),
    );
    const grounded =
      mentioned(originalText, query) ||
      matches.some((e) =>
        (dest.kind === 'person' ? (e.personNames?.filter((n) => same(n, query)) ?? []) : e.aliases)
          .filter(
            (a) =>
              !Object.entries(categoryAliases).some(([key, aliases]) => [key, ...aliases].some((generic) => same(generic, a))) ||
              categoryOf(a) === categoryOf(query),
          )
          .some((a) => mentioned(originalText, a)),
      );
    if (!grounded) {
      issues.push('ungroundedDestination');
      return finish([], false);
    }
    // A building's own name should resolve to that building, not every room alias.
    if (dest.kind === 'place' && matches.some((e) => e.kind === 'building')) matches = matches.filter((e) => e.kind === 'building');
  } else if (dest.kind === 'category' || dest.kind === 'need') {
    const categories = unique([...dest.categories.map(categoryOf), ...dest.needs.flatMap((n) => needs[n] ?? [])]);
    matches = index.entries.filter((e) => categories.includes(categoryOf(e.category)));
  } else {
    issues.push('destinationUnspecified');
    return finish([]);
  }
  if (dest.building) {
    const requested = index.entries.filter(
      (e) => e.kind === 'building' && (e.id === dest.building || e.aliases.some((a) => same(a, dest.building!))),
    );
    if (!requested.some((e) => e.aliases.some((a) => mentioned(originalText, a)))) {
      issues.push('ungroundedBuilding');
      return finish([], false);
    }
    matches = matches.filter((e) => requested.some((b) => b.buildingKey === e.buildingKey));
  }
  if (dest.floor)
    matches = matches.flatMap((e) => {
      const floor = index.floors.find(
        (f) => f.buildingKey === e.buildingKey && (f.key === dest.floor || f.code === floorCode(dest.floor!)),
      );
      if (e.kind === 'building') return floor ? [{ ...e, floorKey: floor.key, floorCode: floor.code }] : [];
      return e.floorKey === dest.floor || e.floorCode === floorCode(dest.floor!) ? [e] : [];
    });
  const excludedCategories = intent.excludedCategories.map(categoryOf);
  matches = matches.filter(
    (e) =>
      !excludedCategories.includes(categoryOf(e.category)) &&
      !intent.excludedNames.some((name) => [...e.aliases, ...e.buildingAliases, ...(e.personNames ?? [])].some((a) => same(a, name))),
  );
  return finish(matches);
}
