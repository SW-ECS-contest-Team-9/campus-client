import { Image, StyleSheet, Text, View } from 'react-native';
import type { AppPreparation } from '../state/AppState';
import { color, type } from './theme';
import { translate, type Language } from '../i18n/translations';

/** 병렬로 준비되는 항목 중 아직 끝나지 않은 첫 단계를 안내. */
export function preparationMessage(preparation: AppPreparation, language: Language = 'ko'): string | null {
  if (!preparation.settingsReady) return translate(language, 'loadingSettings');
  if (!preparation.mapDataReady) return translate(language, 'loadingMap');
  // 실패하면 기존 지도 오류 안내와 재시도 단추가 보이도록 로딩 화면을 걷음.
  if (preparation.failed) return null;
  if (!preparation.sceneReady) return translate(language, 'loading3d');
  // 웹 엔진(null)은 첫 프레임 신호가 없으므로 장면 ready 를 완료 기준으로 사용.
  if (preparation.firstFrameReady === false) return translate(language, 'loadingFrame');
  return null;
}

/** 기존 홈 로딩 화면의 모양을 유지하고, 준비 중인 지도 위에 표시. */
export function AppLoading({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <View style={s.loading} accessibilityViewIsModal>
      <Image
        source={require('../../assets/characters/loading.png')}
        style={{ width: 88, height: 88 }}
        resizeMode="contain"
        accessible={false}
      />
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
