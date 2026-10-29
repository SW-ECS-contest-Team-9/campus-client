// 첫 실행 코치마크(R15·R20 사례: 3~5장, 한 번에 하나, "건너뛰기" 항상 보임, 진행 점). 지도 화면 위에 한 번만.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './components';
import { color, elevation, shape, space, type } from './theme';

const STEPS = [
  { title: '지도를 끌어 보세요', body: '한 손가락으로 끌면 움직이고, 두 손가락으로 돌리거나 키울 수 있어요.' },
  { title: '아래 칸을 올려 보세요', body: '"어디로 갈까요?" 칸을 위로 끌면 저장한 곳과 최근 간 곳이 나와요.' },
  { title: '장소 찾기를 누르세요', body: '건물·강의실·편의점 이름으로 찾고, 바로 길 안내를 받을 수 있어요.' },
];

export function CoachMarks({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const [i, setI] = useState(0);
  if (!visible) return null;
  const last = i === STEPS.length - 1;
  const step = STEPS[i];
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDone}>
      <View style={s.dim}>
        <Pressable accessibilityRole="button" accessibilityLabel="설명 건너뛰기" onPress={onDone} style={s.skip} hitSlop={12}>
          <Text style={s.skipT}>건너뛰기</Text>
        </Pressable>
        <View style={s.card} accessibilityLiveRegion="polite">
          <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {STEPS.map((_, k) => (
              <View key={k} style={[s.dot, k === i && s.dotOn]} />
            ))}
          </View>
          <Text style={s.title} accessibilityRole="header">
            {step.title}
          </Text>
          <Text style={s.body}>{step.body}</Text>
          <Button label={last ? '시작하기' : '다음'} onPress={() => (last ? onDone() : setI(i + 1))} />
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
