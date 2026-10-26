// CT02 검색. 기본은 장소 이름 검색, 스위치를 켜면 자연어 경로 요청을 해석한다.
// mode=start 면 자연어 모드 없이 고른 장소를 출발점으로 지정하고 CT04 로 돌아간다.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Building, MessageCircleQuestion, Search } from 'lucide-react-native';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { describe as describeRequest, planFromRequest } from '../nlp/apply';
import { mergeWithGemma, shouldAskGemma } from '../nlp/gemma';
import { cancelInterpret, interpretWithGemma } from '../nlp/gemmaRuntime';
import { note3dStat } from '../map3d/diag';
import { buildLexicon } from '../nlp/lexicon';
import { parseRouteRequest } from '../nlp/parse';
import type { RouteRequest } from '../nlp/types';
import { searchPlaces } from '../search/search';
import { placeSubtitle, startFromFix, useApp } from '../state/AppState';
import { SearchInput } from '../ui/components';
import { Badge, Btn, Card, P, Row, Screen, Section, T } from '../ui/kit';
import { shape } from '../ui/theme';
import { Character } from '../ui/v3';

type SearchMode = 'place' | 'natural';

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
  const aiRun = useRef(0);
  const pkg = app.pkg;
  const hits = useMemo(() => (pkg && !naturalSearch ? searchPlaces(pkg, q) : []), [pkg, q, naturalSearch]);
  const lex = useMemo(() => (pkg && naturalSearch ? buildLexicon(pkg) : null), [pkg, naturalSearch]);
  const parsed = useMemo(() => (pkg && lex && q.trim().length >= 2 ? parseRouteRequest(q, pkg, lex) : null), [pkg, lex, q]);
  const req = naturalSearch ? (picked && picked.text === q ? picked.req : parsed) : null;
  // AI 문장 해석(실험): 규칙이 목적지를 못 찾았거나 후보 없이 되물을 때만, 누르거나 검색 키로
  const aiOn = (app.settings.aiParse ?? false) && app.aiModel;
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

  const changeSearchMode = (on: boolean) => {
    stopAi();
    setPicked(null);
    setSearchModeOverride(on ? 'natural' : 'place');
  };
  const changeQuery = (text: string) => {
    if (ai) stopAi();
    setPicked(null);
    setQ(text);
  };

  const pick = (key: string) => {
    if (q.trim()) app.addRecentSearch(q.trim());
    if (choosingStart) {
      app.setStart({ type: 'place', placeKey: key });
      router.back();
    } else router.push({ pathname: '/place/[key]', params: { key } });
  };
  // 알아들은 조건을 채워 경로 옵션으로. 필수 조건은 앱 상태에 남아 경로 계산의 하드 필터가 됨.
  const go = () => {
    if (!pkg || !req || plan?.kind !== 'go') return;
    app.addRecentSearch(q.trim());
    app.setNlp({ text: q.trim(), chips: describeRequest(req, pkg), notes: plan.notes, mandatory: plan.mandatory });
    app.setDestKey(plan.destKey);
    app.setCondition(plan.condition);
    if (plan.origin.type === 'place') app.setStart({ type: 'place', placeKey: plan.origin.placeKey });
    else {
      const f = app.fix;
      app.setStart(f && !f.uncertain ? startFromFix(pkg, app.graph, f, '현재 위치') : null);
    }
    router.push('/options');
  };
  const sub = (key: string, nodeKey: string | null) =>
    `${pkg ? placeSubtitle(pkg, key) : ''}${nodeKey ? '' : ' · 길에 붙지 않아 길찾기 불가'}`;
  const offline = app.loaded?.source !== 'server';
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
            trackColor={{ false: T.line, true: T.primary }}
            ios_backgroundColor={T.line}
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
      <Badge
        tone={offline ? 'offline' : 'primary'}
        text={`${offline ? '저장된 지도에서 검색 중' : '방금 받은 지도에서 검색 중'} · 지도 v${pkg?.release.version}`}
      />
      {naturalSearch && req && pkg && plan ? (
        <Card tone="primary" style={s.nlp}>
          <View style={s.head}>
            <MessageCircleQuestion size={18} color={T.primary} />
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
              <Btn kind="ghost" label="취소" onPress={stopAi} />
            </View>
          ) : ai?.text === q && ai.state !== 'running' ? (
            <P tone="muted">
              {ai.state === 'done' ? 'AI 해석을 더했어요(필수 조건은 규칙 결과를 줄이지 않아요)' : 'AI도 알아듣지 못했어요'}
            </P>
          ) : null}
          {plan.kind === 'ask' ? (
            <>
              {canAskAi && ai?.state !== 'running' ? (
                <Btn kind="soft" label="AI로 해석해 보기" style={s.choice} onPress={() => void runAi()} />
              ) : null}
              <Text style={s.q} accessibilityLiveRegion="polite">
                {plan.question}
              </Text>
              {plan.choices.map((c) => (
                <Btn key={c.label} kind="soft" label={c.label} style={s.choice} onPress={() => setPicked({ text: q, req: c.apply(req) })} />
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
              <Btn label="이 조건으로 경로 보기" onPress={go} />
            </>
          )}
        </Card>
      ) : null}
      {!naturalSearch && q && hits.length ? <Section>장소 {hits.length}</Section> : null}
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
      {!q ? app.recentSearches.map((r) => <Row key={r} icon={Search} title={r} onPress={() => changeQuery(r)} />) : null}
      {!naturalSearch && q && !hits.length ? (
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
  modeCopy: { flex: 1, gap: 2 },
  modeTitle: { fontSize: T.small, fontWeight: '800', color: T.text },
  nlp: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headT: { fontSize: T.small, fontWeight: '800', color: T.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: shape.pill, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 6 },
  chipT: { fontSize: T.caption + 1, fontWeight: '700', color: T.text },
  chipMust: { backgroundColor: T.primary },
  chipMustT: { color: '#FFFFFF' },
  q: { fontSize: T.body, fontWeight: '800', color: T.text },
  // 연한 남보라 카드 위에서도 단추로 보이게 흰 바탕 + 옅은 테두리
  choice: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(79,70,229,0.18)' },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  aiT: { fontSize: T.small, fontWeight: '700', color: T.primary, flex: 1 },
});
