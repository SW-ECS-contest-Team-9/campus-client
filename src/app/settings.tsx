// CT13 설정: 기본 이동 방식, 위치 권한 안내, 3D 표시(가벼운 모드), 서버·3D 페이지 주소(개발), 개인정보.
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { DEFAULT_MAP3D_URL } from '../map3d/embed';
import { get3dStats } from '../map3d/diag';
import { MODES } from '../route/modes';
import { DEFAULT_SERVER_URL, useApp } from '../state/AppState';
import { Btn, Card, Chip, H, P, Screen, Section, T } from '../ui/kit';

export default function SettingsScreen() {
  const app = useApp();
  const [server, setServer] = useState(app.settings.serverUrl);
  const [map3d, setMap3d] = useState(app.settings.map3dUrl);
  const [stats] = useState(get3dStats);
  const aiOn = app.settings.aiParse ?? false;
  return (
    <Screen title="설정">
      <H>내 이동에 맞게</H>
      <Section>이동 경로(기본 조건)</Section>
      <View style={s.chips}>
        {MODES.map((m) => (
          <Chip key={m.key} label={m.label} on={app.condition === m.key} onPress={() => app.setCondition(m.key)} />
        ))}
      </View>
      <Section>화면 표현(기기 등급)</Section>
      <View style={s.chips}>
        <Chip
          label={`자동 · ${app.settings.autoTier ?? '-'}`}
          on={app.settings.deviceTier == null}
          onPress={() => app.updateSettings({ deviceTier: null })}
        />
        <Chip label="1 유리·움직임" on={app.settings.deviceTier === 1} onPress={() => app.updateSettings({ deviceTier: 1 })} />
        <Chip label="2 가볍게" on={app.settings.deviceTier === 2} onPress={() => app.updateSettings({ deviceTier: 2 })} />
        <Chip label="3 정지" on={app.settings.deviceTier === 3} onPress={() => app.updateSettings({ deviceTier: 3 })} />
      </View>
      <P tone="muted">
        {app.tier === 1
          ? '지금: 1 — 지도 위 유리 흐림과 움직임을 모두 써요(Galaxy S21 이상 기준).'
          : app.tier === 2
            ? '지금: 2 — 흐림 없이 반투명 면, 움직임은 짧게(조금 오래된 휴대폰).'
            : '지금: 3 — 움직임과 움직이는 캐릭터 없이 가장 가볍게.'}
      </P>
      <Section>3D 엔진</Section>
      <View style={s.chips}>
        <Chip
          label="기본(네이티브)"
          on={app.settings.map3dEngine !== 'web'}
          onPress={() => app.updateSettings({ map3dEngine: 'native' })}
        />
        <Chip label="웹" on={app.settings.map3dEngine === 'web'} onPress={() => app.updateSettings({ map3dEngine: 'web' })} />
      </View>
      <P tone="muted">
        {app.settings.map3dEngine === 'web'
          ? '웹: 3D 지도 페이지를 서버에서 받아 그려요(인터넷·서버 필요, 첫 화면이 느려요).'
          : '기본: 앱에 들어 있는 3D 지도를 바로 그려요(서버 없이, 빠름).'}
      </P>
      <Section>자연어 검색</Section>
      <Card style={s.row}>
        <View style={{ flex: 1 }}>
          <P>자연어 검색을 기본으로 사용</P>
          <P tone="muted">검색 화면을 열면 문장으로 목적지와 이동 조건을 찾는 모드로 시작해요.</P>
        </View>
        <Switch
          value={app.settings.naturalSearchDefault}
          onValueChange={(v) => app.updateSettings({ naturalSearchDefault: v })}
          trackColor={{ false: T.line, true: T.primary }}
          ios_backgroundColor={T.line}
          accessibilityLabel="자연어 검색을 기본으로 사용"
        />
      </Card>
      <Card style={s.row}>
        <View style={{ flex: 1 }}>
          <P>기기 안 AI 보조(실험)</P>
          <P tone="muted">규칙으로 못 알아들은 문장을 Gemma 270M으로 한 번 더 해석해요.</P>
          <P tone="muted">
            {app.aiModel
              ? `모델 있음 · ${aiOn ? '켜짐' : '꺼짐'}${app.settings.aiParse == null ? '(기본 꺼짐)' : ''} · 필수 조건은 규칙 결과를 줄이지 않아요`
              : '모델 파일이 없어요(시험판: PC 에서 넣음). 규칙 해석만 써요.'}
          </P>
        </View>
        <Switch
          value={aiOn}
          onValueChange={(v) => app.updateSettings({ aiParse: v })}
          trackColor={{ false: T.line, true: T.primary }}
          ios_backgroundColor={T.line}
          accessibilityLabel="기기 안 AI 보조(실험)"
        />
      </Card>
      <Section>화면 표시</Section>
      <Card style={s.row}>
        <View style={{ flex: 1 }}>
          <P>가벼운 3D 지도</P>
          <P tone="muted">구조물·이름표를 빼서 오래된 휴대폰에서도 부드럽게</P>
        </View>
        <Switch
          value={app.settings.light}
          onValueChange={(v) => app.updateSettings({ light: v })}
          trackColor={{ true: T.primary }}
          accessibilityLabel="가벼운 3D 지도"
        />
      </Card>
      <Section>위치 권한</Section>
      <Card>
        <P tone="muted">
          {'위치를 허락하면 앱을 보고 있는 동안만 위치·걸음·기압을 읽어 길 위에 맞춰 보여 줘요. 위치 기록은 기기 밖으로 보내지 않아요.'}
        </P>
      </Card>
      <Section>지도 서버(개발용)</Section>
      <TextInput
        style={s.input}
        value={server}
        onChangeText={setServer}
        placeholder={DEFAULT_SERVER_URL}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="지도 서버 주소"
      />
      <TextInput
        style={s.input}
        value={map3d}
        onChangeText={setMap3d}
        placeholder={DEFAULT_MAP3D_URL}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="3D 지도 주소"
      />
      <Btn label="주소 저장" onPress={() => app.updateSettings({ serverUrl: server.trim(), map3dUrl: map3d.trim() })} />
      <Btn kind="soft" label="지도 갱신 확인" onPress={app.checkUpdate} />
      {app.updateStatus ? <P tone="caution">{app.updateStatus}</P> : null}
      <Section>개인정보</Section>
      <Card>
        <P tone="muted">저장한 장소·최근 경로·설정은 이 기기에만 있어요(계정 없음).</P>
      </Card>
      {stats.length ? (
        <>
          <Section>측정(시험용)</Section>
          <Card>
            {stats.map((l) => (
              <P key={l} tone="muted">
                {l}
              </P>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.line,
    backgroundColor: T.card,
    paddingHorizontal: 16,
    fontSize: T.small,
    color: T.text,
  },
});
