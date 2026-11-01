// CT02 검색. 기본은 장소 이름 검색, 스위치를 켜면 자연어 경로 요청을 해석한다.
// mode=start 는 출발 장소 선택, mode=natural 은 저장된 기본값과 관계없이 자연어로 조건 변경.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Building, Info, MapPin, Navigation, Search, X } from 'lucide-react-native';
import { Alert, Keyboard, StyleSheet, Switch, Text, View } from 'react-native';
import { currentLocationLabel } from '../location/fix';
import { beginRoute } from '../location/goRoute';
import { startFromFix } from '../location/start';
import { placeSubtitle } from '../map/labels';
import { localizedEntityName } from '../map/names-i18n';
import { describeUnsupported, planFromRequest, publicSearchWarnings } from '../nlp/apply';
import { cancelInterpret, interpretWithGemma } from '../nlp/gemmaRuntime';
import { note3dStat } from '../map3d/diag';
import { buildSearchIndex } from '../nlp/resolveIntent';
import { runSearchPipeline, routeRequestForIntent, type ResolvedCandidate } from '../nlp/searchPipeline';
import type { RouteRequest } from '../nlp/types';
import directory from '../data/facility-directory.draft.json';
import { searchFacilities } from '../search/facilities';
import { searchResults } from '../search/search';
import { useApp } from '../state/AppState';
import { Button, IconButton, ResultRow, SearchInput, StatusChip } from '../ui/components';
import { useToast } from '../ui/feedback';
import { Card, P, Screen, Section } from '../ui/kit';
import { color, type } from '../ui/theme';
import { Character } from '../ui/v3';
import { translate, type MessageKey } from '../i18n/translations';

const directorySources: Record<string, string> = Object.fromEntries(directory.sourceDocuments.map((source) => [source.id, source.label]));

type SearchMode = 'place' | 'natural';
const INITIAL_BUILDINGS = 4;
const INITIAL_PLACES = 8;
const INITIAL_BUILDING_PLACES = 3;

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; mode?: string }>();
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const toast = useToast();
  const choosingStart = params.mode === 'start';
  const [q, setQ] = useState(params.q ?? '');
  // 조건 변경 링크는 자연어로 열고, 그 외에는 저장된 기본값을 따름(설정이 비동기로 불러와져도 반영).
  const [searchModeOverride, setSearchModeOverride] = useState<SearchMode | null>(null);
  const searchMode = searchModeOverride ?? (params.mode === 'natural' || app.settings.naturalSearchDefault ? 'natural' : 'place');
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
  const [analysis, setAnalysis] = useState<({ text: string } & ReturnType<typeof runSearchPipeline>) | null>(null);
  const [expandedBuilding, setExpandedBuilding] = useState<string | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);
  const [readingLocation, setReadingLocation] = useState(false);
  const [locationMessage, setLocationMessage] = useState<MessageKey | null>(null);
  const locationRun = useRef(0);
  const aiRun = useRef(0);
  const pkg = app.pkg;
  const results = useMemo(
    () => (pkg && !naturalSearch ? searchResults(pkg, q) : { buildingHits: [], placeHits: [] }),
    [pkg, q, naturalSearch],
  );
  const facilityHits = useMemo(() => (!choosingStart && !naturalSearch ? searchFacilities(q) : []), [q, choosingStart, naturalSearch]);
  const index = useMemo(() => (pkg ? buildSearchIndex(pkg) : null), [pkg]);
  const activeAnalysis = naturalSearch && analysis?.text === q ? analysis : null;
  const req = naturalSearch ? (picked?.text === q ? picked.req : (activeAnalysis?.request ?? null)) : null;
  // 자연어 검색은 기기 안 LLM 해석과 한 세트다. 입력 중에는 실행하지 않는다.
  useEffect(() => {
    if (req) note3dStat(`NLP ${req.unsupported.map((u) => describeUnsupported(u, app.settings.language)).join(' | ') || '-'}`);
  }, [req, app.settings.language]);
  const aiDone = ai?.text === q && ai.state === 'done';
  const canAskAi = naturalSearch && app.aiModel && !!q.trim() && !aiDone && ai?.state !== 'running';
  const stopAi = () => {
    aiRun.current += 1;
    setAi(null);
    void cancelInterpret();
  };
  useEffect(
    () => () => {
      aiRun.current += 1;
      locationRun.current += 1;
      void cancelInterpret();
    },
    [],
  );
  const runAi = async () => {
    if (!canAskAi || !pkg) return;
    const text = q;
    const run = ++aiRun.current;
    setAi({ text, state: 'running' });
    try {
      const g = await interpretWithGemma(text);
      if (run !== aiRun.current) return;
      note3dStat(
        `GEMMA ${g.loadMs != null ? `load ${g.loadMs} ms, ` : ''}total ${g.totalMs} ms, prompt ${g.promptN ?? '-'} tok ${Math.round(g.promptMs ?? 0)} ms, gen ${g.genN ?? '-'} tok ${Math.round(g.genMs ?? 0)} ms`,
      );
      if (!g.intent) {
        note3dStat('GEMMA_ERR intent JSON invalid');
        return setAi({ text, state: 'failed' });
      }
      const result = runSearchPipeline(text, g.intent, pkg, app.settings.language);
      note3dStat(
        `NLP_RESULT ${JSON.stringify({ valid: result.resolution.valid, status: result.resolution.status, count: result.resolution.candidates.length, issues: result.resolution.issues })}`,
      );
      setAnalysis({ text, ...result });
      setPicked(null);
      setAi({ text, state: result.resolution.valid ? 'done' : 'failed' });
    } catch (e) {
      if (run !== aiRun.current) return;
      note3dStat(`GEMMA_ERR 오류: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
      setAi({ text, state: 'failed' });
    }
  };
  const plan = useMemo(() => (pkg && req ? planFromRequest(req, pkg, app.settings.language) : null), [pkg, req, app.settings.language]);

  const candidateDetails = (candidate: ResolvedCandidate) => {
    const building = pkg?.buildings.find((b) => b.key === candidate.buildingKey);
    return [
      building ? localizedEntityName(building, app.settings.language) : null,
      candidate.floorCode,
      candidate.room,
      candidate.notice,
    ].filter(Boolean);
  };
  const chooseIntentCandidate = (candidate: ResolvedCandidate) => {
    if (!pkg || !index || !activeAnalysis) return;
    const result = routeRequestForIntent(activeAnalysis.intent, candidate, pkg, q, index);
    if (!result.request) {
      Alert.alert(
        candidate.name,
        [...candidateDetails(candidate), t(result.originIssue ? 'searchOriginMissing' : 'facilityRouteUnlinked')]
          .filter(Boolean)
          .join('\n'),
      );
      return;
    }
    setPicked({ text: q, req: result.request });
  };

  const resetResults = () => {
    if (ai) stopAi();
    setPicked(null);
    setAnalysis(null);
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
    beginRoute(pkg, app.graph, app.fix, { start: app.setStart }, app.settings.language);
  };
  const pick = (key: string) => {
    locationRun.current += 1;
    setReadingLocation(false);
    setLocationMessage(null);
    rememberSearch();
    app.setStart({ type: 'place', placeKey: key });
    router.navigate('/preview'); // 출발 장소를 고르면 바로 경로(사례 R20)
  };
  const readCurrentLocation = async () => {
    if (!pkg || readingLocation) return;
    const run = ++locationRun.current;
    Keyboard.dismiss();
    setReadingLocation(true);
    setLocationMessage(null);
    try {
      const permitted = await app.enableLocation();
      if (run !== locationRun.current) return;
      if (!permitted) return setLocationMessage('locationDeniedStart');
      const fix = await app.waitFix(15000);
      if (run !== locationRun.current) return;
      if (!fix) return setLocationMessage('locationUnavailable');
      if (fix.uncertain) return setLocationMessage('locationInaccurate');
      const start = startFromFix(pkg, app.graph, fix, currentLocationLabel(pkg, fix, app.settings.language));
      if (!start) return setLocationMessage('noNearbyPath');
      app.setStart(start);
      router.navigate('/preview');
    } catch {
      if (run === locationRun.current) setLocationMessage('locationUnavailable');
    } finally {
      if (run === locationRun.current) setReadingLocation(false);
    }
  };
  // 알아들은 조건과 출발점을 채운 뒤 출발점 확인으로. 필수 조건은 앱 상태에 남아 경로 계산의 하드 필터가 됨.
  const go = () => {
    if (!aiDone || !pkg || !req || plan?.kind !== 'go') return;
    rememberSearch();
    app.setNlp({ text: q.trim(), request: req, mandatory: plan.mandatory });
    app.setDestKey(plan.destKey);
    app.setCondition(plan.condition);
    if (plan.origin.type === 'place') {
      app.setStart({ type: 'place', placeKey: plan.origin.placeKey });
      router.push('/preview');
    } else beginRoute(pkg, app.graph, app.fix, { start: app.setStart }, app.settings.language);
  };
  const sub = (key: string, nodeKey: string | null) => {
    const place = pkg ? placeSubtitle(pkg, key, app.settings.language) : '';
    if (choosingStart) return place;
    return `${place}, ${t(nodeKey ? 'tapForRoute' : 'notRoutable')}`;
  };
  const placeAction = (key: string, name: string, nodeKey: string | null) => ({
    onPress: choosingStart ? () => pick(key) : nodeKey ? () => beginRouteToPlace(key) : () => openDetails(key),
    icon: choosingStart || !nodeKey ? MapPin : Navigation,
    trailing:
      !choosingStart && nodeKey ? (
        <IconButton icon={Info} label={t('viewDetails', { name })} onPress={() => openDetails(key)} />
      ) : undefined,
  });
  const visibleBuildings = showAllResults ? results.buildingHits : results.buildingHits.slice(0, INITIAL_BUILDINGS);
  const visiblePlaces = showAllResults ? results.placeHits : results.placeHits.slice(0, INITIAL_PLACES);
  const hiddenResultCount =
    Math.max(0, results.buildingHits.length - INITIAL_BUILDINGS) + Math.max(0, results.placeHits.length - INITIAL_PLACES);
  const resultCount = results.buildingHits.length + results.placeHits.length;
  return (
    <Screen title={t(choosingStart ? 'chooseStartPlace' : 'searchPlaces')}>
      <SearchInput
        value={q}
        onChangeText={changeQuery}
        autoFocus={!params.q}
        returnKeyType="search"
        accessibilityLabel={t(naturalSearch ? 'naturalQuery' : choosingStart ? 'startQuery' : 'placeQuery')}
        placeholder={t(choosingStart ? 'startName' : naturalSearch ? 'naturalInput' : 'placePlaceholder')}
        onSubmitEditing={() => (canAskAi ? void runAi() : naturalSearch && aiDone && plan?.kind === 'go' ? go() : undefined)}
      />
      {!choosingStart ? (
        <View style={s.modeRow}>
          <Text style={s.modeTitle}>{t('searchNatural')}</Text>
          <Switch
            value={naturalSearch}
            onValueChange={changeSearchMode}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel={t('naturalMode')}
          />
        </View>
      ) : null}
      {canAskAi ? <Button label={t('naturalInterpret')} onPress={() => void runAi()} /> : null}
      {ai?.text === q && ai.state === 'running' ? (
        <View style={s.aiRow} accessibilityLiveRegion="polite">
          <Text style={s.aiT}>{t('searchWorking')}</Text>
          <Button variant="quiet" label={t('cancel')} onPress={stopAi} />
        </View>
      ) : ai?.text === q && ai.state === 'failed' ? (
        <P>{t('intentFailed')}</P>
      ) : null}
      {activeAnalysis?.resolution.valid ? (
        <View style={s.intentResults}>
          {!activeAnalysis.resolution.candidates.length ? (
            <P>{t('searchDataInsufficient')}</P>
          ) : (
            <>
              <Section>{t('searchResultsCount', { count: String(activeAnalysis.resolution.candidates.length) })}</Section>
              {activeAnalysis.resolution.candidates.slice(0, showAllResults ? undefined : INITIAL_PLACES).map((candidate) => (
                <ResultRow
                  key={candidate.id}
                  icon={candidate.kind === 'building' ? Building : MapPin}
                  title={candidate.name}
                  sub={candidateDetails(candidate).join(' · ')}
                  onPress={() => chooseIntentCandidate(candidate)}
                />
              ))}
              {activeAnalysis.resolution.candidates.length > INITIAL_PLACES ? (
                <Button
                  variant="quiet"
                  label={t(showAllResults ? 'collapseResults' : 'moreResults', {
                    count: String(activeAnalysis.resolution.candidates.length - INITIAL_PLACES),
                  })}
                  onPress={() => setShowAllResults((value) => !value)}
                />
              ) : null}
            </>
          )}
          {activeAnalysis.resolution.status === 'unroutable' ? <P>{t('facilityRouteUnlinked')}</P> : null}
          {activeAnalysis.resolution.ranking === 'unavailable' ? <P>{t('nearestUnavailable')}</P> : null}
          {activeAnalysis.intent.dest.kind === 'person' ||
          (activeAnalysis.resolution.candidates.length > 0 &&
            activeAnalysis.resolution.candidates.every((c) => c.category === 'faculty_office')) ? (
            <P>{t('officeNotPresence')}</P>
          ) : null}
          {activeAnalysis.intent.currentInfo ? <P>{t('currentInfoUnavailable')}</P> : null}
          {activeAnalysis.originIssue ? <P>{t('searchOriginMissing')}</P> : null}
        </View>
      ) : null}

      {choosingStart ? (
        <View style={s.locationAction} accessibilityLiveRegion="polite">
          <Button
            variant="secondary"
            label={t(readingLocation ? 'readingLocation' : 'readLocationAgain')}
            disabled={!pkg || readingLocation}
            onPress={() => void readCurrentLocation()}
          />
          {locationMessage ? <StatusChip tone="warning" label={t(locationMessage)} /> : null}
        </View>
      ) : null}
      {naturalSearch && req && pkg && plan ? (
        <Card tone="primary" style={s.nlp}>
          {plan.kind === 'ask' ? (
            <>
              <Text style={s.q} accessibilityLiveRegion="polite">
                {plan.question}
              </Text>
              {plan.choices.map((c) => (
                <Button
                  key={c.label}
                  disabled={ai?.state === 'running'}
                  variant="secondary"
                  label={c.label}
                  style={s.choice}
                  onPress={() => setPicked({ text: q, req: c.apply(req) })}
                />
              ))}
            </>
          ) : (
            <>
              {publicSearchWarnings(req, app.settings.language).map((warning) => (
                <P key={warning} tone="caution">
                  {warning}
                </P>
              ))}
              {plan.notes
                .filter((n) => !req.unsupported.some((u) => n === describeUnsupported(u, app.settings.language)))
                .map((n) => (
                  <P key={n} tone="muted">
                    {n}
                  </P>
                ))}
              <Button label={t('viewRouteWithPrefs')} disabled={!aiDone} onPress={go} />
            </>
          )}
        </Card>
      ) : null}
      {!naturalSearch && q && results.buildingHits.length ? (
        <Section>{t('buildingsCount', { count: String(results.buildingHits.length) })}</Section>
      ) : null}
      {visibleBuildings.map((h) => {
        const expanded = expandedBuilding === h.building.key;
        const unavailable = h.places.length - h.routablePlaceCount;
        const visibleBuildingPlaces = expanded ? h.places : h.places.slice(0, INITIAL_BUILDING_PLACES);
        const hiddenBuildingPlaces = Math.max(0, h.places.length - INITIAL_BUILDING_PLACES);
        const detail = h.places.length
          ? `${t('subplaces', { count: String(h.places.length) })}${unavailable ? `, ${t('routableCount', { count: String(h.routablePlaceCount) })}` : ''}`
          : t('noSubplaces');
        return (
          <View key={h.building.key} style={s.buildingGroup}>
            <ResultRow icon={Building} title={localizedEntityName(h.building, app.settings.language)} sub={detail} />
            {visibleBuildingPlaces.map((p) => (
              <View key={p.place.key} style={s.childResult}>
                <ResultRow
                  title={localizedEntityName(p.place, app.settings.language)}
                  sub={sub(p.place.key, p.place.nodeKey)}
                  {...placeAction(p.place.key, localizedEntityName(p.place, app.settings.language), p.place.nodeKey)}
                />
              </View>
            ))}
            {hiddenBuildingPlaces ? (
              <Button
                variant="quiet"
                label={expanded ? t('collapseSubplaces') : t('moreSubplaces', { count: String(hiddenBuildingPlaces) })}
                onPress={() => setExpandedBuilding(expanded ? null : h.building.key)}
                style={s.childMore}
              />
            ) : null}
          </View>
        );
      })}
      {!naturalSearch && q && results.placeHits.length ? (
        <Section>{t('placesCount', { count: String(results.placeHits.length) })}</Section>
      ) : null}
      {visiblePlaces.map((h) => (
        <ResultRow
          key={h.place.key}
          title={localizedEntityName(h.place, app.settings.language)}
          sub={sub(h.place.key, h.place.nodeKey)}
          {...placeAction(h.place.key, localizedEntityName(h.place, app.settings.language), h.place.nodeKey)}
        />
      ))}
      {facilityHits.map((facility) => (
        <ResultRow
          key={facility.id}
          icon={Info}
          title={facility.displayName}
          sub={[facility.buildingName, facility.floorCode, facility.room, facility.notice].filter(Boolean).join(' · ')}
          onPress={() =>
            Alert.alert(
              facility.displayName,
              [facility.notice, ...facility.evidence.map((e) => directorySources[e.sourceId] ?? e.sourceId)].join('\n'),
            )
          }
        />
      ))}
      {!naturalSearch && hiddenResultCount ? (
        <Button
          variant="quiet"
          label={showAllResults ? t('collapseResults') : t('moreResults', { count: String(hiddenResultCount) })}
          onPress={() => setShowAllResults((v) => !v)}
        />
      ) : null}
      {!naturalSearch && !q && app.recentSearches.length ? (
        <View style={s.recentHead}>
          <Section>{t('recentSearches')}</Section>
          <Button
            variant="quiet"
            label={t('clearAll')}
            onPress={() =>
              Alert.alert(t('confirmClearSearch'), t('cannotUndo'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('clear'),
                  style: 'destructive',
                  onPress: () => {
                    app.clearRecentSearches();
                    toast(t('historyCleared'));
                  },
                },
              ])
            }
          />
        </View>
      ) : null}
      {!naturalSearch && !q
        ? app.recentSearches.map((r) => (
            <ResultRow
              key={r}
              icon={Search}
              title={r}
              onPress={() => changeQuery(r)}
              trailing={
                <IconButton
                  icon={X}
                  label={t('deleteSearch', { query: r })}
                  onPress={() => {
                    app.removeRecentSearch(r);
                    toast(t('oneHistoryRemoved'), { label: t('undo'), onPress: () => app.addRecentSearch(r) });
                  }}
                />
              }
            />
          ))
        : null}
      {!naturalSearch && q && !resultCount && !facilityHits.length ? (
        <View style={s.empty}>
          <Character name="emptySearch" size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <P>{t('noSearchResults', { query: q })}</P>
            <P tone="muted">{t('searchHint')}</P>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  locationAction: { gap: 8 },
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  modeTitle: { fontSize: type.small, fontWeight: '800', color: color.text },
  buildingGroup: { gap: 6 },
  childResult: { marginLeft: 16 },
  childMore: { marginLeft: 16 },
  nlp: { gap: 10 },
  intentResults: { gap: 8 },
  q: { fontSize: type.body, fontWeight: '800', color: color.text },
  // 연한 남보라 카드 위에서도 단추로 보이게 흰 바탕 + 옅은 테두리
  choice: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(79,70,229,0.18)' },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  aiT: { fontSize: type.small, fontWeight: '700', color: color.primary, flex: 1 },
});
