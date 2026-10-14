// ST02 경로 없음: 원인별 문구와 다음 행동. 화면·RN 에 의존하지 않음(시험 가능).
// 원칙: 무엇이 안 되는지 한 줄 → 왜(지도 자료 사정) → 지금 할 수 있는 일. 조건은 스스로 바꾸지 않음(제품 규칙 04).
import type { RouteCondition } from './route';

export type NoRouteCause = 'stairs' | 'disconnected' | 'dest_unattached' | 'start_unattached' | 'same_place';
export type NoRouteAction = 'change_start' | 'change_dest' | 'allow_stairs' | 'nearby_dest' | 'arrive';
export interface NoRouteCopy {
  cause: NoRouteCause;
  title: string;
  body: string;
  primary: { action: NoRouteAction; label: string };
  secondary: { action: NoRouteAction; label: string } | null;
}

export function noRouteCopy(input: {
  reason: 'no_route' | 'same_point' | 'unknown_node';
  condition: RouteCondition;
  destName: string | null;
  destAttached: boolean;
}): NoRouteCopy {
  const dest = input.destName ?? '목적지';
  if (input.reason === 'same_point')
    return {
      cause: 'same_place',
      title: '출발점과 목적지가\n같은 곳이에요.',
      body: `지금 ${dest} 근처에 있어요. 다른 곳으로 가려면 목적지를 바꿔 주세요.`,
      primary: { action: 'change_dest', label: '목적지 바꾸기' },
      secondary: { action: 'arrive', label: '여기가 맞아요 · 도착 확인' },
    };
  if (input.reason === 'unknown_node')
    return input.destAttached
      ? {
          cause: 'start_unattached',
          title: '출발점이 길과\n이어져 있지 않아요.',
          body: '고른 출발점이 지도의 길과 연결되지 않아 경로를 만들 수 없어요. 가까운 출입구나 다른 장소를 출발점으로 골라 주세요.',
          primary: { action: 'change_start', label: '출발점 다시 고르기' },
          secondary: null,
        }
      : {
          cause: 'dest_unattached',
          title: `${dest}까지는\n아직 길 안내가 안 돼요.`,
          body: '이 장소는 지도에서 길과 이어지지 않았어요(지도 자료 준비 중). 같은 건물의 출입구나 가까운 장소를 목적지로 골라 보세요.',
          primary: { action: 'nearby_dest', label: '가까운 장소 찾기' },
          secondary: { action: 'change_start', label: '출발점 바꾸기' },
        };
  if (input.condition === 'avoidStairs')
    return {
      cause: 'stairs',
      title: '계단을 피하는 경로가\n연결되어 있지 않아요.',
      body: `${dest}까지 계단 없이 이어지는 길이 지금 지도에 없어요. 실제로는 길이 있어도 아직 지도에 그려지지 않았을 수 있어요.`,
      primary: { action: 'change_start', label: '출발점·목적지 변경' },
      secondary: { action: 'allow_stairs', label: '계단 허용으로 조건 변경' },
    };
  return {
    cause: 'disconnected',
    title: '두 곳을 잇는 길이\n지도에서 끊겨 있어요.',
    body: `${dest}까지 가는 길 중간이 지도에 아직 없어요. 다른 출입구나 가까운 장소를 고르면 안내할 수 있을 수 있어요.`,
    primary: { action: 'nearby_dest', label: '가까운 장소로 바꾸기' },
    secondary: { action: 'change_start', label: '출발점 바꾸기' },
  };
}
