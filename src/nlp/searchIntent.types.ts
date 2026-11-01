import type { Mandatory, Mode, Preference } from './types';

export interface SearchIntent {
  dest: {
    kind: 'place' | 'category' | 'need' | 'person' | 'unknown';
    name: string | null;
    building: string | null;
    floor: string | null;
    categories: string[];
    needs: string[];
  };
  origin: { name: string | null; floor: string | null; current: boolean };
  mode: Mode;
  secondaryModes: Mode[];
  waypoints: string[];
  timeLimitMin: number | null;
  mandatory: Mandatory[];
  preferences: Preference[];
  excludedNames: string[];
  excludedCategories: string[];
  nearest: boolean;
  currentInfo: boolean;
  clarify: string | null;
}

export function emptyIntent(): SearchIntent {
  return {
    dest: { kind: 'unknown', name: null, building: null, floor: null, categories: [], needs: [] },
    origin: { name: null, floor: null, current: true },
    mode: 'shortest',
    secondaryModes: [],
    waypoints: [],
    timeLimitMin: null,
    mandatory: [],
    preferences: [],
    excludedNames: [],
    excludedCategories: [],
    nearest: false,
    currentInfo: false,
    clarify: null,
  };
}
