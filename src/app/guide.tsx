// CT07 3D 지도 안내: 남은 시간·거리, 지금 할 일(단계), 3D 지도(경로 + 위치 따라가기), 도착 확인 / 안내 종료.
// 위치가 불확실하면 단계 안내 대신 위치 확인으로 보냄(제품 규칙 02). AR 은 넣지 않음.
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRouteFollower, distrustZones } from '../route/follow';
import { DEFAULT_GPS_DISTRUST } from '../location/matcher';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { floorCode } from '../map/labels';
import { minutesOf } from '../route/time';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { CampusMap } from '../ui/CampusMap';
import { FooterPanel, P, Screen } from '../ui/kit';
import { useRouteCommand } from '../ui/useRouteCommand';
import { Character, Gradient, Pulse, RouteDrawBar, WaveEdge } from '../ui/v3';
import { color, gradient, shape, space, type } from '../ui/theme';
import { translate, type MessageKey } from '../i18n/translations';
import { localizedEntityName } from '../map/names-i18n';
import { localizedStep } from '../route/step-i18n';
import { startFromCurrentFix } from '../location/start';

/** 경로 다시 찾기: 확실한 위치가 경로에서 약 5 보폭(0.7 m × 5) 넘게 벗어난 것이 연속 REROUTE_N 번이면(사용자 지시 2026-11-01) */
const REROUTE_DIST_M = 3.5;
const REROUTE_N = 2;
/** 다시 찾기 사이 최소 간격(ms): 위치가 튀어 경로가 계속 바뀌지 않게 */
const REROUTE_COOLDOWN_MS = 10_000;

export default function GuideScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const r = app.route;
  const cmd = useRouteCommand();
  const inset = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  // 단계는 이 화면만 씀. 경로가 바뀌면 처음 단계로.
  const [step0, setStep0] = useState(0);
  const [stepRoute, setStepRoute] = useState(r);
  if (stepRoute !== r) {
    setStepRoute(r);
    setStep0(0);
  }
  // 자동 진행: 보정 위치 → 경로 위 거리(m) → 그 거리가 든 단계. 손으로 넘긴 단계보다 앞일 때만 앞으로(뒤로는 안 감)
  const follower = useMemo(
    () =>
      r?.ok && app.pkg
        ? createRouteFollower(r.points, { zones: distrustZones(app.pkg.buildings, Object.keys(DEFAULT_GPS_DISTRUST)) })
        : null,
    [r, app.pkg],
  );
  const lastReroute = useRef(0);
  const offN = useRef(0);
  const { graph, setStart } = app;
  const language = app.settings.language;
  const stepEnds = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const s of r?.ok ? r.steps : []) out.push((acc += s.lengthM));
    return out;
  }, [r]);
  useEffect(() => {
    const f = app.fix;
    if (!follower || !f || f.uncertain || !app.pkg) return;
    const fk = app.confirmedFloor?.floorKey ?? f.match?.floorKey ?? null;
    const floorZ = fk ? (app.pkg.floors.find((x) => x.key === fk)?.floorZ ?? null) : null;
    const st = follower.update({ x: f.x, y: f.y, z: floorZ ?? f.match?.z ?? null, uncertain: f.uncertain, raw: null });
    // 경로 이탈(확실한 위치가 경로에서 약 5 보폭 넘게, 연속 2번): 지금 위치에서 같은 목적지로 다시 찾음 → 경로가 바뀌면 단계·추종기도 새로
    const off = st.status === 'offRoute' || (st.distM != null && st.distM > REROUTE_DIST_M);
    offN.current = off ? offN.current + 1 : 0;
    if (off && offN.current >= REROUTE_N) {
      const now = Date.now();
      if (now - lastReroute.current < REROUTE_COOLDOWN_MS) return;
      const next = startFromCurrentFix(app.pkg, graph, f, language);
      if (next) {
        lastReroute.current = now;
        offN.current = 0;
        setStart(next);
      }
      return;
    }
    if (st.status !== 'following' || st.m == null) return;
    const at = stepEnds.findIndex((end) => st.m! < end - 2); // 단계 끝 2 m 전부터 다음 단계
    const next = at < 0 ? stepEnds.length - 1 : at;
    setStep0((cur) => (next > cur ? next : cur)); // eslint-disable-line react-hooks/set-state-in-effect -- 위치가 올 때마다 단계 맞춤
  }, [app.fix, app.confirmedFloor, app.pkg, graph, setStart, language, follower, stepEnds]);
  if (!app.pkg || !r?.ok) return <Redirect href="/" />;
  const pkg = app.pkg;
  const i = Math.min(step0, r.steps.length - 1);
  const step = r.steps[i];
  const left = r.steps.slice(i).reduce((a, s) => a + s.lengthM, 0);
  // 남은 시간: 경로 걷는 시간(오르내림·승강기 포함)을 남은 길이 비율로
  const leftS = r.totalLengthM > 0 ? (r.durationS * left) / r.totalLengthM : 0;
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const unsure = !app.fix || app.fix.uncertain;
  const showStepControls = app.settings.guideStepControls;
  const isLastStep = i === r.steps.length - 1;
  const footer =
    showStepControls || isLastStep ? (
      <FooterPanel style={s.controls} onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
        <View style={s.two}>
          {showStepControls ? (
            <Button variant="secondary" label={t('previous')} disabled={i === 0} onPress={() => setStep0(i - 1)} style={{ flex: 1 }} />
          ) : null}
          {!isLastStep ? (
            <Button label={t('nextStep')} onPress={() => setStep0(i + 1)} style={{ flex: 2 }} />
          ) : (
            <Button label={t('confirmArrival')} onPress={() => router.navigate('/arrive')} style={{ flex: 2 }} />
          )}
        </View>
      </FooterPanel>
    ) : null;
  return (
    <Screen title={t('guiding')} scroll={false} headerAction={{ label: t('endGuidance'), onPress: () => router.dismissTo('/') }}>
      <View style={s.summary}>
        <Text style={s.min}>{t('approxMinutes', { minutes: String(minutesOf(leftS)) })}</Text>
        <P tone="muted">
          {t('distanceLeft', { distance: String(Math.round(left)) })}
          {dest?.floorKey ? `, ${t('destinationFloor', { floor: floorCode(pkg, dest.floorKey) ?? '' })}` : ''}
        </P>
      </View>
      {unsure && app.fix ? (
        <View style={[s.now, s.nowWarn]}>
          <View style={s.warnHead}>
            <Character name="uncertain" size={56} />
            <Text style={[s.nowT, { color: color.warning, flex: 1 }]}>{t('verifyLocation')}</Text>
          </View>
          <Text style={[s.nowS, { color: color.warning }]}>{t('guidancePaused')}</Text>
          <Button label={t('recheckLocation')} onPress={() => router.push('/recheck')} />
        </View>
      ) : (
        <Pulse trigger={i} style={s.now}>
          <Gradient colors={gradient.deep} />
          <Text style={s.nowT}>{localizedStep(step, app.settings.language, pkg)}</Text>
          <RouteDrawBar progress={(i + 1) / r.steps.length} height={5} />
          <Text style={s.nowS}>
            {t('guideProgress', {
              step: String(i + 1),
              total: String(r.steps.length),
              destination: dest ? localizedEntityName(dest, app.settings.language) : '',
              minutes: String(minutesOf(leftS)),
            })}
          </Text>
        </Pulse>
      )}
      <View style={[s.map, { marginBottom: -inset.bottom }]}>
        <CampusMap
          commands={[cmd]}
          pickPlaces={false}
          minimal
          padding={{ top: 20, bottom: (footer ? footerHeight : 0) + 20 }}
          overlay={
            <>
              <WaveEdge color="#F0F2FE" flip height={16} />
              {footer}
            </>
          }
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.surface },
  now: {
    backgroundColor: gradient.deep[1],
    borderRadius: shape.card,
    borderBottomLeftRadius: shape.tail,
    padding: 18,
    gap: 8,
    overflow: 'hidden',
  },
  nowWarn: { backgroundColor: color.warningSoft },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nowT: { color: '#fff', fontSize: type.title - 2, fontWeight: '800', lineHeight: 28 },
  nowS: { color: '#C9D3E0', fontSize: type.caption + 1 },
  map: { flex: 1, minHeight: 180, marginHorizontal: -space[20] },
  summary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  min: { fontSize: type.display - 2, fontWeight: '800', color: color.text },
  two: { flexDirection: 'row', gap: 8 },
});
