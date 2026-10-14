// ST01 저장되지 않은 지도: 서버에서 지도를 받은 적이 없어 앱에 들어 있는 개발 지도를 쓰는 중.
import { router } from 'expo-router';
import { Text } from 'react-native';
import { useApp } from '../state/AppState';
import { Btn, Card, H, P, Screen, T } from '../ui/kit';

export default function UnsavedScreen() {
  const app = useApp();
  return (
    <Screen
      title="지도 저장이 필요해요"
      footer={
        <>
          <Btn label="오프라인 지도 관리" onPress={() => router.replace('/offline')} />
          <Btn kind="soft" label="지금 지도로 계속 보기" onPress={() => router.back()} />
        </>
      }
    >
      <Text style={{ fontSize: 34, color: T.caution, marginTop: 8 }}>⚠</Text>
      <H>캠퍼스 지도를{'\n'}아직 받지 않았어요.</H>
      <P>지금은 앱에 들어 있는 개발용 지도(v{app.pkg?.release.version})를 쓰고 있어요. 인터넷에 연결해 최신 지도를 받아 주세요.</P>
      <Card>
        <P>캠퍼스 지도</P>
        <P tone="muted">{app.updateStatus ?? '받지 않음'}</P>
        <Text style={{ color: T.caution, fontWeight: '700', fontSize: T.small }}>최신 지도와 장소·길이 다를 수 있어요</Text>
      </Card>
      <Card tone="primary">
        <P>지금 가능한 것</P>
        <P tone="muted">개발 지도 안의 장소 검색과 길찾기는 계속 쓸 수 있어요.</P>
      </Card>
    </Screen>
  );
}
