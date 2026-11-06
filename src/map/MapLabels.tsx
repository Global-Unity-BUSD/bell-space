import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { labelOpacity, planLabels, STAIR_MARKER, type LabelSpec, type PlannedLabel } from './labelPlan';
import { mapColors } from '../ui/theme';

type Camera = {
  width: number;
  height: number;
  fitScale: number;
  mapWidth: number;
  mapHeight: number;
  maxZoom: number;
  zoom: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
};

const TEXT_STYLE = {
  room: { fontWeight: '700', color: mapColors.roomText },
  area: { fontWeight: '700', color: mapColors.areaText },
  building: { fontWeight: '800', color: mapColors.buildingText },
  context: { fontWeight: '500', color: mapColors.contextText },
  stair: {},
} as const;

function StairBadge() {
  return (
    <View style={styles.stair}>
      <Svg width={12} height={12} viewBox="0 0 12 12">
        <Path d="M1 11h3V8h3V5h3V2h1" stroke="#ffffff" strokeWidth={1.6} fill="none"
          strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

// One label: native text placed on the UI thread. Its position depends only
// on zoom (the parent container carries the pan), so panning updates a single
// view and pinching updates positions with plain arithmetic.
const MapLabel = memo(function MapLabel({ label, camera }: { label: PlannedLabel; camera: Camera }) {
  const { zoom, fitScale, width, height, mapWidth, mapHeight } = camera;
  const { anchor, appear, vanish, rotate } = label;
  const boxW = label.width;
  const boxH = label.height;
  const style = useAnimatedStyle(() => {
    const z = zoom.value;
    const opacity = labelOpacity(z, appear, vanish);
    if (opacity === 0) return { opacity: 0 };
    const s = fitScale * z;
    return {
      opacity,
      transform: [
        { translateX: width / 2 + s * (anchor.x - mapWidth / 2) - boxW / 2 },
        { translateY: height / 2 + s * (anchor.y - mapHeight / 2) - boxH / 2 },
        { rotate: rotate ? '-90deg' : '0deg' },
      ],
    };
  });
  if (!Number.isFinite(appear)) return null;
  return (
    <Animated.View style={[styles.label, { width: boxW, height: boxH }, style]}>
      {label.kind === 'stair' ? <StairBadge /> : (
        <Text allowFontScaling={false} numberOfLines={label.lines.length} style={[
          styles.text, TEXT_STYLE[label.kind], { fontSize: label.fontSize, lineHeight: Math.round(label.fontSize * 1.18) },
          label.uncertain && styles.uncertain,
        ]}>
          {label.lines.join('\n')}
        </Text>
      )}
    </Animated.View>
  );
});

export default memo(function MapLabels({ specs, camera }: { specs: LabelSpec[]; camera: Camera }) {
  const { fitScale, maxZoom, x, y } = camera;
  const labels = useMemo(() => planLabels(specs, fitScale, maxZoom), [specs, fitScale, maxZoom]);
  const pan = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, pan]}>
      {labels.map((label) => <MapLabel key={label.id} label={label} camera={camera} />)}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  label: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center', opacity: 0 },
  text: {
    textAlign: 'center', letterSpacing: 0.1,
    textShadowColor: 'rgba(255,255,255,0.95)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 },
  },
  uncertain: { fontStyle: 'italic', fontWeight: '500', color: mapColors.uncertainText },
  stair: {
    width: STAIR_MARKER, height: STAIR_MARKER, borderRadius: 5, backgroundColor: mapColors.stair,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#ffffff',
  },
});
