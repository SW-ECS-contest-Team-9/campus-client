// 앱 전체 상태: 지도 꾸러미, 설정·즐겨찾기(기기 저장), 경로 선택, 현재 위치.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { checkForUpdate, loadLocal, type Deps, type LoadedPackage } from '../api/mapRelease';
import type { MapPackage } from '../map/package';
import fixtureJson from '../map/fixture/campus-fixture.json';
import { buildGraph, findRoute, type Graph, type RouteCondition, type RouteResult } from '../route/route';
import type { Fix } from '../location/fix';
import { DEV_HOST } from '../config/devHost';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { adjustForFirst3d, chooseTier, type DeviceTier } from '../ui/tier';

const fixture = fixtureJson as unknown as MapPackage;

export interface Settings {
  serverUrl: string;
  /** 3D 지도 페이지 주소(campus-tracker client3d.html). 빈 값 = 개발 기본값 */
  map3dUrl: string;
  /** 가벼운 3D(구조물·이름표 없음) */
  light: boolean;
  /** 화면 표현 등급(사용자 지정). null = 자동(autoTier) */
  deviceTier: DeviceTier | null;
  /** 처음 켤 때 고른 등급(3D 첫 화면이 느리면 한 번 낮춤) */
  autoTier: DeviceTier | null;
  /** 3D 첫 화면 시간으로 자동 등급을 확인했는지 */
  autoTier3dChecked: boolean;
}
/** 개발 기본값. 운영 주소는 나중에 정함. */
export const DEFAULT_SERVER_URL = `http://${DEV_HOST}:8010`;
const DEFAULT_SETTINGS: Settings = {
  serverUrl: DEFAULT_SERVER_URL,
  map3dUrl: '',
  light: false,
  deviceTier: null,
  autoTier: null,
  autoTier3dChecked: false,
};
/** 갱신 실패 문구: 개발용 오류 글(TypeError 등)을 그대로 보이지 않음(카카오 디자인: 진단 정보 분리). */
const failText = (e: string) =>
  /fetch|network|서버 연결/i.test(e) ? '서버에 연결하지 못했어요(인터넷·서버 주소 확인)' : `갱신 안 됨: ${e}`;
const detectTier = (): DeviceTier =>
  chooseTier({ os: Platform.OS, apiLevel: Device.platformApiLevel ?? null, totalMemory: Device.totalMemory ?? null });
export interface RecentRoute {
  startLabel: string;
  destKey: string;
  condition: RouteCondition;
  at: string;
}
/** 사용자가 확인한 지금 층(위치 다시 확인 CT09). 보는 층과 다름. */
export interface ConfirmedFloor {
  buildingKey: string;
  floorKey: string;
}
export type StartPoint = { type: 'place'; placeKey: string } | { type: 'node'; nodeKey: string; label: string };

const SETTINGS_KEY = 'settings.v1';
const FAVORITES_KEY = 'favorites.v1';
const RECENT_KEY = 'recent.v1';

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
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** 지금 쓰는 표현 등급(사용자 지정 > 자동) */
  tier: DeviceTier;
  noteFirst3dReady: (ms: number) => void;
  recentSearches: string[];
  addRecentSearch: (q: string) => void;
  recentRoutes: RecentRoute[];
  addRecentRoute: (r: RecentRoute) => void;
  confirmedFloor: ConfirmedFloor | null;
  setConfirmedFloor: (f: ConfirmedFloor | null) => void;
  guideStep: number;
  setGuideStep: (n: number) => void;
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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [recent, setRecent] = useState<{ searches: string[]; routes: RecentRoute[] }>({ searches: [], routes: [] });
  const [confirmedFloor, setConfirmedFloor] = useState<ConfirmedFloor | null>(null);
  const [guideStep, setGuideStep] = useState(0);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [start, setStart] = useState<StartPoint | null>(null);
  const [destKey, setDestKey] = useState<string | null>(null);
  const [condition, setCondition] = useState<RouteCondition>('shortest');
  const [fix, setFix] = useState<Fix | null>(null);
  const [floorSel, setFloorSel] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const [s, f, r] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEY),
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(RECENT_KEY),
      ]);
      const st: Settings = { ...DEFAULT_SETTINGS, ...(s ? (JSON.parse(s) as Partial<Settings>) : {}) };
      if (st.autoTier == null) {
        st.autoTier = detectTier();
        void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(st));
      }
      setSettings(st);
      if (f) setFavorites(JSON.parse(f) as string[]);
      if (r) setRecent(JSON.parse(r) as typeof recent);
      const local = await loadLocal(deps);
      setLoaded(local);
      // 켤 때 한 번 새 지도 확인(실패하면 지금 것 유지)
      if (st.serverUrl) {
        const u = await checkForUpdate(st.serverUrl, local, deps);
        setLoaded(u);
        if (u.updated) setUpdateStatus(`새 지도 v${u.pkg.release.version} 받음`);
        else if (u.error) setUpdateStatus(failText(u.error));
      }
    })();
  }, []);

  const setServerUrl = useCallback(
    async (serverUrl: string) => {
      const next = { ...settings, serverUrl: serverUrl.trim() };
      setSettings(next);
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    },
    [settings],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    },
    [settings],
  );
  /** 3D 첫 화면까지 걸린 시간(앱 켠 뒤 한 번). 자동 등급이면 느릴 때 한 단계 낮춤. */
  const noteFirst3dReady = useCallback((ms: number) => {
    setSettings((cur) => {
      // 웹은 첫 화면 시간이 망·타일 받기에 좌우되어 기기 성능을 뜻하지 않음 → Android 만
      if (Platform.OS !== 'android' || cur.autoTier3dChecked || cur.autoTier == null) return cur;
      const next = { ...cur, autoTier: adjustForFirst3d(cur.autoTier, ms), autoTier3dChecked: true };
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const saveRecent = (next: typeof recent) => {
    setRecent(next);
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };
  const addRecentSearch = (q: string) => saveRecent({ ...recent, searches: [q, ...recent.searches.filter((x) => x !== q)].slice(0, 5) });
  const addRecentRoute = (r: RecentRoute) =>
    saveRecent({
      ...recent,
      routes: [r, ...recent.routes.filter((x) => x.destKey !== r.destKey || x.startLabel !== r.startLabel)].slice(0, 5),
    });

  const checkUpdate = useCallback(async () => {
    if (!loaded) return;
    setUpdateStatus('확인 중…');
    const r = await checkForUpdate(settings.serverUrl, loaded, deps);
    setLoaded(r);
    setUpdateStatus(r.updated ? `새 지도 v${r.pkg.release.version} 받음` : r.error ? failText(r.error) : '최신 지도임');
  }, [loaded, settings.serverUrl]);

  const toggleFavorite = useCallback(
    async (key: string) => {
      const next = favorites.includes(key) ? favorites.filter((k) => k !== key) : [...favorites, key];
      setFavorites(next);
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    },
    [favorites],
  );

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
    loaded,
    pkg,
    graph,
    settings,
    setServerUrl,
    updateSettings,
    tier: settings.deviceTier ?? settings.autoTier ?? 2,
    noteFirst3dReady,
    updateStatus,
    recentSearches: recent.searches,
    addRecentSearch,
    recentRoutes: recent.routes,
    addRecentRoute,
    confirmedFloor,
    setConfirmedFloor,
    guideStep,
    setGuideStep,
    checkUpdate,
    favorites,
    toggleFavorite,
    start,
    setStart,
    destKey,
    setDestKey,
    condition,
    setCondition,
    route,
    startNodeKey,
    fix,
    setFix,
    floorSel,
    setFloor,
  };
  // eslint-disable-next-line react-hooks/immutability -- 개발 빌드 시험 손잡이(전역)
  if (__DEV__) (globalThis as { __app?: AppState }).__app = value; // 개발 중 화면 시험용(갈무리 스크립트)
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
