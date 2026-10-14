import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { placeSubtitle, useApp } from '../state/AppState';

export default function FavoritesScreen() {
  const app = useApp();
  return (
    <View style={s.root}>
      <FlatList
        data={app.favorites}
        keyExtractor={(k) => k}
        renderItem={({ item }) => {
          const p = app.pkg?.places.find((x) => x.key === item);
          return (
            <View style={s.item}>
              <Pressable style={{ flex: 1 }} disabled={!p} onPress={() => router.push({ pathname: '/place/[key]', params: { key: item } })}>
                <Text style={s.name}>{p ? p.name : '없어진 장소'}</Text>
                <Text style={s.sub}>{p && app.pkg ? placeSubtitle(app.pkg, item) : '지금 지도에 없음'}</Text>
              </Pressable>
              <Pressable onPress={() => app.toggleFavorite(item)}><Text style={s.del}>삭제</Text></Pressable>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>즐겨찾기 없음. 장소 화면에서 ☆ 를 누르세요.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  name: { fontSize: 15, color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  del: { color: '#b91c1c', fontSize: 13 },
  empty: { padding: 16, color: '#6b7280' },
});
