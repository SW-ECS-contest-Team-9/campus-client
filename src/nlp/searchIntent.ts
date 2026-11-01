import model from './intentModel.json';
import type { Mandatory, Mode, Preference } from './types';

import type { SearchIntent } from './searchIntent.types';
export type { SearchIntent } from './searchIntent.types';
export { emptyIntent } from './searchIntent.types';

export const intentJsonSchema = model.schema;
export const intentContextSize = 4096;
export const intentMaxTokens = 1024;
export function intentMessages(text: string) {
  return [...model.messages, { role: 'user', content: text }];
}
// Protocol adapter only: no text heuristics, map lookup, or answer repair.
export function parseSearchIntent(value: unknown): SearchIntent | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const nullableText = (v: unknown): v is string | null => v === null || typeof v === 'string';
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const modes = ['shortest', 'fastest', 'avoidStairs', 'accessible', 'preferElevator', 'rainProtected', 'nightSafe'];
  const kinds = ['place', 'category', 'need', 'person', 'unknown'];
  if (
    !object(p.dest) ||
    !object(p.origin) ||
    !nullableText(p.dest.name) ||
    !nullableText(p.dest.floor) ||
    !nullableText(p.origin.name) ||
    !nullableText(p.origin.floor) ||
    typeof p.origin.current !== 'boolean' ||
    !kinds.includes(String(p.kind)) ||
    !modes.includes(String(p.mode)) ||
    !Array.isArray(p.unsupported) ||
    p.unsupported.length !== 0 ||
    !strings(p.categories) ||
    !strings(p.needs) ||
    !strings(p.secondaryModes) ||
    !p.secondaryModes.every((m) => modes.includes(m)) ||
    !strings(p.mandatory) ||
    !p.mandatory.every((m) => ['avoidStairs', 'wheelchairNeeded'].includes(m)) ||
    !strings(p.preferences) ||
    !p.preferences.every((m) => ['indoor', 'fewerStairs', 'covered', 'quiet', 'lessCrowded'].includes(m)) ||
    !strings(p.excludedNames) ||
    !strings(p.excludedCategories) ||
    !strings(p.waypoints) ||
    typeof p.nearest !== 'boolean' ||
    typeof p.currentInfo !== 'boolean' ||
    !nullableText(p.clarify) ||
    !(p.timeLimitMin === null || (typeof p.timeLimitMin === 'number' && Number.isFinite(p.timeLimitMin)))
  )
    return null;
  return {
    dest: {
      kind: p.kind as SearchIntent['dest']['kind'],
      name: p.dest.name,
      building: null,
      floor: p.dest.floor,
      categories: p.categories,
      needs: p.needs,
    },
    origin: { name: p.origin.name, floor: p.origin.floor, current: p.origin.current },
    mode: p.mode as Mode,
    secondaryModes: p.secondaryModes as Mode[],
    mandatory: p.mandatory as Mandatory[],
    preferences: p.preferences as Preference[],
    excludedNames: p.excludedNames,
    excludedCategories: p.excludedCategories,
    nearest: p.nearest,
    currentInfo: p.currentInfo,
    clarify: p.clarify,
    waypoints: p.waypoints,
    timeLimitMin: p.timeLimitMin,
  };
}
