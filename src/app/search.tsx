// CT02 검색. 기본은 장소 이름 검색, 스위치를 켜면 자연어 경로 요청을 해석한다.
// mode=start 면 자연어 모드 없이 고른 장소를 출발점으로 지정하고 CT04 로 돌아간다.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Building, Info, MapPin, MessageCircleQuestion, Navigation, Search, X } from 'lucide-react-native';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { startFromCurrentFix } from '../location/start';
import { displayName, placeSubtitle } from '../map/labels';
import { describe as describeRequest, planFromRequest } from '../nlp/apply';
import { mergeWithGemma, shouldAskGemma } from '../nlp/gemma';
import { cancelInterpret, interpretWithGemma } from '../nlp/gemmaRuntime';
import { note3dStat } from '../map3d/diag';
import { buildLexicon } from '../nlp/lexicon';
import { parseRouteRequest } from '../nlp/parse';
import type { RouteRequest } from '../nlp/types';
import { searchResults } from '../search/search';
import { useApp } from '../state/AppState';
import { Button, IconButton, ResultRow, SearchInput, StatusChip } from '../ui/components';
import { Card, P, Screen, Section } from '../ui/kit';
import { color, shape, type } from '../ui/theme';
import { Character } from '../ui/v3';

type SearchMode = 'place' | 'natural';
const INITIAL_BUILDINGS = 4;
const INITIAL_PLACES = 8;
const INITIAL_BUILDING_PLACES = 3;

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; mode?: string }>();
  const app = useApp();
  const choosingStart = params.mode === 'start';
  const [q, setQ] = useState(params.q ?? '');
  // 사용자가 이 화면에서 직접 바꾸기 전에는 저장된 기본값을 따름(설정이 비동기로 불러와져도 반영).
  const [searchModeOverride, setSearchModeOverride] = useState<SearchMode | null>(null);
  const searchMode = searchModeOverride ?? (app.settings.naturalSearchDefault ? 'natural' : 'place');
  const naturalSearch = !choosingStart && searchMode === 'natural';
  // 이미 열린 검색 화면에 새 검색어로 들어오면(링크·최근 검색) 그 글로 바꿈
  const [lastParam, setLastParam] = useState(params.q);
  if (params.q !== lastParam) {
    setLastParam(params.q);
    setQ(params.q ?? '');
  }
  // 되물음에서 고른 후보를 반영한 요청(같은 문장일 때만)
  const [picked, setPicked] = useState<{ text: string; req: RouteRequest } | null>(null);
  const [ai, setAi] = useState<{ text: string; state: 'running' | 'done' | 'failed' } | null>(null);
  const [expandedBuilding, setExpandedBuilding] = useState<string | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);
  const aiRun = useRef(0);
  const pkg = app.pkg;
  const results = useMemo(
    () => (pkg && !naturalSearch ? searchResults(pkg, q) : { buildingHits: [], placeHits: [] }),
    [pkg, q, naturalSearch],
  );
  const lex = useMemo(() => (pkg && naturalSearch ? buildLexicon(pkg) : null), [pkg, naturalSearch]);
  const parsed = useMemo(() => (pkg && lex && q.trim().length >= 2 ? parseRouteRequest(q, pkg, lex) : null), [pkg, lex, q]);
  const req = naturalSearch ? (picked && picked.text === q ? picked.req : parsed) : null;
  // AI 문장 해석(실험): 규칙이 목적지를 못 찾았거나 후보 없이 되물을 때만, 누르거나 검색 키로
  const aiOn = app.settings.aiParse && app.aiModel;
  const canAskAi = naturalSearch && aiOn && !!parsed && shouldAskGemma(parsed) && !(picked && picked.text === q);
  const stopAi = () => {
    aiRun.current += 1;
    setAi(null);
    void cancelInterpret();
  };
  useEffect(
    () => () => {
      aiRun.current += 1;
      void cancelInterpret();
    },
    [],
  );
  const runAi = async () => {
    if (!naturalSearch || !pkg || !parsed || ai?.state === 'running') return;
    const text = q;
    const run = ++aiRun.current;
    setAi({ text, state: 'running' });
    try {
      const g = await interpretWithGemma(text, pkg);
      if (run !== aiRun.current) return;
      note3dStat(
        `GEMMA ${g.loadMs != null ? `load ${g.loadMs} ms, ` : ''}total ${g.totalMs} ms, prompt ${g.promptN ?? '-'} tok ${Math.round(g.promptMs ?? 0)} ms, gen ${g.genN ?? '-'} tok ${Math.round(g.genMs ?? 0)} ms`,
      );
      if (!g.req) {
        note3dStat(`GEMMA_ERR 해석 실패(JSON 아님): ${g.raw.slice(0, 120)}`);
        return setAi({ text, state: 'failed' });
      }
      setPicked({ text, req: mergeWithGemma(parsed, g.req) });
      setAi({ text, state: 'done' });
    } catch (e) {
      if (run !== aiRun.current) return;
      note3dStat(`GEMMA_ERR 오류: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
      setAi({ text, state: 'failed' });
    }
  };
  const plan = useMemo(() => (pkg && req ? planFromRequest(req, pkg) : null), [pkg, req]);

  const resetResults = () => {
    if (ai) stopAi();
    setPicked(null);
    setExpandedBuilding(null);
    setShowAllResults(false);
  };
  const changeSearchMode = (on: boolean) => {
    resetResults();
    setSearchModeOverride(on ? 'natural' : 'place');
  };
  const changeQuery = (text: string) => {
    resetResults();
    setQ(text);
  };

  const rememberSearch = () => {
    if (q.trim()) app.addRecentSearch(q.trim());
  };
  const openDetails = (key: string) => {
    rememberSearch();
    router.push({ pathname: '/place/[key]', params: { key } });
  };
  const beginRouteToPlace = (key: string) => {
    if (!pkg) return;
    rememberSearch();
    app.setNlp(null);
    app.setDestKey(key);
    app.setStart(startFromCurrentFix(pkg, app.graph, app.fix));
    router.push('/start');
  };
  const pick = (key: string) => {
    rememberSearch();
    app.setStart({ type: 'place', placeKey: key });
    router.back();
  };
  // 알아들은 조건과 출발점을 채운 뒤 출발점 확인으로. 필수 조건은 앱 상태에 남아 경로 계산의 하드 필터가 됨.
  const go = () => {
    if (!pkg || !req || plan?.kind !== 'go') return;
    rememberSearch();
    app.setNlp({ text: q.trim(), chips: describeRequest(req, pkg), notes: plan.notes, mandatory: plan.mandatory });
    app.setDestKey(plan.destKey);
    app.setCondition(plan.condition);
    if (plan.origin.type === 'place') app.setStart({ type: 'place', placeKey: plan.origin.placeKey });
    else app.setStart(startFromCurrentFix(pkg, app.graph, app.fix));
    router.push('/start');
  };
  const sub = (key: string, nodeKey: string | null) => {
    const place = pkg ? placeSubtitle(pkg, key) : '';
    if (choosingStart) return place;
    return `${place}${nodeKey ? ' · 눌러서 바로 길찾기' : ' · 길에 붙지 않아 길찾기 불가'}`;
  };
  const placeAction = (key: string, name: string, nodeKey: string | null) => ({
    onPress: choosingStart ? () => pick(key) : nodeKey ? () => beginRouteToPlace(key) : () => openDetails(key),
    icon: choosingStart || !nodeKey ? MapPin : Navigation,
    trailing:
      !choosingStart && nodeKey ? <IconButton icon={Info} label={`${name} 상세 보기`} onPress={() => openDetails(key)} /> : undefined,
  });
  const offline = app.loaded?.source !== 'server';
  const visibleBuildings = showAllResults ? results.buildingHits : results.buildingHits.slice(0, INITIAL_BUILDINGS);
  const visiblePlaces = showAllResults ? results.placeHits : results.placeHits.slice(0, INITIAL_PLACES);
  const hiddenResultCount =
    Math.max(0, results.buildingHits.length - INITIAL_BUILDINGS) + Math.max(0, results.placeHits.length - INITIAL_PLACES);
  const resultCount = results.buildingHits.length + results.placeHits.length;
  return (
    <Screen title={choosingStart ? '출발 장소 고르기' : naturalSearch ? '자연어 검색' : '장소 검색'}>
      {!choosingStart ? (
        <Card style={s.modeCard}>
          <View style={s.modeCopy}>
            <Text style={s.modeTitle}>자연어로 검색</Text>
            <P tone="muted">{naturalSearch ? '목적지와 이동 조건을 문장으로 입력해 주세요.' : '장소·건물 이름으로 빠르게 찾습니다.'}</P>
          </View>
          <Switch
            value={naturalSearch}
            onValueChange={changeSearchMode}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel="자연어 검색 모드"
            accessibilityHint="켜면 목적지와 이동 조건을 문장으로 검색합니다"
          />
        </Card>
      ) : null}
      <SearchInput
        value={q}
        onChangeText={changeQuery}
        autoFocus={!params.q}
        returnKeyType="search"
        accessibilityLabel={naturalSearch ? '자연어 길찾기 문장' : choosingStart ? '출발 장소 검색어' : '장소 또는 건물 검색어'}
        placeholder={choosingStart ? '출발 장소 이름' : naturalSearch ? '예: 계단 없이 북악관 편의점 가고 싶어' : '장소·건물 이름 또는 층'}
        onSubmitEditing={() => (naturalSearch && plan?.kind === 'go' ? go() : canAskAi ? void runAi() : undefined)}
      />
      <StatusChip
        tone={offline ? 'offline' : 'info'}
        label={`${offline ? '저장된 지도에서 검색 중' : '방금 받은 지도에서 검색 중'} · 지도 v${pkg?.release.version}`}
      />
      {naturalSearch && req && pkg && plan ? (
        <Card tone="primary" style={s.nlp}>
          <View style={s.head}>
            <MessageCircleQuestion size={18} color={color.primary} />
            <Text style={s.headT}>이렇게 알아들었어요</Text>
          </View>
          <View style={s.chips}>
            {describeRequest(req, pkg).map((c) => (
              <View key={c} style={[s.chip, c.startsWith('필수') && s.chipMust]}>
                <Text style={[s.chipT, c.startsWith('필수') && s.chipMustT]}>{c}</Text>
              </View>
            ))}
          </View>
          {req.unsupported.length ? (
            <P tone="caution">
              {req.unsupported
                .map((u) => `${u.text}: ${u.reason}`)
                .filter((x, i, a) => a.indexOf(x) === i)
                .join(' · ')}
            </P>
          ) : null}
          {ai?.text === q && ai.state === 'running' ? (
            <View style={s.aiRow} accessibilityLiveRegion="polite">
              <Text style={s.aiT}>AI가 문장을 해석하는 중…</Text>
              <Button variant="quiet" label="취소" onPress={stopAi} />
            </View>
          ) : ai?.text === q && ai.state !== 'running' ? (
            <P tone="muted">
              {ai.state === 'done' ? 'AI 해석을 더했어요(필수 조건은 규칙 결과를 줄이지 않아요)' : 'AI도 알아듣지 못했어요'}
            </P>
          ) : null}
          {plan.kind === 'ask' ? (
            <>
              {canAskAi && ai?.state !== 'running' ? (
                <Button variant="secondary" label="AI로 해석해 보기" style={s.choice} onPress={() => void runAi()} />
              ) : null}
              <Text style={s.q} accessibilityLiveRegion="polite">
                {plan.question}
              </Text>
              {plan.choices.map((c) => (
                <Button
                  key={c.label}
                  variant="secondary"
                  label={c.label}
                  style={s.choice}
                  onPress={() => setPicked({ text: q, req: c.apply(req) })}
                />
              ))}
            </>
          ) : (
            <>
              {plan.notes
                .filter((n) => !req.unsupported.some((u) => n.startsWith(u.text)))
                .map((n) => (
                  <P key={n} tone="muted">
                    {n}
                  </P>
                ))}
              <Button label="이 조건으로 경로 보기" onPress={go} />
            </>
          )}
        </Card>
      ) : null}
      {!naturalSearch && q && results.buildingHits.length ? <Section>건물 {results.buildingHits.length}</Section> : null}
      {visibleBuildings.map((h) => {
        const expanded = expandedBuilding === h.building.key;
        const unavailable = h.places.length - h.routablePlaceCount;
        const visibleBuildingPlaces = expanded ? h.places : h.places.slice(0, INITIAL_BUILDING_PLACES);
        const hiddenBuildingPlaces = Math.max(0, h.places.length - INITIAL_BUILDING_PLACES);
        const detail = h.places.length
          ? `세부 위치 ${h.places.length}개${unavailable ? ` · 길찾기 가능 ${h.routablePlaceCount}개` : ''}`
          : '등록된 세부 위치 없음';
        return (
          <View key={h.building.key} style={s.buildingGroup}>
            <ResultRow icon={Building} title={h.building.name} sub={detail} />
            {visibleBuildingPlaces.map((p) => (
              <View key={p.place.key} style={s.childResult}>
                <ResultRow
                  title={displayName(p.place.name)}
                  sub={sub(p.place.key, p.place.nodeKey)}
                  {...placeAction(p.place.key, p.place.name, p.place.nodeKey)}
                />
              </View>
            ))}
            {hiddenBuildingPlaces ? (
              <Button
                variant="quiet"
                label={expanded ? '세부 위치 접기' : `세부 위치 ${hiddenBuildingPlaces}개 더 보기`}
                onPress={() => setExpandedBuilding(expanded ? null : h.building.key)}
                style={s.childMore}
              />
            ) : null}
          </View>
        );
      })}
      {!naturalSearch && q && results.placeHits.length ? <Section>장소 {results.placeHits.length}</Section> : null}
      {visiblePlaces.map((h) => (
        <ResultRow
          key={h.place.key}
          title={displayName(h.place.name)}
          sub={sub(h.place.key, h.place.nodeKey)}
          {...placeAction(h.place.key, h.place.name, h.place.nodeKey)}
        />
      ))}
      {!naturalSearch && hiddenResultCount ? (
        <Button
          variant="quiet"
          label={showAllResults ? '검색 결과 접기' : `검색 결과 ${hiddenResultCount}개 더 보기`}
          onPress={() => setShowAllResults((v) => !v)}
        />
      ) : null}
      {!q && app.recentSearches.length ? (
        <View style={s.recentHead}>
          <Section>최근 검색</Section>
          <Button variant="quiet" label="전체 지우기" onPress={app.clearRecentSearches} />
        </View>
      ) : null}
      {!q
        ? app.recentSearches.map((r) => (
            <ResultRow
              key={r}
              icon={Search}
              title={r}
              onPress={() => changeQuery(r)}
              trailing={<IconButton icon={X} label={`${r} 기록 지우기`} onPress={() => app.removeRecentSearch(r)} />}
            />
          ))
        : null}
      {!naturalSearch && q && !resultCount ? (
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

const s = StyleSheet.create({
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeCopy: { flex: 1, gap: 2 },
  modeTitle: { fontSize: type.small, fontWeight: '800', color: color.text },
  buildingGroup: { gap: 6 },
  childResult: { marginLeft: 16 },
  childMore: { marginLeft: 16 },
  nlp: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headT: { fontSize: type.small, fontWeight: '800', color: color.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: shape.pill, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 6 },
  chipT: { fontSize: type.caption + 1, fontWeight: '700', color: color.text },
  chipMust: { backgroundColor: color.primary },
  chipMustT: { color: '#FFFFFF' },
  q: { fontSize: type.body, fontWeight: '800', color: color.text },
  // 연한 남보라 카드 위에서도 단추로 보이게 흰 바탕 + 옅은 테두리
  choice: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(79,70,229,0.18)' },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  aiT: { fontSize: type.small, fontWeight: '700', color: color.primary, flex: 1 },
});
