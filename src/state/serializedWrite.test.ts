import { describe, expect, it } from 'vitest';
import { createSerializedWriter } from './serializedWrite';

describe('ordered settings persistence', () => {
  it('writes later language selections after earlier slow writes', async () => {
    const saved: string[] = [];
    let releaseFirst!: () => void;
    const firstDone = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const persist = createSerializedWriter(async (language: string) => {
      if (language === 'ja') await firstDone;
      saved.push(language);
    });
    const first = persist('ja');
    const second = persist('en');
    await Promise.resolve();
    expect(saved).toEqual([]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(saved).toEqual(['ja', 'en']);
  });
  it('continues writing after a failed write', async () => {
    const saved: string[] = [];
    const persist = createSerializedWriter(async (language: string) => {
      if (language === 'ja') throw new Error('storage unavailable');
      saved.push(language);
    });
    const first = persist('ja');
    const second = persist('en');
    await expect(first).rejects.toThrow('storage unavailable');
    await expect(second).resolves.toBeUndefined();
    expect(saved).toEqual(['en']);
  });
});
