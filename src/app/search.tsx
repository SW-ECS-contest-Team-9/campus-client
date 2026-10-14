// CT02 장소 검색. mode=start 면 고른 장소를 출발점으로(CT04 로 돌아감), 아니면 장소 상세(CT03)로.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { searchPlaces } from '../search/search';
import { placeSubtitle, useApp } from '../state/AppState';
import { Card, P, Row, Screen, Section, T } from '../ui/kit';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; mode?: string }>();
  const app = useApp();
  const [q, setQ] = useState(params.q ?? '');
  const hits = useMemo(() => (app.pkg ? searchPlaces(app.pkg, q) : []), [app.pkg, q]);
  const pick = (key: string) => {
    if (q.trim()) app.addRecentSearch(q.trim());
    if (params.mode === 'start') { app.setStart({ type: 'place', placeKey: key }); router.back(); }
    else router.push({ pathname: '/place/[key]', params: { key } });
  };
  const sub = (key: string, nodeKey: string | null) => `${app.pkg ? placeSubtitle(app.pkg, key) : ''}${nodeKey ? '' : ' · 길에 붙지 않아 길찾기 불가'}`;
  const offline = app.loaded?.source !== 'server';
  return (
    <Screen title={params.mode === 'start' ? '출발 장소 고르기' : '장소 검색'}>
      <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="건물, 강의실, 시설 검색" autoFocus={!params.q} returnKeyType="search" accessibilityLabel="검색어" />
      <P tone="muted">{offline ? '저장된 지도에서 검색 중' : '방금 받은 지도에서 검색 중'} · 지도 v{app.pkg?.release.version}</P>
      {q ? <Section>검색 결과 {hits.length}</Section> : null}
      {hits.map((h) => <Row key={h.place.key} icon="▦" title={h.place.name} sub={sub(h.place.key, h.place.nodeKey)} onPress={() => pick(h.place.key)} />)}
      {!q && app.recentSearches.length ? <Section>최근 검색</Section> : null}
      {!q ? app.recentSearches.map((r) => <Row key={r} icon="↺" title={r} onPress={() => setQ(r)} />) : null}
      {q && !hits.length ? (
        <Card tone="primary">
          <P>찾는 장소가 없나요?</P>
          <P tone="muted">이 지도에 없는 장소는 새 지도를 받은 뒤 검색할 수 있어요(설정 → 지도 갱신 확인).</P>
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: T.line, backgroundColor: T.card, paddingHorizontal: 16, fontSize: T.small + 1, color: T.text },
});
