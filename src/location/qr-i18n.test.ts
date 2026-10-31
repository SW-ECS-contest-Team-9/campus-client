import { describe, expect, it } from 'vitest';
import fixture from '../map/fixture/campus-fixture.json';
import type { MapPackage } from '../map/package';
import { localizedQrMessage } from './qr-i18n';

const pkg = fixture as unknown as MapPackage;
describe('QR calibration messages', () => {
  it('renders the same outcome in the selected language', () => {
    const message = { kind: 'success', label: '북악관 입구(2)' } as const;
    expect(localizedQrMessage(message, 'en', pkg)).toContain('Bukak Bldg. entrance 2');
    expect(localizedQrMessage(message, 'ja', pkg)).toContain('Bukak館 2番入口');
    expect(localizedQrMessage(message, 'ko', pkg)).toContain('북악관 입구(2)');
  });
  it('keeps unknown administrator-provided names unchanged', () => {
    expect(localizedQrMessage({ kind: 'success', label: 'A-101 기준점' }, 'en', pkg)).toContain('A-101 기준점');
    expect(localizedQrMessage({ kind: 'missing' }, 'en', pkg)).not.toContain('기준점');
  });
});
