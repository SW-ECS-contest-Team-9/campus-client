import { Tabs } from 'expo-router';
import { renderActiveScreen } from '../../ui/useActiveRoute';

/** 메뉴와 3D는 앱 루트에서 유지하고, 탭 콘텐츠만 즉시 바꾼다. */
export default function TabLayout() {
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
      <Tabs.Screen name="index" options={{ title: '지도' }} />
      <Tabs.Screen name="saved" options={{ title: '저장' }} />
      <Tabs.Screen name="offline" options={{ title: '지도 저장' }} />
      <Tabs.Screen name="settings" options={{ title: '설정' }} />
    </Tabs>
  );
}
