import type { Language } from '../i18n/translations';
import type { NoRouteAction, NoRouteCopy } from './noRouteCopy';
import type { RouteCondition } from './route';

const actions: Record<NoRouteAction, readonly [string, string, string]> = {
  change_start: ['更改出发地', '出発地を変更', 'Change start'],
  change_dest: ['更改目的地', '目的地を変更', 'Change destination'],
  change_condition: ['用自然语言更改条件', '自然文で条件を変更', 'Change preferences using natural language'],
  nearby_dest: ['查找附近地点', '近くの場所を探す', 'Find a nearby place'],
  arrive: ['位置正确 · 确认到达', 'ここで合っています · 到着を確認', 'This is the place · Confirm arrival'],
};

/** The cause is decided by the routing logic; translations never change the recommended actions. */
export function localizedNoRoute(copy: NoRouteCopy, condition: RouteCondition, destName: string | null, language: Language): NoRouteCopy {
  if (language === 'ko') return copy;
  const i = language === 'zh' ? 0 : language === 'ja' ? 1 : 2;
  const dest = destName ?? ['目的地', '目的地', 'your destination'][i];
  const titles: Record<NoRouteCopy['cause'], readonly [string, string, string]> = {
    same_place: ['出发地和目的地\n是同一地点。', '出発地と目的地が\n同じ場所です。', 'Your start and destination\nare the same place.'],
    start_unattached: ['出发地未连接到\n地图道路。', '出発地が道に\n接続されていません。', 'The starting point is not\nconnected to a path.'],
    dest_unattached: [`暂时无法导航至\n${dest}。`, `${dest}への経路を\nまだ案内できません。`, `Directions to ${dest}\nare not available yet.`],
    stairs: condition === 'accessible'
      ? ['没有连通的轮椅或婴儿车路线。', '車いす・ベビーカーで通れる経路がつながっていません。', 'No connected wheelchair or stroller route was found.']
      : ['没有连通的无楼梯路线。', '階段を避ける経路がつながっていません。', 'No connected step-free route was found.'],
    disconnected: ['地图中连接两地的道路\n尚未连通。', '2地点を結ぶ道が\n地図上で途切れています。', 'The path between these places\nis incomplete on the map.'],
  };
  const bodies: Record<NoRouteCopy['cause'], readonly [string, string, string]> = {
    same_place: [`您现在位于 ${dest} 附近。如需前往其他地方，请更改目的地。`, `現在${dest}の近くにいます。別の場所へ行く場合は目的地を変更してください。`, `You are near ${dest}. Change the destination to go somewhere else.`],
    start_unattached: ['所选出发地未连接地图道路。请选择附近的入口或其他出发地。', '選んだ出発地は地図上の道につながっていません。近くの入口などを出発地に選んでください。', 'The selected starting point is not connected to a mapped path. Choose a nearby entrance or another starting point.'],
    dest_unattached: ['此地点尚未连接地图道路。请尝试选择同一建筑的入口或附近地点。', 'この場所は地図上の道につながっていません。同じ建物の入口や近くの場所を選んでください。', 'This place is not connected to a mapped path. Try an entrance in the same building or a nearby place.'],
    stairs: [`当前地图中没有通往 ${dest} 的无楼梯路线。实际存在的路线可能尚未绘制。`, `${dest}まで階段なしでつながる道が地図にありません。実際には道があっても、まだ地図にない場合があります。`, `There is no mapped step-free path to ${dest}. A real path may exist but not yet be mapped.`],
    disconnected: [`地图中尚未完整绘制通往 ${dest} 的道路。请尝试选择其他入口或附近地点。`, `${dest}への道の一部がまだ地図にありません。別の入口や近くの場所を選ぶと案内できる場合があります。`, `Part of the path to ${dest} is not yet mapped. Try another entrance or a nearby place.`],
  };
  const localizeAction = (entry: NonNullable<NoRouteCopy['secondary']>) => ({ ...entry, label: actions[entry.action][i] });
  return { ...copy, title: titles[copy.cause][i], body: bodies[copy.cause][i], primary: localizeAction(copy.primary),
    secondary: copy.secondary ? localizeAction(copy.secondary) : null };
}
