// CT03 장소 상세(층 확인): 3D 지도에서 그 건물의 그 층을 보여 줌, 보는 층 고르기, 장소 저장 / 여기로 길찾기.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { sceneBuildingId, type Map3dCommand } from '../../map3d/commands';
import { buildingName, displayName, floorCode, floorsOf, placeSubtitle } from '../../map/labels';
import { useApp } from '../../state/AppState';
import { useToast } from '../../ui/feedback';
import { CampusMap } from '../../ui/CampusMap';
import { color, space, type } from '../../ui/theme';
import { Button, FloorItem, StatusChip } from '../../ui/components';
import { Card, P, Screen } from '../../ui/kit';
import { Pulse, WaveEdge } from '../../ui/v3';

const CATEGORY: Record<string, string> = {
  building_entrance: '건물 입구',
  entrance: '건물 입구',
  landmark: '주요 지점',
  parking: '주차',
  bus_stop: '버스 정류장',
  facility: '편의 시설',
  other: '기타',
};

export default function PlaceScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const app = useApp();
  const toast = useToast();
  const pkg = app.pkg;
  const p = pkg?.places.find((x) => x.key === key);
  if (!pkg || !p)
    return (
      <Screen title="장소">
        <P>없어진 장소예요(지금 지도에 없음).</P>
      </Screen>
    );
  const floors = floorsOf(pkg, p.buildingKey);
  const fav = app.favorites.includes(p.key);
  const viewing = p.buildingKey ? (app.floorSel[p.buildingKey] ?? p.floorKey ?? 'all') : 'all';
  const cmds: Map3dCommand[] = [
    {
      v: 1,
      type: 'focus',
      x: p.x,
      y: p.y,
      z: p.z,
      building: p.buildingKey ? sceneBuildingId(p.buildingKey) : null,
      floor: floorCode(pkg, p.floorKey),
    },
  ];
  const floorName = floorCode(pkg, p.floorKey);
  return (
    <Screen
      title={displayName(p.name)}
      scroll={false}
      footer={
        <View style={s.actions}>
          <Button
            variant="secondary"
            label={fav ? '저장됨' : '장소 저장'}
            onPress={() => {
              void app.toggleFavorite(p.key);
              toast(fav ? '저장을 해제했어요' : '저장했어요', { label: '되돌리기', onPress: () => void app.toggleFavorite(p.key) });
            }}
            style={{ flex: 1 }}
          />
          <Button
            label="여기로 길찾기"
            disabled={!p.nodeKey}
            onPress={() => {
              app.setNlp(null); // 말로 한 요청의 필수 조건은 그 요청에만
              app.setDestKey(p.key);
              router.navigate('/start');
            }}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      <View style={s.map}>
        <CampusMap
          commands={cmds}
          highlightPlaceKeys={[p.key]}
          focus={[{ x: p.x, y: p.y }]}
          pickPlaces={false}
          minimal
          overlay={
            <>
              <WaveEdge color="#F2F3FD" flip height={18} />
              <WaveEdge color="#EEF0FF" />
            </>
          }
        />
      </View>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
        <Text style={s.name}>{displayName(p.name)}</Text>
        <P tone="muted">
          {CATEGORY[p.category] ?? p.category} ·{' '}
          {buildingName(pkg, p.buildingKey) ? `${buildingName(pkg, p.buildingKey)} ${floorName ?? '층 모름'}` : placeSubtitle(pkg, p.key)}
        </P>
        {p.nodeKey ? (
          <StatusChip
            tone="confirmed"
            label={app.loaded?.source === 'fixture' ? '내장 개발 지도로 길찾기 가능' : '저장된 지도로 길찾기 가능'}
          />
        ) : (
          <StatusChip tone="warning" label="길에 붙지 않은 장소라 길찾기를 할 수 없어요" />
        )}
        {floors.length ? (
          <Card>
            <P tone="muted">보는 층(지도에서 볼 층) — 현재 위치 층과 다를 수 있어요</P>
            <Pulse trigger={viewing} style={s.chips}>
              <FloorItem label="전체" state={viewing === 'all' ? 'selected' : 'idle'} onPress={() => app.setFloor(p.buildingKey!, 'all')} />
              {floors.map((f) => (
                <FloorItem
                  key={f.key}
                  label={f.code}
                  state={viewing === f.key ? 'selected' : 'idle'}
                  onPress={() => app.setFloor(p.buildingKey!, f.key)}
                />
              ))}
            </Pulse>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  map: { height: 320, marginHorizontal: -space[20] },
  name: { fontSize: type.display - 2, fontWeight: '800', color: color.text, letterSpacing: -0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8 },
});
