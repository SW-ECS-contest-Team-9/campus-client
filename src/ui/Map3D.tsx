// 3D 캠퍼스 지도를 앱 전체에서 하나만 띄워 둔다. Android 기본은 네이티브 3D(expo-gl + three.js, 앱에 묶은 campus.glb, 서버 없이 뜸),
// 설정 "3D 엔진: 웹" 이거나 웹 빌드면 campus-tracker 의 client3d.html(웹 <iframe>, 네이티브 react-native-webview). 두 엔진 모두 메시지 형식 v1(map3d/native/protocol.ts).
// 화면은 <MapSlot> 으로 자리만 잡고, 초점을 받은 화면의 자리로 그 하나를 옮겨 보여 준다(화면 바꿀 때 다시 불러오지 않음).
// 명령은 페이지가 ready 를 보낸 뒤 보내고, 자리·명령이 바뀔 때마다 다시 보낸다. 못 불러오면 각 자리에 오류 안내와 재시도 단추.
import { useIsFocused, useRoute } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurTargetView } from 'expo-blur';
import { BlurTargetCtx } from './look';
import { Character } from './v3';
import { Button } from './components';
import { parseEvent, type Map3dCommand, type Map3dEvent } from '../map3d/commands';
import { CHARACTER_OK, CHARACTER_UNCERTAIN } from './characterImages';
import { color } from './theme';
import { useActiveRouteKey } from './useActiveRoute';
import { Campus3DView, type Campus3DHandle } from '../map3d/native/Campus3DView';
import { note3dStat } from '../map3d/diag';

export type Map3dEngine = 'native' | 'web';
/** 로딩 UI와 독립적인 준비 신호. 웹 페이지는 아직 첫 프레임을 보고하지 않음(null). */
export interface Map3dPreparation {
  sceneReady: boolean;
  /** 네이티브 첫 프레임을 그리고 화면에 제출했음(실제 디스플레이 표시 시각은 아님). */
  firstFrameReady: boolean | null;
  failed: boolean;
}
/** 네이티브 3D 위에 찍을 장소 점(꾸러미 장소, EPSG:5186) */
export interface Map3dPlace {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

// S21 실기기 첫 표시 17 s(전체)·16 s(가벼운) 측정(2026-10-15, USB). 저사양·느린 망 여유를 두고 60 s.
const READY_TIMEOUT_MS = 60_000;
type Status = 'loading' | 'ready' | 'failed';
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Slot {
  id: string;
  routeKey: string;
  rect: Rect | null;
  commands: Map3dCommand[];
  minimal: boolean;
  onEvent?: (e: Map3dEvent) => void;
  overlay?: ReactNode;
  /** 지도 위·아래를 가리는 카드 높이(dp) */
  padding?: { top: number; bottom: number };
  /** 사용자가 지도를 만지기 시작할 때(시트 접기 등) */
  onTouch?: () => void;
}
interface Api {
  put: (s: Slot) => void;
  remove: (id: string) => void;
  retry: () => void;
}

const ApiCtx = createContext<Api | null>(null);

const StatusCtx = createContext<Status>('loading');

/** 앱이 가진 지도 단추(네이티브 3D 일 때만): 처음 시점·층 펼치기·내 위치로 */
export interface Map3dControls {
  available: boolean;
  home: () => void;
  toggleExplode: () => boolean;
  focusMe: () => void;
}
const ControlsCtx = createContext<Map3dControls>({
  available: false,
  home: () => {},
  toggleExplode: () => false,
  focusMe: () => {},
});
export const useMap3dControls = () => useContext(ControlsCtx);

/** 앱 뿌리에 한 번. children(화면들) 위에 3D 지도 하나를 겹쳐 둠. */
export function Map3DHost({
  url,
  engine = 'web',
  light = false,
  places,
  children,
  onFirstReady,
  onPreparationChange,
}: {
  /** 웹 엔진의 페이지 주소 */
  url: string;
  engine?: Map3dEngine;
  /** 네이티브 엔진 가벼운 모드(선 끔·해상도 2/3) */
  light?: boolean;
  places?: Map3dPlace[];
  children: ReactNode;
  /** 앱 켠 뒤 첫 ready 까지 걸린 시간(ms, 한 번) — 기기 등급 확인용 */
  onFirstReady?: (ms: number, engine: Map3dEngine) => void;
  /** 초기 상태·재시도·장면 준비·첫 프레임·실패 시 앱 공통 상태로 전달. */
  onPreparationChange?: (preparation: Map3dPreparation) => void;
}) {
  const [t0] = useState(() => Date.now());
  const firstReady = useRef(false);
  const blurTarget = useRef<View | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const routeKey = useActiveRouteKey();
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  // 앱 뿌리 크기(네이티브 3D 표면은 이 크기로 고정하고, 자리 밖은 잘라 보임 — 표면 크기를 바꾸면 Android TextureView 가 옛 크기 버퍼를 늘여 보임)
  const [root, setRoot] = useState<{ w: number; h: number } | null>(null);
  const rootRef = useRef<View | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const web = useRef<WebView | null>(null);
  const native = useRef<Campus3DHandle | null>(null);
  const useNative = engine === 'native' && Platform.OS !== 'web';
  const source = useNative ? `native:${light}` : url;
  const preparationKey = JSON.stringify([source, attempt]);
  const [preparation, setPreparation] = useState(() => ({
    key: preparationKey,
    sceneReady: false,
    firstFrameReady: false,
    failed: false,
  }));
  if (preparation.key !== preparationKey) {
    setPreparation({ key: preparationKey, sceneReady: false, firstFrameReady: false, failed: false });
  }
  useEffect(() => {
    onPreparationChange?.({
      sceneReady: preparation.sceneReady,
      firstFrameReady: useNative ? preparation.firstFrameReady : null,
      failed: preparation.failed || status === 'failed',
    });
  }, [preparation, useNative, status, onPreparationChange]);
  const ready = useRef(false);
  const lastUi = useRef<boolean | null>(null);
  const markersSent = useRef(false);
  const sent = useRef(new Map<string, string>());
  const sentSlot = useRef<string | null>(null);
  const retry = useCallback(() => {
    ready.current = false;
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  const api = useMemo<Api>(
    () => ({
      retry,
      put: (s) => setSlots((all) => ({ ...all, [s.id]: s })),
      remove: (id) => {
        setSlots((all) => {
          if (!(id in all)) return all;
          const next = { ...all };
          delete next[id];
          return next;
        });
      },
    }),
    [retry],
  );
  // 늦게 도착한 focus/blur·전환 종료 신호가 이전 지도를 다시 활성화하지 않도록 한다.
  const slot = Object.values(slots).find((entry) => entry.routeKey === routeKey);
  const controls = useMemo<Map3dControls>(
    () => ({
      available: useNative && status === 'ready',
      home: () => native.current?.home(),
      toggleExplode: () => native.current?.toggleExplode() ?? false,
      focusMe: () => native.current?.focusMe(),
    }),
    [useNative, status],
  );

  const post = useCallback((msg: Map3dCommand) => {
    if (Platform.OS === 'web') frame.current?.contentWindow?.postMessage(msg, '*');
    else if (native.current) native.current.post(msg);
    else web.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify(msg))}, '*'); true;`);
  }, []);

  // 보이는 자리의 명령 보내기(ready 뒤). 자리 바뀜·명령 바뀜마다.
  const cmdKey = slot ? `${slot.id}|${slot.minimal}|${JSON.stringify(slot.commands)}` : '';
  useEffect(() => {
    if (status !== 'ready' || !slot) return;
    if (!markersSent.current) {
      post({ v: 1, type: 'setMarkerImages', ok: CHARACTER_OK, uncertain: CHARACTER_UNCERTAIN });
      markersSent.current = true;
    }
    if (lastUi.current !== slot.minimal) {
      post({ v: 1, type: 'setMode', light: null, ui: slot.minimal ? 'min' : 'full' });
      lastUi.current = slot.minimal;
    }
    // 같은 자리에서 바뀐 명령만 다시 보냄(위치가 1초마다 바뀔 때 경로를 다시 보내면 페이지가 경로 전체로 화면을 되돌림)
    if (sentSlot.current !== slot.id) {
      sent.current.clear();
      sentSlot.current = slot.id;
    }
    const send = (c: Map3dCommand) => {
      const k = c.type === 'setFloor' ? `floor:${c.building}` : /Route$/.test(c.type) ? 'route' : /Location$/.test(c.type) ? 'loc' : c.type;
      const j = JSON.stringify(c);
      if (sent.current.get(k) === j) return;
      sent.current.set(k, j);
      post(c);
    };
    if (!slot.commands.some((c) => c.type === 'setRoute')) send({ v: 1, type: 'clearRoute' });
    if (!slot.commands.some((c) => c.type === 'setLocation')) send({ v: 1, type: 'clearLocation' });
    for (const c of slot.commands) send(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cmdKey 가 slot 의 내용
  }, [status, cmdKey, post]);

  const handler = useRef<Slot['onEvent']>(undefined);
  const firstReadyCb = useRef(onFirstReady);
  const useNativeRef = useRef(useNative);
  useEffect(() => {
    handler.current = slot?.onEvent;
    firstReadyCb.current = onFirstReady;
    useNativeRef.current = useNative;
  });
  const receive = useCallback(
    (raw: unknown) => {
      const e = parseEvent(raw);
      if (!e) return;
      // 이전 엔진/재시도에서 늦게 도착한 사건은 새 준비 상태에 반영하지 않음.
      if (e.type === 'ready' || e.type === 'firstFrame' || (e.type === 'error' && /^native3d:/.test(e.error))) {
        setPreparation((cur) => {
          if (cur.key !== preparationKey) return cur;
          if (e.type === 'ready') return { ...cur, sceneReady: true };
          if (e.type === 'firstFrame') return { ...cur, firstFrameReady: true };
          return { ...cur, failed: true };
        });
      }
      if (e.type === 'ready') {
        if (!firstReady.current) {
          firstReady.current = true;
          firstReadyCb.current?.(Date.now() - t0, useNativeRef.current ? 'native' : 'web');
        }
        ready.current = true;
        lastUi.current = null;
        markersSent.current = false;
        sentSlot.current = null;
        setStatus('ready');
      }
      // 네이티브 3D 가 처음에 실패하면(문맥·자료) 오류 안내로
      if (e.type === 'error' && /^native3d:/.test(e.error) && !ready.current) setStatus('failed');
      handler.current?.(e);
    },
    [t0, preparationKey],
  );

  // 엔진·주소·가벼운 모드가 바뀌면 다시 불러옴. 너무 오래 ready 가 안 오면 실패.
  const [loadedSource, setLoadedSource] = useState(source);
  if (loadedSource !== source) {
    setLoadedSource(source);
    setStatus('loading');
  }
  useEffect(() => {
    ready.current = false;
    const t = setTimeout(() => {
      if (!ready.current) setStatus('failed');
      // 기존 UI의 ready 기준은 유지하면서, 첫 프레임 이전의 정지도 준비 실패로 전달.
      if (useNative) {
        setPreparation((cur) => (cur.key === preparationKey && !cur.firstFrameReady ? { ...cur, failed: true } : cur));
      }
    }, READY_TIMEOUT_MS);
    let cancelled = false;
    if (Platform.OS === 'web')
      fetch(source, { mode: 'no-cors' }).catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [source, attempt, preparationKey, useNative]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const on = (e: MessageEvent) => {
      if (frame.current && e.source === frame.current.contentWindow) receive(e.data);
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [receive]);

  const rect = slot?.rect;
  const shown = !!rect && status !== 'failed';
  // 다시 보일 때 바로 한 프레임 그림(숨긴 동안 표면이 비워져 흰 화면으로 밀려 들어오던 문제)
  useEffect(() => {
    if (shown) native.current?.redraw();
  }, [shown]);
  // 숨길 때도 마지막 크기를 유지(지도 다시 그리기 비용 줄임)
  const [r, setR] = useState<Rect>({ x: 0, y: 0, w: 360, h: 400 });
  if (rect && (rect.x !== r.x || rect.y !== r.y || rect.w !== r.w || rect.h !== r.h)) setR(rect);
  return (
    <ApiCtx.Provider value={api}>
      <ControlsCtx.Provider value={controls}>
        <StatusCtx.Provider value={status}>
          <View
            ref={rootRef}
            style={s.root}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setRoot((cur) => (cur && cur.w === width && cur.h === height ? cur : { w: width, h: height }));
              rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));
            }}
          >
            {children}
            <View
              testID="shared-map-host"
              pointerEvents={shown ? 'box-none' : 'none'}
              style={[s.host, { left: r.x - origin.x, top: r.y - origin.y, width: r.w, height: r.h, opacity: shown ? 1 : 0 }]}
              accessibilityElementsHidden={!shown}
              importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
            >
              {Platform.OS === 'web' ? (
                <iframe
                  key={`${source}:${attempt}`}
                  ref={frame}
                  src={url}
                  title="3D 캠퍼스 지도"
                  style={{ border: 0, width: '100%', height: '100%', display: 'block', pointerEvents: shown ? 'auto' : 'none' }}
                />
              ) : (
                <BlurTargetView ref={blurTarget} style={s.fill} onTouchStart={() => slot?.onTouch?.()}>
                  {useNative ? (
                    root ? (
                      <View
                        style={{ position: 'absolute', left: -(r.x - origin.x), top: -(r.y - origin.y), width: root.w, height: root.h }}
                      >
                        <Campus3DView
                          key={`${source}:${attempt}`}
                          ref={native}
                          light={light}
                          places={places}
                          padding={{
                            top: r.y - origin.y + (slot?.padding?.top ?? 0),
                            bottom: root.h - (r.y - origin.y + r.h) + (slot?.padding?.bottom ?? 0),
                            left: r.x - origin.x,
                            right: root.w - (r.x - origin.x + r.w),
                          }}
                          style={s.fill}
                          logFrames
                          onStats={note3dStat}
                          onEvent={(e) => receive(e)}
                        />
                      </View>
                    ) : null
                  ) : (
                    <WebView
                      key={`${source}:${attempt}`}
                      ref={web}
                      source={{ uri: url }}
                      style={s.fill}
                      originWhitelist={['*']}
                      javaScriptEnabled
                      onMessage={(e) => receive(e.nativeEvent.data)}
                      onError={() => setStatus('failed')}
                      onHttpError={() => setStatus('failed')}
                      // GPU 렌더러가 죽으면(메모리·드라이버) 오류 안내와 재시도 표시
                      onRenderProcessGone={() => setStatus('failed')}
                      androidLayerType="hardware"
                      webviewDebuggingEnabled={__DEV__}
                      setSupportMultipleWindows={false}
                    />
                  )}
                </BlurTargetView>
              )}
              {status === 'loading' ? (
                <View style={s.loading} pointerEvents="none">
                  <View style={s.loadingPill}>
                    <Character name="loading" size={30} />
                    <Text style={s.loadingT}>3D 지도를 불러오는 중…</Text>
                  </View>
                </View>
              ) : null}
              <BlurTargetCtx.Provider value={blurTarget}>
                {/* 초점만 잃은 화면의 UI는 숨겨서 유지(시트 위치·등장 효과가 복귀 때 초기화되지 않게). */}
                {status !== 'failed' &&
                  Object.values(slots).map((entry) => {
                    if (entry.overlay == null) return null;
                    const visible = shown && entry.id === slot?.id;
                    return (
                      <View
                        key={entry.id}
                        style={[StyleSheet.absoluteFill, !visible && s.hiddenOverlay]}
                        pointerEvents={visible ? 'box-none' : 'none'}
                        accessibilityElementsHidden={!visible}
                        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
                      >
                        {entry.overlay}
                      </View>
                    );
                  })}
              </BlurTargetCtx.Provider>
            </View>
          </View>
        </StatusCtx.Provider>
      </ControlsCtx.Provider>
    </ApiCtx.Provider>
  );
}

/** 화면 안 3D 지도 자리. 초점 받은 화면의 자리에 공용 3D 지도가 놓임. 3D 를 못 쓰면 오류 안내와 재시도 단추. */
export function MapSlot({
  commands,
  onEvent,
  minimal = false,
  overlay,
  style,
  padding,
  onTouch,
}: {
  /** 지도 위·아래를 가리는 카드 높이(dp): 네이티브 3D 가 보이는 부분 가운데에 맞춤 */
  padding?: { top: number; bottom: number };
  /** 사용자가 지도를 만지기 시작할 때 */
  onTouch?: () => void;
  commands: (Map3dCommand | null)[];
  onEvent?: (e: Map3dEvent) => void;
  minimal?: boolean;
  /** 지도 위에 얹는 단추·배지(3D 위에도 보이게 공용 지도와 함께 그림) */
  overlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const api = useContext(ApiCtx);
  const status = useContext(StatusCtx);
  const { key: routeKey } = useRoute();
  const focused = useIsFocused();
  const inset = useSafeAreaInsets();
  const id = useId();
  const ref = useRef<View | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const list = useMemo(() => commands.filter((c): c is Map3dCommand => !!c), [commands]);
  const measure = useCallback(
    () =>
      ref.current?.measureInWindow((x, y, w, h) => {
        if (!(w > 0 && h > 0)) return;
        setRect((cur) => (cur?.x === x && cur.y === y && cur.w === w && cur.h === h ? cur : { x, y, w, h }));
      }),
    [],
  );

  useLayoutEffect(() => {
    api?.put({ id, routeKey, rect, commands: list, minimal, onEvent, overlay, padding, onTouch });
  });
  // 화면이 스택에서 제거될 때 보관한 UI도 함께 정리.
  useEffect(() => () => api?.remove(id), [api, id]);

  useLayoutEffect(() => {
    if (focused) measure();
  }, [focused, measure]);

  return (
    <View ref={ref} style={[s.fill, style]} onLayout={measure} collapsable={false}>
      {status === 'failed' ? (
        <>
          <View
            style={[
              s.failure,
              {
                top: Math.max(padding?.top ?? 0, rect && rect.y < inset.top ? inset.top + 8 : 0),
                bottom: padding?.bottom ?? 0,
              },
            ]}
          >
            <Text style={s.noticeT} accessibilityRole="alert">
              3D 지도를 불러오지 못했어요
            </Text>
            <Button variant="secondary" label="지도 다시 시도" onPress={() => api?.retry()} />
          </View>
          {overlay}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  host: { position: 'absolute', overflow: 'hidden', backgroundColor: color.canvas },
  hiddenOverlay: { display: 'none' },
  fill: { flex: 1, backgroundColor: color.canvas, overflow: 'hidden' },
  failure: { position: 'absolute', left: 16, right: 16, alignItems: 'center', justifyContent: 'center', gap: 12 },
  noticeT: { color: color.warning, fontSize: 13, fontWeight: '600' },
  loading: { position: 'absolute', left: 0, right: 0, top: '40%', alignItems: 'center' },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(20,27,58,0.84)',
    paddingLeft: 8,
    paddingRight: 14,
    paddingVertical: 4,
    borderRadius: 999,
  },
  loadingT: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
