// 지원 언어의 명시적 이동 표현을 기존 조건 파서에 연결한다. 모델 번역/재학습은 아니다.
const terms: [RegExp, string][] = [
  [/\b(?:without stairs|no stairs|avoid(?:ing)? stairs)\b|階段(?:なし|を避け)|不走楼梯|不要楼梯|避免楼梯/gi, '계단 없이'],
  [/\b(?:fewer stairs|less stairs)\b|階段を少なく|少走楼梯/gi, '계단 적게'],
  [/\bwheelchair\b|車椅子|轮椅|輪椅/gi, '휠체어'],
  [/\b(?:elevator|lift)\b|エレベーター|电梯|電梯/gi, '엘리베이터'],
  [/\b(?:avoid(?:ing)? rain|rain(?:ing)?)\b|雨に濡れず|雨を避け|雨が降|避雨|下雨/gi, '비가 와요'],
  [/\b(?:fastest|quickly|hurry)\b|急いで|最快|赶时间/gi, '빨리'],
  [/\b(?:at night|night)\b|夜間|夜道|夜里|夜间/gi, '밤'],
  [/\bindoors?\b|屋内|室内/gi, '실내'],
];

export function routeLanguage(text: string): string {
  let value = text
    .replace(/\bfrom\s+(.+?)\s+to\s+/gi, '$1에서 ')
    .replace(/(?:从|從)(.+?)(?:到|去)/g, '$1에서 ')
    .replace(/から/g, '에서')
    .replace(/まで/g, '로')
    .replace(/\bbasement\s*(\d+)/gi, '지하$1층')
    .replace(/\bfloor\s*(\d+)/gi, '$1층')
    .replace(/地下\s*(\d+)\s*[階层樓楼]/g, '지하$1층')
    .replace(/(\d+)\s*[階层樓楼]/g, '$1층');
  for (const [pattern, replacement] of terms) value = value.replace(pattern, replacement);
  return value;
}
