import { localizedEntityName } from '../../map/names-i18n';
// CT12 저장한 장소 + 최근 이용 경로.
import { router } from 'expo-router';
import { Building } from 'lucide-react-native';
import { localizedStartLabel, placeSubtitle, startLabel } from '../../map/labels';
import { beginRoute } from '../../location/goRoute';
import { useApp } from '../../state/AppState';
import { Button, ResultRow } from '../../ui/components';
import { H, P, Screen, Section, TabScreen } from '../../ui/kit';
import { modeInfo } from '../../route/modes';
import { translate, type MessageKey } from '../../i18n/translations';

export default function SavedScreen() {
  const app = useApp();
  const t = (key: MessageKey) => translate(app.settings.language, key);
  const pkg = app.pkg;
  if (!pkg) return null;
  return (
    <TabScreen>
      <Screen title={t('savedTitle')} back={false}>
        <H>{t('savedHero')}</H>
        {app.favorites.length ? (
          app.favorites.map((k) => {
            const p = pkg.places.find((x) => x.key === k);
            return (
              <ResultRow
                key={k}
                icon={Building}
                title={p ? localizedEntityName(p, app.settings.language) : t('missingPlace')}
                sub={p ? placeSubtitle(pkg, k, app.settings.language) : t('missingOnMap')}
                onPress={p ? () => router.push({ pathname: '/place/[key]', params: { key: k } }) : () => app.toggleFavorite(k)}
              />
            );
          })
        ) : (
          <P tone="muted">{t('noFavorites')}</P>
        )}
        {app.recentRoutes.length ? <Section>{t('recentRoutes')}</Section> : null}
        {app.recentRoutes.map((r) => {
          const d = pkg.places.find((p) => p.key === r.destKey);
          return (
            <ResultRow
              key={r.at}
              title={`${r.start ? startLabel(pkg, r.start, app.settings.language) : localizedStartLabel(r.startLabel, app.settings.language)} → ${d ? localizedEntityName(d, app.settings.language) : t('missingPlace')}`}
              sub={`${modeInfo(r.condition, app.settings.language).label}, ${r.at.slice(0, 10)}`}
              onPress={
                d
                  ? () => {
                      app.setDestKey(d.key);
                      app.setCondition(r.condition);
                      beginRoute(pkg, app.graph, app.fix, { start: app.setStart }, app.settings.language);
                    }
                  : undefined
              }
            />
          );
        })}
        <Button
          variant={app.favorites.length ? 'secondary' : 'primary'}
          label={t('findOtherPlace')}
          onPress={() => router.push('/search')}
        />
      </Screen>
    </TabScreen>
  );
}
