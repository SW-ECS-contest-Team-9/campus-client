// 평면 지도 (react-native-svg). 끌어서 이동, +/- 로 확대. 웹·네이티브 공통.
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import type { EdgeKind, MapNode, MapPackage } from '../map/package';

export const KIND_COLOR: Record<EdgeKind, string> = {
  walkway: '#6b7280',
  sidewalk: '#0ea5e9',
  crossing: '#f59e0b',
  corridor: '#8b5cf6',
  stairs: '#ef4444',
  ramp: '#10b981',
  elevator: '#ec4899',
  vehicle_road: '#d1d5db',
};

interface Props {
  pkg: MapPackage;
  floorSel: Record<string, string>; // buildingKey → floorKey | 'all'
  routeNodeKeys?: string[] | null;
  highlightPlaceKeys?: string[];
  me?: { x: number; y: number; accuracyM: number | null; uncertain: boolean } | null;
  onPlacePress?: (key: string) => void;
  focus?: { x: number; y: number }[]; // 처음 화면을 이 점들에 맞춤
}

export function MapView({ pkg, floorSel, routeNodeKeys, highlightPlaceKeys = [], me, onPlacePress, focus }: Props) {
  const [size, setSize] = useState({ w: 360, h: 480 });
  const bounds = useMemo(() => {
    const xs = pkg.nodes.map((n) => n.x),
      ys = pkg.nodes.map((n) => n.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [pkg]);
  const fit = Math.min(size.w / (bounds.maxX - bounds.minX + 20), size.h / (bounds.maxY - bounds.minY + 20));
  const init = useMemo(() => {
    if (!focus || focus.length === 0) return { zoom: 1, x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const xs = focus.map((p) => p.x),
      ys = focus.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const z = Math.min((bounds.maxX - bounds.minX + 20) / (x1 - x0 + 40), (bounds.maxY - bounds.minY + 20) / (y1 - y0 + 40));
    return { zoom: Math.max(1, Math.min(z, 30)), x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [zoom, setZoom] = useState(init.zoom);
  const [center, setCenter] = useState({ x: init.x, y: init.y });
  const scale = fit * zoom;
  const drag = useRef({ x: 0, y: 0, cx: 0, cy: 0 });
  const pan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- drag 는 손가락 사건 때만 읽음(그리기 중 아님)
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          drag.current = { x: 0, y: 0, cx: center.x, cy: center.y };
        },
        onPanResponderMove: (_, g) => setCenter({ x: drag.current.cx - g.dx / scale, y: drag.current.cy + g.dy / scale }),
      }),
    [center, scale],
  );
  const sx = (x: number) => (x - center.x) * scale + size.w / 2;
  const sy = (y: number) => -(y - center.y) * scale + size.h / 2;

  const nodes = useMemo(() => new Map(pkg.nodes.map((n) => [n.key, n])), [pkg]);
  // 보이는가: 바깥은 항상, 층 아는 실내는 고른 층만, 층 모르는 실내는 흐리게 항상
  const vis = (n: MapNode | undefined): 'on' | 'dim' | 'off' => {
    if (!n || n.location === 'outdoor') return 'on';
    if (!n.floorKey) return 'dim';
    const sel = floorSel[n.buildingKey ?? ''] ?? 'all';
    return sel === 'all' || sel === n.floorKey ? 'on' : 'off';
  };

  const routeSet = new Set<string>();
  if (routeNodeKeys) for (let i = 1; i < routeNodeKeys.length; i++) routeSet.add(`${routeNodeKeys[i - 1]}|${routeNodeKeys[i]}`);
  const routeEdges = pkg.edges.filter((e) => routeSet.has(`${e.from}|${e.to}`) || routeSet.has(`${e.to}|${e.from}`));
  const pts = (g: [number, number, number?][] | [number, number][]) =>
    g.map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ');

  return (
    <View
      style={styles.wrap}
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...pan.panHandlers}
    >
      <Svg width={size.w} height={size.h}>
        {pkg.walkAreas.map((a) => (
          <Polygon key={a.key} points={pts(a.polygon)} fill="#dcfce7" stroke="#86efac" strokeWidth={1} />
        ))}
        {pkg.buildings.map((b) => (b.footprint ? <Polygon key={b.key} points={pts(b.footprint)} fill="#e5e7eb" stroke="#9ca3af" /> : null))}
        {pkg.edges.map((e) => {
          const v = [vis(nodes.get(e.from)), vis(nodes.get(e.to))];
          if (v.includes('off')) return null;
          const dim = v.includes('dim');
          return (
            <Polyline
              key={e.key}
              points={pts(e.geometry)}
              fill="none"
              stroke={KIND_COLOR[e.kind]}
              strokeWidth={e.kind === 'vehicle_road' ? 4 : 2}
              strokeOpacity={dim ? 0.35 : 0.9}
              strokeDasharray={e.estimated && dim ? '4,3' : undefined}
            />
          );
        })}
        {routeEdges.map((e) => (
          <Polyline
            key={`r-${e.key}`}
            points={pts(e.geometry)}
            fill="none"
            stroke="#2563eb"
            strokeWidth={6}
            strokeOpacity={0.85}
            strokeLinecap="round"
          />
        ))}
        {pkg.buildings.map((b) =>
          b.center ? (
            <SvgText
              key={`bl-${b.key}`}
              x={sx(b.center[0])}
              y={sy(b.center[1])}
              fontSize={12}
              fill="#374151"
              fontWeight="bold"
              textAnchor="middle"
            >
              {b.name}
            </SvgText>
          ) : null,
        )}
        {pkg.places.map((p) => {
          const hl = highlightPlaceKeys.includes(p.key);
          return (
            <G key={p.key} onPress={() => onPlacePress?.(p.key)}>
              <Circle cx={sx(p.x)} cy={sy(p.y)} r={hl ? 8 : 5} fill={hl ? '#dc2626' : '#f97316'} stroke="#fff" strokeWidth={1.5} />
              {hl ? (
                <SvgText x={sx(p.x) + 10} y={sy(p.y) + 4} fontSize={12} fill="#111827">
                  {p.name.slice(0, 16)}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {me ? (
          <G>
            {me.accuracyM ? (
              <Circle cx={sx(me.x)} cy={sy(me.y)} r={me.accuracyM * scale} fill={me.uncertain ? '#fca5a5' : '#93c5fd'} fillOpacity={0.3} />
            ) : null}
            <Circle cx={sx(me.x)} cy={sy(me.y)} r={7} fill={me.uncertain ? '#9ca3af' : '#2563eb'} stroke="#fff" strokeWidth={2} />
          </G>
        ) : null}
      </Svg>
      <View style={styles.zoom}>
        <Pressable style={styles.zbtn} onPress={() => setZoom((z) => Math.min(z * 1.5, 30))}>
          <Text style={styles.ztxt}>+</Text>
        </Pressable>
        <Pressable style={styles.zbtn} onPress={() => setZoom((z) => Math.max(z / 1.5, 0.5))}>
          <Text style={styles.ztxt}>−</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Legend() {
  const items: EdgeKind[] = ['walkway', 'sidewalk', 'crossing', 'corridor', 'stairs', 'ramp', 'elevator'];
  const ko: Record<string, string> = {
    walkway: '길',
    sidewalk: '인도',
    crossing: '횡단',
    corridor: '복도',
    stairs: '계단',
    ramp: '경사로',
    elevator: '승강기',
  };
  return (
    <View style={styles.legend}>
      {items.map((k) => (
        <View key={k} style={styles.li}>
          <View style={[styles.sw, { backgroundColor: KIND_COLOR[k] }]} />
          <Text style={styles.lt}>{ko[k]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f8fafc', overflow: 'hidden' },
  zoom: { position: 'absolute', right: 12, bottom: 12, gap: 8 },
  zbtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  ztxt: { fontSize: 22, color: '#111827' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sw: { width: 14, height: 4, borderRadius: 2 },
  lt: { fontSize: 11, color: '#374151' },
});
