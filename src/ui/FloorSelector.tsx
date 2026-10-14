// 건물별 층 고르기. 층 자료가 있는 건물만 나온다. 바깥은 항상 보인다.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MapPackage } from '../map/package';

export function FloorSelector({ pkg, floorSel, setFloor }: { pkg: MapPackage; floorSel: Record<string, string>; setFloor: (b: string, f: string) => void }) {
  const withFloors = pkg.buildings.filter((b) => pkg.floors.some((f) => f.buildingKey === b.key));
  if (!withFloors.length) return <Text style={s.none}>층 자료 있는 건물 없음</Text>;
  return (
    <View>
      {withFloors.map((b) => {
        const floors = pkg.floors.filter((f) => f.buildingKey === b.key).sort((a, c) => c.sortOrder - a.sortOrder);
        const sel = floorSel[b.key] ?? 'all';
        return (
          <ScrollView key={b.key} horizontal contentContainerStyle={s.row} showsHorizontalScrollIndicator={false}>
            <Text style={s.b}>{b.name}</Text>
            {[{ key: 'all', code: '전체' }, ...floors].map((f) => (
              <Pressable key={f.key} onPress={() => setFloor(b.key, f.key)} style={[s.chip, sel === f.key && s.on]}>
                <Text style={[s.t, sel === f.key && s.ton]}>{f.code}</Text>
              </Pressable>
            ))}
          </ScrollView>
        );
      })}
      <Text style={s.none}>층 모르는 실내 길은 흐리게 표시</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center' },
  b: { fontSize: 13, fontWeight: '600', marginRight: 4, color: '#111827' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  on: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  t: { fontSize: 12, color: '#374151' },
  ton: { color: '#fff' },
  none: { fontSize: 11, color: '#6b7280', paddingHorizontal: 12 },
});
