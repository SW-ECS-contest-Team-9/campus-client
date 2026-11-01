// CT06 경로 미리보기: 3D 지도에 경로(층 바뀌는 곳 표시), 요약(시간·길이·계단·층 이동), 안내 시작.
// 경로는 서버가 닿으면 고른 방식의 서버 계산, 아니면 기기 계산(AppState.route).
import { Redirect, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { startLabel as startLabelOf } from '../map/labels';
import { modeInfo } from '../route/modes';
import { hasRouteIndicators } from '../route/route';
import { minutesOf } from '../route/time';
import { useApp } from '../state/AppState';
import { CampusMap } from '../ui/CampusMap';
import { color, space, type } from '../ui/theme';
import { FloorCapsule } from '../ui/FloorCapsule';
import { Button, StatusChip } from '../ui/components';
import { P, Screen } from '../ui/kit';
import { useRouteCommand } from '../ui/useRouteCommand';
import { Glass, RouteDrawBar, WaveEdge } from '../ui/v3';
import { Footprints } from 'lucide-react-native';
import { translate, type MessageKey } from '../i18n/translations';

export default function PreviewScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const r = app.route;
  const server = app.serverRoute;
  const cmd = useRouteCommand();
  const pkg = app.pkg;
  const dest = pkg?.places.find((p) => p.key === app.destKey);
  const st = app.start;
  if (!pkg || !r)
    return (
      <Screen title={t('routePreview')}>
        <P>{t('selectEndpoints')}</P>
      </Screen>
    );
  if (!r.ok) return <Redirect href="/no-route" />;
  const stairs = r.steps.filter((s) => s.kind === 'stairs').length;
  const changes = r.steps.filter((s) => s.floorChange);
  const startLabel = startLabelOf(pkg, st, app.settings.language);
  const fromServer = r.source === 'server';
  // 기기 계산인데 꾸러미에 지붕·조명 지표가 없으면 이 방식은 일부만 반영됨
  const partial = !fromServer && !hasRouteIndicators(pkg) ? modeInfo(app.condition, app.settings.language).device : null;
  return (
    <Screen
      title={t('routePreview')}
      scroll={false}
      footer={
        <View style={s.two}>
          <Button
            variant="secondary"
            label={t('origin')}
            onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })}
            style={{ flex: 1 }}
          />
          <Button
            label={t('startGuidance')}
            onPress={() => {
              if (dest && startLabel)
                app.addRecentRoute({
                  startLabel,
                  start: st ?? undefined,
                  destKey: dest.key,
                  condition: app.condition,
                  at: new Date().toISOString(),
                });
              router.navigate('/guide');
            }}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      <View style={s.map}>
        <CampusMap
          commands={[cmd]}
          pickPlaces={false}
          minimal
          padding={{ top: 72, bottom: 236 }}
          overlay={
            <>
              <FloorCapsule buildingKey={dest?.buildingKey} style={s.floors} />
              <WaveEdge color="#F2F3FD" flip height={18} />
              <Glass style={s.sum}>
                <View style={s.sumHead}>
                  <Footprints size={18} color={color.primary} />
                  <Text style={s.kind}>{modeInfo(app.condition, app.settings.language).title}</Text>
                  <Text style={s.note}>{modeInfo(app.condition, app.settings.language).note}</Text>
                </View>
                <Text style={s.t}>
                  {t('approxMinutes', { minutes: String(minutesOf(r.durationS)) })}{' '}
                  <Text style={s.len}>, {Math.round(r.totalLengthM)} m</Text>
                </Text>
                <RouteDrawBar />
                <P tone="muted">{t('routeCounts', { stairs: String(stairs), floors: String(changes.length) })}</P>
              </Glass>
            </>
          }
        />
      </View>
      {fromServer || partial || (server && !server.ok && server.code === 'no_route') ? (
        <View style={s.below}>
          {fromServer ? <StatusChip tone="confirmed" label={t('calculatedOnServer')} /> : null}
          {partial ? <P tone="muted">{partial}</P> : null}
          {server && !server.ok && server.code === 'no_route' ? <P tone="muted">{t('serverNoRoute')}</P> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  floors: { position: 'absolute', left: 12, right: 96, top: 14, alignSelf: 'flex-start' },
  map: { flex: 1, marginHorizontal: -space[20] },
  sum: { position: 'absolute', left: 16, right: 16, bottom: 16, padding: 18, gap: 8 },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { flexShrink: 0, fontSize: type.small, fontWeight: '800', color: color.primary },
  note: { flex: 1, minWidth: 0, marginLeft: 4, fontSize: type.caption, lineHeight: 20, color: color.secondary },
  t: { fontSize: type.display - 2, fontWeight: '800', color: color.text, letterSpacing: -0.5 },
  len: { fontSize: type.body, fontWeight: '700', color: color.secondary },
  below: { gap: 6, paddingTop: 10 },
  two: { flexDirection: 'row', gap: 8 },
});
