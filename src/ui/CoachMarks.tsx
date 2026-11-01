// 첫 실행 코치마크(R15·R20 사례: 3~5장, 한 번에 하나, "건너뛰기" 항상 보임, 진행 점). 지도 화면 위에 한 번만.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './components';
import { color, elevation, shape, space, type } from './theme';
import { translate, type Language } from '../i18n/translations';

const STEPS = [
  { title: 'coachDragTitle', body: 'coachDragBody' },
  { title: 'coachSheetTitle', body: 'coachSheetBody' },
  { title: 'coachSearchTitle', body: 'coachSearchBody' },
] as const;

export function CoachMarks({ visible, onDone, language = 'ko' }: { visible: boolean; onDone: () => void; language?: Language }) {
  const [i, setI] = useState(0);
  if (!visible) return null;
  const last = i === STEPS.length - 1;
  const step = STEPS[i];
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDone}>
      <View style={s.dim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate(language, 'skipIntro')}
          onPress={onDone}
          style={s.skip}
          hitSlop={12}
        >
          <Text style={s.skipT}>{translate(language, 'skip')}</Text>
        </Pressable>
        <View style={s.card} accessibilityLiveRegion="polite">
          <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {STEPS.map((_, k) => (
              <View key={k} style={[s.dot, k === i && s.dotOn]} />
            ))}
          </View>
          <Text style={s.title} accessibilityRole="header">
            {translate(language, step.title)}
          </Text>
          <Text style={s.body}>{translate(language, step.body)}</Text>
          <Button label={translate(language, last ? 'getStarted' : 'next')} onPress={() => (last ? onDone() : setI(i + 1))} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(20,27,58,0.55)', justifyContent: 'flex-end', padding: space[20], paddingBottom: 140 },
  skip: { position: 'absolute', top: 56, right: space[20], minHeight: space[48], justifyContent: 'center', paddingHorizontal: space[12] },
  skipT: { ...type.actionLabel, color: color.onPrimary },
  card: { backgroundColor: color.surface, borderRadius: shape.card, padding: space[20], gap: space[12], ...elevation.float },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.border },
  dotOn: { backgroundColor: color.primary, width: 20 },
  title: { fontSize: type.title - 2, fontWeight: '800', color: color.text },
  body: { fontSize: type.small, lineHeight: 22, color: color.secondary },
});
