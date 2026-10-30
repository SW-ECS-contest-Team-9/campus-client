import { router, Stack } from 'expo-router';
import type React from 'react';
import { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { pageUrl } from '../map3d/commands';
import { AppProvider, useApp } from '../state/AppState';
import { ToastProvider } from '../ui/feedback';
import { TierCtx, useLook } from '../ui/look';
import { Map3DHost, type Map3dPlace } from '../ui/Map3D';
import { color, motion } from '../ui/theme';

// 머리는 각 화면이 직접 그림(ui/kit Screen). 흐름: 지도 → 검색 → 장소 → 출발점 → 옵션 → 미리보기 → 안내 → 도착.
if (__DEV__) (globalThis as { __router?: typeof router }).__router = router; // 개발 중 화면 시험용

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style="dark" />
          <ToastProvider>
            <Shared3D>
              <Screens />
            </Shared3D>
          </ToastProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** 화면 더미. 동작 줄이기면 화면 전환 효과 없음. */
function Screens() {
  const { moving } = useLook();
  return (
    <Stack
      initialRouteName="(tabs)"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.canvas },
        animation: moving ? 'fade_from_bottom' : 'none',
        animationDuration: motion.base,
      }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

/** 3D 지도 페이지 하나를 앱 전체가 함께 씀(화면 바꿀 때 다시 불러오지 않음). */
function Shared3D({ children }: { children: React.ReactNode }) {
  const app = useApp();
  // 네이티브 3D 위 장소 점(길찾기 되는 장소만)
  const pkg = app.pkg;
  const places = useMemo<Map3dPlace[] | undefined>(
    () =>
      pkg?.places
        .filter((p) => p.nodeKey)
        .map((p) => ({ id: p.key.replace(/^p:/, ''), name: p.name.split(/[=(]/)[0].trim(), x: p.x, y: p.y, z: p.z })),
    [pkg],
  );
  return (
    <TierCtx.Provider value={app.tier}>
      <Map3DHost
        url={pageUrl(app.settings.map3dUrl, app.settings.light)}
        engine={app.settings.map3dEngine}
        light={app.settings.light || app.tier === 3}
        places={places}
        onFirstReady={app.noteFirst3dReady}
      >
        {children}
      </Map3DHost>
    </TierCtx.Provider>
  );
}
