import { localizedEntityName } from '../../map/names-i18n';
// CT03 장소 상세(층 확인): 3D 지도에서 그 건물의 그 층을 보여 줌, 보는 층 고르기, 장소 저장 / 여기로 길찾기.
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { sceneBuildingId, type Map3dCommand } from '../../map3d/commands';
import { buildingName, floorCode, floorsOf, placeSubtitle } from '../../map/labels';
import { beginRoute } from '../../location/goRoute';
import { useApp } from '../../state/AppState';
import { useToast } from '../../ui/feedback';
import { CampusMap } from '../../ui/CampusMap';
import { color, space, type } from '../../ui/theme';
import { Button, FloorItem, StatusChip } from '../../ui/components';
import { Card, P, Screen } from '../../ui/kit';
import { Pulse, WaveEdge } from '../../ui/v3';
import { translate, type MessageKey } from '../../i18n/translations';

const CATEGORY: Record<string, MessageKey> = {
  building_entrance: 'entranceCategory',
  entrance: 'entranceCategory',
  landmark: 'landmarkCategory',
  parking: 'parkingCategory',
  bus_stop: 'busCategory',
  facility: 'facilityCategory',
  other: 'otherCategory',
};

export default function PlaceScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const app = useApp();
  const t = (key: MessageKey) => translate(app.settings.language, key);
  const toast = useToast();
  const pkg = app.pkg;
  const p = pkg?.places.find((x) => x.key === key);
  if (!pkg || !p)
    return (
      <Screen title={t('place')}>
        <P>{t('placeMissingDetail')}</P>
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
      title={localizedEntityName(p, app.settings.language)}
      scroll={false}
      footer={
        <View style={s.actions}>
          <Button
            variant="secondary"
            label={t(fav ? 'savedState' : 'savePlace')}
            onPress={() => {
              void app.toggleFavorite(p.key);
              toast(t(fav ? 'removedFavorite' : 'addedFavorite'), { label: t('undo'), onPress: () => void app.toggleFavorite(p.key) });
            }}
            style={{ flex: 1 }}
          />
          <Button
            label={t('directionsHere')}
            disabled={!p.nodeKey}
            onPress={() => {
              app.setNlp(null); // 말로 한 요청의 필수 조건은 그 요청에만
              app.setDestKey(p.key);
              beginRoute(pkg, app.graph, app.fix, { start: app.setStart }, app.settings.language);
            }}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      <View style={s.map}>
        <CampusMap
          commands={cmds}
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
        <Text style={s.name}>{localizedEntityName(p, app.settings.language)}</Text>
        <P tone="muted">
          {t(CATEGORY[p.category] ?? 'otherCategory')},{' '}
          {buildingName(pkg, p.buildingKey, app.settings.language)
            ? `${buildingName(pkg, p.buildingKey, app.settings.language)} ${floorName ?? t('unknownFloor')}`
            : placeSubtitle(pkg, p.key, app.settings.language)}
        </P>
        {p.nodeKey ? (
          <StatusChip tone="confirmed" label={t(app.loaded?.source === 'fixture' ? 'bundledRoutable' : 'savedRoutable')} />
        ) : (
          <StatusChip tone="warning" label={t('placeNotRoutable')} />
        )}
        {floors.length ? (
          <Card>
            <P tone="muted">{t('viewingFloorNotice')}</P>
            <Pulse trigger={viewing} style={s.chips}>
              <FloorItem
                label={t('allFloors')}
                state={viewing === 'all' ? 'selected' : 'idle'}
                onPress={() => app.setFloor(p.buildingKey!, 'all')}
              />
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
