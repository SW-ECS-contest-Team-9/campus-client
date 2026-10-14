import { Stack } from 'expo-router';
import { AppProvider } from '../state/AppState';

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerTitleStyle: { fontSize: 17 } }}>
        <Stack.Screen name="index" options={{ title: '서경대 지도' }} />
        <Stack.Screen name="search" options={{ title: '검색 결과' }} />
        <Stack.Screen name="place/[key]" options={{ title: '장소' }} />
        <Stack.Screen name="route" options={{ title: '길찾기' }} />
        <Stack.Screen name="favorites" options={{ title: '즐겨찾기' }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
      </Stack>
    </AppProvider>
  );
}
