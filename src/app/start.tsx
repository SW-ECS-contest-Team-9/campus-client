// CT04 출발점 확인: 현재 위치(확실할 때만) 또는 사용자가 고른 장소. 위치가 불확실하면 직접 고르게 함(제품 규칙 02).
import { router } from 'expo-router';
import { ChevronRight, CircleDot, MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { currentLocationLabel } from '../location/fix';
import { placeName, startLabel } from '../map/labels';
import { useApp } from '../state/AppState';
import { CampusMap } from '../ui/CampusMap';
import { Button } from '../ui/components';
import { Card, P, Screen } from '../ui/kit';
import { color, elevation, shape, type } from '../ui/theme';
import { translate } from '../i18n/translations';

export default function StartScreen() {
  const app = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(app.settings.language, key);
  const [startCardHeight, setStartCardHeight] = useState(0);
  if (!app.pkg) return null;
  const pkg = app.pkg;

  const st = app.start;
  const startTitle = startLabel(pkg, st, app.settings.language) || null;
  const displayedStartTitle = st && st.type !== 'place' && app.fix ? currentLocationLabel(pkg, app.fix, app.settings.language) : startTitle;
  const destinationTitle = app.destKey ? placeName(pkg, app.destKey, app.settings.language) : t('notSelectedYet');
  return (
    <Screen
      title={t('startCheck')}
      scroll={false}
      footer={<Button label={t('viewRoute')} disabled={!st} onPress={() => router.navigate('/preview')} />}
    >
      <P tone="muted">{t('chooseIfUnsure')}</P>
      <View style={s.map}>
        <CampusMap
          pickPlaces={false}
          minimal
          padding={{ top: startCardHeight + 24, bottom: 0 }}
          overlay={
            <View style={s.startOverlay} pointerEvents="box-none" onLayout={(event) => setStartCardHeight(event.nativeEvent.layout.height)}>
              <Card style={s.startCard}>
                <Pressable
                  style={({ pressed }) => [s.locationRow, s.originRow, pressed && s.originPressed]}
                  onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })}
                  hitSlop={{ top: 10, bottom: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('origin')}: ${displayedStartTitle ?? t('notSelectedYet')}`}
                  accessibilityHint={t('chooseStartingPoint')}
                >
                  <View style={[s.locationIcon, s.originIcon]}>
                    <CircleDot size={16} color={color.success} />
                  </View>
                  <Text style={[s.locationLabel, s.originLabel]}>{t('origin')}</Text>
                  <Text style={s.locationTitle} numberOfLines={1}>
                    {displayedStartTitle ?? t('notSelectedYet')}
                  </Text>
                  <ChevronRight size={16} color={color.secondary} />
                </Pressable>
                <View style={s.locationDivider} />
                <View style={s.locationRow} accessible accessibilityLabel={`${t('destination')}: ${destinationTitle}`}>
                  <View style={[s.locationIcon, s.destinationIcon]}>
                    <MapPin size={16} color={color.primary} />
                  </View>
                  <Text style={[s.locationLabel, s.destinationLabel]}>{t('destination')}</Text>
                  <Text style={s.locationTitle} numberOfLines={1}>
                    {destinationTitle}
                  </Text>
                </View>
              </Card>
            </View>
          }
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  map: { flex: 1, minHeight: 200, borderRadius: 28, overflow: 'hidden' },
  startOverlay: { position: 'absolute', top: 12, left: 12, right: 12 },
  startCard: { ...elevation.low, paddingVertical: 10, paddingHorizontal: 16, gap: 0, borderBottomLeftRadius: shape.card },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  originRow: { marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 12 },
  originPressed: { backgroundColor: color.successSoft },
  locationIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  originIcon: { backgroundColor: color.successSoft },
  destinationIcon: { backgroundColor: color.primarySoft },
  locationLabel: { fontSize: type.caption, lineHeight: 22, fontWeight: '700' },
  originLabel: { color: color.success },
  destinationLabel: { color: color.primary },
  locationTitle: { flex: 1, minWidth: 0, fontSize: type.small, lineHeight: 22, fontWeight: '600', color: color.text },
  locationDivider: { marginLeft: 32, marginVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
});
