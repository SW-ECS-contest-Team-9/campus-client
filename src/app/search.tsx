// CT02 장소 검색. mode=start 면 고른 장소를 출발점으로(CT04 로 돌아감), 아니면 장소 상세(CT03)로.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Building, Search } from 'lucide-react-native';
import { searchPlaces } from '../search/search';
import { placeSubtitle, useApp } from '../state/AppState';
import { SearchInput } from '../ui/components';
import { Badge, Card, P, Row, Screen, Section } from '../ui/kit';
import { Character } from '../ui/v3';
import { View } from 'react-native';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; mode?: string }>();
  const app = useApp();
  const [q, setQ] = useState(params.q ?? '');
  const hits = useMemo(() => (app.pkg ? searchPlaces(app.pkg, q) : []), [app.pkg, q]);
  const pick = (key: string) => {
    if (q.trim()) app.addRecentSearch(q.trim());
    if (params.mode === 'start') {
      app.setStart({ type: 'place', placeKey: key });
      router.back();
    } else router.push({ pathname: '/place/[key]', params: { key } });
  };
  const sub = (key: string, nodeKey: string | null) =>
    `${app.pkg ? placeSubtitle(app.pkg, key) : ''}${nodeKey ? '' : ' · 길에 붙지 않아 길찾기 불가'}`;
  const offline = app.loaded?.source !== 'server';
  return (
    <Screen title={params.mode === 'start' ? '출발 장소 고르기' : '장소 검색'}>
      <SearchInput value={q} onChangeText={setQ} autoFocus={!params.q} returnKeyType="search" accessibilityLabel="검색어" />
      <Badge
        tone={offline ? 'offline' : 'primary'}
        text={`${offline ? '저장된 지도에서 검색 중' : '방금 받은 지도에서 검색 중'} · 지도 v${app.pkg?.release.version}`}
      />
      {q ? <Section>검색 결과 {hits.length}</Section> : null}
      {hits.map((h) => (
        <Row
          key={h.place.key}
          icon={Building}
          title={h.place.name}
          sub={sub(h.place.key, h.place.nodeKey)}
          onPress={() => pick(h.place.key)}
        />
      ))}
      {!q && app.recentSearches.length ? <Section>최근 검색</Section> : null}
      {!q ? app.recentSearches.map((r) => <Row key={r} icon={Search} title={r} onPress={() => setQ(r)} />) : null}
      {q && !hits.length ? (
        <Card tone="primary" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Character name="emptySearch" size={84} />
          <View style={{ flex: 1, gap: 4 }}>
            <P>「{q}」에 맞는 장소가 이 지도에 없어요</P>
            <P tone="muted">건물 이름만(예: 북악관) 넣어 보거나, 새 지도를 받은 뒤 다시 찾아 주세요(설정 → 지도 갱신 확인).</P>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
