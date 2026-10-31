// 지도 위 보는 층 캡슐(V3-5·7): 3D 페이지 자체 층 판 대신 앱 쪽 하나(토스 디자인: 같은 조작 두 곳 금지 → 쓰는 화면은 minimal).
// 고른 층은 그라데이션 알약, 바뀌면 짧은 맥박. "보는 층"이라고 밝혀 현재 위치 층과 섞지 않음(제품 규칙 01).
import { Layers } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppState';
import { PressScale } from './components';
import { color, gradient, shape } from './theme';
import { Glass, Gradient, Pulse } from './v3';
import { localizedEntityName } from '../map/names-i18n';
import { translate } from '../i18n/translations';

export function FloorCapsule({ buildingKey, style }: { buildingKey: string | null | undefined; style?: object }) {
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string>) => translate(app.settings.language, key, values);
  const pkg = app.pkg;
  if (!pkg || !buildingKey) return null;
  const floors = pkg.floors.filter((f) => f.buildingKey === buildingKey).sort((a, b) => b.sortOrder - a.sortOrder);
  if (!floors.length) return null;
  const building = pkg.buildings.find((b) => b.key === buildingKey);
  const name = building ? localizedEntityName(building, app.settings.language) : '';
  const sel = app.floorSel[buildingKey] ?? 'all';
  const items = [{ key: 'all', code: t('allFloors') }, ...floors.map((f) => ({ key: f.key, code: f.code }))];
  return (
    <Glass radius={shape.pill} style={[s.wrap, style]}>
      <View style={s.label} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Layers size={14} color={color.primary} />
        <Text style={s.labelT} numberOfLines={1}>
          {t('viewingFloors', { name })}
        </Text>
      </View>
      <Pulse trigger={sel} style={{ flexShrink: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {items.map((f) => {
            const on = sel === f.key;
            return (
              <PressScale
                key={f.key}
                accessibilityRole="button"
                accessibilityLabel={t('viewFloorA11y', { name, floor: f.key === 'all' ? t('wholeBuilding') : f.code })}
                accessibilityState={{ selected: on }}
                onPress={() => app.setFloor(buildingKey, f.key)}
                style={[s.item, on && s.itemOn]}
              >
                {on ? <Gradient colors={gradient.brand} angle="right" /> : null}
                <Text style={[s.itemT, on && { color: color.onPrimary }]}>{f.code}</Text>
              </PressScale>
            );
          })}
        </ScrollView>
      </Pulse>
    </Glass>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 4, paddingLeft: 12, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110 },
  labelT: { fontSize: 12, fontWeight: '700', color: color.primary, flexShrink: 1 },
  row: { gap: 4, alignItems: 'center' },
  item: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: shape.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemOn: { backgroundColor: color.primary },
  itemT: { fontSize: 14, fontWeight: '800', color: color.text },
});
