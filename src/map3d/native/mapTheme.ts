export const MAP_THEMES = ['default', 'island', 'trek', 'pirate'] as const;
export type MapTheme = typeof MAP_THEMES[number];
export function normalizeMapTheme(value: unknown): MapTheme {
  return typeof value === 'string' && (MAP_THEMES as readonly string[]).includes(value) ? value as MapTheme : 'default';
}
