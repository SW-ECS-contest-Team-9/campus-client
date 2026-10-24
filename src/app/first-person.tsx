// 1인칭 화면(네이티브 3D 만): 앱이 계산한 경로(AppState.route)를 눈높이로.
// - 미리 보기(mode=preview): 경로를 1×·2×·3× 로 걸어 봄. 재생/멈춤, 진행 막대 끌어 넘기기, 나가기.
// - 따라가기(mode=follow): 길 안내 중. 위치 보정(tracker → 맞춤기)이 끌어당긴 위치를 경로 위 거리로 바꿔(route/follow.ts) 카메라가 따라감.
//   층은 보정기의 층 판정(바닥 높이). 경로에서 15 m 넘게 벗어나면 멈추고 알림.
// 세로 화면에서 가로 시야가 좁아지지 않게 3D 는 화면 위쪽(가로:세로 약 0.75)에만 두고 아래에 조작판.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Flag, MoveUp, Pause, Play, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { routeCommand, type Map3dCommand, type Map3dEvent } from '../map3d/embed';
import { DEFAULT_GPS_DISTRUST } from '../location/matcher';
import { createRouteFollower, distrustZones, followNotice, type FollowState } from '../route/follow';
import { useApp } from '../state/AppState';
import { Btn, T } from '../ui/kit';
import { MapSlot, useMap3dControls } from '../ui/Map3D';

type FpEvent = Extract<Map3dEvent, { type: 'firstPerson' }>;
const SPEEDS = [1, 2, 3] as const;
const TURN_ICON = { left: ArrowLeft, right: ArrowRight, up: ArrowUp, down: ArrowDown, arrive: Flag } as const;

export default function FirstPersonScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const follow = mode === 'follow';
  const app = useApp();
  const ctl = useMap3dControls();
  const inset = useSafeAreaInsets();
  const win = useWindowDimensions();
  const r = app.route;
  const pkg = app.pkg;
  const [speed, setSpeed] = useState<number>(2);
  const [paused, setPaused] = useState(false);
  const [ev, setEv] = useState<FpEvent | null>(null);
  const [fs, setFs] = useState<FollowState | null>(null);
  const barW = useRef(0);
  const route = useMemo(() => (app.graph && r?.ok ? routeCommand(app.graph, r) : null), [app.graph, r]);
  const fpCmd = useMemo<Map3dCommand>(
    () =>
      follow
        ? { v: 1, type: 'firstPerson', on: true, follow: true }
        : { v: 1, type: 'firstPerson', on: true, follow: false, speed, paused },
    [follow, speed, paused],
  );
  const commands = useMemo(() => [route, fpCmd], [route, fpCmd]);

  // 따라가기: 보정 위치(app.fix: 맞춤기가 통로로 끌어당긴 점) → 경로 위 거리 → 3D 목표
  // 날 GPS 보조 이탈 판정은 보정기가 GPS 를 덜 믿는 구역(북악관 외곽선 + 15 m)에서 끔
  const follower = useMemo(
    () =>
      follow && r?.ok && pkg
        ? createRouteFollower(r.points, { zones: distrustZones(pkg.buildings, Object.keys(DEFAULT_GPS_DISTRUST)) })
        : null,
    [follow, r, pkg],
  );
  const send = useRef(ctl.send);
  useEffect(() => {
    send.current = ctl.send;
  });
  useEffect(() => {
    if (!follower || !pkg) return;
    const f = app.fix;
    if (!f) return;
    const fk = app.confirmedFloor?.floorKey ?? f.match?.floorKey ?? null;
    const floorZ = fk ? (pkg.floors.find((x) => x.key === fk)?.floorZ ?? null) : null;
    const st = follower.update({
      x: f.x,
      y: f.y,
      z: floorZ ?? f.match?.z ?? null,
      uncertain: f.uncertain,
      // 날 GPS 보조: 실내 층(지하 포함)이면 쓰지 않음
      raw: f.raw ? { x: f.raw.x, y: f.raw.y, accuracyM: f.accuracyM, t: f.timestamp / 1000, indoor: !!f.match?.floorKey } : null,
    });
    // 보정 위치(밖의 상태)가 바뀔 때마다 한 번: 따라가기 상태를 화면에 옮김
    setFs(st); // eslint-disable-line react-hooks/set-state-in-effect
    send.current({ v: 1, type: 'firstPersonFollow', m: st.status === 'following' ? st.m : null });
  }, [follower, app.fix, app.confirmedFloor, pkg]);

  if (!pkg || !r?.ok || !route) return <Redirect href="/" />;
  // 3D 높이: 가로:세로 0.75 쯤(가로 시야 약 60°), 아래 조작판 자리는 남김
  const panelH = follow ? 150 : 210;
  const mapH = Math.max(240, Math.min(win.height - inset.top - inset.bottom - panelH, win.width / 0.72));
  const total = ev?.total || r.totalLengthM;
  const s = ev?.s ?? 0;
  const frac = total > 0 ? Math.min(1, s / total) : 0;
  const done = ev?.state === 'done';
  const notice = follow ? followNotice(fs, !!app.fix) : null;
  const Icon = ev?.turn ? TURN_ICON[ev.turn] : MoveUp;
  const seekTo = (x: number, w: number) => {
    if (follow || w <= 0) return;
    ctl.send({ v: 1, type: 'firstPersonSeek', m: Math.max(0, Math.min(1, x / w)) * total });
  };

  return (
    <View style={[st.root, { paddingTop: inset.top }]}>
      <View style={{ height: mapH }}>
        <MapSlot
          commands={commands}
          minimal
          onEvent={(e) => {
            if (e.type !== 'firstPerson') return;
            setEv(e);
            if (e.state === 'done') setPaused(true);
          }}
          overlay={
            <View style={st.hud} pointerEvents="none" accessibilityLiveRegion="polite">
              <Icon size={30} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={st.hudT} numberOfLines={2}>
                  {ev?.text ?? '1인칭 준비 중…'}
                </Text>
                <Text style={st.hudS} numberOfLines={1}>
                  {[ev?.sub, ev?.floor].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          }
          fallback={
            <View style={st.fail}>
              <Text style={st.failT}>1인칭은 3D 지도(앱 내장)에서만 볼 수 있어요</Text>
            </View>
          }
        />
      </View>
      <View style={[st.panel, { paddingBottom: inset.bottom + 12 }]}>
        {notice ? (
          <View style={st.notice} accessibilityLiveRegion="assertive">
            <Text style={st.noticeT}>{notice}</Text>
          </View>
        ) : null}
        <View
          style={st.bar}
          accessibilityRole="adjustable"
          accessibilityLabel="진행"
          accessibilityValue={{ min: 0, max: Math.round(total), now: Math.round(s), text: `${Math.round(s)} / ${Math.round(total)} m` }}
          onStartShouldSetResponder={() => !follow}
          onMoveShouldSetResponder={() => !follow}
          onResponderGrant={(e) => seekTo(e.nativeEvent.locationX, barW.current)}
          onResponderMove={(e) => seekTo(e.nativeEvent.locationX, barW.current)}
          onLayout={(e) => (barW.current = e.nativeEvent.layout.width)}
        >
          <View style={st.track} pointerEvents="none">
            <View style={[st.fill, { width: `${frac * 100}%` }]} />
          </View>
          <View style={[st.knob, { left: `${frac * 100}%` }]} pointerEvents="none" />
        </View>
        <Text style={st.meta}>
          {Math.round(s)} m / {Math.round(total)} m{follow ? ' · 걸으며 따라가기' : ''}
        </Text>
        <View style={st.row}>
          {!follow ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={paused || done ? '재생' : '멈춤'}
                style={st.play}
                onPress={() => setPaused(!(paused || done))}
              >
                {paused || done ? <Play size={26} color="#fff" /> : <Pause size={26} color="#fff" />}
              </Pressable>
              {SPEEDS.map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityState={{ selected: speed === k }}
                  accessibilityLabel={`${k}배속`}
                  style={[st.speed, speed === k && st.speedOn]}
                  onPress={() => setSpeed(k)}
                >
                  <Text style={[st.speedT, speed === k && st.speedTOn]}>{k}×</Text>
                </Pressable>
              ))}
            </>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="나가기" style={st.exit} onPress={() => router.back()}>
            <X size={22} color={T.text} />
            <Text style={st.exitT}>나가기</Text>
          </Pressable>
        </View>
        {!follow ? null : <Btn kind="ghost" label="위치 다시 확인" onPress={() => router.push('/recheck')} />}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A' },
  hud: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(20,34,53,0.9)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  hudT: { color: '#fff', fontSize: 19, fontWeight: '800' },
  hudS: { color: '#C9D3E0', fontSize: 13, marginTop: 2 },
  fail: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  failT: { color: '#fff', fontSize: T.body, textAlign: 'center' },
  panel: { flex: 1, backgroundColor: '#F6F8FB', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 },
  notice: { backgroundColor: T.cautionSoft, borderRadius: 12, padding: 10 },
  noticeT: { color: T.caution, fontWeight: '700', fontSize: T.small },
  bar: { height: 32, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#D7DDF0', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: T.primary },
  knob: {
    position: 'absolute',
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: T.primary,
    borderWidth: 3,
    borderColor: '#fff',
  },
  meta: { color: T.sub, fontSize: T.caption },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  play: {
    width: T.touch + 4,
    height: T.touch + 4,
    borderRadius: 26,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speed: {
    minWidth: T.touch,
    height: T.touch,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  speedOn: { backgroundColor: T.primarySoft, borderColor: T.primary },
  speedT: { fontSize: T.body, fontWeight: '700', color: T.sub },
  speedTOn: { color: T.primary },
  exit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: T.touch,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: T.line,
  },
  exitT: { fontSize: T.small, fontWeight: '700', color: T.text },
});
