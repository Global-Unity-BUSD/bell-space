import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

const PIN_WIDTH = 30;
const PIN_HEIGHT = 38;
// Gap between the pin tip and the top of the label it marks.
const LABEL_CLEARANCE = 4;

// Screen-space marker whose tip follows a map point through the same camera
// as the floor (rotation is disabled in the UI, so only pan and zoom apply).
export default function SelectionPin({ point, labelHalfHeight = 8, width, height, fitScale, fittedWidth, fittedHeight, zoom, x, y }: {
  point: { x: number; y: number };
  labelHalfHeight?: number;
  width: number;
  height: number;
  fitScale: number;
  fittedWidth: number;
  fittedHeight: number;
  zoom: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
}) {
  const lift = LABEL_CLEARANCE + labelHalfHeight;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: width / 2 + x.value + zoom.value * (point.x * fitScale - fittedWidth / 2) - PIN_WIDTH / 2 },
      { translateY: height / 2 + y.value + zoom.value * (point.y * fitScale - fittedHeight / 2) - PIN_HEIGHT - lift },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.pin, style]}>
      <Svg width={PIN_WIDTH} height={PIN_HEIGHT} viewBox="0 0 30 38">
        <Path d="M15 37C15 37 28 23.5 28 14A13 13 0 0 0 2 14C2 23.5 15 37 15 37Z"
          fill="#1769ff" stroke="#fff" strokeWidth={2} />
        <Path d="M15 9A5 5 0 1 1 15 19A5 5 0 1 1 15 9Z" fill="#fff" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pin: { position: 'absolute', left: 0, top: 0, width: PIN_WIDTH, height: PIN_HEIGHT },
});
