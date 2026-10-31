import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppState';
import { Button } from '../ui/components';
import { Card, P, Screen } from '../ui/kit';
import { localizedQrMessage, type QrMessage } from '../location/qr-i18n';
import { translate, type MessageKey } from '../i18n/translations';

export default function QrAnchorScreen() {
  const app = useApp();
  const t = (key: MessageKey, values?: Record<string, string>) => translate(app.settings.language, key, values);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [message, setMessage] = useState<QrMessage | null>(null);
  const onScan = async (data: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const label = await app.applyQrAnchor(data);
      setMessage({ kind: 'success', label });
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      setMessage({ kind: reason === 'INVALID_QR' ? 'invalid' : reason === 'ANCHOR_NOT_FOUND' ? 'missing' : 'error' });
    }
  };
  return (
    <Screen title={t('qrTitle')}>
      <P tone="muted">{t('qrHint')}</P>
      {!permission?.granted ? (
        <Card>
          <P>{t('qrPermission')}</P>
          <Button label={t('allowCamera')} onPress={() => void requestPermission()} />
        </Card>
      ) : focused ? (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => void onScan(data)}
          />
        </View>
      ) : null}
      {message ? (
        <Card>
          <P>{localizedQrMessage(message, app.settings.language, app.pkg)}</P>
          <Button
            variant="secondary"
            label={t('scanAgain')}
            onPress={() => {
              setMessage(null);
              inFlight.current = false;
              setBusy(false);
            }}
          />
          <Button label={t('showMap')} onPress={() => router.back()} />
        </Card>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({ camera: { height: 320, borderRadius: 16, overflow: 'hidden' } });
