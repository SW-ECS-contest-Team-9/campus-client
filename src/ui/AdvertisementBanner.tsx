import { useFocusEffect } from 'expo-router';
import { openURL } from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { currentAdvertisement, fetchAdvertisements, type Advertisement } from '../api/advertisements';
import { color, type } from './theme';

/** 광고는 화면 방문·앱 복귀 시 다시 받고, 화면을 떠나면 요청과 게시 시각 타이머를 취소한다. */
export function AdvertisementBanner({ serverUrl }: { serverUrl: string }) {
  const [ad, setAd] = useState<Advertisement | null>(null);
  useFocusEffect(
    useCallback(() => {
      let controller: AbortController;
      let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
      let items: Advertisement[] = [];
      const update = () => {
        clearTimeout(boundaryTimer);
        const now = Date.now();
        setAd(currentAdvertisement(items, now));
        const boundaries = items
          .filter((item) => item.isActive)
          .flatMap((item) =>
            [item.startsAt, item.endsAt].flatMap((date) => (date !== null && Date.parse(date) > now ? [Date.parse(date)] : [])),
          );
        if (boundaries.length) boundaryTimer = setTimeout(update, Math.min(Math.min(...boundaries) - now, 2_147_483_647));
      };
      const load = () => {
        controller?.abort();
        clearTimeout(boundaryTimer);
        items = [];
        setAd(null);
        const request = new AbortController();
        controller = request;
        void fetchAdvertisements(serverUrl, { signal: request.signal }).then((result) => {
          if (request.signal.aborted) return;
          items = result;
          update();
        });
      };
      load();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') load();
      });
      return () => {
        controller.abort();
        clearTimeout(boundaryTimer);
        subscription.remove();
      };
    }, [serverUrl]),
  );
  return (
    <View style={s.container}>
      <BannerImage key={ad ? `${ad.id}:${ad.imageUrl}:${ad.targetUrl}` : 'empty'} ad={ad} />
    </View>
  );
}

function BannerImage({ ad }: { ad: Advertisement | null }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  // 이미지 응답이 멈춰도 기본 빈 영역을 유지하고 뒤늦은 로딩 완료로 다시 표시하지 않는다.
  useEffect(() => {
    if (!ad || status !== 'loading') return;
    const timeout = setTimeout(() => setStatus('failed'), 5000);
    return () => clearTimeout(timeout);
  }, [ad, status]);
  const ready = !!ad && status === 'ready';
  return (
    <Pressable
      style={s.slot}
      testID="offline-ad-slot"
      disabled={!ready}
      accessible={ready}
      accessibilityRole={ready ? 'link' : undefined}
      accessibilityLabel={ready ? `광고: ${ad.title}` : undefined}
      onPress={() => {
        if (ad && currentAdvertisement([ad])) void openURL(ad.targetUrl).catch(() => undefined);
      }}
    >
      {!ready ? <Text style={s.label}>광고</Text> : null}
      {ad && status !== 'failed' ? (
        <Image
          source={{ uri: ad.imageUrl }}
          resizeMode="contain"
          accessible={false}
          style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}
          onLoad={() => setStatus((previous) => (previous === 'loading' ? 'ready' : previous))}
          onError={() => setStatus('failed')}
        />
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 12, flexShrink: 0 },
  slot: {
    width: '100%',
    aspectRatio: 320 / 50,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  label: { ...type.captionText, color: color.secondary },
});
