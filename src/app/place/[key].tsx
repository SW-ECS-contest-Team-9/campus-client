// CT03 장소 상세(층 확인): 3D 지도에서 그 건물의 그 층을 보여 줌, 보는 층 고르기, 장소 저장 / 여기로 길찾기.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { sceneBuildingId, type Map3dCommand } from '../../map3d/embed';
import { placeSubtitle, useApp } from '../../state/AppState';
import { CampusMap } from '../../ui/CampusMap';
import { Badge, Btn, Card, Chip, P, Screen, T } from '../../ui/kit';

const CATEGORY: Record<string, string> = {
  building_entrance: '건물 입구', landmark: '주요 지점', parking: '주차', bus_stop: '버스 정류장', facility: '편의 시설', other: '기타',
};

export default function PlaceScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const app = useApp();
  const pkg = app.pkg;
  const p = pkg?.places.find((x) => x.key === key);
  const floors = useMemo(() => (pkg && p?.buildingKey ? pkg.floors.filter((f) => f.buildingKey === p.buildingKey).sort((a, b) => a.sortOrder - b.sortOrder) : []), [pkg, p]);
  if (!pkg || !p) return <Screen title="장소"><P>없어진 장소예요(지금 지도에 없음).</P></Screen>;
  const fav = app.favorites.includes(p.key);
  const viewing = p.buildingKey ? app.floorSel[p.buildingKey] ?? p.floorKey ?? 'all' : 'all';
  const cmds: Map3dCommand[] = [{ v: 1, type: 'focus', x: p.x, y: p.y, z: p.z, building: p.buildingKey ? sceneBuildingId(p.buildingKey) : null, floor: pkg.floors.find((f) => f.key === p.floorKey)?.code ?? null }];
  const floorName = pkg.floors.find((f) => f.key === p.floorKey)?.code;
  return (
    <Screen title={pkg.buildings.find((b) => b.key === p.buildingKey)?.name ?? p.name} scroll={false}
      footer={<View style={s.actions}>
        <Btn kind="soft" label={fav ? '저장됨' : '장소 저장'} onPress={() => app.toggleFavorite(p.key)} style={{ flex: 1 }} />
        <Btn label="여기로 길찾기" disabled={!p.nodeKey} onPress={() => { app.setDestKey(p.key); router.push('/start'); }} style={{ flex: 2 }} />
      </View>}>
      <View style={s.map}><CampusMap commands={cmds} highlightPlaceKeys={[p.key]} focus={[{ x: p.x, y: p.y }]} pickPlaces={false} /></View>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
        <Text style={s.name}>{floorName ? `${floorName} ` : ''}{p.name}</Text>
        <P tone="muted">{CATEGORY[p.category] ?? p.category} · {placeSubtitle(pkg, p.key)}</P>
        {p.nodeKey ? <Badge tone="confirmed" text={app.loaded?.source === 'fixture' ? '내장 개발 지도로 길찾기 가능' : '저장된 지도로 길찾기 가능'} />
          : <Badge tone="caution" text="길에 붙지 않은 장소라 길찾기를 할 수 없어요" />}
        {floors.length ? (
          <Card>
            <P tone="muted">보는 층(지도에서 볼 층) — 현재 위치 층과 다를 수 있어요</P>
            <View style={s.chips}>
              <Chip label="전체" on={viewing === 'all'} onPress={() => app.setFloor(p.buildingKey!, 'all')} />
              {floors.map((f) => <Chip key={f.key} label={f.code} on={viewing === f.key} onPress={() => app.setFloor(p.buildingKey!, f.key)} />)}
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  map: { height: 300, marginHorizontal: -T.margin },
  name: { fontSize: T.display - 2, fontWeight: '800', color: T.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8 },
});
