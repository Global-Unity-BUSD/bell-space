import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

const RING = 100; // base ring size, scaled to the uncertainty radius
const DOT = 16;
const MIN_RING = 44; // an approximate position is never drawn smaller than this

// Live position marker: a dot and an uncertainty circle that follow the map
// camera on the UI thread. An approximate estimate is drawn without a solid
// dot, so it never looks like an exact position.
export default function LiveMarker({ point, radius, quality, width, height, fitScale, fittedWidth, fittedHeight,
  zoom, x, y }: {
  point: { x: number; y: number };
  // Uncertainty radius in map units.
  radius: number;
  quality: 'precise' | 'approximate' | 'unknown';
  width: number; height: number; fitScale: number; fittedWidth: number; fittedHeight: number;
  zoom: SharedValue<number>; x: SharedValue<number>; y: SharedValue<number>;
}) {
  const ring = useAnimatedStyle(() => {
    const cx = width / 2 + x.value + zoom.value * (point.x * fitScale - fittedWidth / 2);
    const cy = height / 2 + y.value + zoom.value * (point.y * fitScale - fittedHeight / 2);
    const px = Math.max(quality === 'precise' ? DOT : MIN_RING, radius * fitScale * zoom.value * 2);
    return { transform: [{ translateX: cx - RING / 2 }, { translateY: cy - RING / 2 }, { scale: px / RING }] };
  });
  const dot = useAnimatedStyle(() => ({
    transform: [
      { translateX: width / 2 + x.value + zoom.value * (point.x * fitScale - fittedWidth / 2) - DOT / 2 },
      { translateY: height / 2 + y.value + zoom.value * (point.y * fitScale - fittedHeight / 2) - DOT / 2 },
    ],
  }));
  const color = quality === 'precise' ? '#1769ff' : quality === 'approximate' ? '#d97706' : '#8b95a1';
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: color, backgroundColor: `${color}22` },
        quality !== 'precise' && styles.dashed, ring]} />
      {quality === 'precise' && (
        <Animated.View pointerEvents="none" style={[styles.dotWrap, dot]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', left: 0, top: 0, width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2 },
  dashed: { borderStyle: 'dashed' },
  dotWrap: { position: 'absolute', left: 0, top: 0, width: DOT, height: DOT },
  dot: { flex: 1, borderRadius: DOT / 2, borderWidth: 3, borderColor: '#ffffff' },
});
