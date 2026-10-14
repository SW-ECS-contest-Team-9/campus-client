// CT09 위치 다시 확인: 방향 안내를 멈추고 건물·층을 사용자가 확인. 확인한 층은 "현재 위치 층"으로 쓰고, 보는 층과 따로 둔다.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppState';
import { FloorItem } from '../ui/components';
import { Btn, Card, Chip, P, Screen, Section, T } from '../ui/kit';

export default function RecheckScreen() {
  const app = useApp();
  const pkg = app.pkg!;
  const withFloors = pkg.buildings.filter((b) => pkg.floors.some((f) => f.buildingKey === b.key));
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const [building, setBuilding] = useState(app.confirmedFloor?.buildingKey ?? dest?.buildingKey ?? withFloors[0]?.key ?? null);
  const floors = pkg.floors.filter((f) => f.buildingKey === building).sort((a, b) => a.sortOrder - b.sortOrder);
  const last = app.confirmedFloor;
  const lastText = last
    ? `${pkg.buildings.find((b) => b.key === last.buildingKey)?.name} ${pkg.floors.find((f) => f.key === last.floorKey)?.code}`
    : '없음';
  return (
    <Screen
      title="위치 다시 확인"
      footer={
        <>
          <Btn label="출발점 직접 지정" onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })} />
          <Btn kind="ghost" label="경로 지도로 돌아가기" onPress={() => router.back()} />
        </>
      }
    >
      <Card tone="caution">
        <Text style={s.t}>현재 위치를 확인하고 있어요</Text>
        <P tone="caution">방향 안내를 잠시 멈췄어요 · 주변 표지와 층을 확인해 주세요</P>
      </Card>
      <Text style={s.last}>마지막 확인: {lastText}</Text>
      <P>
        {app.fix?.uncertain ? `휴대폰 위치가 정확하지 않아요(${app.fix.reason}).` : '건물 안에서는 휴대폰 위치로 층을 알 수 없어요.'} 지금
        있는 건물과 층을 골라 주세요.
      </P>
      {withFloors.length > 1 ? (
        <>
          <Section>건물</Section>
          <View style={s.chips}>
            {withFloors.map((b) => (
              <Chip key={b.key} label={b.name} on={building === b.key} onPress={() => setBuilding(b.key)} />
            ))}
          </View>
        </>
      ) : null}
      <Card>
        <Text style={s.q}>{withFloors.find((b) => b.key === building)?.name ?? ''} 몇 층에 있나요?</Text>
        <View style={s.chips}>
          {floors.map((f) => (
            <FloorItem
              key={f.key}
              label={f.code}
              state={last?.floorKey === f.key ? 'current' : 'idle'}
              a11yLabel={last?.floorKey === f.key ? `${f.code}, 마지막으로 확인한 층` : f.code}
              onPress={() => {
                app.setConfirmedFloor({ buildingKey: f.buildingKey, floorKey: f.key });
                app.setFloor(f.buildingKey, f.key); // 보는 층도 그 층으로 옮김(사용자가 바꿀 수 있음)
                router.back();
              }}
            />
          ))}
        </View>
        {!floors.length ? <P tone="muted">이 지도에는 층 자료가 있는 건물이 없어요.</P> : null}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  t: { fontSize: T.title - 2, fontWeight: '800', color: T.caution },
  last: { fontSize: T.body, fontWeight: '800', color: T.text },
  q: { fontSize: T.body, fontWeight: '800', color: T.text, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
