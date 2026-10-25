import { Tabs } from 'expo-router';

/** 탭 화면은 첫 방문에 만들고 유지. 각 화면의 기존 탭 UI로 이동한다. */
export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      backBehavior="history"
      tabBar={() => null}
      screenOptions={{ headerShown: false, lazy: true, freezeOnBlur: false, animation: 'fade' }}
    >
      <Tabs.Screen name="index" options={{ title: '지도' }} />
      <Tabs.Screen name="saved" options={{ title: '저장' }} />
      <Tabs.Screen name="offline" options={{ title: '오프라인' }} />
    </Tabs>
  );
}
