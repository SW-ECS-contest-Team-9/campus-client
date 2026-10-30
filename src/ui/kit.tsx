// 화면 공통 틀(Screen·Card·글·아래 탭). 단추·칩·줄은 ./components 를 직접 쓴다.
// 기준 기기 Galaxy S21(360×800 dp): 누르는 곳 48 dp 이상, CTA 52.
import { router, useIsFocused } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gradient, WaveHeader } from './v3';
import { color, elevation, glass, shape, space, type } from './theme';
import { IconButton, TabBarView, type TabKey } from './components';

/** 화면 틀: 상태 표시줄·아래 막대 여백, 머리(뒤로 + 제목), 내용 스크롤. */
export function Screen({
  title,
  back = true,
  children,
  scroll = true,
  footer,
}: {
  title?: string;
  back?: boolean;
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
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

export function Card({
  children,
  style,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'primary' | 'caution' | 'confirmed';
}) {
  const bg =
    tone === 'primary'
      ? color.primarySoft
      : tone === 'caution'
        ? color.warningSoft
        : tone === 'confirmed'
          ? color.successSoft
          : glass.fillStrong;
  return <View style={[s.card, { backgroundColor: bg }, style]}>{children}</View>;
}

export const H = ({ children }: { children: ReactNode }) => (
  <Text style={s.h} accessibilityRole="header">
    {children}
  </Text>
);
export const Section = ({ children }: { children: ReactNode }) => <Text style={s.section}>{children}</Text>;
export const P = ({ children, tone }: { children: ReactNode; tone?: 'caution' | 'muted' }) => (
  <Text
    style={[s.p, tone === 'caution' && { color: color.warning }, tone === 'muted' && { color: color.secondary, fontSize: type.caption }]}
  >
    {children}
  </Text>
);

/** 아래 탭(지도·저장·오프라인) — Navigation/TabBar */
export function TabBar({ at }: { at: TabKey }) {
  const inset = useSafeAreaInsets();
  const to = { map: '/', saved: '/saved', offline: '/offline' } as const;
  return <TabBarView at={at} focused={useIsFocused()} bottomInset={inset.bottom} onSelect={(k) => router.navigate(to[k])} />;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  back: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)', shadowOpacity: 0, elevation: 0 },
  title: { flex: 1, fontSize: type.title, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  body: { paddingHorizontal: space[20], gap: 12, paddingTop: 4 },
  footer: {
    paddingHorizontal: space[20],
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
  h: { fontSize: type.display - 2, lineHeight: 34, fontWeight: '800', color: color.text, marginTop: 4, letterSpacing: -0.5 },
  section: { fontSize: type.small, fontWeight: '700', color: color.secondary, marginTop: 8 },
  p: { fontSize: type.small, lineHeight: 22, color: color.text },
});
