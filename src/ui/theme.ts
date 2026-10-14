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
