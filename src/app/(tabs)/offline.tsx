// CT11 오프라인 지도: 기기에 저장된 지도 꾸러미(버전·크기·날짜·범위)와 갱신. 3D 지도: 기본(네이티브)은 앱에 들어 있어 인터넷 없이, 웹 엔진은 인터넷 필요.
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApp } from '../../state/AppState';
import { Button, MapPackCard } from '../../ui/components';
import { AdvertisementBanner } from '../../ui/AdvertisementBanner';
import { Screen, TabScreen } from '../../ui/kit';
import { Character } from '../../ui/v3';
import { translate, type MessageKey } from '../../i18n/translations';

export default function OfflineScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const l = app.loaded;
  const pkg = app.pkg;
  const kb = useMemo(() => (pkg ? Math.round(JSON.stringify(pkg).length / 1024) : 0), [pkg]); // 지도 전체 직렬화: 렌더마다 하지 않음
  if (!l || !pkg) return null;
  const src = t(l.source === 'server' ? 'justDownloaded' : l.source === 'stored' ? 'storedOnDevice' : 'bundledMap');
  return (
    <TabScreen>
      <Screen title={t('offline')} back={false}>
        <View style={s.hero}>
          <Character name="offline" size={72} style={s.char} />
        </View>
        <MapPackCard
          state={l.source === 'fixture' ? 'queued' : 'stored'}
          title={t('campusMapVersion', { version: String(pkg.release.version) })}
          detail={t('mapDetail', { source: src, date: pkg.release.createdAt.slice(0, 10), size: String(kb) })}
        />
        <Button label={t('checkMapUpdate')} onPress={app.checkUpdate} />
        <AdvertisementBanner serverUrl={app.settings.serverUrl} />
      </Screen>
    </TabScreen>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  char: { marginVertical: -12 },
});
