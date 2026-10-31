// 화면 공통 틀(Screen·Card·글·아래 탭). 단추·칩·줄은 ./components 를 직접 쓴다.
// 기준 기기 Galaxy S21(360×800 dp): 누르는 곳 48 dp 이상, CTA 52.
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gradient, WaveHeader } from './v3';
import { color, elevation, glass, shape, space, type } from './theme';
import { IconButton, PressScale, TabBarView } from './components';
import { TAB_BAR_HEIGHT } from './navigation';
import { useActiveTab } from './useActiveRoute';
import { Banner } from './feedback';
import { useApp } from '../state/AppState';
import { translate } from '../i18n/translations';
import { useState } from 'react';

// 배너를 닫으면 앱을 다시 켤 때까지 숨김(화면마다 다시 뜨지 않게)
let bannerClosed = false;

/** 화면 틀: 상태 표시줄·아래 막대 여백, 머리(뒤로 + 제목), 내용 스크롤. */
export function Screen({
  title,
  back = true,
  children,
  scroll = true,
  footer,
  headerAction,
}: {
  title?: string;
  back?: boolean;
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  headerAction?: { label: string; onPress: () => void };
}) {
  const inset = useSafeAreaInsets();
  const app = useApp();
  const [closed, setClosed] = useState(bannerClosed);
  // 서버에서 받은 지도가 아니면(인터넷 없음·아직 안 받음) 한 줄 배너. 검색·미리보기마다 따로 적지 않음.
  const src = app.loaded?.source;
  const bannerText =
    closed || !src || src === 'server'
      ? null
      : src === 'fixture'
        ? translate(app.settings.language, 'bundledBanner')
        : translate(app.settings.language, 'offlineBanner');
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
                label={translate(app.settings.language, 'back')}
                iconColor={color.onPrimary}
                style={s.back}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              />
            ) : null}
            <Text style={s.title} numberOfLines={2} accessibilityRole="header">
              {title}
            </Text>
            {headerAction ? (
              <PressScale
                accessibilityLabel={headerAction.label}
                onPress={headerAction.onPress}
                style={(pressed) => [s.headerAction, s.back, pressed && { backgroundColor: 'rgba(255,255,255,0.28)' }]}
              >
                <Text style={s.headerActionText}>{headerAction.label}</Text>
              </PressScale>
            ) : null}
          </View>
        </WaveHeader>
      ) : (
        <View style={{ height: inset.top }} />
      )}
      {bannerText ? (
        <Banner
          text={bannerText}
          closeLabel={translate(app.settings.language, 'closeNotice')}
          onClose={() => {
            bannerClosed = true;
            setClosed(true);
          }}
        />
      ) : null}
      <View style={{ flex: 1 }}>{body}</View>
      {footer ? <FooterPanel>{footer}</FooterPanel> : null}
    </View>
  );
}

/** 화면 아래 또는 지도 위에 놓는 공통 버튼 패널. */
export function FooterPanel({
  children,
  style,
  onLayout,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: ViewProps['onLayout'];
}) {
  const inset = useSafeAreaInsets();
  return (
    <View style={[s.footer, { paddingBottom: inset.bottom + 12 }, style]} onLayout={onLayout}>
      {children}
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

/** 3D와 화면 전환 위에 하나만 유지하는 하단 메뉴. */
export function MainTabBar() {
  const inset = useSafeAreaInsets();
  const at = useActiveTab();
  const app = useApp();
  const to = { map: '/', saved: '/saved', offline: '/offline', settings: '/settings' } as const;
  if (!at || !app.pkg) return null;
  return (
    <View testID="main-tab-bar" style={s.tabs} pointerEvents="box-none">
      <TabBarView at={at} bottomInset={inset.bottom} labels={{ map: translate(app.settings.language, 'map'), saved: translate(app.settings.language, 'saved'), offline: translate(app.settings.language, 'offline'), settings: translate(app.settings.language, 'settings') }} onSelect={(k) => router.navigate(to[k])} />
    </View>
  );
}

/** 고정 메뉴에 가리지 않도록 탭 콘텐츠의 아래 공간을 확보한다. */
export function TabScreen({ children }: { children: ReactNode }) {
  const inset = useSafeAreaInsets();
  return <View style={{ flex: 1, paddingBottom: TAB_BAR_HEIGHT + inset.bottom }}>{children}</View>;
}

const s = StyleSheet.create({
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  root: { flex: 1, backgroundColor: color.canvas },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  back: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)', shadowOpacity: 0, elevation: 0 },
  headerAction: {
    minHeight: space[48],
    paddingHorizontal: 16,
    borderRadius: shape.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerActionText: { color: color.onPrimary, fontSize: type.small, fontWeight: '700' },
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
