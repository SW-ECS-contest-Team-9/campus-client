// CT05 경로 옵션: 출발·도착, 이동 방식 7가지(서버 경로 방식과 같음). 필수 조건(계단 없이·휠체어)은 자동으로 풀지 않음(제품 규칙 04).
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { effectiveCondition } from '../nlp/apply';
import { MODES, modeInfo } from '../route/modes';
import { useApp } from '../state/AppState';
import { Btn, Card, Chip, P, Screen, Section, T } from '../ui/kit';

export default function OptionsScreen() {
  const app = useApp();
  const [lockMsg, setLockMsg] = useState(false);
  if (!app.pkg) return null;
  const pkg = app.pkg;
  const st = app.start;
  const startLabel = st
    ? st.type === 'place'
      ? (pkg.places.find((p) => p.key === st.placeKey)?.name ?? '없어진 장소')
      : st.label
    : '고르지 않음';
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const destFloor = dest?.floorKey ? pkg.floors.find((f) => f.key === dest.floorKey)?.code : null;
  const cond = modeInfo(app.condition);
  // 말로 정한 필수 조건(계단 없이·휠체어)은 하드 필터: 그보다 느슨한 방식으로 바꾸려면 직접 "필수 조건 풀기"
  const nlp = app.nlp;
  const mandatory = nlp?.mandatory ?? [];
  const locked = mandatory.length > 0;
  const mustLabel = app.condition === 'accessible' ? '휠체어·유모차' : '계단 없이';
  const go = () => {
    const r = app.route;
    if (!r) return;
    router.push(r.ok ? '/preview' : '/no-route');
  };
  return (
    <Screen
      title="경로 옵션"
      footer={
        <>
          <P tone="muted">저장된 지도(v{pkg.release.version})로 기기에서 계산해요. 지금의 통행 제한은 반영되지 않을 수 있어요.</P>
          <Btn label="경로 확인" disabled={!st || !dest} onPress={go} />
        </>
      }
    >
      <Card>
        <View style={s.line}>
          <Text style={s.k}>출발</Text>
          <Text style={s.v}>{startLabel}</Text>
        </View>
        <View style={s.line}>
          <Text style={[s.k, { color: T.primary }]}>도착</Text>
          <Text style={[s.v, { color: T.primary }]}>{dest ? `${dest.name}${destFloor ? ` · ${destFloor}` : ''}` : '고르지 않음'}</Text>
        </View>
        {st ? (
          <Btn kind="ghost" label="출발점 직접 지정" onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })} />
        ) : (
          <Btn kind="soft" label="출발점 정하기(현재 위치·장소)" onPress={() => router.push('/start')} />
        )}
      </Card>
      {nlp ? (
        <Card style={s.nlp}>
          <Text style={s.nlpT}>말씀하신 조건 · 「{nlp.text}」</Text>
          <View style={s.chips}>
            {nlp.chips.map((c) => (
              <Text key={c} style={[s.tag, c.startsWith('필수') && locked && s.tagMust]}>
                {c}
              </Text>
            ))}
          </View>
          {nlp.notes.map((n) => (
            <P key={n} tone="caution">
              {n}
            </P>
          ))}
        </Card>
      ) : null}
      <Section>이동 방식</Section>
      <View style={s.chips}>
        {MODES.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            on={app.condition === c.key}
            onPress={() => (effectiveCondition(c.key, mandatory) !== c.key ? setLockMsg(true) : app.setCondition(c.key))}
          />
        ))}
      </View>
      {locked ? (
        <Card tone="caution" style={{ gap: 6 }}>
          <P tone="caution">
            {lockMsg ? '필수 조건이라 다른 방식으로 바꾸지 않았어요. ' : ''}말씀하신 「{mustLabel}」는 필수 조건이에요. 그런 길이 없으면
            「경로 없음」으로 알려 드려요.
          </P>
          <Btn
            kind="ghost"
            label="필수 조건 풀기"
            onPress={() => {
              app.setNlp({ ...nlp!, mandatory: [], chips: nlp!.chips.filter((c) => !c.startsWith('필수')) });
              setLockMsg(false);
            }}
          />
        </Card>
      ) : null}
      <Card tone="primary">
        <Text style={s.ct}>{cond.label}</Text>
        <P>{cond.note}</P>
        {cond.device ? <P tone="muted">{cond.device}</P> : null}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  k: { width: 36, fontSize: T.body, fontWeight: '800', color: T.text },
  v: { flex: 1, fontSize: T.body, fontWeight: '700', color: T.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ct: { fontSize: T.body, fontWeight: '800', color: T.primary },
  nlp: { gap: 8 },
  nlpT: { fontSize: T.small, fontWeight: '800', color: T.text },
  tag: {
    fontSize: T.caption + 1,
    fontWeight: '700',
    color: T.primary,
    backgroundColor: T.primarySoft,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagMust: { backgroundColor: T.primary, color: '#FFFFFF' },
});
