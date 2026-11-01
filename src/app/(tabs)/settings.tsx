// CT13 설정: 자연어 검색, 화면 표시(가벼운 3D), 위치 권한 안내, 개인정보. 기기 등급·3D 엔진·서버 주소·측정은 개발 빌드에서만.
import { useRef, useState } from 'react';
import { Modal, StyleSheet, Switch, TextInput, View } from 'react-native';
import { DEFAULT_MAP3D_URL } from '../../map3d/commands';
import { get3dStats } from '../../map3d/diag';
import { DEFAULT_SERVER_URL, useApp } from '../../state/AppState';
import { Button, FloorItem } from '../../ui/components';
import { color, type } from '../../ui/theme';
import { Card, H, P, Screen, Section, TabScreen } from '../../ui/kit';
import { languageNames, translate, type Language } from '../../i18n/translations';
import { DEVELOPER_ACCESS_CODE, matchesDeveloperCode, nextKoreanTap } from '../../settings/developerAccess';

export default function SettingsScreen() {
  const app = useApp();
  const [server, setServer] = useState(app.settings.serverUrl);
  const [map3d, setMap3d] = useState(app.settings.map3dUrl);
  const [tracker, setTracker] = useState(app.settings.trackerUrl);
  const [stats] = useState(get3dStats);
  const taps = useRef(0);
  const [codeDialog, setCodeDialog] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [developerUnlocked, setDeveloperUnlocked] = useState(false);
  const aiOn = app.settings.aiParse;
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string>) => translate(app.settings.language, key, values);
  const chooseLanguage = (lang: Language) => {
    void app.updateSettings({ language: lang });
    taps.current = nextKoreanTap(taps.current, lang === 'ko');
    if (taps.current === 10) {
      taps.current = 0;
      setCode('');
      setCodeError(false);
      setCodeDialog(true);
    }
  };
  const closeCodeDialog = () => {
    setCodeDialog(false);
    setCode('');
    setCodeError(false);
  };
  const unlockDeveloper = () => {
    if (!matchesDeveloperCode(code, DEVELOPER_ACCESS_CODE)) return setCodeError(true);
    setDeveloperUnlocked(true);
    closeCodeDialog();
  };
  return (
    <TabScreen>
      <Screen title={t('settings')} back={false}>
        <Modal visible={codeDialog} transparent animationType="fade" onRequestClose={closeCodeDialog}>
          <View style={s.modalBackdrop}>
            <Card style={s.modalCard}>
              <H>{t('developerAccessTitle')}</H>
              <TextInput
                style={s.input}
                value={code}
                onChangeText={(value) => {
                  setCode(value);
                  setCodeError(false);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t('developerAccessCode')}
                placeholder={t('developerAccessCode')}
                onSubmitEditing={unlockDeveloper}
              />
              {codeError ? <P tone="caution">{t(DEVELOPER_ACCESS_CODE ? 'developerAccessInvalid' : 'developerAccessUnset')}</P> : null}
              <Button label={t('developerUnlock')} onPress={unlockDeveloper} />
              <Button variant="secondary" label={t('cancel')} onPress={closeCodeDialog} />
            </Card>
          </View>
        </Modal>
        <Section>{t('language')}</Section>
        <View style={s.chips}>
          {(Object.keys(languageNames) as Language[]).map((lang) => (
            <FloorItem
              key={lang}
              label={languageNames[lang]}
              state={app.settings.language === lang ? 'selected' : 'idle'}
              onPress={() => chooseLanguage(lang)}
            />
          ))}
        </View>
        {app.settings.language !== 'ko' ? <P tone="muted">{t('mapTranslationNotice')}</P> : null}
        <Section>{t('naturalSearch')}</Section>
        <Card style={s.row}>
          <View style={{ flex: 1 }}>
            <P>{t('naturalDefault')}</P>
            <P tone="muted">{t('naturalDescription')}</P>
          </View>
          <Switch
            value={app.settings.naturalSearchDefault}
            onValueChange={(v) => app.updateSettings({ naturalSearchDefault: v })}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel={t('naturalDefault')}
          />
        </Card>
        <Card style={s.row}>
          <View style={{ flex: 1 }}>
            <P>{t('aiAssist')}</P>
            <P tone="muted">{t('aiDescription')}</P>
            <P tone="muted">{app.aiModel ? t('modelReady', { state: t(aiOn ? 'enabled' : 'disabled') }) : t('modelMissing')}</P>
          </View>
          <Switch
            value={aiOn}
            onValueChange={(v) => app.updateSettings({ aiParse: v })}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel={t('aiAssist')}
          />
        </Card>
        <Section>{t('displaySettings')}</Section>
        <Card style={s.row}>
          <View style={{ flex: 1 }}>
            <P>{t('lightMode')}</P>
            <P tone="muted">{t('lightDescription')}</P>
          </View>
          <Switch
            value={app.settings.light}
            onValueChange={(v) => app.updateSettings({ light: v })}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel={t('lightMode')}
          />
        </Card>
        <Section>{t('locationPermission')}</Section>
        <Card>
          <P tone="muted">{t('locationPrivacy')}</P>
        </Card>
        <Section>{t('privacy')}</Section>
        <Card>
          <P tone="muted">{t('privacyDescription')}</P>
        </Card>
        {developerUnlocked ? (
          <>
            <H>{t('developer')}</H>
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
          </>
        ) : null}
      </Screen>
    </TabScreen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { gap: 12 },
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
