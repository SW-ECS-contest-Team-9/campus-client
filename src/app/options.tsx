import { localizedEntityName } from '../map/names-i18n';
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
import { describe as describeRequest, planFromRequest } from '../nlp/apply';
import { translate, type MessageKey } from '../i18n/translations';

export default function OptionsScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  if (!app.pkg) return null;
  const pkg = app.pkg;
  const st = app.start;
  const startLabel = startLabelOf(pkg, st, app.settings.language) || t('notSelected');
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const destFloor = floorCode(pkg, dest?.floorKey);
  const cond = modeInfo(app.condition, app.settings.language);
  // 말로 정한 필수 조건(계단 없이·휠체어)은 다음 자연어 요청 전까지 유지
  const nlp = app.nlp;
  const nlpPlan = nlp ? planFromRequest(nlp.request, pkg, app.settings.language) : null;
  const mandatory = nlp?.mandatory ?? [];
  const locked = mandatory.length > 0;
  const mustLabel = modeInfo(app.condition === 'accessible' ? 'accessible' : 'avoidStairs', app.settings.language).label;
  const go = () => {
    const r = app.route;
    if (!r) return;
    router.navigate(r.ok ? '/preview' : '/no-route');
  };
  return (
    <Screen
      title={t('routeReview')}
      footer={
        <>
          <P tone="muted">{t('routeCalculationNotice', { version: String(pkg.release.version) })}</P>
          <Button label={t('viewRoute')} disabled={!st || !dest} onPress={go} />
        </>
      }
    >
      <Card>
        <View style={s.line}>
          <Text style={s.k}>{t('originShort')}</Text>
          <Text style={s.v}>{startLabel}</Text>
        </View>
        <View style={s.line}>
          <Text style={[s.k, { color: color.primary }]}>{t('destinationShort')}</Text>
          <Text style={[s.v, { color: color.primary }]}>
            {dest ? `${localizedEntityName(dest, app.settings.language)}${destFloor ? `, ${destFloor}` : ''}` : t('notSelected')}
          </Text>
        </View>
        {st ? (
          <Button
            variant="quiet"
            label={t('specifyStart')}
            onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })}
          />
        ) : (
          <Button variant="secondary" label={t('chooseStartLocation')} onPress={() => router.push('/start')} />
        )}
      </Card>
      {nlp ? (
        <Card style={s.nlp}>
          <Text style={s.nlpT}>{t('requestedPreferences', { text: nlp.text })}</Text>
          <View style={s.chips}>
            {describeRequest(nlp.request, pkg, app.settings.language).map((c) => (
              <Text key={c} style={[s.tag, c.startsWith(t('nlpRequired', { value: '' })) && locked && s.tagMust]}>
                {c}
              </Text>
            ))}
          </View>
          {(nlpPlan?.kind === 'go' ? nlpPlan.notes : []).map((n) => (
            <P key={n} tone="caution">
              {n}
            </P>
          ))}
        </Card>
      ) : null}
      <Section>{t('appliedPreferences')}</Section>
      {locked ? (
        <Card tone="caution" style={{ gap: 6 }}>
          <P tone="caution">{t('mandatoryNotice', { condition: mustLabel })}</P>
        </Card>
      ) : null}
      <Card tone="primary">
        <Text style={s.ct}>{cond.label}</Text>
        <P>{cond.note}</P>
        {cond.device && !hasRouteIndicators(pkg) && !(app.route?.ok && app.route.source === 'server') ? (
          <P tone="muted">{cond.device}</P>
        ) : null}
      </Card>
      <P tone="muted">{t('changeConditionHint')}</P>
      <Button
        variant="secondary"
        label={t('changeConditionNatural')}
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
