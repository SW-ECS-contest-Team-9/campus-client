// 3D 캠퍼스 지도: campus-tracker 의 client3d.html 을 웹은 <iframe>, 네이티브는 react-native-webview 로 띄운다.
// 명령(commands)은 페이지가 ready 를 보낸 뒤 보내고, 바뀔 때마다 다시 보낸다. 못 불러오면(오프라인 등) 평면 지도로 바꾸고 알림.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseEvent, type Map3dCommand, type Map3dEvent } from '../map3d/embed';
import { CHARACTER_OK, CHARACTER_UNCERTAIN } from './characterImages';
import { T } from './kit';

const READY_TIMEOUT_MS = 25_000;

interface Props {
  url: string;
  commands: (Map3dCommand | null)[];
  onEvent?: (e: Map3dEvent) => void;
  /** 3D 를 못 쓸 때 보일 평면 지도 */
  fallback: ReactNode;
}

export function Map3D({ url, commands, onEvent, fallback }: Props) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const frame = useRef<HTMLIFrameElement | null>(null);
  const web = useRef<WebView | null>(null);
  const ready = useRef(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const list = useMemo(() => commands.filter((c): c is Map3dCommand => !!c), [commands]);
  const key = JSON.stringify(list);

  const post = (msg: Map3dCommand) => {
    if (Platform.OS === 'web') frame.current?.contentWindow?.postMessage(msg, '*');
    else web.current?.injectJavaScript(`window.postMessage(${JSON.stringify(JSON.stringify(msg))}, '*'); true;`);
  };
  const sendAll = () => {
    post({ v: 1, type: 'setMarkerImages', ok: CHARACTER_OK, uncertain: CHARACTER_UNCERTAIN });
    if (!list.some((c) => c.type === 'setRoute')) post({ v: 1, type: 'clearRoute' });
    if (!list.some((c) => c.type === 'setLocation')) post({ v: 1, type: 'clearLocation' });
    for (const c of list) post(c);
  };
  const receive = (raw: unknown) => {
    const e = parseEvent(raw);
    if (!e) return;
    if (e.type === 'ready') { ready.current = true; setState('ready'); sendAll(); }
    handler.current?.(e);
  };

  // 명령이 바뀌면 다시 보냄
  useEffect(() => { if (ready.current) sendAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);

  // 너무 오래 ready 가 안 오면 실패로
  useEffect(() => {
    ready.current = false;
    setState('loading');
    const t = setTimeout(() => { if (!ready.current) setState('failed'); }, READY_TIMEOUT_MS);
    // 웹: 서버가 아예 없으면 빨리 알 수 있음
    if (Platform.OS === 'web') fetch(url, { mode: 'no-cors' }).catch(() => setState('failed'));
    return () => clearTimeout(t);
  }, [url]);

  // 웹: 이 iframe 에서 온 메시지만
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const on = (e: MessageEvent) => { if (frame.current && e.source === frame.current.contentWindow) receive(e.data); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state === 'failed') {
    return (
      <View style={s.fill}>
        {fallback}
        <View style={s.notice}><Text style={s.noticeT}>3D 지도를 불러오지 못해 평면 지도로 보여요</Text></View>
      </View>
    );
  }
  return (
    <View style={s.fill}>
      {Platform.OS === 'web'
        ? <iframe ref={frame} src={url} title="3D 캠퍼스 지도" style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
        : <WebView ref={web} source={{ uri: url }} style={s.fill} originWhitelist={['*']} javaScriptEnabled onMessage={(e) => receive(e.nativeEvent.data)} onError={() => setState('failed')} onHttpError={() => setState('failed')} />}
      {state === 'loading' ? <View style={s.loading} pointerEvents="none"><Text style={s.loadingT}>3D 지도를 불러오는 중…</Text></View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: T.canvas, overflow: 'hidden' },
  notice: { position: 'absolute', left: 12, right: 12, top: 12, backgroundColor: '#FFF4E5', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  noticeT: { color: T.caution, fontSize: 13, fontWeight: '600' },
  loading: { position: 'absolute', left: 0, right: 0, top: 12, alignItems: 'center' },
  loadingT: { backgroundColor: '#142235E0', color: '#fff', fontSize: 13, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
});
