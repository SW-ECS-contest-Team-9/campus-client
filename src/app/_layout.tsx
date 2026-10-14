import { router, Stack } from 'expo-router';
import type React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { pageUrl } from '../map3d/embed';
import { AppProvider, useApp } from '../state/AppState';
import { Map3DHost } from '../ui/Map3D';

// 머리는 각 화면이 직접 그림(ui/kit Screen). 흐름: 지도 → 검색 → 장소 → 출발점 → 옵션 → 미리보기 → 안내 → 도착.
if (__DEV__) (globalThis as { __router?: typeof router }).__router = router; // 개발 중 화면 시험용

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Shared3D>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F6F8FB' } }} />
        </Shared3D>
      </AppProvider>
    </SafeAreaProvider>
  );
}

/** 3D 지도 페이지 하나를 앱 전체가 함께 씀(화면 바꿀 때 다시 불러오지 않음). */
function Shared3D({ children }: { children: React.ReactNode }) {
  const app = useApp();
  return <Map3DHost url={pageUrl(app.settings.map3dUrl, app.settings.light)}>{children}</Map3DHost>;
}
