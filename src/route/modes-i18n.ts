import type { Language } from '../i18n/translations';
import type { RouteCondition } from './route';
import type { ModeInfo } from './modes';

type Copy = Pick<ModeInfo, 'label' | 'title' | 'note' | 'device'>;
const zh: Record<RouteCondition, Copy> = {
  shortest: { label: '最短', title: '最短路线', note: '包括楼梯在内的最短路线。', device: null },
  fastest: { label: '最快', title: '最快路线', note: '考虑上坡、楼梯和电梯等待时间的最快步行路线。时间为估算值。', device: null },
  avoidStairs: {
    label: '避开楼梯',
    title: '无楼梯路线',
    note: '只查找完全不使用楼梯的路线。若没有符合条件的路线，应用不会自动放宽条件。此路线不保证适合轮椅通行。',
    device: null,
  },
  accessible: {
    label: '轮椅・婴儿车',
    title: '轮椅・婴儿车路线',
    note: '避开楼梯、坡度超过 1/12 的陡坡和狭窄道路。门槛、门和地面状况尚未确认。若没有路线将显示“无路线”。',
    device: null,
  },
  preferElevator: { label: '优先电梯', title: '优先电梯路线', note: '优先使用电梯和坡道；必要时仍会使用楼梯。', device: null },
  rainProtected: {
    label: '避雨',
    title: '避雨路线',
    note: '优先经过室内、地下和有遮棚的道路。无屋顶资料的室外道路视为淋雨。',
    device: '离线地图缺少屋顶数据，目前仅将室内道路视为避雨路线。连接服务器后将重新计算。',
  },
  nightSafe: {
    label: '夜间明亮',
    title: '夜间明亮路线',
    note: '优先经过有路灯的道路并减少经过车道。路灯数据仅包含已确认的位置，建筑物夜间开放情况未知。',
    device: '离线地图缺少路灯数据，目前仅优先室内道路并减少经过车道。连接服务器后将重新计算。',
  },
};
const ja: Record<RouteCondition, Copy> = {
  shortest: { label: '最短', title: '最短ルート', note: '階段を含む最も短い道です。', device: null },
  fastest: {
    label: '早い道',
    title: '最速ルート',
    note: '上り坂・階段・エレベーターの待ち時間を考慮した最も早い道です。時間は目安です。',
    device: null,
  },
  avoidStairs: {
    label: '階段を避ける',
    title: '階段のないルート',
    note: '階段を使わない道だけを探します。見つからない場合も条件を自動で変更しません。車いすでの通行は保証できません。',
    device: null,
  },
  accessible: {
    label: '車いす・ベビーカー',
    title: '車いす・ベビーカールート',
    note: '階段、1/12を超える急坂、狭い道を避けます。段差・ドア・床の状態は未確認です。道がない場合はお知らせします。',
    device: null,
  },
  preferElevator: {
    label: 'エレベーター優先',
    title: 'エレベーター優先ルート',
    note: 'エレベーターやスロープを優先します。必要に応じて階段も使います。',
    device: null,
  },
  rainProtected: {
    label: '雨を避ける',
    title: '雨を避けるルート',
    note: '屋内・地下・ひさしの下を優先します。屋根が不明な屋外の道は雨に濡れるものとします。',
    device: '保存した地図に屋根の情報がないため、屋内のみを雨を避ける道として計算しました。接続後に再計算します。',
  },
  nightSafe: {
    label: '夜に明るい道',
    title: '夜に明るいルート',
    note: '街灯のある道を優先し、車道をなるべく避けます。街灯は確認済みの場所のみで、建物の夜間入館は不明です。',
    device: '保存した地図に街灯の情報がないため、屋内を優先し車道を避けて計算しました。接続後に再計算します。',
  },
};
const en: Record<RouteCondition, Copy> = {
  shortest: { label: 'Shortest', title: 'Shortest route', note: 'The shortest route, including stairs.', device: null },
  fastest: {
    label: 'Fastest',
    title: 'Fastest route',
    note: 'The quickest walking route, accounting for slopes, stairs and elevator waits. Times are estimates.',
    device: null,
  },
  avoidStairs: {
    label: 'Avoid stairs',
    title: 'Step-free route',
    note: 'Only routes without stairs are considered. If none exists, your preference is not automatically relaxed. Wheelchair access is not guaranteed.',
    device: null,
  },
  accessible: {
    label: 'Wheelchair & stroller',
    title: 'Wheelchair and stroller route',
    note: 'Avoids stairs, slopes steeper than 1:12 and narrow paths. Thresholds, doors and surface conditions have not been verified. If no route exists, we will let you know.',
    device: null,
  },
  preferElevator: {
    label: 'Prefer elevators',
    title: 'Elevator-preferred route',
    note: 'Prefers elevators and ramps, but may use stairs when needed.',
    device: null,
  },
  rainProtected: {
    label: 'Sheltered',
    title: 'Rain-sheltered route',
    note: 'Prefers indoor, underground and covered paths. Outdoor paths with unknown cover are treated as exposed.',
    device: 'The saved map lacks roof data, so only indoor paths are treated as sheltered. The route will be recalculated when connected.',
  },
  nightSafe: {
    label: 'Well-lit at night',
    title: 'Well-lit night route',
    note: 'Prefers lit paths and avoids roads where possible. Only confirmed lights are included; nighttime building access is unknown.',
    device:
      'The saved map lacks lighting data, so indoor paths are preferred and roads avoided where possible. The route will be recalculated when connected.',
  },
};
export function localizedMode(key: RouteCondition, lang: Language): Copy | null {
  return lang === 'zh' ? zh[key] : lang === 'ja' ? ja[key] : lang === 'en' ? en[key] : null;
}
