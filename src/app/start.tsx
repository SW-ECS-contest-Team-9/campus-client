// CT04 출발점 확인: 현재 위치(확실할 때만) 또는 사용자가 고른 장소. 위치가 불확실하면 직접 고르게 함(제품 규칙 02).
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { startNodeForFix } from '../location/fix';
import { useApp } from '../state/AppState';
import { CampusMap } from '../ui/CampusMap';
import { Badge, Btn, Card, H, P, Screen } from '../ui/kit';

export default function StartScreen() {
  const app = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  if (!app.pkg) return null;
  const pkg = app.pkg;
  const placeName = (k: string) => pkg.places.find((p) => p.key === k)?.name ?? '없어진 장소';

  // 위치 보정(통로 위로 끌린 점)의 그 길 가까운 끝 노드에서 출발. 불확실하면 직접 고르게 함(제품 규칙 02).
  const useHere = async () => {
    setMsg('위치 읽는 중…');
    if (!(await app.enableLocation())) return setMsg('위치 권한이 없어요 · 장소로 골라 주세요');
    const fix = await app.waitFix(15000);
    if (!fix) return setMsg('현재 위치를 확인하지 못했어요');
    if (fix.uncertain) return setMsg(`현재 위치가 정확하지 않아요 (${fix.reason})`);
    const n = startNodeForFix(pkg, fix);
    if (!n) return setMsg('가까운 길이 50 m 안에 없어요');
    const f = fix.match?.floorKey ? pkg.floors.find((x) => x.key === fix.match?.floorKey) : null;
    const b = f ? pkg.buildings.find((x) => x.key === f.buildingKey)?.name : null;
    app.setStart({ type: 'node', nodeKey: n.key, label: `현재 위치${f ? ` · ${b ?? ''} ${f.code}(추정)` : ''}` });
    setMsg(null);
  };
  const st = app.start;
  const startTitle = st ? (st.type === 'place' ? placeName(st.placeKey) : st.label) : null;
  const tone = msg ? 'caution' : st?.type === 'node' ? 'confirmed' : 'primary';
  return (
    <Screen
      title="출발점 확인"
      scroll={false}
      footer={
        <>
          <Btn label="이 위치에서 경로 보기" disabled={!st} onPress={() => router.push('/options')} />
          <View style={s.two}>
            <Btn kind="soft" label="위치 다시 읽기" onPress={useHere} style={{ flex: 1 }} />
            <Btn
              kind="soft"
              label="장소로 고르기"
              onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })}
              style={{ flex: 1 }}
            />
          </View>
        </>
      }
    >
      <H>어디에서 출발하나요?</H>
      {msg ? <Badge tone="caution" text={msg} /> : null}
      <View style={s.map}>
        <CampusMap pickPlaces={false} minimal />
      </View>
      <Card>
        <P tone="muted">{st?.type === 'node' ? '현재 위치에서 출발' : st ? '사용자가 지정한 출발점' : '출발점을 골라 주세요'}</P>
        <P>{startTitle ?? '아직 고르지 않음'}</P>
        {st?.type === 'place' ? <P tone="muted">직접 고른 위치라 실제 현재 위치와 다를 수 있어요.</P> : null}
        {tone === 'confirmed' ? <Badge tone="confirmed" text="현재 위치 확인됨" /> : null}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  map: { flex: 1, minHeight: 200, borderRadius: 28, borderBottomLeftRadius: 10, overflow: 'hidden' },
  two: { flexDirection: 'row', gap: 8 },
});
