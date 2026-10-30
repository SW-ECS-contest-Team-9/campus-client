import { StyleSheet, Text, View } from 'react-native';
import type { AppPreparation } from '../state/AppState';
import { color, type } from './theme';
import { Character } from './v3';

/** 병렬로 준비되는 항목 중 아직 끝나지 않은 첫 단계를 안내. */
export function preparationMessage(preparation: AppPreparation): string | null {
  if (!preparation.settingsReady) return '저장된 설정을 읽는 중...';
  if (!preparation.mapDataReady) return '지도 데이터를 준비하는 중...';
  // 실패하면 기존 지도 오류 안내와 재시도 단추가 보이도록 로딩 화면을 걷음.
  if (preparation.failed) return null;
  if (!preparation.sceneReady) return '3D 건물과 지형을 준비하는 중...';
  // 웹 엔진(null)은 첫 프레임 신호가 없으므로 장면 ready 를 완료 기준으로 사용.
  if (preparation.firstFrameReady === false) return '지도를 화면에 표시하는 중...';
  return null;
}

/** 기존 홈 로딩 화면의 모양을 유지하고, 준비 중인 지도 위에 표시. */
export function AppLoading({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <View style={s.loading} accessibilityViewIsModal>
      <Character name="loading" size={88} />
      <Text style={s.loadingT} accessibilityLiveRegion="polite">
        {message}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: color.canvas },
  loadingT: { fontSize: type.small, color: color.secondary, fontWeight: '600' },
});
