// CT05 경로 옵션: 출발·도착, 이동 방식(최단 / 계단 피하기 / 승강기 우선). 계단 피하기는 자동으로 풀지 않음(제품 규칙 04).
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { RouteCondition } from '../route/route';
import { useApp } from '../state/AppState';
import { Btn, Card, Chip, P, Screen, Section, T } from '../ui/kit';

const CONDS: { key: RouteCondition; label: string; note: string }[] = [
  { key: 'shortest', label: '최단', note: '계단을 포함해 가장 짧은 길이에요.' },
  {
    key: 'avoidStairs',
    label: '계단 피하기',
    note: '계단을 전혀 쓰지 않는 길만 찾아요. 없으면 "경로 없음"으로 알려 드리고 조건을 스스로 풀지 않아요. 휠체어 통행(폭·경사·문)을 보장하지는 않아요.',
  },
  { key: 'preferElevator', label: '승강기 우선', note: '계단보다 승강기·경사로를 먼저 써요. 필요하면 계단도 써요.' },
];

export default function OptionsScreen() {
  const app = useApp();
  if (!app.pkg) return null;
  const pkg = app.pkg;
  const st = app.start;
  const startLabel = st
    ? st.type === 'place'
      ? (pkg.places.find((p) => p.key === st.placeKey)?.name ?? '없어진 장소')
      : st.label
    : '고르지 않음';
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const destFloor = dest?.floorKey ? pkg.floors.find((f) => f.key === dest.floorKey)?.code : null;
  const cond = CONDS.find((c) => c.key === app.condition)!;
  const go = () => {
    const r = app.route;
    if (!r) return;
    router.push(r.ok ? '/preview' : '/no-route');
  };
  return (
    <Screen
      title="경로 옵션"
      footer={
        <>
          <P tone="muted">저장된 지도(v{pkg.release.version})로 기기에서 계산해요. 지금의 통행 제한은 반영되지 않을 수 있어요.</P>
          <Btn label="경로 확인" disabled={!st || !dest} onPress={go} />
        </>
      }
    >
      <Card>
        <View style={s.line}>
          <Text style={s.k}>출발</Text>
          <Text style={s.v}>{startLabel}</Text>
        </View>
        <View style={s.line}>
          <Text style={[s.k, { color: T.primary }]}>도착</Text>
          <Text style={[s.v, { color: T.primary }]}>{dest ? `${dest.name}${destFloor ? ` · ${destFloor}` : ''}` : '고르지 않음'}</Text>
        </View>
        <Btn kind="ghost" label="출발점 직접 지정" onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })} />
      </Card>
      <Section>이동 방식</Section>
      <View style={s.chips}>
        {CONDS.map((c) => (
          <Chip key={c.key} label={c.label} on={app.condition === c.key} onPress={() => app.setCondition(c.key)} />
        ))}
      </View>
      <Card tone="primary">
        <Text style={s.ct}>{cond.label}</Text>
        <P>{cond.note}</P>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  k: { width: 36, fontSize: T.body, fontWeight: '800', color: T.text },
  v: { flex: 1, fontSize: T.body, fontWeight: '700', color: T.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ct: { fontSize: T.body, fontWeight: '800', color: T.primary },
});
