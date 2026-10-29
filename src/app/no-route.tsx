// ST02 조건에 맞는 경로 없음. 원인별(계단 피하기 / 길 끊김 / 길에 안 붙음 / 같은 곳) 문구와 다음 행동.
// 계단 피하기는 스스로 풀지 않고, 사용자가 고르게 한다(제품 규칙 04).
import { router } from 'expo-router';
import { ArrowUpDown, CircleAlert, MapPinOff } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { modeInfo } from '../route/modes';
import { noRouteCopy, type NoRouteAction } from '../route/noRouteCopy';
import { displayName } from '../map/labels';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { Card, H, P, Screen } from '../ui/kit';
import { color, type } from '../ui/theme';
import { Character } from '../ui/v3';

export default function NoRouteScreen() {
  const app = useApp();
  const r = app.route;
  const dest = app.pkg?.places.find((p) => p.key === app.destKey) ?? null;
  const copy = noRouteCopy({
    reason: r && !r.ok ? r.reason : 'no_route',
    condition: app.condition,
    destName: dest ? displayName(dest.name) : null,
    destAttached: !!dest?.nodeKey,
  });
  const building = dest?.buildingKey ? app.pkg?.buildings.find((b) => b.key === dest.buildingKey)?.name : undefined;
  const run = (a: NoRouteAction) => {
    if (a === 'change_start') router.replace('/start');
    else if (a === 'change_dest') router.replace('/search');
    else if (a === 'nearby_dest') router.replace({ pathname: '/search', params: building ? { q: building } : {} });
    else if (a === 'arrive') router.replace('/arrive');
    else {
      // 사용자가 직접 "계단 허용"을 고름 → 말로 정한 필수 조건(계단 없이)도 함께 풂
      if (app.nlp?.mandatory.length) app.setNlp({ ...app.nlp, mandatory: [] });
      app.setCondition('shortest');
      router.replace('/options');
    }
  };
  const Icon =
    copy.cause === 'stairs' || copy.cause === 'disconnected' ? ArrowUpDown : copy.cause === 'same_place' ? CircleAlert : MapPinOff;
  return (
    <Screen
      title="경로를 찾지 못했어요"
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
      <Card tone="caution">
        <Text style={s.k}>선택한 조건: {modeInfo(app.condition).label}</Text>
        <P>조건을 그대로 두고 있어요. 바꾸려면 아래에서 직접 골라 주세요.</P>
      </Card>
      {app.condition === 'avoidStairs' ? (
        <P tone="muted">계단 없는 경로가 있어도 휠체어 통행을 보장하지는 않아요. 폭·경사·시설 운영 확인이 필요해요.</P>
      ) : null}
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
  k: { fontSize: type.body, fontWeight: '800', color: color.warning },
});
