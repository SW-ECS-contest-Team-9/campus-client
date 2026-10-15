// 현재 위치 1회 읽기: expo-location → EPSG:5186. 계속 읽기·통로 맞춤은 expoSensors.ts + tracker.ts(위치 보정 v2).
import * as Location from 'expo-location';
import { wgs84To5186 } from './projection';
import { toFix, type Fix } from './fix';

export * from './fix';

/** 위치 권한을 받고 1회 위치를 읽는다. 권한이 없으면 null. */
export async function getFix(isIndoor: (x: number, y: number) => boolean = () => false): Promise<Fix | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return null;
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
  const { x, y } = wgs84To5186(p.coords.longitude, p.coords.latitude);
  return toFix(p.coords.longitude, p.coords.latitude, p.coords.accuracy ?? null, p.timestamp, isIndoor(x, y));
}
