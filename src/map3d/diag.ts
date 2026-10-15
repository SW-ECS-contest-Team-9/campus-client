// 네이티브 3D 측정 글(LOAD3D·FIRST_FRAME·FRAMES)을 앱 안에 남김. 삼성 실기기는 release 앱의 console 을 logcat 에 안 남겨서
// 설정 화면 맨 아래 "3D 측정" 줄로 보여 줌(실기기 확인용).
let lines: string[] = [];

export function note3dStat(text: string): void {
  const kind = text.split(' ')[0];
  // 종류별 마지막 것 + FRAMES 는 최근 5개
  lines =
    kind === 'FRAMES'
      ? [...lines, text].filter((l, i, a) => !l.startsWith('FRAMES') || a.slice(i).filter((x) => x.startsWith('FRAMES')).length <= 5)
      : [...lines.filter((l) => !l.startsWith(kind)), text];
}
export function get3dStats(): string[] {
  return lines;
}
