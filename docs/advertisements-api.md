# 광고 API 연동 계약

`campus-backend`의 `feat/advertisements-api` 브랜치, 커밋 `e4d0832`의 구현을 기준으로 한다.
`routers/advertisements.py`가 `/v1/advertisements`를 제공하며,
`advertisements/repository.py`에서 활성 광고를 조회한다.
DB의 snake_case 컬럼은 라우터에서 JSON의 camelCase 필드로 변환한다.

## 요청 및 응답

앱 설정의 `serverUrl`을 기준으로 `GET /v1/advertisements`를 호출한다. 별도 인증은 사용하지 않는다.

```json
{
  "count": 1,
  "items": [
    {
      "id": 1,
      "title": "캠퍼스 행사",
      "imageUrl": "https://cdn.example.com/banner.png",
      "targetUrl": "https://example.com/event",
      "startsAt": "2026-10-01T00:00:00Z",
      "endsAt": "2026-11-01T00:00:00Z",
      "isActive": true
    }
  ]
}
```

| DB 컬럼    | JSON 필드 | 형식                                                      |
| ---------- | --------- | --------------------------------------------------------- |
| id         | id        | 양의 정수                                                 |
| title      | title     | 비어 있지 않은 문자열; 접근성 이름에도 사용               |
| image_url  | imageUrl  | HTTP(S) 이미지 주소; 서버 기준 상대 경로도 허용           |
| target_url | targetUrl | 탭했을 때 여는 절대 HTTP(S) 주소                          |
| starts_at  | startsAt  | 타임존을 명시한 ISO 8601 문자열 또는 null(시작 제한 없음) |
| ends_at    | endsAt    | 타임존을 명시한 ISO 8601 문자열 또는 null(종료 제한 없음) |
| is_active  | isActive  | boolean                                                   |

시각은 UTC의 `Z` 또는 `+09:00` 같은 오프셋을 반드시 포함한다. 기간이 둘 다 있으면 `starts_at < ends_at`여야 한다.
광고가 없으면 `200 { "count": 0, "items": [] }`를 반환한다.
서버에서 `is_active = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR now() < ends_at)` 조건으로 조회하고,
`id` 오름차순으로 정렬한다. 여러 광고면 클라이언트는 유효한 첫 광고 하나를 표시한다.
현재 활성 광고만 반환하므로 미래에 시작할 광고는 응답에 포함되지 않는다.
무작위 회전·노출/클릭 집계는 포함하지 않는다.

## 클라이언트 동작

- 오프라인 지도 탭 방문, 서버 주소 변경, 탭이 열린 상태의 앱 포그라운드 복귀 시 조회한다.
- `count`가 항목 수와 같은 정수인지 확인한 뒤 활성 여부·게시 기간·응답 필드·URL을 검증한다. 잘못된 항목은 건너뛴다.
- 받은 목록의 게시 시작·종료 시각에 선택을 다시 확인한다. 표시 중인 광고가 만료되면 제거하고 서버를 다시 조회해 다음 활성 광고를 받는다.
- 빈 목록에서는 주기적으로 조회하지 않는다. 이후 화면 방문·앱 복귀 시 다시 조회한다.
- 카드와 같은 너비, `320:50` 비율을 유지한다. 이미지는 `contain`으로 잘림 없이 표시한다.
- 이미지를 모두 불러온 뒤에만 표시하고 링크를 활성화한다. 탭하면 외부 링크를 연다.
- 요청 및 이미지 로딩 제한 시간은 각각 5초다.
- 서버 미설정, 오프라인, API 미구현(404), 서버 오류, 광고 없음, 잘못된 응답, 이미지 오류·시간 초과에서는
  테두리와 ‘광고’ 문구만 있는 빈 광고 영역을 유지한다. 별도 오류 알림은 띄우지 않는다.
- 화면을 떠나면 요청·타이머·앱 상태 구독을 해제한다. 광고 목록은 기기에 영구 저장하지 않는다.

공통 화면의 탭 여백은 `TabContentInset`으로 전달하고 `Screen`과 `FooterPanel`에서 반영한다.
설정 탭, 안내 화면의 `headerAction`, 지도 위의 `FooterPanel`은 현재 구조를 유지한다.
기존 광고 브랜치와 같이 공통 지도 안내 배너와 오프라인 지도 화면의 3D 설명 카드는 제거한다.

## 서버 실행 조건

`0007_advertisements` 마이그레이션이 적용되어 있어야 한다. 미적용 상태는 빈 목록이 아닌 서버 오류다.
신규 광고는 기본 비활성(`is_active = false`)이므로 운영자가 데이터와 게시 기간을 등록하고 명시적으로 활성화해야 한다.
이미지 호스팅·업로드·관리 API는 제공하지 않는다. `imageUrl`은 클라이언트 기기에서 접근할 수 있는 주소여야 한다.
웹에서는 기존 API의 CORS 설정에 앱 주소를 허용해야 한다.

서버의 최종 경로나 응답 필드가 달라지면 `src/api/advertisements.ts`와 이 문서를 함께 갱신한다.

## 검증

```bash
npx vitest run src/api/advertisements.test.ts src/ui/AdvertisementBanner.test.ts
CLIENT_SERVER=http://127.0.0.1:8010 npx vitest run src/api/advertisements.server.it.test.ts
npm run lint
npm run typecheck
```

서버 계약 테스트는 실제 HTTP 응답의 상태 코드·항목 수·정렬·활성 여부와 클라이언트 파싱 결과를 비교한다.
`CLIENT_SERVER`를 설정하지 않으면 건너뛴다. 광고가 없는 서버에서는 빈 목록 계약만 검증된다.
실기기의 이미지 표시와 외부 링크 열기는 실제 광고 데이터로 별도 확인해야 한다.
