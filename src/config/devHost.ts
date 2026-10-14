// 개발 서버가 도는 PC 주소. 웹·iOS 시뮬레이터는 같은 PC.
// 실기기: 빌드할 때 EXPO_PUBLIC_DEV_HOST=PC의 망 IP(예 192.168.0.12) 를 주면 그 주소를 씀(README "실기기 개발 주소").
export const DEV_HOST = process.env.EXPO_PUBLIC_DEV_HOST || '127.0.0.1';
