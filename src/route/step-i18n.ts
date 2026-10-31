import type { Language } from '../i18n/translations';
import { localizedMapName, localizedPackageFloor } from '../map/names-i18n';
import type { MapPackage } from '../map/package';
import type { RouteStep } from './route';

const names = {
  walkway: ['道路', '道', 'Path'],
  sidewalk: ['人行道', '歩道', 'Sidewalk'],
  crossing: ['人行横道', '横断歩道', 'Crosswalk'],
  corridor: ['走廊', '廊下', 'Corridor'],
  stairs: ['楼梯', '階段', 'Stairs'],
  ramp: ['坡道', 'スロープ', 'Ramp'],
  elevator: ['电梯', 'エレベーター', 'Elevator'],
  vehicle_road: ['车道', '車道', 'Road'],
  open_area: ['开放区域', '広場', 'Open area'],
} as const satisfies Record<RouteStep['kind'], readonly [string, string, string]>;

/** Use structured route fields rather than trying to translate server-provided Korean prose. */
export function localizedStep(step: RouteStep, language: Language, pkg?: Pick<MapPackage, 'buildings'>): string {
  if (language === 'ko') return step.text;
  const name = names[step.kind][language === 'zh' ? 0 : language === 'ja' ? 1 : 2];
  if (step.floorChange && step.fromFloor && step.toFloor) {
    const floor = (label: string) => (pkg ? localizedPackageFloor(label, pkg, language) : localizedMapName(label, language));
    const floors = `${floor(step.fromFloor)} → ${floor(step.toFloor)}`;
    return language === 'zh'
      ? `乘坐或经过${name}：${floors}`
      : language === 'ja'
        ? `${name}で ${floors}`
        : `Take ${name.toLowerCase()}: ${floors}`;
  }
  if (step.kind === 'stairs' || step.kind === 'elevator')
    return language === 'zh' ? `使用${name}` : language === 'ja' ? `${name}を利用` : `Take the ${name.toLowerCase()}`;
  return `${name}, ${Math.round(step.lengthM)} m`;
}
