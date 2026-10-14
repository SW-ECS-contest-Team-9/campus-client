import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useApp } from '../state/AppState';

export default function SettingsScreen() {
  const app = useApp();
  const [url, setUrl] = useState(app.settings.serverUrl);
  const l = app.loaded;
  const src = l?.source === 'fixture' ? '내장 개발 자료' : l?.source === 'stored' ? '기기에 저장된 지도' : '서버에서 받음';
  return (
    <View style={s.root}>
      <Text style={s.h}>서버 주소</Text>
      <TextInput style={s.input} value={url} onChangeText={setUrl} placeholder="http://192.168.0.10:8000" autoCapitalize="none" autoCorrect={false} />
      <Pressable style={s.btn} onPress={() => app.setServerUrl(url)}><Text style={s.btnT}>저장</Text></Pressable>

      <Text style={s.h}>지도</Text>
      <Text style={s.t}>버전 v{l?.pkg.release.version} · {src}</Text>
      <Text style={s.t}>만든 날 {l?.pkg.release.createdAt} · 출처 {l?.pkg.release.source}</Text>
      <Text style={s.t}>장소 {l?.pkg.places.length} · 길 {l?.pkg.edges.length} · 층 {l?.pkg.floors.length}</Text>
      <Pressable style={s.btn} onPress={app.checkUpdate}><Text style={s.btnT}>지도 갱신 확인</Text></Pressable>
      {app.updateStatus ? <Text style={s.status}>{app.updateStatus}</Text> : null}
      <Text style={s.note}>즐겨찾기·설정은 이 기기에만 저장됩니다(계정 없음).</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 8 },
  h: { fontSize: 15, fontWeight: '700', marginTop: 8, color: '#111827' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnT: { color: '#fff', fontWeight: '600' },
  t: { fontSize: 13, color: '#374151' },
  status: { fontSize: 13, color: '#b45309' },
  note: { fontSize: 12, color: '#6b7280', marginTop: 12 },
});
