// 네이티브 3D 캠퍼스 지도(expo-gl + three.js). client3d 페이지(WebView)를 대신하는 끼워 넣기 부품. 이 저장소가 관리(복사본 아님).
// 같은 메시지 형식 v1: ref.post(명령) 으로 보내고 onEvent(사건) 으로 받음 — 앱 화면 코드는 바꾸지 않아도 됨.
// 자료는 앱에 묶인 assets/campus.glb(웹 모델링을 구운 것, export/build-glb.mjs). 서버·인터넷 없이 뜸.
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Image, PanResponder, PixelRatio, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as THREE from 'three';
import { createCampusScene, type CampusScene } from './campusScene';
import type { PageEvent } from './protocol';
import type { Language } from '../../i18n/translations';
import { nativeBuildingLabel, type BuildingLabel } from './label-i18n';

// Hermes 에 없을 수 있는 것(GLTFLoader 가 JSON 덩어리를 읽을 때 씀)
if (typeof (globalThis as any).TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = class {
    decode(b: Uint8Array) {
      let s = '';
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      try { return decodeURIComponent(escape(s)); } catch { return s; }
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CAMPUS_GLB = require('../../../assets/3d/campus.glb');

export interface Campus3DHandle {
  /** client3d 와 같은 명령(객체 또는 JSON 문자열) */
  post: (msg: unknown) => void;
  /** 앱이 가진 지도 단추(campus-client 추가): 처음 시점, 층 펼치기(펼쳤으면 true), 내 위치로 */
  home: () => void;
  toggleExplode: () => boolean;
  /** 숨겼다 다시 보일 때 다음 프레임을 꼭 그리게(표면 버퍼가 비어 흰 화면이 되지 않게) */
  redraw: () => void;
  focusMe: () => void;
}
/** 장소 점(campus-client 추가): 꾸러미 장소, EPSG:5186. 누르면 pick(kind 'place', id). */
export interface Campus3DPlace { id: string; name: string; x: number; y: number; z: number }
type Label = { key: string; kind: 'building' | 'place' | 'change'; text: string; w: number; id: string; tm?: Campus3DPlace };
const labelWidth = (t: string) => Math.min(150, 14 + t.length * 13);

export interface Campus3DProps {
  onEvent?: (e: PageEvent) => void;
  places?: Campus3DPlace[];
  buildingNames?: Readonly<Record<string, BuildingLabel>>;
  language?: Language;
  /** 위·아래를 앱 카드가 가리는 높이(dp). 보이는 부분 가운데로 장면을 맞춤 */
  padding?: { top: number; bottom: number; left?: number; right?: number };
  /** 가벼운 모드: 선 끔 + 해상도 2/3 (tier 2) */
  light?: boolean;
  style?: StyleProp<ViewStyle>;
  /** 측정용: 손으로 움직이는 동안 프레임 간격을 3 s 마다 console.log('FRAMES …') */
  logFrames?: boolean;
  /** 측정용: LOAD3D·FIRST_FRAME·FRAMES 글을 앱에도 넘김(삼성 실기기는 release 앱의 console 을 logcat 에 안 남김) */
  onStats?: (text: string) => void;
}

async function loadGlb(): Promise<ArrayBuffer> {
  // 묶은 자산을 캐시 파일로 꺼낸 뒤(expo-asset) 통째로 읽음(expo-file-system). 지도 꾸러미에 넣을 땐 그 파일 경로를 바로 File 로.
  const asset = Asset.fromModule(CAMPUS_GLB);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  try {
    return await new File(uri).arrayBuffer();
  } catch (err) {
    throw new Error(`campus.glb 를 읽지 못함(${uri}): ${String((err as Error)?.message ?? err)}`);
  }
}

export const Campus3DView = forwardRef<Campus3DHandle, Campus3DProps>(function Campus3DView({ onEvent, places, buildingNames, language = 'ko', padding, light = false, style, logFrames = false, onStats }, ref) {
  const sceneRef = useRef<CampusScene | null>(null);
  const renderRun = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => {
    renderRun.current?.stop();
    sceneRef.current = null;
  }, []);
  const queue = useRef<unknown[]>([]);
  const handler = useRef(onEvent);
  const statsRef = useRef(onStats);
  useEffect(() => { handler.current = onEvent; statsRef.current = onStats; });
  const stat = (t: string) => { console.log(t); statsRef.current?.(t); };
  const [markers, setMarkers] = useState<{ ok: string | null; uncertain: string | null }>({ ok: null, uncertain: null });
  const [markerState, setMarkerState] = useState<'ok' | 'uncertain' | null>(null);
  const markerPos = useRef(new Animated.ValueXY({ x: -999, y: -999 })).current;
  const scale = useRef(PixelRatio.get());
  const layoutSize = useRef<{ w: number; h: number } | null>(null);

  // ---------- 이름표(campus-client 추가): 건물 이름·장소 점·층 바뀜 글을 RN 으로 화면 위에. 화면에서 겹치면 뒤 순서를 뺌 ----------
  const [labels, setLabels] = useState<Label[]>([]);
  const labelXY = useRef(new Map<string, Animated.ValueXY>()).current;
  const labelKeys = useRef('');
  const labelsDirty = useRef(true);
  const placeList = useRef(places);
  const buildingNamesRef = useRef(buildingNames);
  const languageRef = useRef(language);
  const placeAnchors = useRef<{ pl: Campus3DPlace; p: THREE.Vector3 }[] | null>(null);
  const changes = useRef<{ at: number[]; label: string | null }[]>([]);
  const changeAnchors = useRef<{ label: string; p: THREE.Vector3 }[] | null>(null);
  const shownPlaces = useRef<{ pl: Campus3DPlace; x: number; y: number }[]>([]);
  useEffect(() => { buildingNamesRef.current = buildingNames; languageRef.current = language; labelsDirty.current = true; }, [buildingNames, language]);
  useEffect(() => { placeList.current = places; placeAnchors.current = null; labelsDirty.current = true; }, [places]);
  const layoutLabels = useCallback((sc: CampusScene) => {
    const k = scale.current;
    if (!placeAnchors.current) placeAnchors.current = (placeList.current ?? []).map((pl) => ({ pl, p: sc.toScene(pl.x, pl.y, pl.z) }));
    if (!changeAnchors.current) changeAnchors.current = changes.current.filter((c) => c.label).map((c) => ({ label: c.label!, p: sc.toScene(c.at[0], c.at[1], Number.isFinite(c.at[2]) ? c.at[2] : null) }));
    const rects: number[][] = [];
    // 캐릭터(현재 위치 그림 64 dp) 자리는 비워 둠
    const me = sc.markerScreen();
    if (me) rects.push([me.x / k - 32, me.y / k - 64, me.x / k + 32, me.y / k]);
    const out: Label[] = [];
    const pos: [string, number, number][] = [];
    const put = (l: Label, p: THREE.Vector3, h: number, below: number) => {
      const sp = sc.screenOf(p);
      if (!sp) return null;
      const x = sp.x / k, y = sp.y / k;
      const r = [x - l.w / 2, y - h + below, x + l.w / 2, y + below];
      // 앱 카드가 가리는 위·아래 띠에는 이름표를 두지 않음
      const H = layoutSize.current?.h ?? Infinity, W = layoutSize.current?.w ?? Infinity, q = padRef.current;
      if (r[1] < (q?.top ?? 0) || r[3] > H - (q?.bottom ?? 0) || r[0] < (q?.left ?? 0) || r[2] > W - (q?.right ?? 0)) return null;
      if (rects.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return null;
      rects.push(r); out.push(l); pos.push([l.key, x, y]);
      return { x, y };
    };
    changeAnchors.current.forEach((c, i) => put({ key: `c:${i}:${c.label}`, kind: 'change', text: c.label, w: labelWidth(c.label), id: '' }, c.p, 26, 0));
    for (const b of sc.buildingAnchors()) {
      const name = nativeBuildingLabel(b.name, buildingNamesRef.current?.[b.id], languageRef.current);
      put({ key: `b:${b.id}`, kind: 'building', text: name, w: labelWidth(name), id: b.id }, b.p, 26, 0);
    }
    const shown: { pl: Campus3DPlace; x: number; y: number }[] = [];
    // 장소 점은 가까이 볼 때만(멀면 건물 이름만)
    if (sc.cameraDistance() < 520) for (const a of placeAnchors.current) { const at = put({ key: `p:${a.pl.id}`, kind: 'place', text: a.pl.name, w: 18, id: a.pl.id, tm: a.pl }, a.p, 18, 9); if (at) shown.push({ pl: a.pl, ...at }); }
    shownPlaces.current = shown;
    for (const [key, x, y] of pos) { let v = labelXY.get(key); if (!v) { v = new Animated.ValueXY({ x, y }); labelXY.set(key, v); } else v.setValue({ x, y }); }
    const keys = JSON.stringify(out.map((l) => [l.key, l.text, l.w]));
    if (keys !== labelKeys.current) { labelKeys.current = keys; setLabels(out); }
  }, [labelXY]);

  const post = useCallback((msg: unknown) => {
    let m: any = msg;
    if (typeof msg === 'string') { try { m = JSON.parse(msg); } catch { /* scene 이 오류 사건을 보냄 */ } }
    if (m && m.type === 'setMarkerImages') setMarkers({ ok: m.ok ?? null, uncertain: m.uncertain ?? null });
    if (m && (m.type === 'setRoute' || m.type === 'clearRoute')) { changes.current = m.type === 'setRoute' && Array.isArray(m.floorChanges) ? m.floorChanges : []; changeAnchors.current = null; labelsDirty.current = true; }
    if (sceneRef.current) sceneRef.current.command(msg);
    else queue.current.push(msg);
  }, []);
  const padRef = useRef(padding);
  const applyPad = () => { const q = padRef.current, k = scale.current; sceneRef.current?.setPadding((q?.top ?? 0) * k, (q?.bottom ?? 0) * k, (q?.left ?? 0) * k, (q?.right ?? 0) * k); };
  useEffect(() => { padRef.current = padding; labelsDirty.current = true; applyPad(); }, [padding?.top, padding?.bottom, padding?.left, padding?.right]); // eslint-disable-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    post,
    home: () => sceneRef.current?.home(),
    toggleExplode: () => sceneRef.current?.toggleExplode() ?? false,
    redraw: () => sceneRef.current?.redraw(),
    focusMe: () => sceneRef.current?.focusMe(),
  }), [post]);

  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    const t0 = Date.now();
    let stopped = false;
    let frameId: number | null = null;
    let dispose = () => {};
    renderRun.current?.stop();
    renderRun.current = { stop: () => {
      stopped = true;
      if (frameId != null) cancelAnimationFrame(frameId);
      dispose();
    } };
    try {
      // campus-client: 가벼운 모드도 해상도는 그대로(TextureView 표면은 보기 크기라 작은 viewport 는 왼쪽 아래에만 그려짐). 선만 끔
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      scale.current = PixelRatio.get();
      const canvas: any = { width: w, height: h, style: {}, clientWidth: w, clientHeight: h, addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl };
      // expo-gl 의 문맥은 GLES 3(WebGL2 함수 있음)이지만 WebGLRenderingContext 의 인스턴스라 three(r163+)가 WebGL1 로 보고 거절함 → 만들 때만 전역을 숨김
      const G = globalThis as any, saved = G.WebGLRenderingContext;
      G.WebGLRenderingContext = undefined;
      let renderer: THREE.WebGLRenderer;
      try { renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: false, powerPreference: 'high-performance' }); } finally { G.WebGLRenderingContext = saved; }
      dispose = () => renderer.dispose();
      renderer.setPixelRatio(1);
      const glb = await loadGlb();
      if (stopped) return;
      const tAsset = Date.now();
      const scene = await createCampusScene({ renderer, width: w, height: h, glb, light, emit: (e) => { if (!stopped) handler.current?.(e); } });
      dispose = () => { scene.dispose(); renderer.dispose(); };
      if (stopped) { dispose(); return; }
      sceneRef.current = scene;
      // campus-client: 앱은 3D 보기 하나를 화면마다 다른 크기 자리로 옮김 → 보기 크기에 맞춰 다시 맞춤
      if (layoutSize.current) scene.resize(Math.round(layoutSize.current.w * scale.current), Math.round(layoutSize.current.h * scale.current));
      applyPad();
      for (const m of queue.current.splice(0)) scene.command(m);
      // 그리기 버퍼 비트(R/G/B/A, 깊이, 스텐실) — expo-gl 이 고른 EGL 설정 확인용
      const bits = [gl.RED_BITS, gl.GREEN_BITS, gl.BLUE_BITS, gl.ALPHA_BITS, gl.DEPTH_BITS, gl.STENCIL_BITS].map((p) => gl.getParameter(p)).join('/');
      stat(`LOAD3D asset ${tAsset - t0} ms, scene ${Date.now() - tAsset} ms, total ${Date.now() - t0} ms, buffer ${w}x${h}, bits ${bits}`);
      let first = true;
      const frames: number[] = [];
      let lastLog = Date.now();
      const loop = () => {
        if (stopped) return;
        const drew = scene.frameTick();
        if (drew) {
          gl.endFrameEXP();
          if (first) {
            first = false;
            stat(`FIRST_FRAME ${Date.now() - t0} ms ${JSON.stringify(scene.info())}`);
            // ready 는 장면 생성 완료. 첫 그리기와 버퍼 제출까지 끝난 시점은 별도로 알림.
            handler.current?.({ v: 1, type: 'firstFrame' });
          }
          if (logFrames) frames.push(Date.now());
        }
        if (drew || labelsDirty.current) { labelsDirty.current = false; layoutLabels(scene); }
        // 위치 표시는 장면이 다시 그려질 때만 바뀜(위치·카메라 변경은 모두 dirty) → 유휴 프레임에는 계산·갱신 안 함
        if (drew) {
          const p = scene.markerScreen();
          if (p) { markerPos.setValue({ x: p.x / scale.current, y: p.y / scale.current }); setMarkerState((s) => (s === p.state ? s : p.state)); }
          else setMarkerState((s) => (s === null ? s : null));
        }
        if (logFrames && Date.now() - lastLog > 3000 && frames.length > 10) {
          const d = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
          const q = (x: number) => d[Math.min(d.length - 1, Math.floor(d.length * x))];
          stat(`FRAMES n=${d.length} p50=${q(0.5)} p95=${q(0.95)} max=${d[d.length - 1]} ms`);
          frames.length = 0; lastLog = Date.now();
        }
        frameId = requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      dispose();
      if (stopped) return;
      console.error('3D 실패', err);
      handler.current?.({ v: 1, type: 'error', error: `native3d: ${String((err as Error)?.message ?? err)}` });
    }
  }, [light, logFrames, markerPos, layoutLabels]);

  // 손 조작: 한 손가락 끌기 = 이동, 두 손가락 = 확대·회전(함께 위아래로 = 기울이기), 짧게 누름 = 고르기
  const g = useRef({ x: 0, y: 0, d: 0, a: 0, my: 0, n: 0, moved: 0, t: 0 }).current;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { const t = e.nativeEvent.touches; g.n = t.length; g.x = t[0].pageX; g.y = t[0].pageY; g.moved = 0; g.t = Date.now(); if (t.length > 1) two(t); },
    onPanResponderMove: (e) => {
      const s = sceneRef.current; const t = e.nativeEvent.touches;
      if (!s || !t.length) return;
      const k = scale.current;
      if (t.length === 1) {
        if (g.n !== 1) { g.n = 1; g.x = t[0].pageX; g.y = t[0].pageY; return; }
        const dx = t[0].pageX - g.x, dy = t[0].pageY - g.y; g.moved += Math.abs(dx) + Math.abs(dy);
        s.pan(dx * k, dy * k); g.x = t[0].pageX; g.y = t[0].pageY;
      } else {
        if (g.n < 2) { g.n = 2; two(t); return; }
        const dxp = t[1].pageX - t[0].pageX, dyp = t[1].pageY - t[0].pageY;
        const d = Math.hypot(dxp, dyp), a = Math.atan2(dyp, dxp), my = (t[0].pageY + t[1].pageY) / 2;
        const zoom = d / (g.d || d);
        if (Math.abs(zoom - 1) > 0.002) s.zoom(zoom);
        let da = a - g.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        s.rotate(-da);
        if (Math.abs(zoom - 1) < 0.01 && Math.abs(da) < 0.01) s.tilt(-(my - g.my));
        g.d = d; g.a = a; g.my = my; g.moved += 10;
      }
    },
    onPanResponderRelease: (e) => {
      if (g.moved < 8 && Date.now() - g.t < 350 && sceneRef.current) {
        // 장소 점 가까이(22 dp)를 누르면 그 장소
        const lx = e.nativeEvent.locationX, ly = e.nativeEvent.locationY;
        const hit = shownPlaces.current.find((q) => Math.hypot(q.x - lx, q.y - ly) < 22);
        if (hit) handler.current?.({ v: 1, type: 'pick', kind: 'place', id: hit.pl.id, name: hit.pl.name, x: hit.pl.x, y: hit.pl.y, z: hit.pl.z });
        else sceneRef.current.tap(lx * scale.current, ly * scale.current);
      }
    },
  })).current;
  function two(t: any) { g.d = Math.hypot(t[1].pageX - t[0].pageX, t[1].pageY - t[0].pageY); g.a = Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX); g.my = (t[0].pageY + t[1].pageY) / 2; }

  const img = markerState === 'ok' ? markers.ok : markerState === 'uncertain' ? markers.uncertain : null;
  return (
    <View
      style={[s.fill, style]}
      {...pan.panHandlers}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!width || !height) return;
        layoutSize.current = { w: width, h: height };
        sceneRef.current?.resize(Math.round(width * scale.current), Math.round(height * scale.current));
        labelsDirty.current = true;
      }}
    >
      <GLView style={s.fill} onContextCreate={onContextCreate} />
      {labels.map((l) => {
        const v = labelXY.get(l.key);
        if (!v) return null;
        if (l.kind === 'place') return <Animated.View key={l.key} pointerEvents="none" style={[s.pdot, { transform: [{ translateX: Animated.subtract(v.x, 7) }, { translateY: Animated.subtract(v.y, 7) }] }]} />;
        return (
          <Animated.View key={l.key} pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[s.label, l.kind === 'change' && s.labelChange, { width: l.w, transform: [{ translateX: Animated.subtract(v.x, l.w / 2) }, { translateY: Animated.subtract(v.y, 26) }] }]}>
            <Text style={s.labelT} numberOfLines={1}>{l.text}</Text>
          </Animated.View>
        );
      })}
      {markerState ? (
        <Animated.View pointerEvents="none" style={[s.marker, { transform: [{ translateX: Animated.subtract(markerPos.x, 32) }, { translateY: Animated.subtract(markerPos.y, 64) }] }]}>
          {img ? <Image source={{ uri: img }} style={s.markerImg} /> : <View style={[s.dot, markerState === 'uncertain' && s.dotU]} />}
        </Animated.View>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  marker: { position: 'absolute', left: 0, top: 0, width: 64, height: 64, alignItems: 'center', justifyContent: 'flex-end' },
  markerImg: { width: 64, height: 64, resizeMode: 'contain' },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#0F766E', borderWidth: 4, borderColor: '#fff', marginBottom: 4 },
  dotU: { backgroundColor: '#B45309' },
  label: { position: 'absolute', left: 0, top: 0, height: 22, borderRadius: 11, backgroundColor: 'rgba(20,27,58,0.84)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  labelChange: { backgroundColor: '#DB2777' },
  labelT: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pdot: { position: 'absolute', left: 0, top: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#4F46E5', borderWidth: 2.5, borderColor: '#fff' },
});
