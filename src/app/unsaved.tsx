// ST01 저장되지 않은 지도: 서버에서 지도를 받은 적이 없어 앱에 들어 있는 개발 지도를 쓰는 중.
import { router } from 'expo-router';
import { Text } from 'react-native';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { Card, H, P, Screen } from '../ui/kit';
import { color, type } from '../ui/theme';
import { Character } from '../ui/v3';
import { translate, type MessageKey } from '../i18n/translations';

export default function UnsavedScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  return (
    <Screen
      title={t('mapNotSavedTitle')}
      footer={
        <>
          <Button label={t('goToOffline')} onPress={() => router.dismissTo('/offline')} />
          <Button variant="secondary" label={t('continueWithMap')} onPress={() => router.back()} />
        </>
      }
    >
      <Character name="offline" size={96} />
      <H>{t('mapNotDownloaded')}</H>
      <P>{t('bundledMapVersionNotice', { version: String(app.pkg?.release.version ?? '') })}</P>
      <Card>
        <P>{t('campusMap')}</P>
        <P tone="muted">{app.updateStatus ?? t('notDownloaded')}</P>
        <Text style={{ color: color.warning, fontWeight: '700', fontSize: type.small }}>{t('mapMayDiffer')}</Text>
      </Card>
      <Card tone="primary">
        <P>{t('availableNow')}</P>
        <P tone="muted">{t('bundledFeatures')}</P>
      </Card>
    </Screen>
  );
}
