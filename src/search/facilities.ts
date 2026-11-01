// 사진·색인 기반 초안. 지도 좌표/이름을 덮어쓰지 않는다.
import directory from '../data/facility-directory.draft.json';
import { normalize } from './search';

export function searchFacilities(query: string, limit = 30) {
  const tokens = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!tokens.length) return [];
  return directory.entries
    .filter((entry) => {
      const fields = [entry.displayName, ...entry.aliases, ...Object.values(entry.searchTags).flat()].map(normalize);
      return tokens.every((token) => fields.some((field) => field.includes(token)));
    })
    .slice(0, limit);
}
