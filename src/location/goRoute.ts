// 목적지를 고른 뒤 다음 화면 정하기(사례 R20: 네이버지도·구글맵은 출발지 = 현재 위치가 기본, 바꿀 때만 손댐).
// 현재 위치가 확실하면 바로 경로 미리보기, 아니면 출발점 고르기 화면.
import { router } from 'expo-router';
import type { MapPackage } from '../map/package';
import type { Graph } from '../route/route';
import type { Fix } from './fix';
import { startFromCurrentFix, type StartPoint } from './start';
import type { Language } from '../i18n/translations';

export function beginRoute(pkg: MapPackage, graph: Graph | null, fix: Fix | null, set: { start: (s: StartPoint | null) => void }, language: Language = 'ko'): void {
  const st = startFromCurrentFix(pkg, graph, fix, language);
  set.start(st);
  router.push(st ? '/preview' : '/start');
}
