// CT01 캠퍼스 지도(V3): 지도가 화면 전체(V3-1), 위에 검색 알약, 오른쪽 지도 단추, 아래 떠 있는 탭 캡슐.
// 지도 위 부품은 모두 overlay 로 공용 3D 지도와 함께 그림(3D 가 화면 위에 겹쳐 있어서).
import { router, useFocusEffect } from 'expo-router';
import { House, Layers, Navigation, type LucideIcon } from 'lucide-react-native';
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
  const inset = useSafeAreaInsets();
  const [locMsg, setLocMsg] = useState<string | null>(null);
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
    setLocMsg('위치 읽는 중…');
    app.setConfirmedFloor(null);
    if (!(await app.enableLocation())) setLocMsg('위치 권한이 없어요 · 출발점을 직접 골라 주세요');
    map.focusMe();
  };
  // 위치 보정 상태(통로에 맞춘 점). 불확실은 꼬리표일 뿐 점은 계속 통로 위에 있음.
  const fix = app.fix;
  const fixWhere =
    floorLabel(pkg, fix?.match?.floorKey) || (fix?.match?.buildingKey ? buildingName(pkg, fix.match.buildingKey) || '건물 안' : '바깥 길');
  const fixText = !fix
    ? locMsg
    : fix.uncertain
      ? `위치 불확실 · 가까운 통로에 표시 중`
      : fix.match?.onNetwork
        ? `내 위치(추정) · ${fixWhere}`
        : `내 위치 · 정확도 ${Math.round(fix.accuracyM ?? 0)} m`;
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
              <SearchInput onPress={() => router.navigate('/search')} />
              {fixText ? (
                <View pointerEvents="none" accessibilityLiveRegion="polite">
                  <StatusChip label={fixText} tone={fix && !fix.uncertain ? 'confirmed' : 'warning'} />
                </View>
              ) : null}
              {fix && noBaro && !app.confirmedFloor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이 휴대폰엔 기압계가 없어 층을 알 수 없어요. 지금 층 고르기"
                  onPress={() => router.navigate('/recheck')}
                  style={s.unsaved}
                >
                  <StatusChip label="기압계 없음 · 지금 층 고르기" tone="warning" />
                </Pressable>
              ) : null}
              {app.loaded?.source === 'fixture' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="저장된 지도 없음, 내장 개발 지도 사용 중. 자세히 보기"
                  onPress={() => router.navigate('/unsaved')}
                  style={s.unsaved}
                >
                  <StatusChip label="저장된 지도 없음" tone="warning" />
                </Pressable>
              ) : null}
            </View>
            <View style={[s.ctl, { bottom: ctlBottom }]} pointerEvents="box-none">
              {map.available ? (
                <>
                  <CtlButton
                    icon={Layers}
                    label={exploded ? '층 접기' : '층 펼치기(가운데 건물)'}
                    text="층"
                    on={exploded}
                    onPress={() => setExploded(map.toggleExplode())}
                  />
                  <CtlButton
                    icon={House}
                    label="처음 시점"
                    text="처음"
                    onPress={() => {
                      if (exploded) setExploded(map.toggleExplode());
                      map.home();
                    }}
                  />
                </>
              ) : null}
              <CtlButton icon={Navigation} label="내 위치" text="내 위치" onPress={locate} iconColor={color.route} />
            </View>
          </>
        }
      />
      <CoachMarks
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
