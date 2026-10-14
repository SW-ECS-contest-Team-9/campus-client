// CT06 경로 미리보기: 3D 지도에 경로(층 바뀌는 곳 표시), 요약(시간·길이·계단·층 이동), 경로 옵션 / 안내 시작.
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { serverRoute, type ServerRoute } from '../api/serverRoute';
import { routeCommand } from '../map3d/embed';
import { minutes } from '../route/time';
import { useApp } from '../state/AppState';
import { CampusMap } from '../ui/CampusMap';
import { Badge, Btn, Card, P, Screen, T } from '../ui/kit';

export default function PreviewScreen() {
  const app = useApp();
  const r = app.route;
  const [server, setServer] = useState<ServerRoute | null>(null);
  const cmd = useMemo(() => (app.graph && r?.ok ? routeCommand(app.graph, r) : null), [app.graph, r]);
  const pkg = app.pkg;
  const dest = pkg?.places.find((p) => p.key === app.destKey);
  const st = app.start;
  useEffect(() => {
    if (!pkg || !st || !dest || !r?.ok) return;
    const n = st.type === 'node' ? pkg.nodes.find((x) => x.key === st.nodeKey) : null;
    const from = st.type === 'place' ? st.placeKey : n ? `${n.x},${n.y},${n.z}` : '';
    void serverRoute(app.settings.serverUrl, from, dest.key, app.condition).then(setServer);
  }, [pkg, st, dest, r, app.condition, app.settings.serverUrl]);
  if (!pkg || !r) return <Screen title="경로 미리보기"><P>출발과 도착을 먼저 골라 주세요.</P></Screen>;
  if (!r.ok) return <Redirect href="/no-route" />;
  const stairs = r.steps.filter((s) => s.kind === 'stairs').length;
  const changes = r.steps.filter((s) => s.floorChange);
  const startLabel = st ? (st.type === 'place' ? pkg.places.find((p) => p.key === st.placeKey)?.name : st.label) : '';
  const path = [startLabel, ...changes.map((c) => c.toFloor), dest?.name].filter(Boolean).join(' → ');
  const offline = app.loaded?.source !== 'server';
  return (
    <Screen title="경로 미리보기" scroll={false} footer={<View style={s.two}>
      <Btn kind="soft" label="경로 옵션" onPress={() => router.back()} style={{ flex: 1 }} />
      <Btn label="안내 시작" onPress={() => {
        app.setGuideStep(0);
        if (dest && startLabel) app.addRecentRoute({ startLabel, destKey: dest.key, condition: app.condition, at: new Date().toISOString() });
        router.push('/guide');
      }} style={{ flex: 2 }} />
    </View>}>
      <View style={s.map}><CampusMap commands={[cmd]} routeNodeKeys={r.nodeKeys} pickPlaces={false} /></View>
      <ScrollView contentContainerStyle={{ gap: 8 }}>
        <Card style={s.sum}>
          <Text style={s.t}>{app.condition === 'avoidStairs' ? '계단 없는 경로' : app.condition === 'preferElevator' ? '승강기 우선 경로' : '최단 경로'} · 약 {minutes(r.totalLengthM)}분</Text>
          <P tone="muted">{Math.round(r.totalLengthM)} m · 계단 {stairs}곳 · 층 이동 {changes.length}번</P>
          <Text style={s.path}>{path}</Text>
        </Card>
        <Badge tone={offline ? 'primary' : 'confirmed'} text={offline ? '저장된 지도로 계산' : '방금 받은 지도로 계산'} />
        {server ? <P tone="muted">{server.ok ? `서버 계산과 비교: ${Math.round(server.distanceM)} m${Math.abs(server.distanceM - r.totalLengthM) > 5 ? ' (기기 계산과 다름)' : ' (같음)'}` : server.code === 'no_route' ? '서버도 같은 조건의 경로가 없다고 해요' : '서버와 비교하지 못했어요(오프라인)'}</P> : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  map: { height: 320, marginHorizontal: -T.margin },
  sum: { borderWidth: 2, borderColor: T.primary },
  t: { fontSize: T.title, fontWeight: '800', color: T.text },
  path: { fontSize: T.small, color: T.primary, fontWeight: '600' },
  two: { flexDirection: 'row', gap: 8 },
});
