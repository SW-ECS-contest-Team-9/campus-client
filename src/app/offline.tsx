// CT11 오프라인 지도: 기기에 저장된 지도 꾸러미(버전·크기·날짜·범위)와 갱신. 3D 지도는 인터넷이 있어야 보임(없으면 평면 지도).
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppState';
import { Btn, Card, H, P, Screen, T, TabBar } from '../ui/kit';

export default function OfflineScreen() {
  const app = useApp();
  const l = app.loaded;
  const pkg = app.pkg;
  if (!l || !pkg) return null;
  const kb = Math.round(JSON.stringify(pkg).length / 1024);
  const indoor = pkg.buildings.filter((b) => pkg.floors.some((f) => f.buildingKey === b.key));
  const src =
    l.source === 'server' ? '방금 서버에서 받음' : l.source === 'stored' ? '기기에 저장됨' : '저장된 지도 없음 · 앱에 들어 있는 개발 지도';
  return (
    <View style={{ flex: 1 }}>
      <Screen title="오프라인 지도" back={false}>
        <H>인터넷 없이도{'\n'}저장한 범위에서 길찾기</H>
        <P tone="muted">저장된 지도 안의 장소와 길만 안내해요.</P>
        <Card>
          <View style={s.line}>
            <P>지도 크기</P>
            <Text style={s.big}>{kb} KB</Text>
          </View>
        </Card>
        <Card>
          <Text style={s.t}>캠퍼스 지도 v{pkg.release.version}</Text>
          <P tone="muted">
            {src} · {pkg.release.createdAt.slice(0, 10)} 만듦
          </P>
          <Text style={s.scope}>
            바깥 길 전체 + 층 자료 {indoor.length}개 건물({indoor.map((b) => b.name).join(', ') || '없음'})
          </Text>
          <P tone="muted">
            장소 {pkg.places.length} · 길 {pkg.edges.length} · 층 {pkg.floors.length}
          </P>
        </Card>
        <Card tone={l.source === 'fixture' ? 'caution' : undefined}>
          <Text style={s.t}>3D 지도</Text>
          <P tone="muted">3D 화면은 인터넷이 있어야 보여요. 없으면 같은 지도를 평면으로 보여 드려요.</P>
        </Card>
        <Btn label="지도 갱신 확인" onPress={app.checkUpdate} />
        {app.updateStatus ? <P tone="caution">{app.updateStatus}</P> : null}
        <P tone="muted">오프라인에서는 통행 변경과 시설 운영 정보를 확인할 수 없어요.</P>
      </Screen>
      <TabBar at="offline" />
    </View>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  big: { fontSize: T.title, fontWeight: '800', color: T.text },
  t: { fontSize: T.body, fontWeight: '800', color: T.text },
  scope: { fontSize: T.small, fontWeight: '700', color: T.primary },
});
