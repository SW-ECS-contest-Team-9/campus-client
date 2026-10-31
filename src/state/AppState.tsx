// 앱 전체 상태: 지도 꾸러미, 설정·즐겨찾기(기기 저장), 경로 선택, 현재 위치.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { checkForUpdate, loadLocal, type Deps, type LoadedPackage } from '../api/mapRelease';
import { serverRoute as fetchServerRoute, type ServerRoute } from '../api/serverRoute';
import type { MapPackage } from '../map/package';
import fixtureJson from '../map/fixture/campus-fixture.json';
import { buildGraph, findRoute, routeBetween, type Graph, type RouteCondition, type RouteResult } from '../route/route';
import type { Fix } from '../location/fix';
import type { StartPoint } from '../location/start';
import { createTracker, type Tracker } from '../location/tracker';
import { startTracking, type SensorStatus } from '../location/sensors';
import { createExpoSensors, hasLocationPermission, requestLocationPermission } from '../location/expoSensors';
import { DEV_HOST } from '../config/devHost';
import * as Device from 'expo-device';
import { Alert, AppState as RNAppState, InteractionManager, Platform } from 'react-native';
import { adjustForFirst3d, chooseTier, type DeviceTier } from '../ui/tier';
import type { Map3dEngine, Map3dPreparation } from '../ui/Map3D';
import { effectiveCondition } from '../nlp/apply';
import { checkModel } from '../nlp/gemmaRuntime';
import type { Mandatory, RouteRequest } from '../nlp/types';
import { resolveQrAnchor } from '../location/qr';
import { createSerializedWriter } from './serializedWrite';
import { translate, type Language } from '../i18n/translations';

const fixture = fixtureJson as unknown as MapPackage;

export interface Settings {
  language: Language;
  serverUrl: string;
  trackerUrl: string;
  /** 3D 지도 페이지 주소(campus-tracker client3d.html). 빈 값 = 개발 기본값 */
  map3dUrl: string;
  /** 저사양 모드(R22): 3D 를 낮은 해상도·Lambert 재질·구조물 없이. 등급 3 이면 자동 */
  light: boolean;
  /** 화면 표현 등급(사용자 지정). null = 자동(autoTier) */
  deviceTier: DeviceTier | null;
  /** 처음 켤 때 고른 등급(3D 첫 화면이 느리면 한 번 낮춤) */
  autoTier: DeviceTier | null;
  /** 3D 첫 화면 시간으로 자동 등급을 확인했는지 */
  autoTier3dChecked: boolean;
  /** 그 확인을 한 3D 엔진(엔진이 바뀌면 처음 등급부터 다시 확인) */
  autoTier3dEngine?: Map3dEngine;
  /** 자동 등급을 고른 규칙 판(바뀌면 다시 고름) */
  autoTierRule?: number;
  /** 3D 엔진: 네이티브(기본, 앱에 묶은 3D·서버 없이) / 웹(3D 페이지, 서버 필요) */
  map3dEngine: Map3dEngine;
  /** 첫 실행 설명(코치마크)을 봤음 */
  coachDone: boolean;
  /** 위치 권한 이유 설명을 봤음(OS 대화상자 전에 한 번) */
  locationExplained: boolean;
  /** 검색 화면을 열 때 자연어 검색으로 시작할지 */
  naturalSearchDefault: boolean;
  /** 개발용: 경로 안내의 이전·다음 단계 버튼 표시. 기본 꺼짐 */
  guideStepControls: boolean;
}
/** 개발 기본값. 운영 주소는 나중에 정함. */
export const DEFAULT_SERVER_URL = `http://${DEV_HOST}:8010`;
const DEFAULT_SETTINGS: Settings = {
  language: 'ko',
  serverUrl: DEFAULT_SERVER_URL,
  trackerUrl: process.env.EXPO_PUBLIC_TRACKER_URL || `http://${DEV_HOST}:3000`,
  map3dUrl: '',
  light: false,
  deviceTier: null,
  autoTier: null,
  autoTier3dChecked: false,
  map3dEngine: 'native',
  coachDone: false,
  locationExplained: false,
  naturalSearchDefault: false,
  guideStepControls: false,
};
type MapUpdateStatus =
  { kind: 'checking' } | { kind: 'current' } | { kind: 'updated'; version: number } | { kind: 'error'; network: boolean };
const updateError = (e: string): MapUpdateStatus => ({ kind: 'error', network: /fetch|network|서버 연결/i.test(e) });
const AUTO_TIER_RULE = 2;
const detectTier = (): DeviceTier =>
  chooseTier({ os: Platform.OS, apiLevel: Device.platformApiLevel ?? null, totalMemory: Device.totalMemory ?? null });
export interface RecentRoute {
  startLabel: string;
  start?: StartPoint;
  destKey: string;
  condition: RouteCondition;
  at: string;
}
/** 사용자가 확인한 지금 층(위치 다시 확인 CT09). 보는 층과 다름. */
export interface ConfirmedFloor {
  buildingKey: string;
  floorKey: string;
}
export interface NlpState {
  text: string;
  request: RouteRequest;
  mandatory: Mandatory[];
}
export type { StartPoint };

const SETTINGS_KEY = 'settings.v1';
const FAVORITES_KEY = 'favorites.v1';
const RECENT_KEY = 'recent.v1';

const deps: Deps = {
  fetch: (...a) => fetch(...a),
  sha256Hex: (t) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, t),
  store: AsyncStorage,
  fixture,
};

/** 단계는 병렬로 준비될 수 있음. 서버 최신 지도 확인은 필수 준비에 포함하지 않음. */
export interface AppPreparation extends Map3dPreparation {
  settingsReady: boolean;
  mapDataReady: boolean;
}

interface AppCtx {
  loaded: LoadedPackage | null;
  /** 기기에 저장된 설정을 읽었음(그 전엔 기본값) */
  settingsLoaded: boolean;
  /** 설정 → 지도 데이터 → 3D 장면 → 첫 프레임의 네 가지 준비 상태. */
  preparation: AppPreparation;
  note3dPreparation: (preparation: Map3dPreparation) => void;
  pkg: MapPackage | null;
  graph: Graph | null;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** 지금 쓰는 표현 등급(사용자 지정 > 자동) */
  tier: DeviceTier;
  noteFirst3dReady: (ms: number, engine: Map3dEngine) => void;
  recentSearches: string[];
  addRecentSearch: (q: string) => void;
  removeRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
  recentRoutes: RecentRoute[];
  addRecentRoute: (r: RecentRoute) => void;
  confirmedFloor: ConfirmedFloor | null;
  setConfirmedFloor: (f: ConfirmedFloor | null) => void;
  updateStatus: string | null;
  checkUpdate: () => Promise<void>;
  favorites: string[];
  toggleFavorite: (placeKey: string) => Promise<void>;
  start: StartPoint | null;
  setStart: (s: StartPoint | null) => void;
  destKey: string | null;
  setDestKey: (k: string | null) => void;
  /** 경로 조건(말로 정한 필수 조건이 있으면 그것이 앞섬: 계단 없이 = 계단 피하기) */
  condition: RouteCondition;
  setCondition: (c: RouteCondition) => void;
  /** 말로 요청한 길찾기(검색창 문장): 알아들은 것·알림·필수 조건. 필수 조건은 사용자가 직접 풀 때만 없어짐. */
  nlp: NlpState | null;
  setNlp: (n: NlpState | null) => void;
  /** 지금 쓰는 경로: 서버(/v1/routes)가 고른 방식으로 계산했으면 그것, 아니면(오프라인·요청 중) 기기 계산 */
  route: RouteResult | null;
  /** 서버 경로 요청 결과. null = 요청 중이거나 출발·도착이 없음 */
  serverRoute: ServerRoute | null;
  /** 현재 위치(위치 보정 v2 로 통로 위에 끌린 점). 센서가 켜져 있으면 계속 바뀜. */
  fix: Fix | null;
  /** 위치 권한을 받고 위치·걸음·기압 읽기를 켬. 권한이 없으면 false. */
  enableLocation: () => Promise<boolean>;
  applyQrAnchor: (value: string) => Promise<string>;
  /** 지금 위치(있으면 바로, 없으면 다음 위치)를 기다림. 시간 넘으면 null. */
  waitFix: (ms: number) => Promise<Fix | null>;
  /** 켜진 센서(null = 아직 안 켬). 기압계가 없으면 층은 사용자가 고른 층(위치 다시 확인)으로. */
  sensors: SensorStatus | null;
  /** AI 문장 해석 모델 파일이 기기에 있음 */
  aiModel: boolean;
  floorSel: Record<string, string>; // buildingKey → floorKey | 'all'
  setFloor: (buildingKey: string, floorKey: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadedPackage | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [persistSettings] = useState(() =>
    createSerializedWriter((value: Settings) => AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(value))),
  );
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [mapPreparation, note3dPreparation] = useState<Map3dPreparation>({
    sceneReady: false,
    firstFrameReady: false,
    failed: false,
  });
  const [recent, setRecent] = useState<{ searches: string[]; routes: RecentRoute[] }>({ searches: [], routes: [] });
  const [confirmedFloor, setConfirmedFloor] = useState<ConfirmedFloor | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [updateStatus, setUpdateStatus] = useState<MapUpdateStatus | null>(null);
  const [start, setStart] = useState<StartPoint | null>(null);
  const [destKey, setDestKey] = useState<string | null>(null);
  const [baseCondition, setCondition] = useState<RouteCondition>('shortest');
  const [nlp, setNlp] = useState<NlpState | null>(null);
  const condition = effectiveCondition(baseCondition, nlp?.mandatory ?? []);
  const [fix, setFix] = useState<Fix | null>(null);
  const [floorSel, setFloorSel] = useState<Record<string, string>>({});
  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [wantLoc, setWantLoc] = useState(false);
  const [active, setActive] = useState(RNAppState.currentState !== 'background');
  const [sensors, setSensors] = useState<SensorStatus | null>(null);
  const fixRef = useRef<Fix | null>(null);
  const fixWaiters = useRef<((f: Fix) => void)[]>([]);
  const onFix = useCallback((f: Fix) => {
    fixRef.current = f;
    setFix(f);
    for (const w of fixWaiters.current.splice(0)) w(f);
  }, []);
  const waitFix = useCallback(
    (ms: number) =>
      fixRef.current
        ? Promise.resolve(fixRef.current)
        : new Promise<Fix | null>((done) => {
            const waiter = (f: Fix) => {
              clearTimeout(t);
              done(f);
            };
            const t = setTimeout(() => {
              fixWaiters.current = fixWaiters.current.filter((w) => w !== waiter);
              done(null);
            }, ms);
            fixWaiters.current.push(waiter);
          }),
    [],
  );

  useEffect(() => {
    (async () => {
      const [s, f, r] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEY),
        AsyncStorage.getItem(FAVORITES_KEY),
        AsyncStorage.getItem(RECENT_KEY),
      ]);
      const st: Settings = { ...DEFAULT_SETTINGS, ...(s ? (JSON.parse(s) as Partial<Settings>) : {}) };
      if (!['ko', 'zh', 'ja', 'en'].includes(st.language)) st.language = 'ko';
      if (st.autoTier == null || st.autoTierRule !== AUTO_TIER_RULE) {
        // 처음이거나 등급 규칙이 바뀌었으면(2: RAM 기준 7.5 → 6.5 GiB) 다시 고르고 3D 첫 화면 확인도 다시
        st.autoTier = detectTier();
        st.autoTierRule = AUTO_TIER_RULE;
        st.autoTier3dChecked = false;
        void persistSettings(st).catch((error) => console.warn('Could not save settings', error));
      }
      setSettings(st);
      setSettingsLoaded(true);
      if (f) setFavorites(JSON.parse(f) as string[]);
      if (r) setRecent(JSON.parse(r) as typeof recent);
      const local = await loadLocal(deps);
      setLoaded(local);
      // 켤 때 한 번 새 지도 확인(실패하면 지금 것 유지)
      if (st.serverUrl) {
        const u = await checkForUpdate(st.serverUrl, local, deps);
        setLoaded(u);
        if (u.updated) setUpdateStatus({ kind: 'updated', version: u.pkg.release.version });
        else if (u.error) setUpdateStatus(updateError(u.error));
      }
    })();
  }, [persistSettings]);

  // 저장되는 상태(설정·즐겨찾기·최근)는 함수형 갱신: 연달아 불러도 앞 변경이 사라지지 않음
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });
  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((cur) => {
        const next = { ...cur, ...patch };
        void persistSettings(next).catch((error) => console.warn('Could not save settings', error));
        return next;
      });
    },
    [persistSettings],
  );
  /** 3D 첫 화면까지 걸린 시간(앱 켠 뒤 한 번). 자동 등급이면 느릴 때 한 단계 낮춤. */
  const noteFirst3dReady = useCallback(
    (ms: number, engine: Map3dEngine) => {
      setSettings((cur) => {
        // 웹은 첫 화면 시간이 망·타일 받기에 좌우되어 기기 성능을 뜻하지 않음 → Android 만
        if (Platform.OS !== 'android' || cur.autoTier == null) return cur;
        if (cur.autoTier3dChecked && (cur.autoTier3dEngine ?? 'web') === engine) return cur;
        // 엔진이 바뀌었으면(웹 3D 가 느려 낮췄던 등급) 처음 등급부터 다시
        const base = cur.autoTier3dChecked ? detectTier() : cur.autoTier;
        const next = { ...cur, autoTier: adjustForFirst3d(base, ms), autoTier3dChecked: true, autoTier3dEngine: engine };
        void persistSettings(next).catch((error) => console.warn('Could not save settings', error));
        return next;
      });
    },
    [persistSettings],
  );
  const saveRecent = useCallback((f: (cur: typeof recent) => typeof recent) => {
    setRecent((cur) => {
      const next = f(cur);
      void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const addRecentSearch = useCallback(
    (q: string) => saveRecent((cur) => ({ ...cur, searches: [q, ...cur.searches.filter((x) => x !== q)].slice(0, 10) })),
    [saveRecent],
  );
  const removeRecentSearch = useCallback(
    (q: string) => saveRecent((cur) => ({ ...cur, searches: cur.searches.filter((x) => x !== q) })),
    [saveRecent],
  );
  const clearRecentSearches = useCallback(() => saveRecent((cur) => ({ ...cur, searches: [] })), [saveRecent]);
  const addRecentRoute = useCallback(
    (r: RecentRoute) =>
      saveRecent((cur) => ({
        ...cur,
        routes: [r, ...cur.routes.filter((x) => x.destKey !== r.destKey || x.startLabel !== r.startLabel)].slice(0, 5),
      })),
    [saveRecent],
  );

  const checkUpdate = useCallback(async () => {
    if (!loaded) return;
    setUpdateStatus({ kind: 'checking' });
    const r = await checkForUpdate(settings.serverUrl, loaded, deps);
    setLoaded(r);
    setUpdateStatus(r.updated ? { kind: 'updated', version: r.pkg.release.version } : r.error ? updateError(r.error) : { kind: 'current' });
  }, [loaded, settings.serverUrl]);

  const toggleFavorite = useCallback(async (key: string) => {
    setFavorites((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      void AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const pkg = loaded?.pkg ?? null;
  const graph = useMemo(() => (pkg ? buildGraph(pkg) : null), [pkg]);

  // 위치 보정 v2: 꾸러미마다 맞춤기 하나(그래프 준비가 기기에서 수백 ms 라 첫 화면 뒤에)
  useEffect(() => {
    if (!pkg) return;
    const h = InteractionManager.runAfterInteractions(() => setTracker(createTracker(pkg, Platform.OS === 'ios' ? 'ios' : 'android')));
    return () => h.cancel();
  }, [pkg]);
  // AI 문장 해석 모델이 기기에 있는지(머리말만 읽음, 한 번)
  const [aiModel, setAiModel] = useState(false);
  useEffect(() => {
    void checkModel().then(setAiModel);
  }, []);
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (st) => setActive(st === 'active'));
    void hasLocationPermission().then((ok) => ok && setWantLoc(true)); // 이미 허락했으면 켤 때부터
    return () => sub.remove();
  }, []);
  // 앞쪽에 있을 때만 센서를 읽음(뒤로 가면 멈춤)
  useEffect(() => {
    if (!tracker || !wantLoc || !active) return;
    let stop: (() => void) | null = null;
    let dead = false;
    void startTracking(
      createExpoSensors(() => settingsRef.current.language),
      tracker,
      onFix,
    ).then((r) => {
      if (dead) return r.stop();
      stop = r.stop;
      setSensors(r.status);
    });
    return () => {
      dead = true;
      stop?.();
    };
  }, [tracker, wantLoc, active, onFix]);
  // 사용자가 확인한 층 → 맞춤기(기압계 없는 기기의 층 판정. 기압이 있으면 맞춤기가 무시)
  useEffect(() => tracker?.setFloor(confirmedFloor?.floorKey ?? null), [tracker, confirmedFloor]);
  const enableLocation = useCallback(async () => {
    if (!(await hasLocationPermission()) && !settingsRef.current.locationExplained) {
      // OS 대화상자 전에 왜 필요한지 한 번(한 문장 + 다음 행동). 거절하면 OS 대화상자도 띄우지 않음
      const go = await new Promise<boolean>((done) =>
        Alert.alert(
          translate(settingsRef.current.language, 'locationRequestTitle'),
          translate(settingsRef.current.language, 'locationRequestBody'),
          [
            { text: translate(settingsRef.current.language, 'later'), style: 'cancel', onPress: () => done(false) },
            { text: translate(settingsRef.current.language, 'allowLocation'), onPress: () => done(true) },
          ],
        ),
      );
      void updateSettings({ locationExplained: true });
      if (!go) return false;
    }
    const ok = await requestLocationPermission();
    if (ok) setWantLoc(true);
    return ok;
  }, [updateSettings]);
  const applyQrAnchor = useCallback(
    async (value: string) => {
      if (!tracker) throw new Error('MAP_NOT_READY');
      const a = await resolveQrAnchor(settings.trackerUrl, value);
      const f = tracker.anchor(a, Date.now() / 1000);
      setConfirmedFloor(f.match?.floorKey && f.match.buildingKey ? { floorKey: f.match.floorKey, buildingKey: f.match.buildingKey } : null);
      onFix(f);
      return a.label;
    },
    [tracker, settings.trackerUrl, onFix],
  );

  const startNodeKey = useMemo(() => {
    if (!pkg || !start) return null;
    if (start.type === 'node') return start.nodeKey;
    if (start.type === 'point') return null; // 면 위 점: routeBetween 이 임시 노드로 붙임
    return pkg.places.find((p) => p.key === start.placeKey)?.nodeKey ?? null;
  }, [pkg, start]);

  const deviceRoute = useMemo<RouteResult | null>(() => {
    if (!graph || !pkg || !start || !destKey) return null;
    const dest = pkg.places.find((p) => p.key === destKey);
    if (start.type === 'point' && dest?.nodeKey) return routeBetween(graph, [start.x, start.y, start.z], dest.nodeKey, condition).result;
    if (!startNodeKey || !dest?.nodeKey) return { ok: false, reason: 'unknown_node', message: '길에 붙지 않은 장소 — 길 없음' };
    return findRoute(graph, startNodeKey, dest.nodeKey, condition);
  }, [graph, pkg, start, startNodeKey, destKey, condition]);

  // 서버 경로: 출발(장소 key 또는 노드 좌표)·도착·방식이 바뀔 때마다 요청. 늦게 온 옛 응답은 버림.
  const routeReq = useMemo(() => {
    if (!pkg || !start || !destKey) return null;
    const n = start.type === 'node' ? pkg.nodes.find((x) => x.key === start.nodeKey) : null;
    const from =
      start.type === 'place'
        ? start.placeKey
        : start.type === 'point'
          ? `${start.x},${start.y},${start.z}`
          : n
            ? `${n.x},${n.y},${n.z}`
            : '';
    return from ? { key: `${settings.serverUrl}|${from}|${destKey}|${condition}`, from } : null;
  }, [pkg, start, destKey, condition, settings.serverUrl]);
  const [server, setServer] = useState<{ key: string; r: ServerRoute } | null>(null);
  useEffect(() => {
    if (!routeReq || !destKey) return;
    let dead = false;
    void fetchServerRoute(settings.serverUrl, routeReq.from, destKey, condition).then((r) => {
      if (!dead) setServer({ key: routeReq.key, r });
    });
    return () => {
      dead = true;
    };
  }, [routeReq, destKey, condition, settings.serverUrl]);
  const serverRoute = server && routeReq && server.key === routeReq.key ? server.r : null;
  const route = serverRoute?.ok ? serverRoute.route : deviceRoute;

  const setFloor = useCallback((b: string, f: string) => setFloorSel((s) => ({ ...s, [b]: f })), []);

  const value: AppCtx = {
    loaded,
    settingsLoaded,
    preparation: {
      settingsReady: settingsLoaded,
      mapDataReady: pkg !== null && graph !== null,
      ...mapPreparation,
    },
    note3dPreparation,
    pkg,
    graph,
    settings,
    updateSettings,
    tier: settings.deviceTier ?? settings.autoTier ?? 2,
    noteFirst3dReady,
    updateStatus:
      updateStatus === null
        ? null
        : updateStatus.kind === 'checking'
          ? translate(settings.language, 'checkingUpdate')
          : updateStatus.kind === 'current'
            ? translate(settings.language, 'mapUpToDate')
            : updateStatus.kind === 'updated'
              ? translate(settings.language, 'newMapDownloaded', { version: String(updateStatus.version) })
              : translate(settings.language, updateStatus.network ? 'serverConnectionFailed' : 'updateFailed'),
    recentSearches: recent.searches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    recentRoutes: recent.routes,
    addRecentRoute,
    confirmedFloor,
    setConfirmedFloor,
    checkUpdate,
    favorites,
    toggleFavorite,
    start,
    setStart,
    destKey,
    setDestKey,
    condition,
    setCondition,
    nlp,
    setNlp,
    route,
    serverRoute,
    fix,
    enableLocation,
    applyQrAnchor,
    waitFix,
    aiModel,
    sensors,
    floorSel,
    setFloor,
  };
  // eslint-disable-next-line react-hooks/immutability -- 개발 빌드 시험 손잡이(전역)
  if (__DEV__) (globalThis as { __app?: AppCtx }).__app = value; // 개발 중 화면 시험용(갈무리 스크립트)
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider 밖');
  return v;
}
