// 상황별 알림 부품(요구 R15): 토스트(결과만), 스낵바(되돌리기 단추 하나), 배너(화면 위 고정 상태).
// 카드(상자)는 비교할 정보에만 쓰고, 알림·상태·오류는 이 부품으로.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleAlert, X } from 'lucide-react-native';
import { color, elevation, glass, motion, shape, space, type } from './theme';

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; onPress: () => void };
}
const ToastCtx = createContext<(text: string, action?: ToastMsg['action']) => void>(() => {});

/** 토스트·스낵바를 띄우는 함수: show('저장했어요') / show('기록을 지웠어요', { label: '되돌리기', onPress }) */
export const useToast = () => useContext(ToastCtx);

/** 앱 뿌리에 한 번. 아래 탭 위에 하나만 보임(새 것이 오면 바꿈). 토스트 3초, 단추 있는 스낵바 5초. */
export function ToastProvider({ children, bottomOffset = 100 }: { children: ReactNode; bottomOffset?: number }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    const id = ++seq.current;
    setMsg({ id, text, action });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg((cur) => (cur?.id === id ? null : cur)), action ? 5000 : 3000);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {msg ? (
        <Animated.View
          key={msg.id}
          entering={reduce ? undefined : FadeInDown.duration(motion.base)}
          exiting={reduce ? undefined : FadeOutDown.duration(motion.base)}
          style={[s.toastWrap, { bottom: inset.bottom + bottomOffset }]}
          pointerEvents="box-none"
          accessibilityLiveRegion="polite"
        >
          <View style={s.toast}>
            <Text style={s.toastT} numberOfLines={2}>
              {msg.text}
            </Text>
            {msg.action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={msg.action.label}
                hitSlop={8}
                onPress={() => {
                  msg.action?.onPress();
                  setMsg(null);
                }}
              >
                <Text style={s.toastA}>{msg.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

/** 화면 위 고정 배너: 화면 전체에 걸친 상태(인터넷 없음·새 지도 있음). 닫으면 onClose. */
export function Banner({ text, action, onClose }: { text: string; action?: { label: string; onPress: () => void }; onClose?: () => void }) {
  return (
    <View style={s.banner} accessibilityRole="alert">
      <CircleAlert size={18} color={color.warning} strokeWidth={2.2} />
      <Text style={s.bannerT} numberOfLines={2}>
        {text}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} hitSlop={8} onPress={action.onPress}>
          <Text style={s.bannerA}>{action.label}</Text>
        </Pressable>
      ) : null}
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="알림 닫기" hitSlop={12} onPress={onClose} style={s.close}>
          <X size={18} color={color.warning} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  toastWrap: { position: 'absolute', left: space[20], right: space[20], alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    minHeight: space[48],
    maxWidth: '100%',
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    borderRadius: shape.pill,
    backgroundColor: glass.dark,
    ...elevation.float,
  },
  toastT: { ...type.actionLabel, fontWeight: '600', color: color.onPrimary, flexShrink: 1 },
  toastA: { ...type.actionLabel, color: '#C7D2FE' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    minHeight: space[48],
    paddingHorizontal: space[16],
    paddingVertical: space[8],
    backgroundColor: color.warningSoft,
  },
  bannerT: { ...type.captionText, fontWeight: '600', color: color.warning, flex: 1 },
  bannerA: { ...type.captionText, fontWeight: '800', color: color.warning },
  close: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
});
