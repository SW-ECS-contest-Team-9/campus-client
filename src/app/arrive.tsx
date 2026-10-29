// CT10 도착 확인.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { displayName, placeSubtitle } from '../map/labels';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { Card, H, P, Screen } from '../ui/kit';
import { Character, Gradient } from '../ui/v3';
import { color, gradient, type } from '../ui/theme';

export default function ArriveScreen() {
  const app = useApp();
  const pkg = app.pkg;
  const dest = pkg?.places.find((p) => p.key === app.destKey);
  const fav = dest ? app.favorites.includes(dest.key) : false;
  if (!pkg) return null;
  return (
    <Screen
      title="도착 확인"
      footer={
        <>
          <Button
            label="도착했어요 · 안내 종료"
            onPress={() => {
              app.setStart(null);
              app.setDestKey(null);
              router.dismissTo('/');
            }}
          />
          <Button variant="secondary" label="아직이에요 · 위치 확인" onPress={() => router.push('/recheck')} />
          {dest ? (
            <Button variant="quiet" label={fav ? '저장한 장소예요' : '이 장소 저장'} onPress={() => !fav && app.toggleFavorite(dest.key)} />
          ) : null}
        </>
      }
    >
      <View style={s.mark}>
        <Gradient colors={gradient.mist} />
        <View style={s.halo} />
        <Character name="arrive" size={132} />
      </View>
      <H>
        {dest ? displayName(dest.name) : '목적지'}에{'\n'}도착하셨나요?
      </H>
      <P>목적지 근처예요. 건물·층·입구 표지를 확인해 주세요.</P>
      {dest ? (
        <Card>
          <Text style={s.k}>{placeSubtitle(pkg, dest.key)}</Text>
          <Text style={s.v}>{displayName(dest.name)}</Text>
          <P tone="muted">같은 건물이라도 다른 층일 수 있어요.</P>
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  // 축하 자리: 비대칭 덩어리(위 왼쪽 크게 둥근) 안에 축하 캐릭터(001, GIF)
  mark: {
    alignSelf: 'center',
    width: 176,
    height: 164,
    borderTopLeftRadius: 88,
    borderTopRightRadius: 64,
    borderBottomRightRadius: 88,
    borderBottomLeftRadius: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  halo: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(56,189,248,0.18)' },
  k: { fontSize: type.small, fontWeight: '700', color: color.primary },
  v: { fontSize: type.title, fontWeight: '800', color: color.text },
});
