// CT09 위치 다시 확인: 방향 안내를 멈추고 건물·층을 사용자가 확인. 확인한 층은 "현재 위치 층"으로 쓰고, 보는 층과 따로 둔다.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { localizedEntityName } from '../map/names-i18n';
import { buildingName, buildingsWithFloors, floorLabel, floorsOf } from '../map/labels';
import { useApp } from '../state/AppState';
import { Button, FloorItem } from '../ui/components';
import { color, type } from '../ui/theme';
import { Card, P, Screen, Section } from '../ui/kit';
import { Character } from '../ui/v3';
import { translate, type MessageKey } from '../i18n/translations';

export default function RecheckScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const pkg = app.pkg;
  const withFloors = pkg ? buildingsWithFloors(pkg) : [];
  const dest = pkg?.places.find((p) => p.key === app.destKey);
  const [building, setBuilding] = useState(app.confirmedFloor?.buildingKey ?? dest?.buildingKey ?? withFloors[0]?.key ?? null);
  if (!pkg) return null;
  const floors = floorsOf(pkg, building);
  const last = app.confirmedFloor;
  const lastText = last ? floorLabel(pkg, last.floorKey, app.settings.language) : t('none');
  return (
    <Screen
      title={t('recheckLocation')}
      footer={
        <>
          <Button label={t('specifyStart')} onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })} />
          <Button variant="quiet" label={t('returnRouteMap')} onPress={() => router.back()} />
        </>
      }
    >
      <Card tone="caution" style={s.warn}>
        <Character name="uncertain" size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.t}>{t('checkingLocation')}</Text>
          <P tone="caution">{t('verifySigns')}</P>
        </View>
      </Card>
      <Text style={s.last}>{t('lastConfirmed', { place: lastText })}</Text>
      <P>{t(app.fix?.uncertain ? 'inaccurateChooseFloor' : 'indoorChooseFloor')}</P>
      {withFloors.length > 1 ? (
        <>
          <Section>{t('building')}</Section>
          <View style={s.chips}>
            {withFloors.map((b) => (
              <FloorItem
                key={b.key}
                label={localizedEntityName(b, app.settings.language)}
                state={building === b.key ? 'selected' : 'idle'}
                onPress={() => setBuilding(b.key)}
              />
            ))}
          </View>
        </>
      ) : null}
      <Card>
        <Text style={s.q}>{t('whichFloor', { building: buildingName(pkg, building, app.settings.language) })}</Text>
        <View style={s.chips}>
          {floors.map((f) => (
            <FloorItem
              key={f.key}
              label={f.code}
              state={last?.floorKey === f.key ? 'current' : 'idle'}
              a11yLabel={last?.floorKey === f.key ? t('lastFloorA11y', { floor: f.code }) : f.code}
              onPress={() => {
                app.setConfirmedFloor({ buildingKey: f.buildingKey, floorKey: f.key });
                app.setFloor(f.buildingKey, f.key); // 보는 층도 그 층으로 옮김(사용자가 바꿀 수 있음)
                router.back();
              }}
            />
          ))}
        </View>
        {!floors.length ? <P tone="muted">{t('noFloorData')}</P> : null}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  warn: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  t: { fontSize: type.title - 2, fontWeight: '800', color: color.warning },
  last: { fontSize: type.body, fontWeight: '800', color: color.text },
  q: { fontSize: type.body, fontWeight: '800', color: color.text, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
