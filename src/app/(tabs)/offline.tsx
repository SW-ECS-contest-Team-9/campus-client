// CT11 오프라인 지도: 기기에 저장된 지도 꾸러미(버전·크기·날짜·범위)와 갱신. 3D 지도: 기본(네이티브)은 앱에 들어 있어 인터넷 없이, 웹 엔진은 인터넷 필요.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { buildingsWithFloors } from '../../map/labels';
import { useApp } from '../../state/AppState';
import { Button, MapPackCard } from '../../ui/components';
import { color, type } from '../../ui/theme';
import { Card, H, P, Screen, TabBar } from '../../ui/kit';
import { Character } from '../../ui/v3';

export default function OfflineScreen() {
  const app = useApp();
  const l = app.loaded;
  const pkg = app.pkg;
  const kb = useMemo(() => (pkg ? Math.round(JSON.stringify(pkg).length / 1024) : 0), [pkg]); // 지도 전체 직렬화: 렌더마다 하지 않음
  if (!l || !pkg) return null;
  const indoor = buildingsWithFloors(pkg);
  const src =
    l.source === 'server' ? '방금 서버에서 받음' : l.source === 'stored' ? '기기에 저장됨' : '저장된 지도 없음 · 앱에 들어 있는 개발 지도';
  return (
    <View style={{ flex: 1 }}>
      <Screen title="지도 저장" back={false}>
        <H>인터넷 없이도{'\n'}저장한 범위에서 길찾기</H>
        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <P tone="muted">저장된 지도 안의 장소와 길만 안내해요.</P>
          </View>
          <Character name="offline" size={72} style={s.char} />
        </View>
        <MapPackCard
          state={l.source === 'fixture' ? 'queued' : 'stored'}
          title={`캠퍼스 지도 v${pkg.release.version}`}
          detail={`${src} · ${pkg.release.createdAt.slice(0, 10)} 만듦 · ${kb} KB`}
          action={
            l.source === 'fixture'
              ? '인터넷에 연결해 최신 지도를 받아 주세요'
              : `바깥 길 전체 + 층 자료 ${indoor.length}개 건물(${indoor.map((b) => b.name).join(', ') || '없음'})`
          }
        />
        <P tone="muted">
          장소 {pkg.places.length} · 길 {pkg.edges.length} · 층 {pkg.floors.length}
        </P>
        <Card tone={l.source === 'fixture' ? 'caution' : undefined}>
          <Text style={s.t}>3D 지도</Text>
          <P tone="muted">
            {app.settings.map3dEngine === 'web'
              ? '웹 3D 화면은 인터넷과 지도 서버 연결이 필요해요. 연결할 수 없으면 지도가 표시되지 않아요.'
              : '3D 지도는 앱에 들어 있어 인터넷 없이도 보여요(건물 모양은 앱을 받을 때 기준).'}
          </P>
        </Card>
        <Button label="지도 갱신 확인" onPress={app.checkUpdate} />
        {app.updateStatus ? <P tone="caution">{app.updateStatus}</P> : null}
        <P tone="muted">오프라인에서는 통행 변경과 시설 운영 정보를 확인할 수 없어요.</P>
      </Screen>
      <TabBar at="offline" />
    </View>
  );
}

const s = StyleSheet.create({
  t: { fontSize: type.body, fontWeight: '800', color: color.text },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  char: { marginVertical: -12 },
});
