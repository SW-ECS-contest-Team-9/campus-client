import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { tabSlideSpec } from '../../ui/theme';

/** 탭 화면은 첫 방문에 만들고 유지. 각 화면의 기존 탭 UI로 이동한다.
 *  전환은 탭 순서 방향으로 화면 너비만큼 옆으로 밀림(흐려지지 않음, tabSlideSpec). */
export default function TabLayout() {
  const { width } = useWindowDimensions();
  return (
    <Tabs
      initialRouteName="index"
      backBehavior="history"
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: false,
        animation: 'shift',
        transitionSpec: { animation: 'timing', config: tabSlideSpec },
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: {
            // progress: -1 = 왼쪽(앞 순서) 탭, 0 = 보이는 탭, 1 = 오른쪽(뒤 순서) 탭
            transform: [{ translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width, 0, width] }) }],
          },
        }),
      }}
    >
      <Tabs.Screen name="index" options={{ title: '지도' }} />
      <Tabs.Screen name="saved" options={{ title: '저장' }} />
      <Tabs.Screen name="offline" options={{ title: '오프라인' }} />
    </Tabs>
  );
}
