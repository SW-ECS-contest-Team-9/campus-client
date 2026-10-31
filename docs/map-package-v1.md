# 지도 꾸러미 형식 v1 (schemaVersion 1)

릴리스 하나의 ERD 내용(campus, map_release, building, floor, node, edge, place, walk_area, walk_area_node)을 JSON 하나로 묶은 것.
앱은 이 파일을 받아 기기에 저장하고, 검색·경로를 기기 안에서 계산한다. 타입·검증 코드: `src/map/package.ts`.

## 공통 규칙

- 좌표: EPSG:5186 미터. `x` 동쪽, `y` 북쪽, `z` 해발(m, KVD 인천 평균해수면).
- 꾸러미 안 참조는 DB id 가 아니라 **문자열 key**(ERD 의 `key`, 원천 id 기반 안정 키). 릴리스가 바뀌어도 같은 대상은 같은 key.
- 모르는 값은 `null`. NULL 한 칸에 뜻 두 개를 두지 않는다(ERD 수정 1): 바깥/실내는 `location` 으로, `floorKey: null` 은 "실내인데 층 모름"(indoor) 또는 바깥(outdoor).
- 인코딩 UTF-8. 응답 본문 바이트 그대로의 SHA-256 을 `sha256` 으로 준다.

## 최상위

```json
{
  "schemaVersion": 1,
  "release": { "version": 3, "createdAt": "2026-10-15T09:00:00Z", "source": "campus-tracker 2026-10-12c" },
  "campus": { "code": "skuniv", "name": "서경대학교", "crs": 5186 },
  "buildings": [],
  "floors": [],
  "nodes": [],
  "edges": [],
  "places": [],
  "walkAreas": [],
  "walkAreaNodes": []
}
```

## buildings[]

| 필드      | 형              | 설명                           |
| --------- | --------------- | ------------------------------ |
| key       | string          | 예 `b:북악관`                  |
| name      | string          | 표시 이름                      |
| localizedNames | object (선택) | 화면 언어 코드 `ko`, `zh`(간체), `ja`, `en`별 표시 이름. 없는 언어는 기존 이름/내장 번역 사용 |
| aliases   | string[]        | 검색용 다른 이름               |
| center    | [x,y] \| null   | 이름 표시 자리                 |
| footprint | [x,y][] \| null | 외곽선(닫힘 점 반복 없어도 됨) |

## floors[]

| 필드        | 형             | 설명                                                     |
| ----------- | -------------- | -------------------------------------------------------- |
| key         | string         | 예 `f:북악관:5F`                                         |
| buildingKey | string         |                                                          |
| code        | string         | `B1`, `1F` … 건물 안 UNIQUE                              |
| sortOrder   | number         | 아래층이 작음, 건물 안 UNIQUE. 없는 층(4층 등)은 행 없음 |
| floorZ      | number \| null | 층 바닥 높이. 모르면 null                                |
| zEstimated  | boolean        |                                                          |

## nodes[]

| 필드        | 형                  | 설명                                                 |
| ----------- | ------------------- | ---------------------------------------------------- |
| key         | string              |                                                      |
| location    | `outdoor`\|`indoor` |                                                      |
| buildingKey | string \| null      | indoor 면 필수, outdoor 면 null                      |
| floorKey    | string \| null      | outdoor 면 null. indoor 인데 층 모르면 null          |
| kind        | string              | junction, door, stair_end, elevator_stop, endpoint … |
| x, y, z     | number              |                                                      |
| estimated   | boolean             |                                                      |

## edges[]

| 필드             | 형                                                                                          | 설명                                        |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------- |
| key              | string                                                                                      |                                             |
| from, to         | string                                                                                      | 노드 key. 서로 달라야 함                    |
| name             | string \| null                                                                              | 안내 문구용                                 |
| kind             | `walkway`\|`sidewalk`\|`crossing`\|`corridor`\|`stairs`\|`ramp`\|`elevator`\|`vehicle_road` |                                             |
| direction        | `both`\|`forward`\|`backward`                                                               | forward = from→to 만                        |
| pedestrianAccess | `allowed`\|`prohibited`\|`unknown`                                                          | prohibited 는 경로에서 뺌                   |
| wheelchairAccess | 같은 값                                                                                     | MVP 는 unknown 만. "무장애"로 표시하지 않음 |
| lengthM          | number > 0                                                                                  | 3차원 길이                                  |
| stepCount        | number \| null                                                                              |                                             |
| widthM           | number \| null                                                                              |                                             |
| geometry         | [x,y,z][]                                                                                   | 2점 이상                                    |
| estimated        | boolean                                                                                     |                                             |

길의 층은 양 끝 노드에서 알 수 있으므로 따로 두지 않는다.

## places[]

| 필드                            | 형             | 설명                                                                                        |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| key                             | string         | 즐겨찾기는 이 key 로 저장                                                                   |
| location, buildingKey, floorKey |                | 노드와 같은 규칙                                                                            |
| nodeKey                         | string \| null | 경로가 붙는 노드. 같은 층(바깥이면 바깥) 25 m 안 가장 가까운 노드. 없으면 null(길찾기 불가) |
| name                            | string         |                                                                                             |
| localizedNames                  | object (선택)  | `ko`, `zh`, `ja`, `en`별 표시 이름. 제공한 이름은 해당 언어 화면과 검색에 사용               |
| aliases                         | string[]       |                                                                                             |
| category                        | string         | entrance, building_entrance, facility, landmark, parking, bus_stop, room, other             |
| x, y, z                         | number         |                                                                                             |

## walkAreas[] / walkAreaNodes[]

| 필드               | 형                                         | 설명      |
| ------------------ | ------------------------------------------ | --------- |
| key                | string                                     |           |
| location, floorKey |                                            |           |
| name               | string                                     |           |
| kind               | `field`\|`plaza`\|`parking_aisle`\|`other` |           |
| polygon            | [x,y][]                                    | 바깥 고리 |
| z                  | number \| null                             | 면 높이   |
| estimated          | boolean                                    |           |

`walkAreaNodes[]`: `{ "areaKey": "...", "nodeKey": "..." }` — 면과 길이 만나는 노드.

## 검증 (앱이 받을 때, `validatePackage`)

schemaVersion = 1, crs = 5186, 각 목록 key 중복 없음, 참조 key 존재, outdoor 에 건물·층 없음, indoor 에 건물 있음,
같은 건물 층 코드 중복 없음, edge kind·direction·access 값, lengthM > 0, geometry 2점 이상, polygon 3점 이상.
하나라도 어기면 그 꾸러미는 저장하지 않고 이전 꾸러미를 계속 쓴다.

## 서버 API (campus-backend)

- `GET /v1/map/releases/latest` → `{ "id": 3, "version": 3, "schemaVersion": 1, "sizeBytes": 190389, "sha256": "<hex 64>", "url": "/v1/map/releases/3/package" }` (published 중 version 최대)
- `GET /v1/map/releases/{id}/package` → 위 JSON 본문. `url` 은 상대 경로 또는 절대 URL.
- 앱: latest 확인 → 지금 것보다 version 이 크면 받기 → sha256 확인 → 검증 → 저장. 실패하면 이전 것 유지, 아무것도 없으면 내장 fixture.
