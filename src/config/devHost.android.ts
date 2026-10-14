// Android 에뮬레이터에서 PC 는 10.0.2.2. 실기기는 빌드 때 EXPO_PUBLIC_DEV_HOST=PC의 망 IP(평문 허용도 그 주소에만 추가됨).
export const DEV_HOST = process.env.EXPO_PUBLIC_DEV_HOST || '10.0.2.2';
