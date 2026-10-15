// 3D 캠퍼스 지도를 앱 전체에서 하나만 띄워 둔다. Android 기본은 네이티브 3D(expo-gl + three.js, 앱에 묶은 campus.glb, 서버 없이 뜸),
// 설정 "3D 엔진: 웹" 이거나 웹 빌드면 campus-tracker 의 client3d.html(웹 <iframe>, 네이티브 react-native-webview). 두 엔진 모두 메시지 형식 v1.
// 화면은 <MapSlot> 으로 자리만 잡고, 초점을 받은 화면의 자리로 그 하나를 옮겨 보여 준다(화면 바꿀 때 다시 불러오지 않음).
// 명령은 페이지가 ready 를 보낸 뒤 보내고, 자리·명령이 바뀔 때마다 다시 보낸다. 못 불러오면 각 자리에 평면 지도 + 알림.
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurTargetView } from 'expo-blur';
import { BlurTargetCtx } from './look';
import { Character } from './v3';
import { parseEvent, type Map3dCommand, type Map3dEvent } from '../map3d/embed';
import { CHARACTER_OK, CHARACTER_UNCERTAIN } from './characterImages';
import { color } from './components';
import { Campus3DView, type Campus3DHandle } from '../map3d/native/Campus3DView';
import { note3dStat } from '../map3d/diag';

export type Map3dEngine = 'native' | 'web';
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
  rect: Rect | null;
  commands: Map3dCommand[];
  minimal: boolean;
  onEvent?: (e: Map3dEvent) => void;
  overlay?: ReactNode;
  /** 지도 위·아래를 가리는 카드 높이(dp) */
  padding?: { top: number; bottom: number };
}
interface Api {
  put: (s: Slot) => void;
  focus: (id: string, on: boolean) => void;
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
const ControlsCtx = createContext<Map3dControls>({ available: false, home: () => {}, toggleExplode: () => false, focusMe: () => {} });
export const useMap3dControls = () => useContext(ControlsCtx);

/** 앱 뿌리에 한 번. children(화면들) 위에 3D 지도 하나를 겹쳐 둠. */
export function Map3DHost({
  url,
  engine = 'web',
  light = false,
  places,
  children,
  onFirstReady,
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
}) {
  const [t0] = useState(() => Date.now());
  const firstReady = useRef(false);
  const blurTarget = useRef<View | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [active, setActive] = useState<string | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const rootRef = useRef<View | null>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const web = useRef<WebView | null>(null);
  const native = useRef<Campus3DHandle | null>(null);
  const useNative = engine === 'native' && Platform.OS !== 'web';
  const ready = useRef(false);
  const lastUi = useRef<boolean | null>(null);
  const markersSent = useRef(false);
  const sent = useRef(new Map<string, string>());
  const sentSlot = useRef<string | null>(null);

  const api = useMemo<Api>(
    () => ({
      put: (s) => setSlots((all) => ({ ...all, [s.id]: s })),
      // 초점 잃어도 자리 정보는 남김(뒤로 와서 다시 초점 받을 때 바로 씀)
      focus: (id, on) => setActive((cur) => (on ? id : cur === id ? null : cur)),
    }),
    [],
  );
  const slot = active ? slots[active] : undefined;
  const controls = useMemo<Map3dControls>(
    () => ({
      available: useNative && status === 'ready',
      home: () => native.current?.home(),
      toggleExplode: () => native.current?.toggleExplode() ?? false,
      focusMe: () => native.current?.focusMe(),
    }),
    [useNative, status],
  );

  const post = useCallback((msg: Map3dCommand | { v: 1; type: 'setMode'; light?: boolean; ui: 'min' | 'full' }) => {
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
      post({ v: 1, type: 'setMode', ui: slot.minimal ? 'min' : 'full' });
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
      // 네이티브 3D 가 처음에 실패하면(문맥·자료) 평면 지도로
      if (e.type === 'error' && /^native3d:/.test(e.error) && !ready.current) setStatus('failed');
      handler.current?.(e);
    },
    [t0],
  );

  // 엔진·주소·가벼운 모드가 바뀌면 다시 불러옴. 너무 오래 ready 가 안 오면 실패.
  const source = useNative ? `native:${light}` : url;
  const [loadedSource, setLoadedSource] = useState(source);
  if (loadedSource !== source) {
    setLoadedSource(source);
    setStatus('loading');
  }
  useEffect(() => {
    ready.current = false;
    const t = setTimeout(() => !ready.current && setStatus('failed'), READY_TIMEOUT_MS);
    if (Platform.OS === 'web') fetch(source, { mode: 'no-cors' }).catch(() => setStatus('failed'));
    return () => clearTimeout(t);
  }, [source]);

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
  // 숨길 때도 마지막 크기를 유지(지도 다시 그리기 비용 줄임)
  const [r, setR] = useState<Rect>({ x: 0, y: 0, w: 360, h: 400 });
  if (rect && (rect.x !== r.x || rect.y !== r.y || rect.w !== r.w || rect.h !== r.h)) setR(rect);
  return (
    <ApiCtx.Provider value={api}>
      <ControlsCtx.Provider value={controls}>
        <StatusCtx.Provider value={status}>
          <View ref={rootRef} style={s.root} onLayout={() => rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))}>
            {children}
            <View
              pointerEvents={shown ? 'box-none' : 'none'}
              style={[s.host, { left: r.x - origin.x, top: r.y - origin.y, width: r.w, height: r.h, opacity: shown ? 1 : 0 }]}
              accessibilityElementsHidden={!shown}
              importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
            >
              {Platform.OS === 'web' ? (
                <iframe
                  ref={frame}
                  src={url}
                  title="3D 캠퍼스 지도"
                  style={{ border: 0, width: '100%', height: '100%', display: 'block', pointerEvents: shown ? 'auto' : 'none' }}
                />
              ) : (
                <BlurTargetView ref={blurTarget} style={s.fill}>
                  {useNative ? (
                    <Campus3DView
                      key={source}
                      ref={native}
                      light={light}
                      places={places}
                      padding={slot?.padding}
                      style={s.fill}
                      logFrames
                      onStats={note3dStat}
                      onEvent={(e) => receive(e)}
                    />
                  ) : (
                    <WebView
                      ref={web}
                      source={{ uri: url }}
                      style={s.fill}
                      originWhitelist={['*']}
                      javaScriptEnabled
                      onMessage={(e) => receive(e.nativeEvent.data)}
                      onError={() => setStatus('failed')}
                      onHttpError={() => setStatus('failed')}
                      // GPU 렌더러가 죽으면(메모리·드라이버) 앱 전체가 죽지 않게 평면 지도로
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
              <BlurTargetCtx.Provider value={blurTarget}>{shown ? slot?.overlay : null}</BlurTargetCtx.Provider>
            </View>
          </View>
        </StatusCtx.Provider>
      </ControlsCtx.Provider>
    </ApiCtx.Provider>
  );
}

/** 화면 안 3D 지도 자리. 초점 받은 화면의 자리에 공용 3D 지도가 놓임. 3D 를 못 쓰면 fallback(평면 지도) + 알림. */
export function MapSlot({
  commands,
  onEvent,
  minimal = false,
  overlay,
  fallback,
  style,
  padding,
}: {
  /** 지도 위·아래를 가리는 카드 높이(dp): 네이티브 3D 가 보이는 부분 가운데에 맞춤 */
  padding?: { top: number; bottom: number };
  commands: (Map3dCommand | null)[];
  onEvent?: (e: Map3dEvent) => void;
  minimal?: boolean;
  /** 지도 위에 얹는 단추·배지(3D 위에도 보이게 공용 지도와 함께 그림) */
  overlay?: ReactNode;
  fallback: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const api = useContext(ApiCtx);
  const status = useContext(StatusCtx);
  const inset = useSafeAreaInsets();
  const id = useId();
  const ref = useRef<View | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const list = useMemo(() => commands.filter((c): c is Map3dCommand => !!c), [commands]);
  const measure = useCallback(() => ref.current?.measureInWindow((x, y, w, h) => w > 0 && h > 0 && setRect({ x, y, w, h })), []);

  useEffect(() => {
    api?.put({ id, rect, commands: list, minimal, onEvent, overlay, padding });
  });
  useFocusEffect(
    useCallback(() => {
      measure();
      api?.focus(id, true);
      return () => api?.focus(id, false);
    }, [api, id, measure]),
  );

  return (
    <View ref={ref} style={[s.fill, style]} onLayout={measure} collapsable={false}>
      {status === 'failed' ? (
        <>
          {/* 알림은 지도 위에 겹치지 않고 위쪽 줄로(짧은 경로가 가려지던 문제) */}
          {/* 지도가 화면 맨 위까지 깔린 화면(홈)에서는 상태 표시줄 아래로 */}
          <View style={[s.notice, rect && rect.y < inset.top ? { paddingTop: inset.top + 8 } : null]}>
            <Text style={s.noticeT}>3D 지도를 불러오지 못해 평면 지도로 보여요</Text>
          </View>
          <View style={s.fill}>
            {fallback}
            {overlay}
          </View>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  host: { position: 'absolute', overflow: 'hidden', backgroundColor: color.canvas },
  fill: { flex: 1, backgroundColor: color.canvas, overflow: 'hidden' },
  notice: { backgroundColor: color.warningSoft, paddingHorizontal: 12, paddingVertical: 8 },
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
