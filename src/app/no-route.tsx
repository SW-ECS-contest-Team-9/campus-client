// ST02 조건에 맞는 경로 없음. 계단 피하기는 스스로 풀지 않고, 사용자가 고르게 한다(제품 규칙 04).
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useApp } from '../state/AppState';
import { Btn, Card, H, P, Screen, T } from '../ui/kit';

const COND_KO = { shortest: '최단', avoidStairs: '계단 피하기', preferElevator: '승강기 우선' } as const;

export default function NoRouteScreen() {
  const app = useApp();
  const r = app.route;
  const dest = app.pkg?.places.find((p) => p.key === app.destKey);
  const reason = r && !r.ok ? r.reason : 'no_route';
  const stairs = app.condition === 'avoidStairs';
  return (
    <Screen title="경로를 찾지 못했어요" footer={<>
      <Btn label="출발점·목적지 변경" onPress={() => router.replace('/start')} />
      {stairs ? <Btn kind="soft" label="계단 허용으로 조건 변경" onPress={() => { app.setCondition('shortest'); router.replace('/options'); }} /> : null}
    </>}>
      <Text style={s.icon}>↑↓</Text>
      <H>{reason === 'unknown_node' ? '출발점이나 목적지가 길에 붙어 있지 않아요.' : reason === 'same_point' ? '출발과 도착이 같아요.' : stairs ? '계단을 피하는 경로가\n연결되어 있지 않아요.' : '두 곳을 잇는 길이\n지도에 없어요.'}</H>
      <P>{dest ? `${dest.name}까지 ` : ''}{stairs ? '계단 없이 이어지는 길이 지금 지도에 없어요. 실제로는 길이 있어도 아직 지도에 그려지지 않았을 수 있어요.' : '지금 지도의 길이 서로 끊긴 곳이 있어요(지도 자료의 한계). 다른 출입구나 가까운 장소를 골라 보세요.'}</P>
      <Card tone="caution">
        <Text style={s.k}>선택한 조건: {COND_KO[app.condition]}</Text>
        <P>조건을 그대로 두고 있어요. 바꾸려면 아래에서 직접 골라 주세요.</P>
      </Card>
      {stairs ? <P tone="muted">계단 없는 경로가 있어도 휠체어 통행을 보장하지는 않아요. 폭·경사·문 확인이 필요해요.</P> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  icon: { fontSize: 34, color: T.caution, marginTop: 8 },
  k: { fontSize: T.body, fontWeight: '800', color: T.caution },
});
