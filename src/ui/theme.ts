// 디자인 토큰 한 곳(Figma Foundations 변수). 다시 꾸밀 때는 이 파일과 components.tsx 의 변형 표만 고친다.
export const color = {
  primary: '#4F46E5',
  primaryPressed: '#3730A3',
  primarySoft: '#EEF0FF',
  primarySoftPressed: '#E0E3FF',
  route: '#2563EB',
  success: '#0F766E',
  successSoft: '#E3F4EE',
  warning: '#B45309',
  warningSoft: '#FFF4DD',
  text: '#142235',
  secondary: '#536174',
  border: '#DEE5EF',
  surface: '#FFFFFF',
  canvas: '#F6F8FB',
  onPrimary: '#FFFFFF',
} as const;
export const space = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32, 48: 48 } as const;
export const radius = { 12: 12, 16: 16, 24: 24 } as const;
export const type = {
  display: 28,
  title: 22,
  body: 17,
  small: 15,
  caption: 13,
  actionLabel: { fontSize: 15, lineHeight: 22, fontWeight: '700' as const },
  captionText: { fontSize: 13, lineHeight: 20, fontWeight: '400' as const },
};
export const ICON = 20;

// ---------- V3 시각 체계(백엔드/디자인 "V3 디자인 방향" 원칙 V3-1~11) ----------
/** 브랜드 그라데이션: primary → route → 유도 하늘색. 주 행동·머리 물결·경로 진행에만(V3-4). */
export const gradient = {
  brand: ['#4F46E5', '#2563EB', '#38BDF8'] as const,
  brandPressed: ['#3730A3', '#1D4ED8', '#0EA5E9'] as const,
  deep: ['#1E1B4B', '#312E81', '#1E3A8A'] as const,
  /** 화면 바탕의 옅은 빛(장식, 글자 아래 아님) */
  mist: ['#EEF0FF', '#F4F7FF', '#E8F6FE'] as const,
};
/**
 * 유리 면(V3-2·3). 글자가 올라가는 면은 흰 알파 0.86 이상: 배경이 검정이어도 secondary(#536174) 4.6:1, text 11:1.
 * 어두운 유리는 남색 0.84: 배경이 흰색이어도 흰 글자 9:1.
 */
export const glass = {
  fill: 'rgba(255,255,255,0.86)',
  fillStrong: 'rgba(255,255,255,0.94)',
  dark: 'rgba(20,27,58,0.84)',
  edge: 'rgba(255,255,255,0.9)',
  edgeDark: 'rgba(255,255,255,0.14)',
  outline: 'rgba(49,46,129,0.10)',
  /** 웹 backdrop-filter 흐림(px). Android 는 기본 흐림 없음(V3-10, 측정 근거는 V3 문서 "성능"). */
  blur: 16,
};
export const elevation = {
  float: { shadowColor: '#1E1B4B', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  low: { shadowColor: '#1E1B4B', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
};
/** 모양(V3-5): 캡슐, 시트 위 반경, 비대칭 카드(말풍선 꼬리 쪽 10). */
export const shape = {
  pill: 999,
  sheetTop: 32,
  card: 28,
  tail: 10,
  /** 머리 물결 높이(dp) */
  wave: 28,
};
/** 움직임(V3-7·8). 동작 줄이기면 0 또는 짧은 페이드. */
export const motion = {
  press: 100,
  fast: 160,
  base: 240,
  slow: 300,
  draw: 900,
  sheetSpring: { damping: 24, stiffness: 240, mass: 0.9 },
  pressScale: 0.96,
};
