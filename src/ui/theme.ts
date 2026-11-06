import type { TextStyle } from 'react-native';

export const colors = {
  brand: '#1769ff',
  brandPressed: '#0f56db',
  brandSoft: '#e9f0ff',
  text: '#111827',
  textMuted: '#5b6675',
  textFaint: '#8b95a1',
  surface: '#ffffff',
  surfaceMuted: '#f2f4f7',
  canvas: '#f6f7f9',
  border: '#e3e7ec',
  scrim: 'rgba(17, 24, 39, 0.92)',
  previewBg: '#fff4dc',
  previewText: '#8a5a00',
  success: '#17803d',
  danger: '#b42318',
  dangerSoft: '#fdecea',
};

export const mapColors = {
  background: '#eef1f4',
  building: '#ffffff',
  ghost: '#e2e7ec',
  ghostDark: '#9da9b7',
  wall: '#6f7f8c',
  divider: '#9aa6b1',
  uncertain: '#bcc4cc',
  site: '#c3ccd4',
  pin: '#1769ff',
  roomText: '#0b1726',
  areaText: '#1d3557',
  buildingText: '#123a73',
  contextText: '#7a8694',
  uncertainText: '#7b8794',
  stair: '#0f766e',
  stairFill: '#d4efe8',
  route: '#1769ff',
  routeReview: '#ea580c',
  door: '#1769ff',
  openArea: '#e6f2e0',
  coveredArea: '#f1e9d6',
  hill: '#cfe6c3',
  hillEdge: '#5e9150',
  ramp: '#7c3aed',
  rampFill: '#ece2fb',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };

export const type = {
  brand: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, color: colors.brand },
  screenTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  bodyMuted: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  caption: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  overline: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },
} satisfies Record<string, TextStyle>;

export const shadow = {
  shadowColor: '#0b1b33',
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};
