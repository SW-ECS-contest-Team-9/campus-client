// CT12 저장한 장소 + 최근 이용 경로.
import { router } from 'expo-router';
import { Building } from 'lucide-react-native';
import { displayName, placeSubtitle } from '../../map/labels';
import { beginRoute } from '../../location/goRoute';
import { useApp } from '../../state/AppState';
import { Button, ResultRow } from '../../ui/components';
import { H, P, Screen, Section, TabScreen } from '../../ui/kit';
import { modeInfo } from '../../route/modes';

export default function SavedScreen() {
  const app = useApp();
  const pkg = app.pkg;
  if (!pkg) return null;
  return (
    <TabScreen>
      <Screen title="저장한 장소" back={false}>
        <H>자주 가는 곳,{'\n'}한 번에 찾아가요.</H>
        {app.favorites.length ? (
          app.favorites.map((k) => {
            const p = pkg.places.find((x) => x.key === k);
            return (
              <ResultRow
                key={k}
                icon={Building}
                title={p ? displayName(p.name) : '없어진 장소'}
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
            <ResultRow
              key={r.at}
              title={`${r.startLabel} → ${d ? displayName(d.name) : '없어진 장소'}`}
              sub={`${modeInfo(r.condition).label} · ${r.at.slice(5, 10).replace('-', '월 ')}일`}
              onPress={
                d
                  ? () => {
                      app.setDestKey(d.key);
                      app.setCondition(r.condition);
                      beginRoute(pkg, app.graph, app.fix, { start: app.setStart });
                    }
                  : undefined
              }
            />
          );
        })}
        <Button
          variant={app.favorites.length ? 'secondary' : 'primary'}
          label="다른 장소 찾아보기"
          onPress={() => router.push('/search')}
        />
      </Screen>
    </TabScreen>
  );
}
