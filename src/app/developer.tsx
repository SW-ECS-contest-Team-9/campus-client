// 빌드 종류와 관계없이 기기 등급·3D 엔진·서버 주소·진단을 조정하는 개발자 옵션 화면.
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { DEFAULT_MAP3D_URL } from '../map3d/commands';
import { get3dStats } from '../map3d/diag';
import { DEFAULT_SERVER_URL, useApp } from '../state/AppState';
import { Button, FloorItem } from '../ui/components';
import { color, type } from '../ui/theme';
import { Card, P, Screen, Section } from '../ui/kit';
import { translate } from '../i18n/translations';

export default function DeveloperScreen() {
  const app = useApp();
  const [server, setServer] = useState(app.settings.serverUrl);
  const [map3d, setMap3d] = useState(app.settings.map3dUrl);
  const [tracker, setTracker] = useState(app.settings.trackerUrl);
  const [stats] = useState(get3dStats);
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string>) => translate(app.settings.language, key, values);
  return (
    <Screen title={t('developerOptions')}>
      <Section>{t('diagnostics')}</Section>
      <P tone={app.aiModel ? 'muted' : 'caution'}>{t(app.aiModel ? 'modelReady' : 'modelMissing')}</P>
      <P tone="muted">{app.settings.serverUrl}</P>
      <Section>{t('guideSettings')}</Section>
      <Card style={s.row}>
        <View style={{ flex: 1 }}>
          <P>{t('guideStepControls')}</P>
          <P tone="muted">{t('guideStepControlsDescription')}</P>
        </View>
        <Switch
          value={app.settings.guideStepControls}
          onValueChange={(value) => app.updateSettings({ guideStepControls: value })}
          trackColor={{ false: color.border, true: color.primary }}
          ios_backgroundColor={color.border}
          accessibilityLabel={t('guideStepControls')}
        />
      </Card>
      <Section>{t('deviceTier')}</Section>
      <View style={s.chips}>
        <FloorItem
          label={t('autoTier', { tier: String(app.settings.autoTier ?? '-') })}
          state={app.settings.deviceTier == null ? 'selected' : 'idle'}
          onPress={() => app.updateSettings({ deviceTier: null })}
        />
        <FloorItem
          label={t('tier1')}
          state={app.settings.deviceTier === 1 ? 'selected' : 'idle'}
          onPress={() => app.updateSettings({ deviceTier: 1 })}
        />
        <FloorItem
          label={t('tier2')}
          state={app.settings.deviceTier === 2 ? 'selected' : 'idle'}
          onPress={() => app.updateSettings({ deviceTier: 2 })}
        />
        <FloorItem
          label={t('tier3')}
          state={app.settings.deviceTier === 3 ? 'selected' : 'idle'}
          onPress={() => app.updateSettings({ deviceTier: 3 })}
        />
      </View>
      <P tone="muted">{app.tier === 1 ? t('tier1Description') : app.tier === 2 ? t('tier2Description') : t('tier3Description')}</P>
      <Section>{t('mapEngine')}</Section>
      <View style={s.chips}>
        <FloorItem
          label={t('nativeEngine')}
          state={app.settings.map3dEngine !== 'web' ? 'selected' : 'idle'}
          onPress={() => app.updateSettings({ map3dEngine: 'native' })}
        />
        <FloorItem
          label={t('webEngine')}
          state={app.settings.map3dEngine === 'web' ? 'selected' : 'idle'}
          onPress={() => app.updateSettings({ map3dEngine: 'web' })}
        />
      </View>
      <P tone="muted">{app.settings.map3dEngine === 'web' ? t('webEngineDescription') : t('nativeEngineDescription')}</P>
      <Section>{t('developerMapServer')}</Section>
      <TextInput
        style={s.input}
        value={server}
        onChangeText={setServer}
        placeholder={DEFAULT_SERVER_URL}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t('mapServerAddress')}
      />
      <TextInput
        style={s.input}
        value={map3d}
        onChangeText={setMap3d}
        placeholder={DEFAULT_MAP3D_URL}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t('map3dAddress')}
      />
      <TextInput
        style={s.input}
        value={tracker}
        onChangeText={setTracker}
        placeholder={t('calibrationServerAddress')}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t('calibrationServerAddress')}
      />
      <Button
        label={t('saveAddresses')}
        onPress={() => app.updateSettings({ serverUrl: server.trim(), map3dUrl: map3d.trim(), trackerUrl: tracker.trim() })}
      />
      <Button variant="secondary" label={t('checkMapUpdate')} onPress={app.checkUpdate} />
      {app.updateStatus ? <P tone="caution">{app.updateStatus}</P> : null}
      {app.loaded ? (
        <Card>
          <P>{t('diagnostics')}</P>
          {app.loaded.source !== 'server' ? (
            <P tone="caution">{t(app.loaded.source === 'fixture' ? 'bundledBanner' : 'offlineBanner')}</P>
          ) : null}
          <P tone="muted">
            {t(app.loaded.source === 'server' ? 'justDownloaded' : app.loaded.source === 'stored' ? 'storedOnDevice' : 'bundledMap')}
          </P>
        </Card>
      ) : null}
      {stats.length ? (
        <>
          <Section>{t('diagnostics')}</Section>
          <Card>
            {stats.map((l) => (
              <P key={l} tone="muted">
                {l}
              </P>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    paddingHorizontal: 16,
    fontSize: type.small,
    color: color.text,
  },
});
