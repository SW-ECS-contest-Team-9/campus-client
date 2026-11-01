// V3 시각 부품: 그라데이션, 유리 면, 물결 머리, 끄는 시트, 캐릭터, 경로 그리기 막대.
// 원칙 번호는 백엔드/디자인 "V3 디자인 방향"(V3-1~11). 토큰은 theme.ts.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Image, Platform, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withSpring, withTiming, Easing } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useContext } from 'react';
import { BlurTargetCtx, useLook } from './look';
import { elevation, glass, gradient, motion, shape } from './theme';
import { useApp } from '../state/AppState';
import { translate } from '../i18n/translations';

/** 칸을 채우는 선형 그라데이션(SVG). 모서리는 부모 overflow/borderRadius 로. */
export function Gradient({
  colors = gradient.brand,
  angle = 'diag',
  style,
  opacity = 1,
}: {
  colors?: readonly string[];
  angle?: 'diag' | 'down' | 'right';
  style?: StyleProp<ViewStyle>;
  opacity?: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [x2, y2] = angle === 'down' ? ['0', '1'] : angle === 'right' ? ['1', '0'] : ['1', '1'];
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
            {colors.map((c, i) => (
              <Stop key={i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} stopOpacity={opacity} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** 유리 면(V3-2·3): 반투명 흰(또는 남색) + 밝은 테두리 + 그림자, 웹은 뒤 흐림. */
export function Glass({
  children,
  style,
  dark,
  strong,
  radius = shape.card,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
  strong?: boolean;
  radius?: number;
}) {
  const look = useLook();
  const target = useContext(BlurTargetCtx);
  // 등급 1 만 흐림(V3-10). 웹은 backdrop-filter, Android 는 지도(BlurTargetView) 위일 때만 expo-blur. 측정용 끔: globalThis.__glassBlur = false
  const on = look.blur && (globalThis as { __glassBlur?: boolean }).__glassBlur !== false;
  const webBlur = on && Platform.OS === 'web' ? ({ backdropFilter: `blur(${glass.blur}px) saturate(160%)` } as unknown as ViewStyle) : null;
  const nativeBlur = on && Platform.OS === 'android' && !!target;
  return (
    <View
      style={[
        {
          backgroundColor: nativeBlur ? 'transparent' : dark ? glass.dark : strong ? glass.fillStrong : glass.fill,
          borderColor: dark ? glass.edgeDark : glass.edge,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: radius,
        },
        elevation.float,
        webBlur,
        nativeBlur && { overflow: 'hidden' },
        style,
      ]}
    >
      {nativeBlur ? (
        <BlurView
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={40}
          tint={dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : null}
      {nativeBlur ? (
        // 흐림 위 덮개: 글 대비 규칙(V3-3) 그대로 — 흰 0.86 / 남색 0.84(흐림이 있어도 뒤가 검정인 최악을 가정)
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: dark ? glass.dark : glass.fill }]} />
      ) : null}
      {children}
    </View>
  );
}

/** 머리 덩어리(V3-5): 브랜드 그라데이션, 아래 가장자리가 비대칭 물결. 높이 = 내용 + 물결. */
export function WaveHeader({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [w, setW] = useState(360);
  const [h, setH] = useState(120);
  const W = shape.wave;
  // 왼쪽은 깊게, 오른쪽은 얕게 내려오는 물결(대칭 아님)
  const d = `M0 0 H${w} V${h - W * 0.55} C${w * 0.78} ${h - W * 1.25}, ${w * 0.56} ${h + W * 0.1}, ${w * 0.34} ${h - W * 0.35} S${w * 0.08} ${h - W * 0.2}, 0 ${h} Z`;
  return (
    <View
      style={[{ paddingBottom: W }, style]}
      onLayout={(e) => {
        setW(Math.round(e.nativeEvent.layout.width));
        setH(Math.round(e.nativeEvent.layout.height));
      }}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={gradient.brand[0]} />
              <Stop offset="0.6" stopColor={gradient.brand[1]} />
              <Stop offset="1" stopColor={gradient.brand[2]} />
            </LinearGradient>
          </Defs>
          <Path d={d} fill={`url(#${id})`} />
          {/* 빛 방울(장식) */}
          <Path d={`M${w * 0.72} -20 a${w * 0.32} ${w * 0.32} 0 1 0 1 0 Z`} fill="#FFFFFF" fillOpacity={0.08} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

/** 지도 아래 가장자리를 바탕색 물결로 끊음(지도와 내용 사이를 사각 대신 곡선으로, V3-5). */
export function WaveEdge({ color, height = 26, flip }: { color: string; height?: number; flip?: boolean }) {
  return (
    <View pointerEvents="none" style={[s.edge, { height }, flip ? { top: 0, transform: [{ scaleY: -1 }] } : { bottom: 0 }]}>
      <Svg width="100%" height="100%" viewBox="0 0 360 26" preserveAspectRatio="none">
        <Path d="M0 26 V12 C70 -2 120 22 190 14 S310 0 360 10 V26 Z" fill={color} />
      </Svg>
    </View>
  );
}

const CHAR: Record<string, { still: ImageSourcePropType; moving?: ImageSourcePropType }> = {
  arrive: { still: require('../../assets/characters/arrive.png'), moving: require('../../assets/characters/arrive-anim.gif') },
  noRoute: { still: require('../../assets/characters/no-route.png'), moving: require('../../assets/characters/no-route-anim.gif') },
  emptySearch: { still: require('../../assets/characters/empty-search.png') },
  offline: { still: require('../../assets/characters/offline-pack.png'), moving: require('../../assets/characters/offline-pack-anim.gif') },
  loading: { still: require('../../assets/characters/loading.png'), moving: require('../../assets/characters/loading-anim.gif') },
  uncertain: {
    still: require('../../assets/characters/location-uncertain.png'),
    moving: require('../../assets/characters/location-uncertain-anim.gif'),
  },
};
export type CharacterName = keyof typeof CHAR;

/** 상태 캐릭터(V3-9): 작게, 장식(화면 읽기 숨김), 등장은 아래에서 살짝. 동작 줄이기면 정지 그림·움직임 없음. */
export function Character({
  name,
  size = 96,
  animated = true,
  style,
}: {
  name: CharacterName;
  size?: number;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const look = useLook();
  const c = CHAR[name];
  const src = animated && look.animatedCharacters && c.moving ? c.moving : c.still;
  return (
    <Animated.View
      entering={
        look.moving
          ? FadeInDown.duration(motion.slow * look.motionScale)
              .springify()
              .damping(16)
          : undefined
      }
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Image source={src} style={{ width: size, height: size }} resizeMode="contain" />
    </Animated.View>
  );
}

/** 경로 그리기 진행(V3-7): 그라데이션 막대가 0 → progress 로 차오름. 동작 줄이기면 바로. */
export function RouteDrawBar({ progress = 1, height = 6 }: { progress?: number; height?: number }) {
  const look = useLook();
  const k = look.motionScale;
  const v = useSharedValue(k ? 0 : progress);
  useEffect(() => {
    v.value = k ? withTiming(progress, { duration: motion.draw * k, easing: Easing.out(Easing.cubic) }) : progress;
  }, [progress, k, v]);
  // SVG의 % 크기는 부모의 애니메이션 너비를 따라 다시 그려지지 않을 수 있어, 전체 폭을 고정하고 왼쪽부터 늘린다.
  const st = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0, Math.min(1, v.value)) }] }));
  return (
    <View style={[s.track, { height, borderRadius: height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[{ width: '100%', height, borderRadius: height, overflow: 'hidden', transformOrigin: 'left center' }, st]}>
        <Gradient angle="right" />
      </Animated.View>
    </View>
  );
}

/** 짧은 맥박(층 바뀜 신호 등, V3-7). key 가 바뀔 때마다 한 번. */
export function Pulse({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = !useLook().moving;
  const sc = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    sc.value = 0.9;
    sc.value = withSpring(1, { damping: 9, stiffness: 260 });
  }, [trigger, reduce, sc]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return <Animated.View style={[st, style]}>{children}</Animated.View>;
}

/**
 * 끄는 시트(V3-6): 지도 위에 떠 있고, snaps(위에서 잰 보이는 높이, 작은 것부터) 사이를 스프링으로 붙음.
 * 손잡이와 제목은 누르거나 끌어서 조작. 제목 옆 단추는 별도 터치 영역으로 유지.
 */
export function Sheet({
  snaps,
  initial = 0,
  children,
  header,
  headerActions,
  bottomOffset = 0,
  onSnap,
  collapseSignal = 0,
}: {
  snaps: number[];
  initial?: number;
  children: ReactNode;
  header?: ReactNode;
  headerActions?: ReactNode;
  bottomOffset?: number;
  onSnap?: (i: number) => void;
  /** 값이 바뀌면 가장 작은 자리로 접음(지도를 만질 때) */
  collapseSignal?: number;
}) {
  const reduce = !useLook().moving;
  const {
    settings: { language },
  } = useApp();
  const max = snaps[snaps.length - 1];
  const toY = (i: number) => max - snaps[i];
  const y = useSharedValue(toY(initial));
  const start = useSharedValue(0);
  const [at, setAt] = useState(initial);
  const go = (i: number) => {
    'worklet';
    const t = max - snaps[i];
    y.value = reduce ? withTiming(t, { duration: 0 }) : withSpring(t, motion.sheetSpring);
  };
  const report = (i: number) => {
    setAt(i);
    onSnap?.(i);
  };
  const pan = () =>
    Gesture.Pan()
      .activeOffsetY([-8, 8])
      .onStart(() => {
        start.value = y.value;
      })
      .onUpdate((e) => {
        y.value = Math.max(-12, Math.min(max - snaps[0] + 24, start.value + e.translationY));
      })
      .onEnd((e) => {
        const proj = y.value + e.velocityY * 0.12;
        let best = 0;
        for (let i = 1; i < snaps.length; i++) if (Math.abs(max - snaps[i] - proj) < Math.abs(max - snaps[best] - proj)) best = i;
        go(best);
        scheduleOnRN(report, best);
      });
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  useEffect(() => {
    if (!collapseSignal) return;
    go(0);
    setAt(0); // eslint-disable-line react-hooks/set-state-in-effect -- 바깥 신호(지도 만짐)에 맞춰 접음
    onSnap?.(0);
  }, [collapseSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => {
    const i = (at + 1) % snaps.length;
    go(i);
    report(i);
  };
  const tap = () =>
    Gesture.Tap().onEnd((_event, success) => {
      if (success) scheduleOnRN(next);
    });
  return (
    // 탭 자리만큼 아래로 면을 연장해 펼쳐도 화면 하단에 틈이 생기지 않게 한다.
    <Animated.View style={[s.sheet, { height: max + bottomOffset + 24, bottom: -24 }, st]}>
      <Glass strong radius={shape.sheetTop} style={[s.sheetIn, { paddingBottom: bottomOffset + 24 }]}>
        <GestureDetector gesture={Gesture.Exclusive(pan(), tap())}>
          <View
            style={s.grab}
            accessible
            accessibilityRole="button"
            accessibilityLabel={translate(language, at === snaps.length - 1 ? 'collapseSheet' : 'expandSheet')}
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={next}
          >
            <View style={s.grabBar} />
          </View>
        </GestureDetector>
        {header ? (
          <View style={s.sheetHeader}>
            <GestureDetector gesture={Gesture.Exclusive(pan(), tap())}>
              <View
                style={s.sheetTitleHandle}
                accessible
                accessibilityRole="button"
                accessibilityState={{ expanded: at === snaps.length - 1 }}
                accessibilityHint={translate(language, at === snaps.length - 1 ? 'collapseSheet' : 'expandSheet')}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={next}
              >
                {header}
              </View>
            </GestureDetector>
            {headerActions}
          </View>
        ) : null}
        {/* 접힌 자리(0)에서는 내용을 숨김: 아래 탭 바 뒤로 비쳐 보이지 않게 */}
        <Animated.View
          entering={reduce ? undefined : FadeIn.duration(motion.base)}
          style={{ flex: 1, opacity: at === 0 && snaps.length > 1 ? 0 : 1 }}
          pointerEvents={at === 0 && snaps.length > 1 ? 'none' : 'auto'}
        >
          {children}
        </Animated.View>
      </Glass>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  edge: { position: 'absolute', left: 0, right: 0 },
  track: { backgroundColor: 'rgba(79,70,229,0.12)', overflow: 'hidden' },
  sheet: { position: 'absolute', left: 0, right: 0 },
  sheetIn: { flex: 1, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8 },
  sheetTitleHandle: { flex: 1, minHeight: 48, justifyContent: 'center' },
  grab: { height: 44, marginBottom: -12, alignItems: 'center', justifyContent: 'center' }, // 터치 44, 보이는 막대는 위쪽
  grabBar: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(20,34,53,0.22)' },
});
