/** The configured value is bundled into the app and is a UI gate, not authorization. */
export const DEVELOPER_ACCESS_CODE = process.env.EXPO_PUBLIC_DEVELOPER_ACCESS_CODE ?? '9ood_idea';

export function matchesDeveloperCode(input: string, configured: string): boolean {
  return configured.length > 0 && input === configured;
}

export function nextKoreanTap(count: number, isKorean: boolean): number {
  return isKorean ? Math.min(count + 1, 10) : 0;
}
