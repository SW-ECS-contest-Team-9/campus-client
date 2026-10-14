// CT13 설정: 기본 이동 방식, 위치 권한 안내, 3D 표시(가벼운 모드), 서버·3D 페이지 주소(개발), 개인정보.
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { DEFAULT_MAP3D_URL } from '../map3d/embed';
import { DEFAULT_SERVER_URL, useApp } from '../state/AppState';
import { Btn, Card, Chip, H, P, Screen, Section, T } from '../ui/kit';

export default function SettingsScreen() {
  const app = useApp();
  const [server, setServer] = useState(app.settings.serverUrl);
  const [map3d, setMap3d] = useState(app.settings.map3dUrl);
  return (
    <Screen title="설정">
      <H>내 이동에 맞게</H>
      <Section>이동 경로(기본 조건)</Section>
      <View style={s.chips}>
        <Chip label="최단" on={app.condition === 'shortest'} onPress={() => app.setCondition('shortest')} />
        <Chip label="계단 피하기" on={app.condition === 'avoidStairs'} onPress={() => app.setCondition('avoidStairs')} />
        <Chip label="승강기 우선" on={app.condition === 'preferElevator'} onPress={() => app.setCondition('preferElevator')} />
      </View>
      <Section>화면 표시</Section>
      <Card style={s.row}>
        <View style={{ flex: 1 }}>
          <P>가벼운 3D 지도</P>
          <P tone="muted">구조물·이름표를 빼서 오래된 휴대폰에서도 부드럽게</P>
        </View>
        <Switch value={app.settings.light} onValueChange={(v) => app.updateSettings({ light: v })} trackColor={{ true: T.primary }} accessibilityLabel="가벼운 3D 지도" />
      </Card>
      <Section>위치 권한</Section>
      <Card><P tone="muted">"내 위치"를 누를 때만 위치를 읽어요. 위치 기록은 기기 밖으로 보내지 않아요.</P></Card>
      <Section>지도 서버(개발용)</Section>
      <TextInput style={s.input} value={server} onChangeText={setServer} placeholder={DEFAULT_SERVER_URL} autoCapitalize="none" autoCorrect={false} accessibilityLabel="지도 서버 주소" />
      <TextInput style={s.input} value={map3d} onChangeText={setMap3d} placeholder={DEFAULT_MAP3D_URL} autoCapitalize="none" autoCorrect={false} accessibilityLabel="3D 지도 주소" />
      <Btn label="주소 저장" onPress={() => app.updateSettings({ serverUrl: server.trim(), map3dUrl: map3d.trim() })} />
      <Btn kind="soft" label="지도 갱신 확인" onPress={app.checkUpdate} />
      {app.updateStatus ? <P tone="caution">{app.updateStatus}</P> : null}
      <Section>개인정보</Section>
      <Card><P tone="muted">저장한 장소·최근 경로·설정은 이 기기에만 있어요(계정 없음).</P></Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: T.line, backgroundColor: T.card, paddingHorizontal: 16, fontSize: T.small, color: T.text },
});
