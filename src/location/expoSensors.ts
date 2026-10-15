// 실제 센서: expo-location(위치·나침반), expo-sensors(걸음 Pedometer, 기압 Barometer). 앞쪽(전경)에서만 씀.
import * as Location from 'expo-location';
import { Barometer, Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';
import type { SensorSources } from './sensors';

const safe = async <T>(f: () => Promise<T>): Promise<T | null> => {
  try {
    return await f();
  } catch {
    return null;
  }
};

/** 권한을 묻지 않고 이미 있는지만. */
export async function hasLocationPermission(): Promise<boolean> {
  return (await safe(async () => (await Location.getForegroundPermissionsAsync()).status === 'granted')) ?? false;
}
export async function requestLocationPermission(): Promise<boolean> {
  return (await safe(async () => (await Location.requestForegroundPermissionsAsync()).status === 'granted')) ?? false;
}

export const expoSensors: SensorSources = {
  now: () => Date.now() / 1000,
  position: (cb) =>
    safe(async () => {
      if (!(await hasLocationPermission())) return null;
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (p) =>
          cb({
            lon: p.coords.longitude,
            lat: p.coords.latitude,
            accuracyM: p.coords.accuracy ?? null,
            speed: p.coords.speed ?? null,
            course: p.coords.heading ?? null,
          }),
      );
      return () => sub.remove();
    }),
  heading: (cb) =>
    safe(async () => {
      if (Platform.OS === 'web') return null;
      const sub = await Location.watchHeadingAsync((h) => cb(h.trueHeading >= 0 ? h.trueHeading : h.magHeading));
      return () => sub.remove();
    }),
  steps: (cb) =>
    safe(async () => {
      if (!(await Pedometer.isAvailableAsync())) return null;
      if ((await Pedometer.requestPermissionsAsync()).status !== 'granted') return null;
      const sub = Pedometer.watchStepCount((r) => cb(r.steps));
      return () => sub.remove();
    }),
  pressure: (cb) =>
    safe(async () => {
      if (!(await Barometer.isAvailableAsync())) return null;
      Barometer.setUpdateInterval(1000);
      const sub = Barometer.addListener((r) => cb(r.pressure));
      return () => sub.remove();
    }),
};
