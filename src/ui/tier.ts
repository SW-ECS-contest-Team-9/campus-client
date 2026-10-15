// 기기 성능 등급(사용자 결정 2026-10-15: v1.0 Galaxy 배포, S21 이상 완전 지원 + S10/S20/Note10·20/A52 급).
// 1 = 유리 흐림 + 전체 움직임(S21 이상), 2 = 흐림 없는 반투명 그라데이션 + 짧은 움직임, 3 = 정지(움직임·GIF 없음).
// 설정의 deviceTier(사용자 지정)가 있으면 그것, 없으면 처음 켤 때 고른 autoTier. RN 에 의존하지 않음(시험 가능).
export type DeviceTier = 1 | 2 | 3;

export interface TierInput {
  os: string;
  /** Android API 레벨(모르면 null) */
  apiLevel: number | null;
  /** 전체 메모리 바이트(모르면 null) */
  totalMemory: number | null;
}

const GB = 1024 ** 3;

/**
 * 처음 켤 때의 등급. 웹·iOS 는 1. Android: API 34+(Android 14, S20·Note20 은 13 이 마지막)·RAM 6.5 GiB+ → 1
 * (8 GB 폰은 커널 몫을 빼고 약 7.0~7.4 GiB 로 보임 — 실제 S21 MemTotal 7,373,756 kB),
 * API 29 미만·RAM 3.5 GB 미만 → 3, 나머지 2. 느린 기기는 3D 첫 화면 시간으로 한 단계 더 낮춤.
 */
export function chooseTier({ os, apiLevel, totalMemory }: TierInput): DeviceTier {
  if (os !== 'android') return 1;
  const api = apiLevel ?? 0;
  const ram = totalMemory ?? 0;
  if (api < 29 || (totalMemory != null && ram < 3.5 * GB)) return 3;
  if (api >= 34 && ram >= 6.5 * GB) return 1;
  return 2;
}

/** 3D 첫 화면이 이보다 늦으면 자동 등급을 한 단계 낮춤(사용자 지정이 있으면 손대지 않음). */
export const SLOW_3D_FIRST_READY_MS = 8000;
export function adjustForFirst3d(tier: DeviceTier, firstReadyMs: number): DeviceTier {
  return firstReadyMs > SLOW_3D_FIRST_READY_MS ? (Math.min(3, tier + 1) as DeviceTier) : tier;
}

/** 등급별 표현: 흐림, 움직임 배율(0 = 없음), 움직이는 캐릭터. */
export function tierLook(tier: DeviceTier) {
  return {
    blur: tier === 1,
    motionScale: tier === 1 ? 1 : tier === 2 ? 0.6 : 0,
    animatedCharacters: tier !== 3,
  };
}
