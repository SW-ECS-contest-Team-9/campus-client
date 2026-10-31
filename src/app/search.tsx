// CT02 검색. 기본은 장소 이름 검색, 스위치를 켜면 자연어 경로 요청을 해석한다.
// mode=start 는 출발 장소 선택, mode=natural 은 저장된 기본값과 관계없이 자연어로 조건 변경.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Building, Info, MapPin, MessageCircleQuestion, Navigation, Search, X } from 'lucide-react-native';
import { Alert, Keyboard, StyleSheet, Switch, Text, View } from 'react-native';
import { currentLocationLabel } from '../location/fix';
import { beginRoute } from '../location/goRoute';
import { startFromFix } from '../location/start';
import { placeSubtitle } from '../map/labels';
import { localizedEntityName } from '../map/names-i18n';
import { describe as describeRequest, describeUnsupported, planFromRequest } from '../nlp/apply';
import { mergeWithGemma, shouldAskGemma } from '../nlp/gemma';
import { cancelInterpret, interpretWithGemma } from '../nlp/gemmaRuntime';
import { note3dStat } from '../map3d/diag';
import { buildLexicon } from '../nlp/lexicon';
import { parseRouteRequest } from '../nlp/parse';
import type { RouteRequest } from '../nlp/types';
import { searchResults } from '../search/search';
import { useApp } from '../state/AppState';
import { Button, IconButton, ResultRow, SearchInput, StatusChip } from '../ui/components';
import { useToast } from '../ui/feedback';
import { Card, P, Screen, Section } from '../ui/kit';
import { color, shape, type } from '../ui/theme';
import { Character } from '../ui/v3';
import { translate, type MessageKey } from '../i18n/translations';

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
      locationRun.current += 1;
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
  const plan = useMemo(() => (pkg && req ? planFromRequest(req, pkg, app.settings.language) : null), [pkg, req, app.settings.language]);

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
    if (!pkg || !req || plan?.kind !== 'go') return;
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
    return `${place} · ${t(nodeKey ? 'tapForRoute' : 'notRoutable')}`;
  };
  const placeAction = (key: string, name: string, nodeKey: string | null) => ({
    onPress: choosingStart ? () => pick(key) : nodeKey ? () => beginRouteToPlace(key) : () => openDetails(key),
    icon: choosingStart || !nodeKey ? MapPin : Navigation,
    trailing:
      !choosingStart && nodeKey ? <IconButton icon={Info} label={t('viewDetails', { name })} onPress={() => openDetails(key)} /> : undefined,
  });
  const visibleBuildings = showAllResults ? results.buildingHits : results.buildingHits.slice(0, INITIAL_BUILDINGS);
  const visiblePlaces = showAllResults ? results.placeHits : results.placeHits.slice(0, INITIAL_PLACES);
  const hiddenResultCount =
    Math.max(0, results.buildingHits.length - INITIAL_BUILDINGS) + Math.max(0, results.placeHits.length - INITIAL_PLACES);
  const resultCount = results.buildingHits.length + results.placeHits.length;
  return (
    <Screen title={t(choosingStart ? 'chooseStartPlace' : 'searchPlaces')}>
      {!choosingStart ? (
        <Card style={s.modeCard}>
          <View style={s.modeCopy}>
            <Text style={s.modeTitle}>{t('searchNatural')}</Text>
            <P tone="muted">{t(naturalSearch ? 'naturalPrompt' : 'nameSearchPrompt')}</P>
            {naturalSearch ? <P tone="muted">{t('naturalKoreanOnly')}</P> : null}
          </View>
          <Switch
            value={naturalSearch}
            onValueChange={changeSearchMode}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel={t('naturalMode')}
            accessibilityHint={t('naturalHint')}
          />
        </Card>
      ) : null}
      <SearchInput
        value={q}
        onChangeText={changeQuery}
        autoFocus={!params.q}
        returnKeyType="search"
        accessibilityLabel={t(naturalSearch ? 'naturalQuery' : choosingStart ? 'startQuery' : 'placeQuery')}
        placeholder={t(choosingStart ? 'startName' : naturalSearch ? 'naturalExample' : 'placePlaceholder')}
        onSubmitEditing={() => (naturalSearch && plan?.kind === 'go' ? go() : canAskAi ? void runAi() : undefined)}
      />
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
          <View style={s.head}>
            <MessageCircleQuestion size={18} color={color.primary} />
            <Text style={s.headT}>{t('recognized')}</Text>
          </View>
          <View style={s.chips}>
            {describeRequest(req, pkg, app.settings.language).map((c) => (
              <View key={c} style={[s.chip, c.startsWith(t('nlpRequired', { value: '' })) && s.chipMust]}>
                <Text style={[s.chipT, c.startsWith(t('nlpRequired', { value: '' })) && s.chipMustT]}>{c}</Text>
              </View>
            ))}
          </View>
          {req.unsupported.length ? (
            <P tone="caution">
              {req.unsupported
                .map((u) => describeUnsupported(u, app.settings.language))
                .filter((x, i, a) => a.indexOf(x) === i)
                .join(' · ')}
            </P>
          ) : null}
          {ai?.text === q && ai.state === 'running' ? (
            <View style={s.aiRow} accessibilityLiveRegion="polite">
              <Text style={s.aiT}>{t('aiWorking')}</Text>
              <Button variant="quiet" label={t('cancel')} onPress={stopAi} />
            </View>
          ) : ai?.text === q && ai.state !== 'running' ? (
            <P tone="muted">
              {t(ai.state === 'done' ? 'aiAdded' : 'aiFailed')}
            </P>
          ) : null}
          {plan.kind === 'ask' ? (
            <>
              {canAskAi && ai?.state !== 'running' ? (
                <Button variant="secondary" label={t('tryAI')} style={s.choice} onPress={() => void runAi()} />
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
                .filter((n) => !req.unsupported.some((u) => n === describeUnsupported(u, app.settings.language)))
                .map((n) => (
                  <P key={n} tone="muted">
                    {n}
                  </P>
                ))}
              <Button label={t('viewRouteWithPrefs')} onPress={go} />
            </>
          )}
        </Card>
      ) : null}
      {!naturalSearch && q && results.buildingHits.length ? <Section>{t('buildingsCount', { count: String(results.buildingHits.length) })}</Section> : null}
      {visibleBuildings.map((h) => {
        const expanded = expandedBuilding === h.building.key;
        const unavailable = h.places.length - h.routablePlaceCount;
        const visibleBuildingPlaces = expanded ? h.places : h.places.slice(0, INITIAL_BUILDING_PLACES);
        const hiddenBuildingPlaces = Math.max(0, h.places.length - INITIAL_BUILDING_PLACES);
        const detail = h.places.length
          ? `${t('subplaces', { count: String(h.places.length) })}${unavailable ? ` · ${t('routableCount', { count: String(h.routablePlaceCount) })}` : ''}`
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
      {!naturalSearch && q && results.placeHits.length ? <Section>{t('placesCount', { count: String(results.placeHits.length) })}</Section> : null}
      {visiblePlaces.map((h) => (
        <ResultRow
          key={h.place.key}
          title={localizedEntityName(h.place, app.settings.language)}
          sub={sub(h.place.key, h.place.nodeKey)}
          {...placeAction(h.place.key, localizedEntityName(h.place, app.settings.language), h.place.nodeKey)}
        />
      ))}
      {!naturalSearch && hiddenResultCount ? (
        <Button
          variant="quiet"
          label={showAllResults ? t('collapseResults') : t('moreResults', { count: String(hiddenResultCount) })}
          onPress={() => setShowAllResults((v) => !v)}
        />
      ) : null}
      {!q && app.recentSearches.length ? (
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
      {!q
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
      {!naturalSearch && q && !resultCount ? (
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
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
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
