import { Tabs } from 'expo-router';
import { renderActiveScreen } from '../../ui/useActiveRoute';
import { useApp } from '../../state/AppState';
import { translate } from '../../i18n/translations';

/** 메뉴와 3D는 앱 루트에서 유지하고, 탭 콘텐츠만 즉시 바꾼다. */
export default function TabLayout() {
  const { settings: { language } } = useApp();
  return (
    <Tabs
      initialRouteName="index"
      screenLayout={renderActiveScreen}
      backBehavior="history"
      detachInactiveScreens={false}
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: false,
        animation: 'none',
      }}
    >
      <Tabs.Screen name="index" options={{ title: translate(language, 'map') }} />
      <Tabs.Screen name="saved" options={{ title: translate(language, 'saved') }} />
      <Tabs.Screen name="offline" options={{ title: translate(language, 'offline') }} />
    </Tabs>
  );
}
