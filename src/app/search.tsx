import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchPlaces } from '../search/search';
import { placeSubtitle, useApp } from '../state/AppState';

/** mode=start 면 고른 장소를 출발점으로, 아니면 장소 상세로. */
export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; mode?: string }>();
  const app = useApp();
  const [q, setQ] = useState(params.q ?? '');
  const hits = useMemo(() => (app.pkg ? searchPlaces(app.pkg, q) : []), [app.pkg, q]);
  const pick = (key: string) => {
    if (params.mode === 'start') {
      app.setStart({ type: 'place', placeKey: key });
      router.back();
    } else if (params.mode === 'dest') {
      app.setDestKey(key);
      router.back();
    } else router.push({ pathname: '/place/[key]', params: { key } });
  };
  return (
    <View style={s.root}>
      <TextInput style={s.input} value={q} onChangeText={setQ} placeholder={params.mode === 'start' ? '출발 장소 검색' : '장소 검색'} autoFocus={!params.q} />
      <Text style={s.count}>{q ? `${hits.length}건` : '검색어를 넣으세요'}</Text>
      <FlatList
        data={hits}
        keyExtractor={(h) => h.place.key}
        renderItem={({ item }) => (
          <Pressable style={s.item} onPress={() => pick(item.place.key)}>
            <Text style={s.name}>{item.place.name}</Text>
            <Text style={s.sub}>{app.pkg ? placeSubtitle(app.pkg, item.place.key) : ''}{item.place.nodeKey ? '' : ' · 길에 안 붙음'}</Text>
          </Pressable>
        )}
        ListEmptyComponent={q ? <Text style={s.empty}>찾는 장소 없음</Text> : null}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  input: { margin: 12, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  count: { paddingHorizontal: 12, color: '#6b7280', fontSize: 12 },
  item: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  name: { fontSize: 15, color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  empty: { padding: 16, color: '#6b7280' },
});
