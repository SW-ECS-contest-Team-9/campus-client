import { describe, expect, it } from 'vitest';
import { nativeBuildingLabel } from './label-i18n';

describe('native map building names', () => {
  it('retains a specific model building number instead of replacing it with its parent name', () => {
    const group = { original: '은주관', localized: 'Eunjoo Bldg.' };
    expect(nativeBuildingLabel('은주1관', group, 'en')).toBe('Eunjoo Bldg. 1');
    expect(nativeBuildingLabel('은주1관', group, 'ko')).toBe('은주1관');
  });
  it('uses the map publisher translation when the names match or the model name is unknown', () => {
    const entry = { original: '새 건물', localized: 'New Hall' };
    expect(nativeBuildingLabel('새 건물', entry, 'en')).toBe('New Hall');
    expect(nativeBuildingLabel('별칭', entry, 'en')).toBe('New Hall');
  });
});
