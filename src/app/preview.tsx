// CT06 경로 미리보기: 3D 지도에 경로(층 바뀌는 곳 표시), 요약(시간·길이·계단·층 이동), 경로 옵션 / 안내 시작.
// 경로는 서버가 닿으면 고른 방식의 서버 계산, 아니면 기기 계산(AppState.route).
import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { routeCommand } from '../map3d/embed';
import { modeInfo } from '../route/modes';
import { hasRouteIndicators } from '../route/route';
import { minutesOf } from '../route/time';
import { useApp } from '../state/AppState';
import { CampusMap } from '../ui/CampusMap';
import { FloorCapsule } from '../ui/FloorCapsule';
import { Badge, Btn, P, Screen, T } from '../ui/kit';
import { useMap3dControls } from '../ui/Map3D';
import { Glass, RouteDrawBar, WaveEdge } from '../ui/v3';
import { Footprints } from 'lucide-react-native';

export default function PreviewScreen() {
  const app = useApp();
  const ctl = useMap3dControls();
  const r = app.route;
  const server = app.serverRoute;
  const cmd = useMemo(() => (app.graph && r?.ok ? routeCommand(app.graph, r) : null), [app.graph, r]);
  const pkg = app.pkg;
  const dest = pkg?.places.find((p) => p.key === app.destKey);
  const st = app.start;
  if (!pkg || !r)
    return (
      <Screen title="경로 미리보기">
        <P>출발과 도착을 먼저 골라 주세요.</P>
      </Screen>
    );
  if (!r.ok) return <Redirect href="/no-route" />;
  const stairs = r.steps.filter((s) => s.kind === 'stairs').length;
  const changes = r.steps.filter((s) => s.floorChange);
  const startLabel = st ? (st.type === 'place' ? pkg.places.find((p) => p.key === st.placeKey)?.name : st.label) : '';
  const path = [startLabel, ...changes.map((c) => c.toFloor), dest?.name].filter(Boolean).join(' → ');
  const offline = app.loaded?.source !== 'server';
  const fromServer = r.source === 'server';
  // 기기 계산인데 꾸러미에 지붕·조명 지표가 없으면 이 방식은 일부만 반영됨
  const partial = !fromServer && !hasRouteIndicators(pkg) ? modeInfo(app.condition).device : null;
  return (
    <Screen
      title="경로 미리보기"
      scroll={false}
      footer={
        <View style={s.two}>
          <Btn kind="soft" label="경로 옵션" onPress={() => router.back()} style={{ flex: 1 }} />
          <Btn
            label="안내 시작"
            onPress={() => {
              app.setGuideStep(0);
              if (dest && startLabel)
                app.addRecentRoute({ startLabel, destKey: dest.key, condition: app.condition, at: new Date().toISOString() });
              router.navigate('/guide');
            }}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      <View style={s.map}>
        <CampusMap
          commands={[cmd]}
          routePoints={r.points}
          pickPlaces={false}
          minimal
          padding={{ top: 72, bottom: 236 }}
          overlay={
            <>
              <FloorCapsule buildingKey={dest?.buildingKey} style={s.floors} />
              <WaveEdge color="#F2F3FD" flip height={18} />
              <Glass style={s.sum}>
                <View style={s.sumHead}>
                  <Footprints size={18} color={T.primary} />
                  <Text style={s.kind}>{modeInfo(app.condition).title}</Text>
                </View>
                <Text style={s.t}>
                  약 {minutesOf(r.durationS)}분 <Text style={s.len}>· {Math.round(r.totalLengthM)} m</Text>
                </Text>
                <RouteDrawBar />
                <P tone="muted">
                  계단 {stairs}곳 · 층 이동 {changes.length}번
                </P>
                <Text style={s.path} numberOfLines={2}>
                  {path}
                </Text>
              </Glass>
            </>
          }
        />
      </View>
      <View style={s.below}>
        {fromServer ? (
          <Badge tone="confirmed" text="서버에서 이 방식으로 계산" />
        ) : (
          <Badge
            tone={offline ? 'offline' : 'confirmed'}
            text={offline ? '저장된 지도로 기기에서 계산' : '방금 받은 지도로 기기에서 계산'}
          />
        )}
        {partial ? <P tone="muted">{partial}</P> : null}
        {/* 1인칭 미리 보기: 경로를 눈높이로 2~3배속 걸어 봄(앱 내장 3D 일 때만) */}
        {ctl.available ? (
          <Btn
            kind="soft"
            label="1인칭 미리 보기"
            onPress={() => router.push({ pathname: '/first-person', params: { mode: 'preview' } })}
          />
        ) : null}
        {server && !server.ok ? (
          <P tone="muted">
            {server.code === 'no_route' ? '서버는 같은 조건의 경로가 없다고 해요' : '서버에 연결하지 못해 기기에서 계산했어요'}
          </P>
        ) : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  floors: { position: 'absolute', left: 12, right: 96, top: 14, alignSelf: 'flex-start' },
  map: { flex: 1, marginHorizontal: -T.margin },
  sum: { position: 'absolute', left: 16, right: 16, bottom: 16, padding: 18, gap: 8 },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { fontSize: T.small, fontWeight: '800', color: T.primary },
  t: { fontSize: T.display - 2, fontWeight: '800', color: T.text, letterSpacing: -0.5 },
  len: { fontSize: T.body, fontWeight: '700', color: T.sub },
  path: { fontSize: T.small, color: T.primary, fontWeight: '600' },
  below: { gap: 6, paddingTop: 10 },
  two: { flexDirection: 'row', gap: 8 },
});
