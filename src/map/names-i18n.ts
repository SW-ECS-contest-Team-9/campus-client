import type { Language } from '../i18n/translations';
import type { LocalizedNames, MapPackage } from './package';

// Names follow the university's published campus map where available. Unknown
// server-provided proper names are retained rather than guessed.
const buildings: Record<string, readonly [string, string, string]> = {
  '본관': ['Administration 大楼', 'Administration館', 'Administration Bldg.'],
  '북악관': ['Bukak 大楼', 'Bukak館', 'Bukak Bldg.'],
  '유담관': ['Yudam 大楼', 'Yudam館', 'Yudam Bldg.'],
  '문예관': ['Munye 大楼', 'Munye館', 'Munye Bldg.'],
  '대일관': ['Daeil 大楼', 'Daeil館', 'Daeil Bldg.'],
  '상승관': ['Sangseung 大楼', 'Sangseung館', 'Sangseung Bldg.'],
  '수인관': ['Suin 大楼', 'Suin館', 'Suin Bldg.'],
  '청운관': ['Cheongun 大楼', 'Cheongun館', 'Cheongun Bldg.'],
  '혜인관': ['Hyein 大楼', 'Hyein館', 'Hyein Bldg.'],
  '한림관': ['Hanlim 大楼', 'Hanlim館', 'Hanlim Bldg.'],
  '은주관': ['Eunjoo 大楼', 'Eunjoo館', 'Eunjoo Bldg.'],
  '은주1관': ['Eunjoo 1 号楼', 'Eunjoo 1号館', 'Eunjoo Bldg. 1'],
  '은주2관': ['Eunjoo 2 号楼', 'Eunjoo 2号館', 'Eunjoo Bldg. 2'],
  '외국인 생활관': ['国际学生宿舍', '留学生寮', 'International Student Dormitory'],
  '공연실습소': ['表演实习室', '公演実習施設', 'Performance Practice Facility'],
};
const index = { zh: 0, ja: 1, en: 2 } as const;
const words: Record<string, readonly [string, string, string]> = {
  '하단 주차장 입구': ['下方停车场入口', '下側駐車場入口', 'Lower parking entrance'],
  '표지판 P1 입구': ['P1 标识入口', 'P1標識の入口', 'P1 sign entrance'],
  '운동장 지하 1층 주차장': ['运动场地下 1 层停车场', '運動場地下1階駐車場', 'Sports field B1 parking'],
  '운동장 지하 2층 주차장': ['运动场地下 2 层停车场', '運動場地下2階駐車場', 'Sports field B2 parking'],
  '라운지': ['休息室', 'ラウンジ', 'Lounge'],
  '편의점': ['便利店', 'コンビニ', 'Convenience store'],
  '노브랜드버거': ['No Brand Burger', 'No Brand Burger', 'No Brand Burger'],
  '정문': ['正门', '正門', 'Main gate'],
  '서문': ['西门', '西門', 'West gate'],
  '도서관': ['图书馆', '図書館', 'Library'],
  '학생식당': ['学生食堂', '学生食堂', 'Student cafeteria'],
  '학식': ['学生食堂', '学生食堂', 'Student cafeteria'],
  '식당': ['餐厅', '食堂', 'Dining hall'],
  '카페': ['咖啡厅', 'カフェ', 'Café'],
  '화장실': ['洗手间', 'トイレ', 'Restroom'],
  '프린터': ['打印机', 'プリンター', 'Printer'],
  '행정실': ['行政办公室', '事務室', 'Administration office'],
  '학과사무실': ['院系办公室', '学科事務室', 'Department office'],
  '보건실': ['医务室', '保健室', 'Health room'],
  '체육관': ['体育馆', '体育館', 'Gymnasium'],
  '강당': ['礼堂', '講堂', 'Auditorium'],
  '헬스장': ['健身房', 'フィットネスジム', 'Fitness center'],
  '은행': ['银行', '銀行', 'Bank'],
  '우체국': ['邮局', '郵便局', 'Post office'],
  '스터디룸': ['自习室', '自習室', 'Study room'],
  '열람실': ['阅览室', '閲覧室', 'Reading room'],
  '서문(후문)': ['西门（后门）', '西門（裏門）', 'West gate (back gate)'],
  '지하통로 입구': ['地下通道入口', '地下通路入口', 'Underground passage entrance'],
  '연결통로': ['连接通道', '連絡通路', 'Connecting passage'],
  '버스 정류장 옆': ['公交车站旁', 'バス停の横', 'Beside the bus stop'],
  '북서 모서리': ['西北角', '北西の角', 'Northwest corner'],
  '북쪽': ['北侧', '北側', 'North side'],
};

/** Remove internal annotation without cutting '=' inside parenthetical notes. */
export function cleanMapName(name: string): string {
  let out = '';
  let depth = 0;
  let note = '';
  for (const char of name) {
    if (char === '(') { if (depth++ === 0) { note = ''; continue; } }
    if (char === ')' && depth > 0) {
      if (--depth === 0) {
        const trimmed = note.trim();
        // Keep identifying names; discard recognizable survey notes, not every
        // parenthetical phrase supplied by a publisher or user.
        const isSurveyNote = /추정|미정|연결\s*층|사용자|현장|학교\s*표지|현관|옹벽|평탄부|회차\s*공간|지도\s*표기|C0\d|\d+(?:\.\d+)?\s*m/i.test(trimmed);
        if (trimmed && !isSurveyNote) out += `(${trimmed})`;
        continue;
      }
    }
    if (depth) note += char;
    else if (char === '=') break;
    else out += char;
  }
  return out.replace(/\s{2,}/g, ' ').trim() || name;
}

export function localizedMapName(name: string, language: Language): string {
  if (language === 'ko') return name;
  const i = index[language];
  if (buildings[name]) return buildings[name][i];
  if (words[name]) return words[name][i];
  const buildingFacility = /^(.+?)\s+(.+)$/.exec(name);
  if (buildingFacility && buildings[buildingFacility[1]] && words[buildingFacility[2]])
    return `${buildings[buildingFacility[1]][i]} ${words[buildingFacility[2]][i]}`;
  const bus = /^서경대본관\s*(\d+)번\s*버스정류장$/.exec(name);
  if (bus) return [`Administration 大楼 ${bus[1]} 路公交车站`, `Administration館 ${bus[1]}番バス停`, `Administration Bldg. bus stop ${bus[1]}`][i];
  const parking = /^(\d+)주차장(?:\s*지하\s*(\d+)층|\s*입구)$/.exec(name);
  if (parking) return parking[2]
    ? [`${parking[1]} 号停车场 B${parking[2]}`, `第${parking[1]}駐車場 B${parking[2]}`, `Parking ${parking[1]} B${parking[2]}`][i]
    : [`${parking[1]} 号停车场入口`, `第${parking[1]}駐車場入口`, `Parking ${parking[1]} entrance`][i];
  const context = /^(라운지|편의점)\s*\(([^()]+)\)$/.exec(name);
  if (context) return `${words[context[1]][i]} (${localizedMapName(context[2], language)})`;
  const underground = /^지하통로 입구:\s*(.+)$/.exec(name);
  if (underground) return `${words['지하통로 입구'][i]}: ${localizedMapName(underground[1], language)}`;
  const direction = /^(.*?)(?:\s+)(동|서|북쪽|북서 모서리)$/.exec(name);
  if (direction && buildings[direction[1]]) {
    const d = direction[2] === '동' ? ['东侧', '東側', 'East side'] : direction[2] === '서' ? ['西侧', '西側', 'West side'] : words[direction[2]];
    return `${buildings[direction[1]][i]} ${d[i]}`;
  }
  const passage = /^(.+?)–(.+?)\s*연결통로$/.exec(name);
  if (passage) return `${localizedMapName(passage[1], language)} – ${localizedMapName(passage[2], language)} ${words['연결통로'][i]}`;
  const entrance = /^(.+?)\s*입구(?:\s*\((\d+)\))?$/.exec(name);
  if (entrance && (buildings[entrance[1]] || /^P\d+$/.test(entrance[1]))) {
    const b = buildings[entrance[1]]?.[i] ?? entrance[1];
    const no = entrance[2];
    return no ? [`${b} ${no} 号入口`, `${b} ${no}番入口`, `${b} entrance ${no}`][i]
      : [`${b} 入口`, `${b}入口`, `${b} entrance`][i];
  }
  const floor = /^(.+?)\s*(\d+)층(?:\s*로비 문)?$/.exec(name);
  if (floor && buildings[floor[1]]) {
    const b = buildings[floor[1]][i];
    return name.endsWith('로비 문') ? [`${b} ${floor[2]} 层大厅门`, `${b} ${floor[2]}階ロビーのドア`, `${b} ${floor[2]}F lobby door`][i]
      : `${b} ${floor[2]}F`;
  }
  const buildingFloor = /^(.+?)\s+(B\d+|\d+F)$/.exec(name);
  if (buildingFloor && buildings[buildingFloor[1]]) return `${buildings[buildingFloor[1]][i]} ${buildingFloor[2]}`;
  return name;
}

/** Prefer publisher-provided translations for new or renamed map entities. */
export function localizedEntityName(entity: { name: string; localizedNames?: LocalizedNames }, language: Language): string {
  const supplied = entity.localizedNames?.[language];
  return typeof supplied === 'string' && supplied.trim() ? supplied.trim() : localizedMapName(cleanMapName(entity.name), language);
}

/** Translate a route's structured building-and-floor label using its map package. */
export function localizedPackageFloor(value: string, pkg: Pick<MapPackage, 'buildings'>, language: Language): string {
  const match = /^(.*?)\s+(B\d+|\d+F)$/i.exec(value);
  const building = match && pkg.buildings.find((b) => b.name === match[1]);
  return match && building ? `${localizedEntityName(building, language)} ${match[2]}` : localizedMapName(value, language);
}

/** Re-localize a previously rendered building and optional floor in saved history. */
export function localizedBuildingFloor(value: string, language: Language): string {
  for (const [korean, names] of Object.entries(buildings)) {
    for (const name of [korean, ...names]) {
      if (value === name || value.startsWith(`${name} `)) {
        const suffix = value.slice(name.length);
        if (!suffix || /^ (?:B\d+|\d+F)$/i.test(suffix)) {
          return `${language === 'ko' ? korean : names[index[language]]}${suffix}`;
        }
      }
    }
  }
  return value;
}
