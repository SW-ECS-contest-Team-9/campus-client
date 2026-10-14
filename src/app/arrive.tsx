// CT10 도착 확인.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { placeSubtitle, useApp } from '../state/AppState';
import { Btn, Card, H, P, Screen, T } from '../ui/kit';

export default function ArriveScreen() {
  const app = useApp();
  const pkg = app.pkg!;
  const dest = pkg.places.find((p) => p.key === app.destKey);
  const fav = dest ? app.favorites.includes(dest.key) : false;
  return (
    <Screen title="도착 확인" footer={<>
      <Btn label="도착했어요 · 안내 종료" onPress={() => { app.setStart(null); app.setDestKey(null); router.replace('/'); }} />
      <Btn kind="soft" label="아직이에요 · 위치 확인" onPress={() => router.push('/recheck')} />
      {dest ? <Btn kind="ghost" label={fav ? '저장한 장소예요' : '이 장소 저장'} onPress={() => !fav && app.toggleFavorite(dest.key)} /> : null}
    </>}>
      <View style={s.mark}><Text style={s.markT}>✓</Text></View>
      <H>{dest?.name ?? '목적지'}에{'\n'}도착하셨나요?</H>
      <P>목적지 근처예요. 건물·층·입구 표지를 확인해 주세요.</P>
      {dest ? <Card>
        <Text style={s.k}>{placeSubtitle(pkg, dest.key)}</Text>
        <Text style={s.v}>{dest.name}</Text>
        <P tone="muted">같은 건물이라도 다른 층일 수 있어요.</P>
      </Card> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  mark: { alignSelf: 'center', width: 76, height: 76, borderRadius: 20, backgroundColor: T.confirmedSoft, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  markT: { fontSize: 36, color: T.confirmed },
  k: { fontSize: T.small, fontWeight: '700', color: T.primary },
  v: { fontSize: T.title, fontWeight: '800', color: T.text },
});
