/** Keep the last trusted altitude while the current fix is uncertain. */
export function createLocationHeightMemory() {
  let trustedZ: number | null = null;
  return {
    resolve(z: number | null, state: 'ok' | 'uncertain'): number | null {
      const valid = z !== null && Number.isFinite(z);
      if (state === 'ok' && valid) trustedZ = z;
      if (trustedZ !== null) return trustedZ;
      return valid ? z : null;
    },
    clear() {
      trustedZ = null;
    },
  };
}
