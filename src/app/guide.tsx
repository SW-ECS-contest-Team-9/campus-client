// CT07 3D 지도 안내: 지금 할 일(단계), 현재 위치 층(추정)과 확인, 3D 지도(경로 + 위치 따라가기), 남은 시간, 도착 확인 / 안내 종료.
// 위치가 불확실하면 단계 안내 대신 위치 확인으로 보냄(제품 규칙 02). AR 은 넣지 않음.
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { displayName, floorCode, floorLabel } from '../map/labels';
import { minutesOf } from '../route/time';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { CampusMap } from '../ui/CampusMap';
import { FloorCapsule } from '../ui/FloorCapsule';
import { P, Screen } from '../ui/kit';
import { useMap3dControls } from '../ui/Map3D';
import { useRouteCommand } from '../ui/useRouteCommand';
import { Character, Gradient, Pulse, RouteDrawBar, WaveEdge } from '../ui/v3';
import { color, gradient, shape, space, type } from '../ui/theme';

export default function GuideScreen() {
  const app = useApp();
  const ctl = useMap3dControls();
  const r = app.route;
  const cmd = useRouteCommand();
  // 단계는 이 화면만 씀. 경로가 바뀌면 처음 단계로.
  const [step0, setStep0] = useState(0);
  const [stepRoute, setStepRoute] = useState(r);
  if (stepRoute !== r) {
    setStepRoute(r);
    setStep0(0);
  }
  if (!app.pkg || !r?.ok) return <Redirect href="/" />;
  const pkg = app.pkg;
  const i = Math.min(step0, r.steps.length - 1);
  const step = r.steps[i];
  const left = r.steps.slice(i).reduce((a, s) => a + s.lengthM, 0);
  // 남은 시간: 경로 걷는 시간(오르내림·승강기 포함)을 남은 길이 비율로
  const leftS = r.totalLengthM > 0 ? (r.durationS * left) / r.totalLengthM : 0;
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const cf = app.confirmedFloor;
  const cfText = cf ? floorLabel(pkg, cf.floorKey) : null;
  const unsure = !app.fix || app.fix.uncertain;
  // 위치 보정이 고른 층(추정). 확인한 층·단계 층과 섞지 않음
  const fixFloor = floorLabel(pkg, app.fix?.match?.floorKey) || null;
  // 보는 층·경로 단계의 층·내가 확인한 층을 섞지 않음(제품 규칙 01): 확인한 층이 없으면 "단계 기준"이라고 밝힘
  const where = unsure
    ? app.fix
      ? '현재 위치 불확실'
      : '현재 위치 모름'
    : cfText
      ? `내 위치: ${cfText} (내가 확인함)`
      : fixFloor
        ? `내 위치: ${fixFloor} (추정) · 층 확인`
        : `이 단계 출발: ${step.fromFloor ?? '바깥'} · 내 층 확인`;
  return (
    <Screen
      title="안내 중"
      scroll={false}
      footer={
        <>
          <View style={s.two}>
            <Button variant="secondary" label="이전" disabled={i === 0} onPress={() => setStep0(i - 1)} style={{ flex: 1 }} />
            {i < r.steps.length - 1 ? (
              <Button label="다음 단계" onPress={() => setStep0(i + 1)} style={{ flex: 2 }} />
            ) : (
              <Button label="도착 확인" onPress={() => router.navigate('/arrive')} style={{ flex: 2 }} />
            )}
          </View>
          {/* 걸으며 1인칭: 보정 위치(길 쪽으로 끌어당긴 위치)를 경로 위에서 따라감 */}
          {ctl.available ? (
            <Button
              variant="secondary"
              label="1인칭으로 따라가기"
              onPress={() => router.push({ pathname: '/first-person', params: { mode: 'follow' } })}
            />
          ) : null}
          <Button variant="quiet" label="안내 종료" onPress={() => router.dismissTo('/')} />
        </>
      }
    >
      {unsure && app.fix ? (
        <View style={[s.now, s.nowWarn]}>
          <View style={s.warnHead}>
            <Character name="uncertain" size={56} />
            <Text style={[s.nowT, { color: color.warning, flex: 1 }]}>현재 위치를 확인해 주세요</Text>
          </View>
          <Text style={[s.nowS, { color: color.warning }]}>방향 안내를 잠시 멈췄어요 · 건물과 층을 확인하면 이어서 안내해요</Text>
          <Button label="위치 다시 확인" onPress={() => router.push('/recheck')} />
        </View>
      ) : (
        <Pulse trigger={i} style={s.now}>
          <Gradient colors={gradient.deep} />
          <Text style={s.nowT}>{step.text}</Text>
          <RouteDrawBar progress={(i + 1) / r.steps.length} height={5} />
          <Text style={s.nowS}>
            {i + 1}/{r.steps.length}단계 · {dest ? displayName(dest.name) : ''} · 약 {minutesOf(leftS)}분 남음
          </Text>
        </Pulse>
      )}
      <Pressable accessibilityRole="button" style={s.where} onPress={() => router.push('/recheck')}>
        <Text style={s.whereT}>{where}</Text>
      </Pressable>
      <View style={s.map}>
        <CampusMap
          commands={[cmd]}
          routePoints={r.points}
          pickPlaces={false}
          minimal
          padding={{ top: 68, bottom: 20 }}
          overlay={
            <>
              <FloorCapsule buildingKey={dest?.buildingKey} style={s.floors} />
              <WaveEdge color="#F0F2FE" flip height={16} />
              <WaveEdge color="#ECF1FE" height={16} />
            </>
          }
        />
      </View>
      <View style={s.foot}>
        <Text style={s.min}>약 {minutesOf(leftS)}분</Text>
        <P tone="muted">
          {Math.round(left)} m 남음{dest?.floorKey ? ` · 목적지 ${floorCode(pkg, dest.floorKey)}` : ''}
        </P>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  floors: { position: 'absolute', left: 12, right: 96, top: 14, alignSelf: 'flex-start' },
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
  where: {
    minHeight: space[48],
    borderRadius: shape.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(49,46,129,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  whereT: { color: color.primary, fontWeight: '700', fontSize: type.small },
  map: { flex: 1, minHeight: 180, marginHorizontal: -space[20] },
  foot: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  min: { fontSize: type.display - 2, fontWeight: '800', color: color.text },
  two: { flexDirection: 'row', gap: 8 },
});
