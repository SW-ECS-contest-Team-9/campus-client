// 화면 공통 틀과 짧은 이름 부품. 실제 모양은 ./components(Figma 컴포넌트 대응)에 있음.
// 기준 기기 Galaxy S21(360×800 dp): 누르는 곳 48 dp 이상, CTA 52.
import { router, useIsFocused } from 'expo-router';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation, glass, shape } from './theme';
import { Gradient, WaveHeader } from './v3';
import { Button, color, FloorItem, IconButton, PressScale, ResultRow, StatusChip, TabBarView, type TabKey } from './components';

/** Foundations 토큰(옛 이름 유지). 색은 components 의 color 와 같음. */
export const T = {
  primary: color.primary,
  primarySoft: color.primarySoft,
  route: color.route,
  confirmed: color.success,
  confirmedSoft: color.successSoft,
  caution: color.warning,
  cautionSoft: color.warningSoft,
  text: color.text,
  sub: color.secondary,
  line: color.border,
  canvas: color.canvas,
  card: color.surface,
  margin: 20,
  touch: 48,
  cta: 52,
  radius: 16,
  panel: 24,
  display: 28,
  title: 22,
  body: 17,
  small: 15,
  caption: 13,
};

/** 화면 틀: 상태 표시줄·아래 막대 여백, 머리(뒤로 + 제목), 내용 스크롤. */
export function Screen({
  title,
  back = true,
  children,
  scroll = true,
  footer,
  right,
}: {
  title?: string;
  back?: boolean;
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  right?: ReactNode;
}) {
  const inset = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView contentContainerStyle={[s.body, { paddingBottom: footer ? 16 : inset.bottom + 16 }]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[s.body, { flex: 1, paddingBottom: footer ? 0 : inset.bottom }]}>{children}</View>
  );
  return (
    <View style={s.root}>
      <Gradient colors={['#F6F8FB', '#EEF0FF', '#E8F6FE']} angle="down" />
      {title !== undefined ? (
        <WaveHeader style={{ paddingTop: inset.top }}>
          <View style={s.head}>
            {back ? (
              <IconButton
                icon={ChevronLeft}
                label="뒤로"
                iconColor={color.onPrimary}
                style={s.back}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              />
            ) : null}
            <Text style={s.title} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
            {right}
          </View>
        </WaveHeader>
      ) : (
        <View style={{ height: inset.top }} />
      )}
      <View style={{ flex: 1 }}>{body}</View>
      {footer ? <View style={[s.footer, { paddingBottom: inset.bottom + 12 }]}>{footer}</View> : null}
    </View>
  );
}

const KIND = { primary: 'primary', soft: 'secondary', ghost: 'quiet' } as const;
export function Btn({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'soft' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Button
      label={label}
      onPress={onPress}
      variant={KIND[kind]}
      size={kind === 'ghost' ? 'regular' : 'large'}
      disabled={disabled}
      loading={loading}
      icon={icon}
      style={style}
    />
  );
}

export function Card({
  children,
  style,
  onPress,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tone?: 'primary' | 'caution' | 'confirmed';
}) {
  const bg =
    tone === 'primary' ? T.primarySoft : tone === 'caution' ? T.cautionSoft : tone === 'confirmed' ? T.confirmedSoft : glass.fillStrong;
  return onPress ? (
    <PressScale onPress={onPress} style={[s.card, { backgroundColor: bg }, style]}>
      {children}
    </PressScale>
  ) : (
    <View style={[s.card, { backgroundColor: bg }, style]}>{children}</View>
  );
}

/** Feedback/StatusChip 로 그림. primary = 안내(아이콘 없음), offline = 와이파이 꺼짐 아이콘. */
export function Badge({ text, tone }: { text: string; tone: 'confirmed' | 'caution' | 'primary' | 'offline' }) {
  return <StatusChip tone={tone === 'caution' ? 'warning' : tone === 'primary' ? 'info' : tone} label={text} />;
}

/** 고르기 칩(Floor/Item 모양: Idle/Selected). */
export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return <FloorItem label={label} state={on ? 'selected' : 'idle'} onPress={onPress} />;
}

export function Row({
  title,
  sub,
  onPress,
  icon,
  trailing,
}: {
  title: string;
  sub?: string | null;
  onPress?: () => void;
  icon?: LucideIcon;
  trailing?: ReactNode;
}) {
  return <ResultRow title={title} sub={sub} onPress={onPress} icon={icon} trailing={trailing} />;
}

export const H = ({ children }: { children: ReactNode }) => (
  <Text style={s.h} accessibilityRole="header">
    {children}
  </Text>
);
export const Section = ({ children }: { children: ReactNode }) => <Text style={s.section}>{children}</Text>;
export const P = ({ children, tone }: { children: ReactNode; tone?: 'caution' | 'muted' }) => (
  <Text style={[s.p, tone === 'caution' && { color: T.caution }, tone === 'muted' && { color: T.sub, fontSize: T.caption }]}>
    {children}
  </Text>
);

/** 아래 탭(지도·저장·오프라인) — Navigation/TabBar */
export function TabBar({ at }: { at: TabKey }) {
  const inset = useSafeAreaInsets();
  const to = { map: '/', saved: '/saved', offline: '/offline' } as const;
  return <TabBarView at={at} focused={useIsFocused()} bottomInset={inset.bottom} onSelect={(k) => router.navigate(to[k])} />;
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  back: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)', shadowOpacity: 0, elevation: 0 },
  title: { flex: 1, fontSize: T.title, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  body: { paddingHorizontal: T.margin, gap: 12, paddingTop: 4 },
  footer: {
    paddingHorizontal: T.margin,
    paddingTop: 16,
    gap: 8,
    backgroundColor: glass.fillStrong,
    borderTopLeftRadius: shape.sheetTop,
    borderTopRightRadius: shape.sheetTop,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: glass.outline,
    ...elevation.float,
  },
  card: {
    borderRadius: shape.card,
    borderBottomLeftRadius: shape.tail,
    padding: 18,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: glass.outline,
  },
  h: { fontSize: T.display - 2, lineHeight: 34, fontWeight: '800', color: T.text, marginTop: 4, letterSpacing: -0.5 },
  section: { fontSize: T.small, fontWeight: '700', color: T.sub, marginTop: 8 },
  p: { fontSize: T.small, lineHeight: 22, color: T.text },
});
