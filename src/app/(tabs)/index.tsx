// CT01 캠퍼스 지도(V3): 지도가 화면 전체(V3-1), 위에 검색 알약, 오른쪽 지도 단추, 아래 떠 있는 탭 캡슐.
// 지도 위 부품은 모두 overlay 로 공용 3D 지도와 함께 그림(3D 가 화면 위에 겹쳐 있어서).
import { router, useFocusEffect } from 'expo-router';
import { House, Layers, Navigation, QrCode, type LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildingName, floorLabel } from '../../map/labels';
import { useApp } from '../../state/AppState';
import { CampusMap } from '../../ui/CampusMap';
import { preparationMessage } from '../../ui/AppLoading';
import { CoachMarks } from '../../ui/CoachMarks';
import { useMap3dControls } from '../../ui/Map3D';
import { IconButton, SearchInput, StatusChip } from '../../ui/components';
import { TAB_BAR_HEIGHT } from '../../ui/navigation';
import { color } from '../../ui/theme';
import { translate, type MessageKey } from '../../i18n/translations';

/** 지도 위 둥근 단추 + 2~3자 이름(초등학생도 뜻을 알게) */
function CtlButton({
  icon,
  label,
  text,
  onPress,
  on,
  iconColor,
}: {
  icon: LucideIcon;
  label: string;
  text: string;
  onPress: () => void;
  on?: boolean;
  iconColor?: string;
}) {
  return (
    <View style={s.ctlItem}>
      <IconButton icon={icon} label={label} tone={on ? 'primary' : 'surface'} onPress={onPress} iconColor={iconColor} />
      <Text style={s.ctlT}>{text}</Text>
    </View>
  );
}

export default function Home() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const inset = useSafeAreaInsets();
  const [locMsg, setLocMsg] = useState<MessageKey | null>(null);
  const [exploded, setExploded] = useState(false);
  const map = useMap3dControls();
  // 지도에서는 탭 방문 기록 대신 앱 종료. 화면을 떠나면 다른 화면의 뒤로가기에 맡긴다.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        BackHandler.exitApp();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );
  // 로딩 화면은 앱 뿌리에서 덮어 표시. 지도는 뒤에서 계속 준비해야 첫 프레임 신호를 받을 수 있음.
  if (!app.pkg) return null;
  const pkg = app.pkg;

  const locate = async () => {
    setLocMsg('readingLocation');
    app.setConfirmedFloor(null);
    if (!(await app.enableLocation())) setLocMsg('locationDeniedStart');
    map.focusMe();
  };
  // 위치 보정 상태(통로에 맞춘 점). 불확실은 꼬리표일 뿐 점은 계속 통로 위에 있음.
  const fix = app.fix;
  const fixWhere =
    floorLabel(pkg, fix?.match?.floorKey, app.settings.language) ||
    (fix?.match?.buildingKey ? buildingName(pkg, fix.match.buildingKey, app.settings.language) || t('indoorUnknown') : t('outdoorPath'));
  const fixText = !fix
    ? locMsg
      ? t(locMsg)
      : null
    : fix.uncertain
      ? t('locationUncertainPath')
      : fix.match?.onNetwork
        ? t('estimatedLocation', { place: fixWhere })
        : fix.accuracyM == null
          ? t('accuracyUnknown')
          : t('locationAccuracy', { accuracy: String(Math.round(fix.accuracyM)) });
  const noBaro = !!app.sensors && !app.sensors.baro;
  const bottom = inset.bottom + TAB_BAR_HEIGHT;
  // 지도 단추 세로 묶음(오른쪽, 하단 메뉴 위): 층 펼치기·처음 시점, 내 위치
  const ctlBottom = bottom + 12;

  return (
    <View style={s.root}>
      <CampusMap
        padding={{ top: inset.top + 110, bottom }}
        overlay={
          <>
            {/* 위: 검색 알약과 위치 상태 */}
            <View style={[s.top, { paddingTop: inset.top + 8, right: map.available ? 16 : 92 }]} pointerEvents="box-none">
              <SearchInput placeholder={t('searchDefault')} onPress={() => router.navigate('/search')} />
              {fixText ? (
                <View pointerEvents="none" accessibilityLiveRegion="polite">
                  <StatusChip label={fixText} tone={fix && !fix.uncertain ? 'confirmed' : 'warning'} />
                </View>
              ) : null}
              {fix && noBaro && !app.confirmedFloor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('noBarometerA11y')}
                  onPress={() => router.navigate('/recheck')}
                  style={s.unsaved}
                >
                  <StatusChip label={t('noBarometer')} tone="warning" />
                </Pressable>
              ) : null}
              {app.loaded?.source === 'fixture' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('noSavedMapA11y')}
                  onPress={() => router.navigate('/unsaved')}
                  style={s.unsaved}
                >
                  <StatusChip label={t('noSavedMap')} tone="warning" />
                </Pressable>
              ) : null}
            </View>
            <View style={[s.ctl, { bottom: ctlBottom }]} pointerEvents="box-none">
              {map.available ? (
                <>
                  <CtlButton
                    icon={Layers}
                    label={t(exploded ? 'collapseFloors' : 'expandFloors')}
                    text={t('layers')}
                    on={exploded}
                    onPress={() => setExploded(map.toggleExplode())}
                  />
                  <CtlButton
                    icon={House}
                    label={t('resetView')}
                    text={t('home')}
                    onPress={() => {
                      if (exploded) setExploded(map.toggleExplode());
                      map.home();
                    }}
                  />
                </>
              ) : null}
              <CtlButton icon={Navigation} label={t('myLocation')} text={t('myLocation')} onPress={locate} iconColor={color.route} />
              <CtlButton icon={QrCode} label={t('qrButtonA11y')} text={t('qrButton')} onPress={() => router.navigate('/qr-anchor')} />
            </View>
          </>
        }
      />
      <CoachMarks
        language={app.settings.language}
        visible={app.settingsLoaded && preparationMessage(app.preparation) === null && !app.settings.coachDone}
        onDone={() => void app.updateSettings({ coachDone: true })}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  // 오른쪽 위 88 dp 는 웹 3D 페이지 자체 단추(처음 시점·층 펼치기) 자리라 비움
  top: { position: 'absolute', left: 16, right: 92, top: 0, gap: 10 },
  unsaved: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  ctl: { position: 'absolute', right: 16, gap: 8, alignItems: 'center' },
  ctlItem: { alignItems: 'center', gap: 2 },
  ctlT: { fontSize: 11, fontWeight: '700', color: color.text },
});
