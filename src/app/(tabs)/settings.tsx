// CT13 설정: 언어, 자연어 검색, 화면 표시, 위치 권한 안내, 개인정보, 개발자 옵션 진입.
import { router } from 'expo-router';
import { StyleSheet, Switch, View } from 'react-native';
import { useApp } from '../../state/AppState';
import { Button, FloorItem } from '../../ui/components';
import { color } from '../../ui/theme';
import { Card, P, Screen, Section, TabScreen } from '../../ui/kit';
import { languageNames, translate, type Language } from '../../i18n/translations';

export default function SettingsScreen() {
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string>) => translate(app.settings.language, key, values);
  return (
    <TabScreen>
      <Screen title={t('settings')} back={false}>
        <Section>{t('language')}</Section>
        <View style={s.chips}>
          {(Object.keys(languageNames) as Language[]).map((lang) => (
            <FloorItem
              key={lang}
              label={languageNames[lang]}
              state={app.settings.language === lang ? 'selected' : 'idle'}
              onPress={() => void app.updateSettings({ language: lang })}
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
        <Button variant="secondary" label={t('developerOptions')} onPress={() => router.push('/developer')} />
      </Screen>
    </TabScreen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
