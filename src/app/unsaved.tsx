// ST01 저장되지 않은 지도: 서버에서 지도를 받은 적이 없어 앱에 들어 있는 개발 지도를 쓰는 중.
import { router } from 'expo-router';
import { Text } from 'react-native';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { Card, H, P, Screen } from '../ui/kit';
import { color, type } from '../ui/theme';
import { Character } from '../ui/v3';

export default function UnsavedScreen() {
  const app = useApp();
  return (
    <Screen
      title="지도 저장이 필요해요"
      footer={
        <>
          <Button label="오프라인 지도로" onPress={() => router.dismissTo('/offline')} />
          <Button variant="secondary" label="지금 지도로 계속 보기" onPress={() => router.back()} />
        </>
      }
    >
      <Character name="offline" size={96} />
      <H>캠퍼스 지도를{'\n'}아직 받지 않았어요.</H>
      <P>지금은 앱에 들어 있는 지도(v{app.pkg?.release.version})를 쓰고 있어요. 인터넷에 연결하면 최신 지도를 받아요.</P>
      <Card>
        <P>캠퍼스 지도</P>
        <P tone="muted">{app.updateStatus ?? '받지 않음'}</P>
        <Text style={{ color: color.warning, fontWeight: '700', fontSize: type.small }}>최신 지도와 장소·길이 다를 수 있어요</Text>
      </Card>
      <Card tone="primary">
        <P>지금 가능한 것</P>
        <P tone="muted">장소 검색과 길찾기는 지금 지도로도 계속 쓸 수 있어요.</P>
      </Card>
    </Screen>
  );
}
