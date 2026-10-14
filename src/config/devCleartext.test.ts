import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { devHosts, networkSecurityXml } = require('../../plugins/withDevCleartext.js') as {
  devHosts: (env?: string) => string[];
  networkSecurityXml: (h: string[]) => string;
};

describe('Android 평문 허용 주소', () => {
  it('기본: 에뮬레이터 PC·자기 자신만', () => {
    expect(devHosts('')).toEqual(['10.0.2.2', '127.0.0.1', 'localhost']);
  });
  it('EXPO_PUBLIC_DEV_HOST 를 더함, 전역 허용은 없음', () => {
    const xml = networkSecurityXml(devHosts('192.168.0.12'));
    expect(xml).toContain('<domain includeSubdomains="false">192.168.0.12</domain>');
    expect(xml).toContain('<base-config cleartextTrafficPermitted="false" />');
  });
  it('이상한 값은 거부', () => {
    expect(() => devHosts('http://1.2.3.4:8010')).toThrow();
  });
});
