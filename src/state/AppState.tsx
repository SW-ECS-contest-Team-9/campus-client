// 앱 전체 상태: 지도 꾸러미, 설정·즐겨찾기(기기 저장), 경로 선택, 현재 위치.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { checkForUpdate, loadLocal, type Deps, type LoadedPackage } from '../api/mapRelease';
import type { MapPackage } from '../map/package';
import fixtureJson from '../map/fixture/campus-fixture.json';
import { buildGraph, findRoute, type Graph, type RouteCondition, type RouteResult } from '../route/route';
import type { Fix } from '../location/fix';

const fixture = fixtureJson as unknown as MapPackage;

export interface Settings {
  serverUrl: string;
}
export type StartPoint = { type: 'place'; placeKey: string } | { type: 'node'; nodeKey: string; label: string };

const SETTINGS_KEY = 'settings.v1';
const FAVORITES_KEY = 'favorites.v1';

const deps: Deps = {
  fetch: (...a) => fetch(...a),
  sha256Hex: (t) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, t),
  store: AsyncStorage,
  fixture,
};

interface AppState {
  loaded: LoadedPackage | null;
  pkg: MapPackage | null;
  graph: Graph | null;
  settings: Settings;
  setServerUrl: (url: string) => Promise<void>;
  updateStatus: string | null;
  checkUpdate: () => Promise<void>;
  favorites: string[];
  toggleFavorite: (placeKey: string) => Promise<void>;
  start: StartPoint | null;
  setStart: (s: StartPoint | null) => void;
  destKey: string | null;
  setDestKey: (k: string | null) => void;
  condition: RouteCondition;
  setCondition: (c: RouteCondition) => void;
  route: RouteResult | null;
  startNodeKey: string | null;
  fix: Fix | null;
  setFix: (f: Fix | null) => void;
  floorSel: Record<string, string>; // buildingKey → floorKey | 'all'
  setFloor: (buildingKey: string, floorKey: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadedPackage | null>(null);
  const [settings, setSettings] = useState<Settings>({ serverUrl: '' });
  const [favorites, setFavorites] = useState<string[]>([]);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [start, setStart] = useState<StartPoint | null>(null);
  const [destKey, setDestKey] = useState<string | null>(null);
  const [condition, setCondition] = useState<RouteCondition>('shortest');
  const [fix, setFix] = useState<Fix | null>(null);
  const [floorSel, setFloorSel] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [s, f] = await Promise.all([AsyncStorage.getItem(SETTINGS_KEY), AsyncStorage.getItem(FAVORITES_KEY)]);
      if (s) setSettings({ serverUrl: '', ...(JSON.parse(s) as Partial<Settings>) });
      if (f) setFavorites(JSON.parse(f) as string[]);
      setLoaded(await loadLocal(deps));
    })();
  }, []);

  const setServerUrl = useCallback(async (serverUrl: string) => {
    const next = { ...settings, serverUrl: serverUrl.trim() };
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, [settings]);

  const checkUpdate = useCallback(async () => {
    if (!loaded) return;
    setUpdateStatus('확인 중…');
    const r = await checkForUpdate(settings.serverUrl, loaded, deps);
    setLoaded(r);
    setUpdateStatus(r.updated ? `새 지도 v${r.pkg.release.version} 받음` : r.error ? `갱신 안 됨: ${r.error}` : '최신 지도임');
  }, [loaded, settings.serverUrl]);

  const toggleFavorite = useCallback(async (key: string) => {
    const next = favorites.includes(key) ? favorites.filter((k) => k !== key) : [...favorites, key];
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }, [favorites]);

  const pkg = loaded?.pkg ?? null;
  const graph = useMemo(() => (pkg ? buildGraph(pkg) : null), [pkg]);

  const startNodeKey = useMemo(() => {
    if (!pkg || !start) return null;
    if (start.type === 'node') return start.nodeKey;
    return pkg.places.find((p) => p.key === start.placeKey)?.nodeKey ?? null;
  }, [pkg, start]);

  const route = useMemo<RouteResult | null>(() => {
    if (!graph || !pkg || !start || !destKey) return null;
    const dest = pkg.places.find((p) => p.key === destKey);
    if (!startNodeKey || !dest?.nodeKey) return { ok: false, reason: 'unknown_node', message: '길에 붙지 않은 장소 — 길 없음' };
    return findRoute(graph, startNodeKey, dest.nodeKey, condition);
  }, [graph, pkg, start, startNodeKey, destKey, condition]);

  const setFloor = useCallback((b: string, f: string) => setFloorSel((s) => ({ ...s, [b]: f })), []);

  const value: AppState = {
    loaded, pkg, graph, settings, setServerUrl, updateStatus, checkUpdate, favorites, toggleFavorite,
    start, setStart, destKey, setDestKey, condition, setCondition, route, startNodeKey, fix, setFix, floorSel, setFloor,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider 밖');
  return v;
}

/** 장소 표시 이름: "이름 · 건물 층" */
export function placeSubtitle(pkg: MapPackage, placeKey: string): string {
  const p = pkg.places.find((x) => x.key === placeKey);
  if (!p) return '';
  const b = p.buildingKey ? pkg.buildings.find((x) => x.key === p.buildingKey)?.name : null;
  const f = p.floorKey ? pkg.floors.find((x) => x.key === p.floorKey)?.code : null;
  if (p.location === 'outdoor') return '바깥';
  return [b, f ?? '층 모름'].filter(Boolean).join(' ');
}
