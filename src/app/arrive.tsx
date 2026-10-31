import { localizedEntityName } from '../map/names-i18n';
// CT10 도착 확인.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { placeSubtitle } from '../map/labels';
import { useApp } from '../state/AppState';
import { useToast } from '../ui/feedback';
import { Button } from '../ui/components';
import { Card, H, P, Screen } from '../ui/kit';
import { Character, Gradient } from '../ui/v3';
import { color, gradient, type } from '../ui/theme';
import { translate, type MessageKey } from '../i18n/translations';

export default function ArriveScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const toast = useToast();
  const pkg = app.pkg;
  const dest = pkg?.places.find((p) => p.key === app.destKey);
  const fav = dest ? app.favorites.includes(dest.key) : false;
  if (!pkg) return null;
  return (
    <Screen
      title={t('confirmArrival')}
      footer={
        <>
          <Button
            label={t('arrivedEnd')}
            onPress={() => {
              app.setStart(null);
              app.setDestKey(null);
              router.dismissTo('/');
            }}
          />
          <Button variant="secondary" label={t('notThereYet')} onPress={() => router.push('/recheck')} />
          {dest ? (
            <Button
              variant="quiet"
              label={t(fav ? 'alreadySaved' : 'saveThisPlace')}
              onPress={() => {
                if (fav) return;
                void app.toggleFavorite(dest.key);
                toast(t('addedFavorite'));
              }}
            />
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
        {t('arrivedQuestion', { destination: dest ? localizedEntityName(dest, app.settings.language) : t('destination') })}
      </H>
      <P>{t('nearDestination')}</P>
      {dest ? (
        <Card>
          <Text style={s.k}>{placeSubtitle(pkg, dest.key, app.settings.language)}</Text>
          <Text style={s.v}>{localizedEntityName(dest, app.settings.language)}</Text>
          <P tone="muted">{t('floorMayDiffer')}</P>
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
