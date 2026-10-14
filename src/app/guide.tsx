// CT07 3D 지도 안내: 지금 할 일(단계), 현재 위치 층(추정)과 확인, 3D 지도(경로 + 위치 따라가기), 남은 시간, 도착 확인 / 안내 종료.
// 위치가 불확실하면 단계 안내 대신 위치 확인으로 보냄(제품 규칙 02). AR 은 넣지 않음.
import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { routeCommand } from '../map3d/embed';
import { minutes } from '../route/time';
import { useApp } from '../state/AppState';
import { CampusMap } from '../ui/CampusMap';
import { Btn, P, Screen, T } from '../ui/kit';

export default function GuideScreen() {
  const app = useApp();
  const r = app.route;
  const cmd = useMemo(() => (app.graph && r?.ok ? routeCommand(app.graph, r) : null), [app.graph, r]);
  if (!app.pkg || !r?.ok) return <Redirect href="/" />;
  const pkg = app.pkg;
  const i = Math.min(app.guideStep, r.steps.length - 1);
  const step = r.steps[i];
  const left = r.steps.slice(i).reduce((a, s) => a + s.lengthM, 0);
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const cf = app.confirmedFloor;
  const cfText = cf ? `${pkg.buildings.find((b) => b.key === cf.buildingKey)?.name ?? ''} ${pkg.floors.find((f) => f.key === cf.floorKey)?.code ?? ''}`.trim() : null;
  const unsure = !app.fix || app.fix.uncertain;
  // 보는 층·경로 단계의 층·내가 확인한 층을 섞지 않음(제품 규칙 01): 확인한 층이 없으면 "단계 기준"이라고 밝힘
  const where = unsure ? (app.fix ? '현재 위치 불확실' : '현재 위치 모름') : cfText ? `내 위치: ${cfText} (내가 확인함)` : `이 단계 출발: ${step.fromFloor ?? '바깥'} · 내 층 확인`;
  return (
    <Screen title="안내 중" scroll={false} footer={<>
      <View style={s.two}>
        <Btn kind="soft" label="이전" disabled={i === 0} onPress={() => app.setGuideStep(i - 1)} style={{ flex: 1 }} />
        {i < r.steps.length - 1
          ? <Btn label="다음 단계" onPress={() => app.setGuideStep(i + 1)} style={{ flex: 2 }} />
          : <Btn label="도착 확인" onPress={() => router.push('/arrive')} style={{ flex: 2 }} />}
      </View>
      <Btn kind="ghost" label="안내 종료" onPress={() => router.replace('/')} />
    </>}>
      {unsure && app.fix ? (
        <View style={[s.now, { backgroundColor: T.cautionSoft }]}>
          <Text style={[s.nowT, { color: T.caution }]}>현재 위치를 확인해 주세요</Text>
          <Text style={[s.nowS, { color: T.caution }]}>방향 안내를 잠시 멈췄어요 · 건물과 층을 확인하면 이어서 안내해요</Text>
          <Btn label="위치 다시 확인" onPress={() => router.push('/recheck')} />
        </View>
      ) : (
        <View style={s.now}>
          <Text style={s.nowT}>{step.text}</Text>
          <Text style={s.nowS}>{i + 1}/{r.steps.length}단계 · {dest?.name ?? ''} · 약 {minutes(left)}분 남음</Text>
        </View>
      )}
      <Pressable accessibilityRole="button" style={s.where} onPress={() => router.push('/recheck')}>
        <Text style={s.whereT}>{where}</Text>
      </Pressable>
      <View style={s.map}><CampusMap commands={[cmd]} routeNodeKeys={r.nodeKeys} pickPlaces={false} /></View>
      <View style={s.foot}>
        <Text style={s.min}>약 {minutes(left)}분</Text>
        <P tone="muted">{Math.round(left)} m 남음{dest?.floorKey ? ` · 목적지 ${pkg.floors.find((f) => f.key === dest.floorKey)?.code}` : ''}</P>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  now: { backgroundColor: T.text, borderRadius: T.radius, padding: 16, gap: 6 },
  nowT: { color: '#fff', fontSize: T.title - 2, fontWeight: '800', lineHeight: 28 },
  nowS: { color: '#C9D3E0', fontSize: T.caption + 1 },
  where: { minHeight: T.touch, borderRadius: 14, backgroundColor: T.card, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  whereT: { color: T.primary, fontWeight: '700', fontSize: T.small },
  map: { flex: 1, minHeight: 180, marginHorizontal: -T.margin },
  foot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  min: { fontSize: T.display - 2, fontWeight: '800', color: T.text },
  two: { flexDirection: 'row', gap: 8 },
});
