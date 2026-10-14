import { router, Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../state/AppState';

// 머리는 각 화면이 직접 그림(ui/kit Screen). 흐름: 지도 → 검색 → 장소 → 출발점 → 옵션 → 미리보기 → 안내 → 도착.
if (__DEV__) (globalThis as { __router?: typeof router }).__router = router; // 개발 중 화면 시험용

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F6F8FB' } }} />
      </AppProvider>
    </SafeAreaProvider>
  );
}
