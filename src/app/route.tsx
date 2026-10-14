import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getFix, nearestOutdoorNode, snapToNetwork } from '../location/location';
import type { RouteCondition } from '../route/route';
import { useApp } from '../state/AppState';
import { MapView } from '../ui/MapView';

const CONDS: { key: RouteCondition; label: string }[] = [
  { key: 'shortest', label: '최단' },
  { key: 'avoidStairs', label: '계단 피하기' },
  { key: 'preferElevator', label: '승강기 우선' },
];

export default function RouteScreen() {
  const app = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  if (!app.pkg) return null;
  const pkg = app.pkg;
  const placeName = (k: string | null) => (k ? pkg.places.find((p) => p.key === k)?.name ?? '없어진 장소' : null);
  const startLabel = app.start ? (app.start.type === 'place' ? placeName(app.start.placeKey) : app.start.label) : null;

  const fromHere = async () => {
    setMsg('위치 읽는 중…');
    let f = app.fix;
    try {
      f = (await getFix()) ?? null;
    } catch {
      f = null;
    }
    if (!f) return setMsg('위치를 못 읽음 — 출발 장소를 직접 고르세요');
    app.setFix(f);
    if (f.uncertain) return setMsg(`위치 불확실 (${f.reason}) — 출발 장소를 직접 고르세요`);
    const snapped = snapToNetwork(f, pkg); // 지금은 원래 점 그대로
    const n = nearestOutdoorNode(pkg, snapped.x, snapped.y);
    if (!n) return setMsg('가까운 길이 50 m 안에 없음 — 출발 장소를 직접 고르세요');
    app.setStart({ type: 'node', nodeKey: n.key, label: `현재 위치 (길까지 ${Math.round(n.distM)} m)` });
    setMsg(null);
  };

  const r = app.route;
  const nodes = new Map(pkg.nodes.map((n) => [n.key, n]));
  const focus = r?.ok ? r.nodeKeys.map((k) => nodes.get(k)!).filter(Boolean) : undefined;
  return (
    <View style={s.root}>
      <View style={s.form}>
        <View style={s.row}>
          <Text style={s.lab}>출발</Text>
          <Text style={s.val} numberOfLines={1}>{startLabel ?? '고르지 않음'}</Text>
        </View>
        <View style={s.row}>
          <Pressable style={s.small} onPress={() => router.push({ pathname: '/search', params: { mode: 'start' } })}><Text style={s.smallT}>장소로 고르기</Text></Pressable>
          <Pressable style={s.small} onPress={fromHere}><Text style={s.smallT}>현재 위치</Text></Pressable>
        </View>
        {msg ? <Text style={s.warn}>{msg}</Text> : null}
        <View style={s.row}>
          <Text style={s.lab}>도착</Text>
          <Text style={s.val} numberOfLines={1}>{placeName(app.destKey) ?? '고르지 않음'}</Text>
          <Pressable style={s.small} onPress={() => router.push({ pathname: '/search', params: { mode: 'dest' } })}><Text style={s.smallT}>고르기</Text></Pressable>
        </View>
        <View style={s.row}>
          {CONDS.map((c) => (
            <Pressable key={c.key} style={[s.chip, app.condition === c.key && s.on]} onPress={() => app.setCondition(c.key)}>
              <Text style={[s.chipT, app.condition === c.key && s.onT]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {r && !r.ok ? <Text style={s.none}>{r.message === '길 없음' ? '길 없음' : `길 없음 · ${r.message}`}</Text> : null}
      {r?.ok ? <Text style={s.total}>총 {Math.round(r.totalLengthM)} m · {r.steps.length}단계</Text> : null}
      <View style={{ flex: 1 }}>
        <MapView key={r?.ok ? r.nodeKeys.join() : 'none'} pkg={pkg} floorSel={app.floorSel} routeNodeKeys={r?.ok ? r.nodeKeys : null}
          highlightPlaceKeys={[app.destKey, app.start?.type === 'place' ? app.start.placeKey : null].filter((x): x is string => !!x)} focus={focus} me={app.fix} />
      </View>
      {r?.ok ? (
        <ScrollView style={s.steps}>
          {r.steps.map((st, i) => (
            <Text key={i} style={[s.step, st.floorChange && s.stepFloor]}>{i + 1}. {st.text}</Text>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  form: { padding: 12, gap: 6, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lab: { width: 34, fontWeight: '700', color: '#111827' },
  val: { flex: 1, color: '#1f2937' },
  small: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  smallT: { fontSize: 13, color: '#1f2937' },
  warn: { fontSize: 12, color: '#b45309' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#d1d5db' },
  on: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipT: { fontSize: 13, color: '#374151' },
  onT: { color: '#fff' },
  none: { padding: 12, color: '#b91c1c', fontWeight: '700' },
  total: { paddingHorizontal: 12, paddingTop: 8, fontWeight: '700', color: '#111827' },
  steps: { maxHeight: 220, paddingHorizontal: 12, borderTopWidth: 1, borderColor: '#e5e7eb' },
  step: { paddingVertical: 4, fontSize: 13, color: '#1f2937' },
  stepFloor: { fontWeight: '700', color: '#be185d' },
});
