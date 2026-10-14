// 화면 공통 부품과 색·크기(Figma Foundations). 기준 기기 Galaxy S21(360×800 dp): 누르는 곳 48 dp 이상, CTA 52.
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const T = {
  primary: '#4F46E5', primarySoft: '#EEF0FF', route: '#2563EB', confirmed: '#0F766E', confirmedSoft: '#E3F4F1',
  caution: '#B45309', cautionSoft: '#FFF4E5', text: '#142235', sub: '#55657A', line: '#DDE3EC', canvas: '#F6F8FB', card: '#FFFFFF',
  margin: 20, touch: 48, cta: 52, radius: 16, panel: 24,
  display: 28, title: 22, body: 17, small: 15, caption: 13,
};

/** 화면 틀: 상태 표시줄·아래 막대 여백, 머리(뒤로 + 제목), 내용 스크롤. */
export function Screen({ title, back = true, children, scroll = true, footer, right }: { title?: string; back?: boolean; children: ReactNode; scroll?: boolean; footer?: ReactNode; right?: ReactNode }) {
  const inset = useSafeAreaInsets();
  const body = scroll
    ? <ScrollView contentContainerStyle={[s.body, { paddingBottom: footer ? 16 : inset.bottom + 16 }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={[s.body, { flex: 1, paddingBottom: footer ? 0 : inset.bottom }]}>{children}</View>;
  return (
    <View style={[s.root, { paddingTop: inset.top }]}>
      {title !== undefined ? (
        <View style={s.head}>
          {back ? <Pressable accessibilityRole="button" accessibilityLabel="뒤로" style={s.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><Text style={s.backT}>‹</Text></Pressable> : null}
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          {right}
        </View>
      ) : null}
      {body}
      {footer ? <View style={[s.footer, { paddingBottom: inset.bottom + 12 }]}>{footer}</View> : null}
    </View>
  );
}

export function Btn({ label, onPress, kind = 'primary', disabled, style }: { label: string; onPress?: () => void; kind?: 'primary' | 'soft' | 'ghost'; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.btn, kind === 'soft' && s.btnSoft, kind === 'ghost' && s.btnGhost, disabled && s.off, pressed && { opacity: 0.85 }, style]}>
      <Text style={[s.btnT, kind !== 'primary' && { color: T.primary }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: 'primary' | 'caution' | 'confirmed' }) {
  const bg = tone === 'primary' ? T.primarySoft : tone === 'caution' ? T.cautionSoft : tone === 'confirmed' ? T.confirmedSoft : T.card;
  const inner = <View style={[s.card, { backgroundColor: bg }, style]}>{children}</View>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>{inner}</Pressable> : inner;
}

export function Badge({ text, tone }: { text: string; tone: 'confirmed' | 'caution' | 'primary' }) {
  const c = tone === 'confirmed' ? [T.confirmedSoft, T.confirmed] : tone === 'caution' ? [T.cautionSoft, T.caution] : [T.primarySoft, T.primary];
  const mark = tone === 'confirmed' ? '✓ ' : tone === 'caution' ? '! ' : '';
  return <View style={[s.badge, { backgroundColor: c[0] }]}><Text style={[s.badgeT, { color: c[1] }]}>{mark}{text}</Text></View>;
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipT, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ title, sub, onPress, icon }: { title: string; sub?: string | null; onPress?: () => void; icon?: string }) {
  return (
    <Card onPress={onPress} style={s.row}>
      {icon ? <Text style={s.rowIcon}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={s.rowT}>{title}</Text>
        {sub ? <Text style={s.rowS}>{sub}</Text> : null}
      </View>
      {onPress ? <Text style={s.chev}>›</Text> : null}
    </Card>
  );
}

export const H = ({ children }: { children: ReactNode }) => <Text style={s.h}>{children}</Text>;
export const Section = ({ children }: { children: ReactNode }) => <Text style={s.section}>{children}</Text>;
export const P = ({ children, tone }: { children: ReactNode; tone?: 'caution' | 'muted' }) => <Text style={[s.p, tone === 'caution' && { color: T.caution }, tone === 'muted' && { color: T.sub, fontSize: T.caption }]}>{children}</Text>;

/** 아래 탭(지도·저장·오프라인) */
export function TabBar({ at }: { at: 'map' | 'saved' | 'offline' }) {
  const inset = useSafeAreaInsets();
  const tabs = [{ k: 'map', label: '지도', icon: '◫', to: '/' }, { k: 'saved', label: '저장', icon: '☆', to: '/saved' }, { k: 'offline', label: '오프라인', icon: '⤓', to: '/offline' }] as const;
  return (
    <View style={[s.tabs, { paddingBottom: inset.bottom }]}>
      {tabs.map((t) => (
        <Pressable key={t.k} accessibilityRole="tab" accessibilityState={{ selected: at === t.k }} style={s.tab} onPress={() => at !== t.k && router.replace(t.to)}>
          <Text style={[s.tabI, at === t.k && { color: T.primary }]}>{t.icon}</Text>
          <Text style={[s.tabT, at === t.k && { color: T.primary, fontWeight: '700' }]}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: T.margin, paddingVertical: 10 },
  back: { width: T.touch, height: T.touch, borderRadius: 14, backgroundColor: T.card, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  backT: { fontSize: 28, lineHeight: 30, color: T.text, marginTop: -2 },
  title: { flex: 1, fontSize: T.title, fontWeight: '700', color: T.text },
  body: { paddingHorizontal: T.margin, gap: 12 },
  footer: { paddingHorizontal: T.margin, paddingTop: 12, gap: 8, backgroundColor: T.canvas },
  btn: { minHeight: T.cta, borderRadius: 14, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSoft: { backgroundColor: T.primarySoft },
  btnGhost: { backgroundColor: 'transparent', minHeight: T.touch },
  btnT: { color: '#fff', fontSize: T.small + 1, fontWeight: '700', textAlign: 'center' },
  off: { opacity: 0.4 },
  card: { borderRadius: T.radius, padding: 16, gap: 4 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeT: { fontSize: T.caption + 1, fontWeight: '600' },
  chip: { minHeight: T.touch, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: T.line, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center', minWidth: 64 },
  chipOn: { backgroundColor: T.primary, borderColor: T.primary },
  chipT: { fontSize: T.small, fontWeight: '600', color: T.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  rowIcon: { fontSize: 20, color: T.primary, width: 24, textAlign: 'center' },
  rowT: { fontSize: T.body, fontWeight: '700', color: T.text },
  rowS: { fontSize: T.caption + 1, color: T.sub, marginTop: 2 },
  chev: { fontSize: 22, color: T.sub },
  h: { fontSize: T.display - 2, lineHeight: 34, fontWeight: '800', color: T.text, marginTop: 4 },
  section: { fontSize: T.small, fontWeight: '700', color: T.sub, marginTop: 8 },
  p: { fontSize: T.small, lineHeight: 22, color: T.text },
  tabs: { flexDirection: 'row', backgroundColor: T.card, borderTopWidth: 1, borderColor: T.line },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabI: { fontSize: 18, color: T.sub },
  tabT: { fontSize: T.caption, color: T.sub },
});
