import { localizedEntityName } from '../map/names-i18n';
// ST02 조건에 맞는 경로 없음. 원인별(계단 피하기 / 길 끊김 / 길에 안 붙음 / 같은 곳) 문구와 다음 행동.
// 이동 조건은 유지하고, 바꾸려면 자연어 검색에서 새 요청을 입력한다.
import { router } from 'expo-router';
import { ArrowUpDown, CircleAlert, MapPinOff } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { modeInfo } from '../route/modes';
import { noRouteCopy, type NoRouteAction } from '../route/noRouteCopy';
import { displayName } from '../map/labels';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { H, P, Screen } from '../ui/kit';
import { color } from '../ui/theme';
import { Character } from '../ui/v3';
import { translate, type MessageKey } from '../i18n/translations';
import { localizedNoRoute } from '../route/noRouteCopy-i18n';

export default function NoRouteScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const r = app.route;
  const dest = app.pkg?.places.find((p) => p.key === app.destKey) ?? null;
  const rawCopy = noRouteCopy({
    reason: r && !r.ok ? r.reason : 'no_route',
    condition: app.condition,
    destName: dest ? displayName(dest.name) : null,
    destAttached: !!dest?.nodeKey,
  });
  const copy = localizedNoRoute(
    rawCopy,
    app.condition,
    dest ? localizedEntityName(dest, app.settings.language) : null,
    app.settings.language,
  );
  const building = dest?.buildingKey ? app.pkg?.buildings.find((b) => b.key === dest.buildingKey)?.name : undefined;
  const run = (a: NoRouteAction) => {
    if (a === 'change_start') router.replace('/start');
    else if (a === 'change_dest') router.replace('/search');
    else if (a === 'nearby_dest') router.replace({ pathname: '/search', params: building ? { q: building } : {} });
    else if (a === 'arrive') router.replace('/arrive');
    else if (a === 'change_condition')
      router.push({
        pathname: '/search',
        params: { mode: 'natural', q: app.nlp?.text ?? (dest ? displayName(dest.name) : '') },
      });
  };
  const Icon =
    copy.cause === 'stairs' || copy.cause === 'disconnected' ? ArrowUpDown : copy.cause === 'same_place' ? CircleAlert : MapPinOff;
  return (
    <Screen
      title={t('routeNotFound')}
      footer={
        <>
          <Button label={copy.primary.label} onPress={() => run(copy.primary.action)} />
          {copy.secondary ? <Button variant="secondary" label={copy.secondary.label} onPress={() => run(copy.secondary!.action)} /> : null}
        </>
      }
    >
      <View style={s.icon}>
        <Character name="noRoute" size={96} />
        <View style={s.badge}>
          <Icon size={18} color={color.warning} strokeWidth={2.2} />
        </View>
      </View>
      <H>{copy.title}</H>
      <P>{copy.body}</P>
      <P tone="muted">{t('currentPreference', { condition: modeInfo(app.condition, app.settings.language).label })}</P>
      {app.condition === 'avoidStairs' ? <P tone="muted">{t('stairsAccessibilityCaution')}</P> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  icon: { marginTop: 4, alignSelf: 'flex-start' },
  badge: {
    position: 'absolute',
    right: -6,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
