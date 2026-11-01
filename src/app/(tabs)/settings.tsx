// CT13 설정: 언어, 자연어 검색, 화면 표시, 위치 권한 안내, 개인정보, 개발자 옵션 진입.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useApp } from '../../state/AppState';
import { Button, FloorItem } from '../../ui/components';
import { color } from '../../ui/theme';
import { Card, H, P, Screen, Section, TabScreen } from '../../ui/kit';
import { languageNames, translate, type Language } from '../../i18n/translations';
import { DEVELOPER_ACCESS_CODE, nextKoreanTap, unlockDeveloperAccess } from '../../settings/developerAccess';

export default function SettingsScreen() {
  const app = useApp();
  const taps = useRef(0);
  const [codeDialog, setCodeDialog] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
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
    if (!unlockDeveloperAccess(code)) return setCodeError(true);
    closeCodeDialog();
    router.push('/developer');
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
          </View>
          <Switch
            value={app.settings.naturalSearchDefault}
            onValueChange={(v) => app.updateSettings({ naturalSearchDefault: v })}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel={t('naturalDefault')}
          />
        </Card>
        <Section>{t('displaySettings')}</Section>
        <Card style={s.row}>
          <View style={{ flex: 1 }}>
            <P>{t('lightMode')}</P>
          </View>
          <Switch
            value={app.settings.light}
            onValueChange={(v) => app.updateSettings({ light: v })}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel={t('lightMode')}
          />
        </Card>
        <Section>{t('mapTheme')}</Section>
        <View style={s.chips}>
          {(
            [
              ['default', 'mapThemeDefault'],
              ['island', 'mapThemeIsland'],
              ['trek', 'mapThemeTrek'],
              ['pirate', 'mapThemePirate'],
            ] as const
          ).map(([value, label]) => (
            <FloorItem
              key={value}
              label={t(label)}
              state={app.settings.mapTheme === value ? 'selected' : 'idle'}
              onPress={() => void app.updateSettings({ mapTheme: value })}
            />
          ))}
        </View>
        <P tone="muted">{t('mapThemeNotice')}</P>
        <Card style={s.row}>
          <View style={{ flex: 1 }}>
            <P>{t('backgroundMotion')}</P>
          </View>
          <Switch
            value={app.settings.backgroundMotion}
            onValueChange={(v) => void app.updateSettings({ backgroundMotion: v })}
            trackColor={{ false: color.border, true: color.primary }}
            ios_backgroundColor={color.border}
            accessibilityLabel={t('backgroundMotion')}
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
    fontSize: 14,
    color: color.text,
  },
});
