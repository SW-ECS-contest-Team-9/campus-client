# campus-client

서경대학교 사용자용 캠퍼스 길찾기 앱 MVP (React Native + Expo SDK 57 + expo-router, TypeScript).
수집 앱이 아님. 백엔드는 campus-backend (FastAPI).

## 실행
```
npm install
npm test            # 단위 시험 (vitest)
npx tsc --noEmit    # 타입 검사
npx expo start --web
npx expo export --platform web   # dist/ 에 정적 웹
```
iOS·Android 는 개발 빌드(`npx expo run:ios` / `run:android` 또는 EAS) 필요. 위치 권한 문구는 app.json 에 있음.

## 구조
- `src/map/package.ts` 지도 꾸러미 형식 v1 타입·검증 (`docs/map-package-v1.md`)
- `src/map/fixture/` 개발용 꾸러미 (`npm run build:fixture -- <dump.sql>` 로 다시 만듦) + 변환 보고서
- `src/route/` 기기 안 경로 (Dijkstra; 최단·계단 피하기·승강기 우선)
- `src/search/` 장소 검색
- `src/api/` 꾸러미 받기 (sha256·검증·이전 것 유지·fixture 대체)
- `src/location/` 위치, WGS84↔EPSG:5186, `snapToNetwork()` 자리(아직 원래 점 반환)
- `src/ui/`, `src/app/` 화면 (지도, 검색 결과, 장소, 길찾기, 즐겨찾기, 설정)
