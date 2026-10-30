// CT05 경로 확인: 출발·도착과 적용된 이동 조건을 표시. 조건 변경은 자연어 검색에서만.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { modeInfo } from '../route/modes';
import { hasRouteIndicators } from '../route/route';
import { displayName, floorCode, startLabel as startLabelOf } from '../map/labels';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { color, type } from '../ui/theme';
import { Card, P, Screen, Section } from '../ui/kit';

export default function OptionsScreen() {
  const app = useApp();
  if (!app.pkg) return null;
  const pkg = app.pkg;
  const st = app.start;
  const startLabel = startLabelOf(pkg, st) || '고르지 않음';
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const destFloor = floorCode(pkg, dest?.floorKey);
  const cond = modeInfo(app.condition);
  // 말로 정한 필수 조건(계단 없이·휠체어)은 다음 자연어 요청 전까지 유지
  const nlp = app.nlp;
  const mandatory = nlp?.mandatory ?? [];
  const locked = mandatory.length > 0;
  const mustLabel = app.condition === 'accessible' ? '휠체어·유모차' : '계단 없이';
  const go = () => {
    const r = app.route;
    if (!r) return;
    router.navigate(r.ok ? '/preview' : '/no-route');
  };
  return (
    <Screen
      title="경로 확인"
      footer={
        <>
          <P tone="muted">
            서버에 연결되면 서버에서, 아니면 저장된 지도(v{pkg.release.version})로 기기에서 계산해요. 지금의 통행 제한은 반영되지 않을 수
            있어요.
          </P>
          <Button label="경로 보기" disabled={!st || !dest} onPress={go} />
        </>
      }
    >
      <Card>
        <View style={s.line}>
          <Text style={s.k}>출발</Text>
          <Text style={s.v}>{startLabel}</Text>
        </View>
        <View style={s.line}>
          <Text style={[s.k, { color: color.primary }]}>도착</Text>
          <Text style={[s.v, { color: color.primary }]}>
            {dest ? `${displayName(dest.name)}${destFloor ? ` · ${destFloor}` : ''}` : '고르지 않음'}
          </Text>
        </View>
        {st ? (
          <Button
            variant="quiet"
            label="출발점 직접 지정"
            onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })}
          />
        ) : (
          <Button variant="secondary" label="출발점 정하기(현재 위치·장소)" onPress={() => router.push('/start')} />
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
      <Section>적용된 이동 조건</Section>
      {locked ? (
        <Card tone="caution" style={{ gap: 6 }}>
          <P tone="caution">말씀하신 「{mustLabel}」는 필수 조건이에요. 그런 길이 없으면 「경로 없음」으로 알려 드려요.</P>
        </Card>
      ) : null}
      <Card tone="primary">
        <Text style={s.ct}>{cond.label}</Text>
        <P>{cond.note}</P>
        {cond.device && !hasRouteIndicators(pkg) && !(app.route?.ok && app.route.source === 'server') ? (
          <P tone="muted">{cond.device}</P>
        ) : null}
      </Card>
      <P tone="muted">이동 조건을 바꾸려면 자연어 검색에서 원하는 길을 말씀해 주세요.</P>
      <Button
        variant="secondary"
        label="자연어로 조건 변경"
        onPress={() =>
          router.push({
            pathname: '/search',
            params: { mode: 'natural', q: nlp?.text ?? (dest ? displayName(dest.name) : '') },
          })
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  k: { width: 36, fontSize: type.body, fontWeight: '800', color: color.text },
  v: { flex: 1, fontSize: type.body, fontWeight: '700', color: color.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ct: { fontSize: type.body, fontWeight: '800', color: color.primary },
  nlp: { gap: 8 },
  nlpT: { fontSize: type.small, fontWeight: '800', color: color.text },
  tag: {
    fontSize: type.caption + 1,
    fontWeight: '700',
    color: color.primary,
    backgroundColor: color.primarySoft,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagMust: { backgroundColor: color.primary, color: '#FFFFFF' },
});
