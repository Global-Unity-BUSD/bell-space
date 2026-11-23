import Svg, { Path } from 'react-native-svg';

// Line icons drawn with the existing react-native-svg dependency (24×24 grid).
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

const ICONS = {
  updates: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  navigation: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', circle(12, 10, 3)],
  chat: ['M21 11.5a8.4 8.4 0 0 1-9 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5z'],
  qa: [circle(12, 12, 10), 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01'],
  settings: [circle(12, 12, 3),
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  search: [circle(11, 11, 7.5), 'M21 21l-4.6-4.6'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  reset: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M16 21h3a2 2 0 0 0 2-2v-3', 'M3 16v3a2 2 0 0 0 2 2h3'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  locate: [circle(12, 12, 7), circle(12, 12, 2), 'M12 1v4', 'M12 19v4', 'M1 12h4', 'M19 12h4'],
  room: ['M3 21h18', 'M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17', 'M15 12h.01'],
  area: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  info: [circle(12, 12, 10), 'M12 16v-4', 'M12 8h.01'],
  clock: [circle(12, 12, 9), 'M12 7v5l3 2'],
  building: ['M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16', 'M15 9h4a1 1 0 0 1 1 1v11', 'M2 21h20',
    'M8 8h3', 'M8 12h3', 'M8 16h3'],
  check: ['M20 6L9 17l-5-5'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  back: ['M15 18l-6-6 6-6'],
  flag: ['M4 22V4', 'M4 4h13l-2 4 2 4H4'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', circle(8.5, 8.5, 1.5), 'M21 15l-5-5L5 21'],
  pin: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', circle(12, 10, 3)],
  user: [circle(12, 8, 4), 'M4 21a8 8 0 0 1 16 0'],
} as const;

export type IconName = keyof typeof ICONS;

export default function Icon({ name, size = 24, color, strokeWidth = 2 }: {
  name: IconName; size?: number; color: string; strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map((d) => <Path key={d} d={d} />)}
    </Svg>
  );
}
