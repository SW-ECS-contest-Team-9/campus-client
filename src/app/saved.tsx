// CT12 저장한 장소 + 최근 이용 경로.
import { router } from 'expo-router';
import { Building } from 'lucide-react-native';
import { View } from 'react-native';
import { placeSubtitle, useApp } from '../state/AppState';
import { Btn, H, P, Row, Screen, Section, TabBar } from '../ui/kit';

const COND_KO = { shortest: '최단', avoidStairs: '계단 피하기', preferElevator: '승강기 우선' } as const;

export default function SavedScreen() {
  const app = useApp();
  const pkg = app.pkg;
  if (!pkg) return null;
  return (
    <View style={{ flex: 1 }}>
      <Screen title="저장한 장소" back={false}>
        <H>자주 가는 곳,{'\n'}한 번에 찾아가요.</H>
        {app.favorites.length ? (
          app.favorites.map((k) => {
            const p = pkg.places.find((x) => x.key === k);
            return (
              <Row
                key={k}
                icon={Building}
                title={p ? p.name : '없어진 장소'}
                sub={p ? placeSubtitle(pkg, k) : '지금 지도에 없음'}
                onPress={p ? () => router.push({ pathname: '/place/[key]', params: { key: k } }) : () => app.toggleFavorite(k)}
              />
            );
          })
        ) : (
          <P tone="muted">{'아직 저장한 장소가 없어요. 장소 화면에서 "장소 저장"을 누르세요.'}</P>
        )}
        {app.recentRoutes.length ? <Section>최근 이용 경로</Section> : null}
        {app.recentRoutes.map((r) => {
          const d = pkg.places.find((p) => p.key === r.destKey);
          return (
            <Row
              key={r.at}
              title={`${r.startLabel} → ${d?.name ?? '없어진 장소'}`}
              sub={`${COND_KO[r.condition]} · ${r.at.slice(5, 10).replace('-', '월 ')}일`}
              onPress={
                d
                  ? () => {
                      app.setDestKey(d.key);
                      app.setCondition(r.condition);
                      router.push('/start');
                    }
                  : undefined
              }
            />
          );
        })}
        <Btn kind={app.favorites.length ? 'soft' : 'primary'} label="다른 장소 찾아보기" onPress={() => router.push('/search')} />
      </Screen>
      <TabBar at="saved" />
    </View>
  );
}
