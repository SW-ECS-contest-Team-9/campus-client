// Android 개발 서버 주소. 에뮬레이터에서 PC 는 10.0.2.2.
// 실기기 USB: 빌드 때 EXPO_PUBLIC_USB_REVERSE=1 이면 127.0.0.1(`adb reverse tcp:8010 tcp:8010` 등으로 PC 에 닿음).
// 실기기 같은 망: 빌드 때 EXPO_PUBLIC_DEV_HOST=PC의 망 IP(평문 허용도 그 주소에만 추가됨). 이것이 가장 우선.
export const DEV_HOST = process.env.EXPO_PUBLIC_DEV_HOST || (process.env.EXPO_PUBLIC_USB_REVERSE === '1' ? '127.0.0.1' : '10.0.2.2');
