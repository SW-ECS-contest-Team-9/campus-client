// CT04 출발점 확인: 현재 위치(확실할 때만) 또는 사용자가 고른 장소. 위치가 불확실하면 직접 고르게 함(제품 규칙 02).
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { currentLocationLabel } from '../location/fix';
import { startFromFix } from '../location/start';
import { startLabel } from '../map/labels';
import { useApp } from '../state/AppState';
import { CampusMap } from '../ui/CampusMap';
import { Button, StatusChip } from '../ui/components';
import { Card, H, P, Screen } from '../ui/kit';
import { translate, type MessageKey } from '../i18n/translations';

export default function StartScreen() {
  const app = useApp();
  const t = (key: MessageKey) => translate(app.settings.language, key);
  const [msg, setMsg] = useState<MessageKey | null>(null);
  if (!app.pkg) return null;
  const pkg = app.pkg;

  // 위치 보정(통로 위로 끌린 점)의 그 길 가까운 끝 노드에서 출발. 불확실하면 직접 고르게 함(제품 규칙 02).
  const useHere = async () => {
    setMsg('readingLocation');
    if (!(await app.enableLocation())) return setMsg('locationDeniedStart');
    const fix = await app.waitFix(15000);
    if (!fix) return setMsg('locationUnavailable');
    if (fix.uncertain) return setMsg('locationInaccurate');
    // 걷는 면·광장 위면 그 자리에서, 아니면 가까운 길 끝에서
    const st = startFromFix(pkg, app.graph, fix, currentLocationLabel(pkg, fix, app.settings.language));
    if (!st) return setMsg('noNearbyPath');
    app.setStart(st);
    setMsg(null);
    router.replace('/preview');
  };
  const st = app.start;
  const startTitle = startLabel(pkg, st, app.settings.language) || null;
  const displayedStartTitle = st && st.type !== 'place' && app.fix ? currentLocationLabel(pkg, app.fix, app.settings.language) : startTitle;
  const tone = msg ? 'caution' : st && st.type !== 'place' ? 'confirmed' : 'primary';
  return (
    <Screen
      title={t('startCheck')}
      scroll={false}
      footer={
        <>
          <Button label={t('viewRoute')} disabled={!st} onPress={() => router.navigate('/preview')} />
          <View style={s.two}>
            <Button variant="secondary" label={t('readLocationAgain')} onPress={useHere} style={{ flex: 1 }} />
            <Button
              variant="secondary"
              label={t('choosePlace')}
              onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })}
              style={{ flex: 1 }}
            />
          </View>
        </>
      }
    >
      <H>{t('whereStart')}</H>
      <P tone="muted">{t('chooseIfUnsure')}</P>
      {msg ? <StatusChip tone="warning" label={t(msg)} /> : null}
      <View style={s.map}>
        <CampusMap pickPlaces={false} minimal />
      </View>
      <Card>
        <P tone="muted">{t(st && st.type !== 'place' ? 'startFromLocation' : st ? 'selectedStart' : 'chooseStartingPoint')}</P>
        <P>{displayedStartTitle ?? t('notSelectedYet')}</P>
        {st?.type === 'place' ? <P tone="muted">{t('manualLocationNotice')}</P> : null}
        {tone === 'confirmed' ? <StatusChip tone="confirmed" label={t('locationConfirmedShort')} /> : null}
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  map: { flex: 1, minHeight: 200, borderRadius: 28, borderBottomLeftRadius: 10, overflow: 'hidden' },
  two: { flexDirection: 'row', gap: 8 },
});
