// 화면 표현 설정을 부품에 내려 줌: 기기 등급(tier.ts)과 지도 위 흐림 대상. 동작 줄이기와 합쳐 움직임을 정함.
import { createContext, useContext, type RefObject } from 'react';
import type { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { tierLook, type DeviceTier } from './tier';

export const TierCtx = createContext<DeviceTier>(1);
/** 지도 위 유리 면이 흐릴 대상(Android expo-blur BlurTargetView). 지도 밖 화면에서는 null. */
export const BlurTargetCtx = createContext<RefObject<View | null> | null>(null);

/** 지금 표현: 흐림 여부, 움직임 배율(0 = 없음: 등급 3 또는 동작 줄이기), 움직이는 캐릭터 여부. */
export function useLook() {
  const tier = useContext(TierCtx);
  const reduce = useReducedMotion();
  const l = tierLook(tier);
  const scale = reduce ? 0 : l.motionScale;
  return { tier, blur: l.blur, motionScale: scale, moving: scale > 0, animatedCharacters: l.animatedCharacters && !reduce };
}
