// Figma "01 · Components" 대응 부품(파일 4FWwpxPN4m0ixK1awFLsoA). 변형 이름은 Figma 와 같게 둔다.
// 토큰은 Foundations 변수(color/*, space/*, radius/*, Campus/Action label·Caption). 터치 48 dp(space/48), CTA 52.
// 누름: Figma 에 프로토타입 동작이 없어(reactions 0) 짧은 눌림(크기 0.97 + Pressed 색, 100 ms)을 넣음 — 동작 줄이기 설정이면 크기 변화 없음.
import {
  ArrowRight,
  Bookmark,
  Check,
  CircleAlert,
  Clock,
  Download,
  Map as MapIcon,
  Navigation,
  Search,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

export const color = {
  primary: '#4F46E5',
  primaryPressed: '#3730A3',
  primarySoft: '#EEF0FF',
  primarySoftPressed: '#E0E3FF',
  route: '#2563EB',
  success: '#0F766E',
  successSoft: '#E3F4EE',
  warning: '#B45309',
  warningSoft: '#FFF4DD',
  text: '#142235',
  secondary: '#536174',
  border: '#DEE5EF',
  surface: '#FFFFFF',
  canvas: '#F6F8FB',
  onPrimary: '#FFFFFF',
} as const;
export const space = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 48: 48 } as const;
export const radius = { 12: 12, 16: 16, 24: 24 } as const;
export const type = {
  display: 28,
  title: 22,
  body: 17,
  small: 15,
  caption: 13,
  actionLabel: { fontSize: 15, lineHeight: 22, fontWeight: '700' as const },
  captionText: { fontSize: 13, lineHeight: 20, fontWeight: '400' as const },
};
export const ICON = 20;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** 동작 줄이기(접근성) 설정 */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return on;
}

type PressProps = {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle> | ((pressed: boolean) => StyleProp<ViewStyle>);
  children: ReactNode | ((pressed: boolean) => ReactNode);
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab' | 'search' | 'link';
  accessibilityState?: { selected?: boolean; disabled?: boolean; busy?: boolean };
  hitSlop?: number;
};

/** 눌림 공통: 100 ms 동안 0.97 로 줄고 Pressed 색(각 부품이 pressed 로 고름). */
export function PressScale({
  onPress,
  disabled,
  style,
  children,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  hitSlop,
}: PressProps) {
  const reduce = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);
  const to = (v: number) => {
    if (reduce) return;
    Animated.timing(scale, { toValue: v, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      onPressIn={() => {
        setPressed(true);
        to(0.97);
      }}
      onPressOut={() => {
        setPressed(false);
        to(1);
      }}
      style={[typeof style === 'function' ? style(pressed) : style, { transform: [{ scale }] }]}
    >
      {typeof children === 'function' ? children(pressed) : children}
    </AnimatedPressable>
  );
}

// ---------- Action/Button (4:334) ----------
export type ButtonStyle = 'primary' | 'secondary' | 'quiet';
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled,
  loading,
  icon: Icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonStyle;
  size?: 'regular' | 'large';
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled && !loading;
  const fg = off ? color.secondary : variant === 'primary' ? color.onPrimary : color.primary;
  const bg = (p: boolean) =>
    off
      ? color.border
      : variant === 'primary'
        ? p
          ? color.primaryPressed
          : color.primary
        : variant === 'secondary'
          ? p
            ? color.primarySoftPressed
            : color.primarySoft
          : p
            ? color.primarySoft
            : 'transparent';
  const Lead = loading ? Clock : Icon;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      accessibilityState={{ busy: !!loading }}
      style={(p) => [b.btn, { minHeight: size === 'large' ? 52 : space[48], backgroundColor: bg(p) }, style]}
    >
      {Lead ? <Lead size={ICON} color={fg} strokeWidth={2} /> : null}
      <Text style={[b.btnT, { color: fg }]}>{label}</Text>
    </PressScale>
  );
}

// ---------- Action/IconButton (4:346) ----------
export function IconButton({
  icon: Icon,
  label,
  onPress,
  tone = 'surface',
  size = space[48],
  iconColor,
  style,
}: {
  icon: LucideIcon;
  /** 화면 읽기용 이름(필수: 글자 없는 단추) */
  label: string;
  onPress?: () => void;
  tone?: 'surface' | 'primary';
  size?: number;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = tone === 'primary';
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={label}
      style={(p) => [
        b.iconBtn,
        { width: size, height: size },
        primary
          ? { backgroundColor: p ? color.primaryPressed : color.primary, borderColor: 'transparent' }
          : { backgroundColor: p ? color.canvas : color.surface },
        style,
      ]}
    >
      <Icon size={ICON + 2} color={iconColor ?? (primary ? color.onPrimary : color.text)} strokeWidth={2} />
    </PressScale>
  );
}

// ---------- Input/Search (4:368) ----------
/** onPress 를 주면 누르면 검색 화면으로 가는 단추 모양(Idle), 아니면 입력칸(Focused/Filled). */
export function SearchInput({
  value,
  onChangeText,
  placeholder = '건물, 강의실, 시설 검색',
  onPress,
  ...rest
}: { value?: string; onChangeText?: (t: string) => void; placeholder?: string; onPress?: () => void } & Omit<TextInputProps, 'style'>) {
  const [focused, setFocused] = useState(false);
  if (onPress) {
    return (
      <PressScale
        onPress={onPress}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        style={(p) => [b.search, p && { borderColor: color.primary }]}
      >
        <Search size={ICON} color={color.text} />
        <Text style={b.searchPh}>{placeholder}</Text>
      </PressScale>
    );
  }
  return (
    <View style={[b.search, (focused || !!value) && { borderColor: color.primary }]}>
      <Search size={ICON} color={focused || value ? color.primary : color.text} />
      <TextInput
        style={b.searchT}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.secondary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
    </View>
  );
}

// ---------- Place/ResultRow (4:406) ----------
export function ResultRow({
  title,
  sub,
  icon: Icon,
  onPress,
  selected,
  trailing,
}: {
  title: string;
  sub?: string | null;
  icon?: LucideIcon;
  onPress?: () => void;
  selected?: boolean;
  trailing?: ReactNode;
}) {
  const body = () => (
    <>
      {Icon ? <Icon size={ICON + 2} color={color.primary} strokeWidth={1.8} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={b.rowT}>{title}</Text>
        {sub ? <Text style={b.rowS}>{sub}</Text> : null}
      </View>
      {trailing}
    </>
  );
  const st = (p: boolean): StyleProp<ViewStyle> => [b.row, (selected || p) && { backgroundColor: color.primarySoft }];
  return onPress ? (
    <PressScale onPress={onPress} accessibilityLabel={sub ? `${title}, ${sub}` : title} style={st}>
      {body}
    </PressScale>
  ) : (
    <View style={st(false)}>{body()}</View>
  );
}

// ---------- Floor/Item (4:419) ----------
export type FloorState = 'idle' | 'selected' | 'current' | 'unknown';
export function FloorItem({
  label,
  state = 'idle',
  onPress,
  a11yLabel,
}: {
  label: string;
  state?: FloorState;
  onPress?: () => void;
  a11yLabel?: string;
}) {
  const sel = state === 'selected';
  const unk = state === 'unknown';
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ selected: sel }}
      style={(p) => [
        b.floor,
        sel && { backgroundColor: p ? color.primaryPressed : color.primary, borderColor: color.primary },
        unk && { backgroundColor: color.warningSoft, borderColor: color.warningSoft },
        !sel && !unk && p && { backgroundColor: color.canvas },
      ]}
    >
      <Text style={[b.floorT, sel && { color: color.onPrimary }, unk && { color: color.warning }]}>{label}</Text>
      {state === 'current' ? <View style={b.dot} /> : null}
    </PressScale>
  );
}

// ---------- Feedback/StatusChip (4:446) ----------
export type ChipTone = 'offline' | 'confirmed' | 'warning' | 'info';
const CHIP: Record<ChipTone, { bg: string; fg: string; icon: LucideIcon | null }> = {
  offline: { bg: 'transparent', fg: color.secondary, icon: WifiOff },
  confirmed: { bg: color.successSoft, fg: color.success, icon: Check },
  warning: { bg: color.warningSoft, fg: color.warning, icon: CircleAlert },
  info: { bg: color.primarySoft, fg: color.primary, icon: null },
};
export function StatusChip({ tone, label, style }: { tone: ChipTone; label: string; style?: StyleProp<ViewStyle> }) {
  const c = CHIP[tone];
  const Icon = c.icon;
  return (
    <View style={[b.chip, { backgroundColor: c.bg }, tone === 'offline' && { paddingHorizontal: 0 }, style]} accessibilityRole="text">
      {Icon ? <Icon size={16} color={c.fg} strokeWidth={2.2} /> : null}
      <Text style={[b.chipT, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// ---------- Map/Pin (4:522) ----------
export type PinType = 'start' | 'destination' | 'entrance';
const PIN: Record<PinType, { bg: string; icon: LucideIcon }> = {
  start: { bg: color.route, icon: Navigation },
  destination: { bg: color.primary, icon: Check },
  entrance: { bg: color.primary, icon: ArrowRight },
};
export function MapPin({ type, size = 40, label }: { type: PinType; size?: number; label?: string }) {
  const p = PIN[type];
  const Icon = p.icon;
  return (
    <View style={[b.pin, { width: size, height: size, backgroundColor: p.bg }]} accessibilityLabel={label} accessible={!!label}>
      <Icon size={Math.round(size * 0.5)} color={color.onPrimary} strokeWidth={2.2} />
    </View>
  );
}

// ---------- Navigation/TabBar (4:586) ----------
export type TabKey = 'map' | 'saved' | 'offline';
const TABS: { k: TabKey; label: string; icon: LucideIcon }[] = [
  { k: 'map', label: '지도', icon: MapIcon },
  { k: 'saved', label: '저장', icon: Bookmark },
  { k: 'offline', label: '오프라인', icon: Download },
];
export function TabBarView({ at, onSelect, bottomInset = 0 }: { at: TabKey; onSelect: (k: TabKey) => void; bottomInset?: number }) {
  return (
    <View style={[b.tabs, { paddingBottom: bottomInset }]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = at === t.k;
        const c = on ? color.primary : color.secondary;
        return (
          <PressScale
            key={t.k}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            onPress={() => !on && onSelect(t.k)}
            style={b.tab}
          >
            <t.icon size={ICON + 2} color={c} strokeWidth={on ? 2.4 : 2} />
            <Text style={[b.tabT, { color: c }, on && { fontWeight: '700' }]}>{t.label}</Text>
          </PressScale>
        );
      })}
    </View>
  );
}

// ---------- Offline/MapPack (4:602) ----------
export function MapPackCard({
  title,
  detail,
  action,
  state,
}: {
  title: string;
  detail: string;
  action: string;
  state: 'stored' | 'download' | 'queued';
}) {
  return (
    <View style={b.pack}>
      <Text style={b.packT}>{title}</Text>
      <Text style={b.packD}>{detail}</Text>
      <Text style={[b.packA, { color: state === 'queued' ? color.warning : color.primary }]}>{action}</Text>
    </View>
  );
}

const b = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    gap: space[8],
    borderRadius: radius[12],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[12],
  },
  btnT: { ...type.actionLabel, textAlign: 'center', flexShrink: 1 },
  iconBtn: { borderRadius: radius[12], borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    minHeight: 52,
    borderRadius: radius[12],
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: space[16],
  },
  searchPh: { fontSize: type.small + 1, color: color.secondary },
  searchT: { flex: 1, fontSize: type.small + 1, color: color.text, paddingVertical: space[12] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    minHeight: 64,
    borderRadius: radius[16],
    backgroundColor: color.surface,
    paddingHorizontal: space[16],
    paddingVertical: space[12],
  },
  rowT: { fontSize: type.body - 1, fontWeight: '700', color: color.text },
  rowS: { ...type.captionText, color: color.secondary, marginTop: 2 },
  floor: {
    minHeight: space[48],
    minWidth: 64,
    paddingHorizontal: space[16],
    borderRadius: radius[12],
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floorT: { ...type.actionLabel, color: color.text },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.route },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius[12],
    paddingHorizontal: space[12],
    paddingVertical: 6,
  },
  chipT: { ...type.captionText, fontWeight: '600', flexShrink: 1 },
  pin: { borderRadius: radius[16], alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: color.surface, borderTopWidth: 1, borderColor: color.border },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabT: { fontSize: type.caption, lineHeight: 18 },
  pack: { backgroundColor: color.surface, borderRadius: radius[16], borderWidth: 1, borderColor: color.border, padding: space[16], gap: 6 },
  packT: { fontSize: type.body, fontWeight: '800', color: color.text },
  packD: { ...type.captionText, color: color.secondary },
  packA: { fontSize: type.small, fontWeight: '700' },
});
