// 경로 방식 7가지의 화면 이름·설명(CT05 옵션·CT06 미리보기·CT12 최근·CT13 설정·ST02 경로 없음 공용).
// 이름은 서버 MODE_SPEC(label)과 맞춤. 기기 꾸러미에 자료가 없는 방식은 device 에 기기 계산의 한계를 적음.
import type { RouteCondition } from './route';

export interface ModeInfo {
  key: RouteCondition;
  /** 칩 이름 */
  label: string;
  /** 미리보기 머리글 */
  title: string;
  note: string;
  /** 기기 계산이 이 방식과 다를 때 알림(null 이면 기기 계산 = 이 방식) */
  device: string | null;
}

const SERVER_ONLY =
  '기기 지도에는 이 방식에 필요한 자료(걷는 시간·지붕·조명)가 없어 지도에는 최단 경로를 그려요. 이 방식의 결과는 아래 서버 계산이에요.';

export const MODES: ModeInfo[] = [
  { key: 'shortest', label: '최단', title: '최단 경로', note: '계단을 포함해 가장 짧은 길이에요.', device: null },
  {
    key: 'fastest',
    label: '빠른 길',
    title: '빠른 경로',
    note: '오르막·계단·승강기 기다림을 셈해 걷는 시간이 가장 짧은 길이에요. 시간은 어림값이에요.',
    device: SERVER_ONLY,
  },
  {
    key: 'avoidStairs',
    label: '계단 피하기',
    title: '계단 없는 경로',
    note: '계단을 전혀 쓰지 않는 길만 찾아요. 없으면 "경로 없음"으로 알려 드리고 조건을 스스로 풀지 않아요. 휠체어 통행(폭·경사·문)을 보장하지는 않아요.',
    device: null,
  },
  {
    key: 'accessible',
    label: '휠체어·유모차',
    title: '휠체어·유모차 경로',
    note: '계단과 가파른 길(1/12 넘음)·좁은 길을 빼요. 문턱·문·바닥 상태는 아직 확인되지 않았어요. 없으면 "경로 없음"으로 알려 드려요.',
    device: '기기 계산은 계단과 휠체어 금지 길만 빼요. 가파른 길까지 뺀 결과는 아래 서버 계산이에요.',
  },
  {
    key: 'preferElevator',
    label: '승강기 우선',
    title: '승강기 우선 경로',
    note: '계단보다 승강기·경사로를 먼저 써요. 필요하면 계단도 써요.',
    device: null,
  },
  {
    key: 'rainProtected',
    label: '비 안 맞는 길',
    title: '비 안 맞는 경로',
    note: '실내·지하·차양 밑을 먼저 지나요. 지붕을 모르는 바깥 길은 비를 맞는 것으로 셈해요.',
    device: SERVER_ONLY,
  },
  {
    key: 'nightSafe',
    label: '밤에 밝은 길',
    title: '밤에 밝은 경로',
    note: '가로등이 있는 길을 먼저 쓰고 차도를 덜 지나요. 가로등은 확인된 곳만 자료에 있고, 건물 야간 출입은 몰라요.',
    device: SERVER_ONLY,
  },
];

export const modeInfo = (k: RouteCondition): ModeInfo => MODES.find((m) => m.key === k) ?? MODES[0];
