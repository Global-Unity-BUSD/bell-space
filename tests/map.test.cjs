const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const generate = require('@babel/generator').default;
const { prepareLabeledSvg } = require('../src/map/prepareLabeledSvg.cjs');
const transformer = require('../svg-transformer.cjs');
const { pathBounds } = require('../src/map/sourceAnnotations.cjs');
const { planLabels, labelOpacity, screenExtent, UNCERTAIN_MIN_ZOOM, BUILDING_VANISH_ZOOM } = require('../src/map/labelPlan.ts');
const { LAYOUT_MIN_ZOOM, nextDetailLevel } = require('../src/map/detailPolicy.ts');
const { boundPan, cameraMatrix, clamp, fitMap, focalOffset, moveCamera, normalizeAngle, rotatedSize, touchFrame,
  MIN_ZOOM, MAX_ZOOM } = require('../src/map/mapMath.ts');

const { prepareFloorPlanSvg, segments } = require('../src/map/prepareFloorPlanSvg.cjs');

const source = readFileSync(resolve(__dirname, '../2026-10-04_floor2-labeled.svg'), 'utf8');
const map = prepareLabeledSvg(source);
const campusSource = [1, 2, 3].map((n) => readFileSync(resolve(__dirname, `../2026-10-21_campus-floor${n}.svg`), 'utf8'));
const campus = campusSource.map((xml) => prepareFloorPlanSvg(xml));
const CAMPUS_MIN_ZOOMS = [1, 2.2, 5.4];
const floor2View = { id: 'floor-2', Geometry: 'Floor', labels: [] };

test('bundling uses only labeled SVG geometry without rendering clipped glyph outlines', () => {
  const maskXml = source.match(/<mask\b[^>]*>[\s\S]*?<\/mask>/)[0];
  const sourcePaths = [...source.replace(maskXml, '').matchAll(/<path d="([^"]*)"/g)]
    .map((match) => match[1]);
  const outlineParts = sourcePaths.at(-1).match(/M[^M]*/g);
  const walls = Object.values(map.structure).flatMap(({ d }) => [...d.matchAll(/M[^M]*/g)].map(([part]) => part));
  assert.deepEqual(walls.sort(), outlineParts.slice(0, 377).sort());
  assert.equal(map.border.d, outlineParts.slice(377, 381).join(''));
  assert.equal(map.base.d, sourcePaths[0]);
  const labels = sourcePaths.slice(1, -1).join('').match(/M[^M]*/g);
  const preparedLabels = map.annotations.flatMap(({ d }) => d.match(/M[^M]*/g));
  assert.deepEqual(preparedLabels.sort(), labels.sort());
  assert.equal(map.annotations.length, 39);
  assert.equal(map.annotations.filter(({ kind }) => kind === 'room').length, 36);
  const renderedLength = [map.base, ...Object.values(map.structure), map.border,
    ...map.annotations].reduce((sum, path) => sum + path.d.length, 0);
  assert.ok(renderedLength < sourcePaths.at(-1).length / 2);
  assert.throws(() => prepareLabeledSvg(source.replace('M133.6 100.1H133.55', 'M133.7 100.1H133.55')),
    /path order changed/);
});

test('glyph bounds are exact, including curves and scientific-notation coordinates', () => {
  assert.deepEqual(pathBounds('M0 0C0 100 100 100 100 0Z'),
    { minX: 0, minY: 0, maxX: 100, maxY: 75 });
  assert.deepEqual(pathBounds('M1e-3 -2H3V4L-1 -2Z'),
    { minX: -1, minY: -2, maxX: 3, maxY: 4 });
  assert.throws(() => pathBounds('M0 0Q20 20 40 0'), /Unsupported/);
});

test('room anchors match the actual labeled SVG glyph centers, not the old range positions', () => {
  const expected = {
    1202: [58.4182, 223.729], 1208: [141.0355, 223.918],
    1216: [116.5675, 133.91855], 1217: [98.43125, 135.8885],
    1218: [78.95095, 131.6615], 1229: [78.9476, 105.22218],
    1230: [98.10025, 102.9185], 1233: [150.1045, 117.9185],
    1234: [151.1555, 106.9185], 1236: [96.08325, 119.91855],
    1242: [143.974, 33.88835], 1245: [82.99995, 45.9182], 1248: [83.0383, 79.9182],
  };
  for (const [id, [x, y]] of Object.entries(expected)) {
    const label = map.annotations.find((a) => a.id === id);
    assert.ok(label, id);
    assert.ok(Math.abs(label.anchor.x - x) < 0.0001, `${id}: x`);
    assert.ok(Math.abs(label.anchor.y - y) < 0.0001, `${id}: y`);
    const room = label.roomBounds;
    assert.ok(x > room.minX && x < room.maxX && y > room.minY && y < room.maxY, id);
  }
});

test('floor plan wall segments follow lines, curves and closing edges', () => {
  assert.deepEqual(segments('M0 0H10V10C10 20 0 20 0 10Z'), [
    { x1: 0, y1: 0, x2: 10, y2: 0 },
    { x1: 10, y1: 0, x2: 10, y2: 10 },
    { x1: 0, y1: 0, x2: 0, y2: 10 },
  ]);
});

test('detail stays discrete within levels and hysteresis prevents threshold flicker', () => {
  let level = 0;
  for (const zoom of [1, 1.3, 1.8, 1.99]) {
    level = nextDetailLevel(zoom, level); assert.equal(level, 0);
  }
  level = nextDetailLevel(2, level); assert.equal(level, 1);
  for (const zoom of [1.99, 2.01, 1.8, 3.39, 2.4]) {
    level = nextDetailLevel(zoom, level); assert.equal(level, 1);
  }
  level = nextDetailLevel(3.4, level); assert.equal(level, 2);
  for (const zoom of [3.39, 3.41, 3.2, 8, 3.1]) {
    level = nextDetailLevel(zoom, level); assert.equal(level, 2);
  }
  level = nextDetailLevel(3.09, level); assert.equal(level, 1);
  level = nextDetailLevel(1.74, level); assert.equal(level, 0);
  assert.equal(nextDetailLevel(8, 0), 2);
  assert.equal(nextDetailLevel(1, 2), 0);
});

test('Metro transforms fresh source-derived annotation metadata and tracks adapter cache', () => {
  const root = resolve(__dirname, '..');
  const options = { projectRoot: root };
  const key = transformer.getCacheKey(options);
  assert.match(key, /^[0-9a-f]{64}$/);
  const transformed = transformer.transform({
    filename: resolve(root, '2026-10-04_floor2-labeled.svg'), src: source,
    options: { dev: true, platform: 'ios', projectRoot: root },
  });
  const context = { module: { exports: {} } };
  runInNewContext(generate(transformed.ast).code, context);
  assert.equal(context.module.exports.annotations.length, 39);
  assert.equal(context.module.exports.annotations.find((a) => a.id === '1202').anchor.x, 58.4182);
});

test('pinch preserves the touched map point through scale and focal movement', () => {
  for (const [startZoom, desiredZoom, startOffset, startFocal, currentFocal] of [
    [1, 2, 0, 35, 60], [3, 1.5, -120, -75, 20], [6, 30, 210, 100, -40],
  ]) {
    const zoom = clamp(desiredZoom, MIN_ZOOM, MAX_ZOOM);
    const offset = focalOffset(startOffset, startFocal, currentFocal, zoom / startZoom);
    const mapPointBefore = (startFocal - startOffset) / startZoom;
    const mapPointAfter = (currentFocal - offset) / zoom;
    assert.ok(Math.abs(mapPointBefore - mapPointAfter) < 1e-10);
  }
});

test('fit and bounds keep the map reachable across phone/tablet viewports and zoom limits', () => {
  for (const [width, height] of [[320, 500], [430, 780], [1024, 640]]) {
    const fitted = fitMap(width, height, 201, 258);
    assert.ok(fitted.width < width && fitted.height < height);
    assert.ok(Math.abs(fitted.width / fitted.height - 201 / 258) < 1e-10);
    assert.equal(boundPan(1e6, fitted.width, width, MIN_ZOOM), 0);
    for (const zoom of [1, 2, 4, 8]) {
      const limit = Math.max(0, (fitted.width * zoom - width) / 2);
      assert.equal(boundPan(1e6, fitted.width, width, zoom), limit);
      assert.equal(boundPan(-1e6, fitted.width, width, zoom), -limit);
    }
  }
});

function near(actual, expected, message = '', tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} != ${expected}`);
}

function applyMatrix(matrix, point) {
  return { x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] };
}

function pairFrame(x, y, distance, angle, reverse = false) {
  const dx = Math.cos(angle) * distance / 2;
  const dy = Math.sin(angle) * distance / 2;
  const points = [{ id: 3, x: 195 + x - dx, y: 325 + y - dy },
    { id: 8, x: 195 + x + dx, y: 325 + y + dy }];
  return touchFrame(reverse ? points.reverse() : points, 390, 650);
}

function mapPointUnderFocal(camera, frame) {
  const dx = (frame.x - camera.x) / camera.zoom;
  const dy = (frame.y - camera.y) / camera.zoom;
  const c = Math.cos(camera.rotation);
  const s = Math.sin(camera.rotation);
  return { x: c * dx + s * dy, y: -s * dx + c * dy };
}

test('combined pinch, rotation and focal translation preserve the touched map point', () => {
  for (const rotation of [-Math.PI, -0.5, 0, Math.PI / 2, 8 * Math.PI]) {
    for (const zoom of [1, 3, 7]) {
      const camera = { zoom, rotation, x: -30, y: 25 };
      const start = pairFrame(40, -60, 100, 0.3);
      const current = pairFrame(-25, 45, 130, 0.9, true);
      const next = moveCamera(camera, start, current, 2000, 2000, 390, 650);
      const before = mapPointUnderFocal(camera, start);
      const after = mapPointUnderFocal(next, current);
      near(after.x, before.x, 'focal x');
      near(after.y, before.y, 'focal y');
      near(next.zoom, Math.min(8, zoom * 1.3));
      near(next.rotation, rotation + 0.6);
    }
  }
});

test('rotation remains continuous across the angle seam and many complete turns', () => {
  let camera = { zoom: 3, rotation: 0.4, x: -22, y: 15 };
  let previous = pairFrame(20, -35, 100, Math.PI - 0.01);
  const anchor = mapPointUnderFocal(camera, previous);
  for (let step = 1; step <= 2500; step++) {
    const angle = Math.PI - 0.01 + step * 0.03;
    const current = pairFrame(20 + 10 * Math.sin(step / 50), -35 + 10 * Math.cos(step / 40),
      100 + 20 * Math.sin(step / 30), angle, step % 2 === 0);
    const next = moveCamera(camera, previous, current, 2000, 2000, 390, 650);
    near(next.rotation - camera.rotation, 0.03, 'no seam jump');
    const point = mapPointUnderFocal(next, current);
    near(point.x, anchor.x, 'long gesture x');
    near(point.y, anchor.y, 'long gesture y');
    camera = next;
    previous = current;
  }
  near(camera.rotation, 0.4 + 2500 * 0.03);
  const normalized = normalizeAngle(camera.rotation);
  assert.ok(normalized >= -Math.PI && normalized < Math.PI);
  near(Math.sin(normalized), Math.sin(camera.rotation));
  near(Math.cos(normalized), Math.cos(camera.rotation));
});

test('pointer membership changes rebase without jumps and three fingers pause movement', () => {
  const camera = { zoom: 3, rotation: 0.8, x: 10, y: -20 };
  const one = touchFrame([{ id: 3, x: 170, y: 310 }], 390, 650);
  const two = pairFrame(30, -10, 100, 0.2);
  const three = touchFrame([{ id: 3, x: 100, y: 200 }, { id: 8, x: 200, y: 250 },
    { id: 9, x: 210, y: 260 }], 390, 650);
  const move = (previous, current) => moveCamera(camera, previous, current, 2000, 2000, 390, 650);
  assert.equal(move(null, two), camera);
  assert.equal(move(one, two), camera);
  assert.equal(move(two, three), camera);
  assert.equal(move(three, three), camera);
  assert.equal(move(three, two), camera);
  assert.equal(move(two, { ...two, secondId: 99 }), camera);

  // Touch-up payloads can include or omit the departing touch. Both rebase to
  // the same remaining finger, and the next move pans without a stale focal.
  const first = { id: 3, x: 170, y: 310 };
  const departing = { id: 8, x: 240, y: 350 };
  const up = touchFrame([departing, first], 390, 650, [departing]);
  assert.deepEqual(up, touchFrame([first], 390, 650, [departing]));
  const moved = touchFrame([{ ...first, x: 177, y: 301 }], 390, 650);
  const next = move(up, moved);
  near(next.x, camera.x + 7);
  near(next.y, camera.y - 9);
  near(next.rotation, camera.rotation);
  assert.equal(touchFrame([first], 390, 650, [first]), null);
  assert.equal(touchFrame([], 390, 650), null);
});

test('zoom limits reverse immediately and near-coincident fingers cannot corrupt the camera', () => {
  const initial = { zoom: 7, rotation: 0, x: 0, y: 0 };
  const a = pairFrame(0, 0, 100, 0);
  const b = pairFrame(0, 0, 200, 0);
  const max = moveCamera(initial, a, b, 2000, 2000, 390, 650);
  assert.equal(max.zoom, 8);
  const reverse = moveCamera(max, b, pairFrame(0, 0, 190, 0), 2000, 2000, 390, 650);
  near(reverse.zoom, 7.6);
  const small = pairFrame(0, 0, 10, 0);
  const min = moveCamera(reverse, b, small, 2000, 2000, 390, 650);
  assert.equal(min.zoom, 1);
  const out = moveCamera(min, small, pairFrame(0, 0, 11, 0), 2000, 2000, 390, 650);
  near(out.zoom, 1.1);
  const coincident = pairFrame(0, 0, 0, 0);
  assert.equal(moveCamera(initial, coincident, b, 2000, 2000, 390, 650), initial);
  assert.equal(moveCamera(initial, a, coincident, 2000, 2000, 390, 650), initial);
});

test('rotated bounds enclose every corner and keep smaller axes centered', () => {
  near(rotatedSize(200, 300, 0).width, 200);
  near(rotatedSize(200, 300, Math.PI / 2).width, 300);
  near(rotatedSize(200, 300, Math.PI / 2).height, 200);
  for (const [width, height] of [[320, 500], [430, 780], [1024, 640]]) {
    const fitted = fitMap(width, height, 201, 258);
    for (const rotation of [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, -2.5, 8 * Math.PI]) {
      const extent = rotatedSize(fitted.width, fitted.height, rotation);
      const matrix = cameraMatrix(0, 0, 0, 0, rotation);
      for (const x of [-fitted.width / 2, fitted.width / 2]) {
        for (const y of [-fitted.height / 2, fitted.height / 2]) {
          const p = applyMatrix(matrix, { x, y });
          assert.ok(Math.abs(p.x) <= extent.width / 2 + 1e-8);
          assert.ok(Math.abs(p.y) <= extent.height / 2 + 1e-8);
        }
      }
      for (const zoom of [1, 2, 8]) {
        const camera = { zoom, rotation, x: 0, y: 0 };
        const start = touchFrame([{ id: 1, x: 0, y: 0 }], width, height);
        const current = touchFrame([{ id: 1, x: 1e6, y: -1e6 }], width, height);
        const next = moveCamera(camera, start, current, fitted.width, fitted.height, width, height);
        near(next.x, Math.max(0, (extent.width * zoom - width) / 2));
        near(next.y, -Math.max(0, (extent.height * zoom - height) / 2));
      }
    }
  }
});

function componentHarness() {
  const { transformSync } = require('@babel/core');
  const hooks = [];
  const changed = new Set();
  const sharedValues = new Set();
  const cancelled = [];
  let dependencies;
  const shared = (initial) => {
    let value = initial;
    const result = {
      get value() { dependencies?.add(result); return value; },
      set value(next) { result.set(next); },
      get() { return result.value; },
      set(next) {
        if (!Object.is(next, value)) { value = next; changed.add(result); }
      },
    };
    sharedValues.add(result);
    return result;
  };
  const closureInputs = (worklet) => {
    const inputs = new Set();
    const visit = (value) => {
      if (sharedValues.has(value)) inputs.add(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(worklet.__closure);
    return inputs;
  };
  const subscribe = (run, inputs = new Set()) => {
    const hook = { runs: 0, dependencies: new Set(), update: null, value: undefined };
    hook.update = () => {
      // Reanimated captures shared values from the entire worklet closure,
      // including branches which are not read during this particular update.
      dependencies = new Set(inputs);
      hook.value = run();
      hook.dependencies = dependencies;
      dependencies = undefined;
      hook.runs++;
    };
    hooks.push(hook);
    hook.update();
    return hook;
  };
  const flush = () => {
    let passes = 0;
    while (changed.size) {
      assert.ok(passes++ < 20, 'shared-value graph must settle');
      const pending = new Set(changed);
      changed.clear();
      for (const hook of hooks) {
        if ([...hook.dependencies].some((value) => pending.has(value))) hook.update();
      }
    }
  };
  const react = { memo: (fn) => fn, useMemo: (fn) => fn(), useCallback: (fn) => fn,
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: (fn) => { fn(); }, useLayoutEffect: (fn) => { fn(); },
    useImperativeHandle: (ref, create) => { if (ref) ref.current = create(); } };
  const native = { View: 'View', Pressable: 'Pressable', Text: 'Text', Switch: 'Switch',
    Platform: { OS: 'ios', select: (options) => options.ios ?? options.default }, StyleSheet: { create: (value) => value, absoluteFill: {} } };
  const reanimated = {
    default: { View: 'AnimatedView', createAnimatedComponent: (component) => component },
    useSharedValue: shared,
    cancelAnimation: (value) => { cancelled.push(value); },
    withTiming: (target) => target,
    withDelay: (_delay, value) => value,
    useAnimatedReaction: (prepare, reactToValue) => {
      let previous = null;
      subscribe(() => {
        const current = prepare();
        // Only the prepare worklet's dependencies trigger a reaction.
        const inputs = dependencies;
        dependencies = undefined;
        reactToValue(current, previous);
        dependencies = inputs;
        previous = current;
      }, closureInputs(prepare));
    },
    useAnimatedStyle: (fn) => { subscribe(fn, closureInputs(fn)); return {}; },
    useAnimatedProps: (fn) => { subscribe(fn, closureInputs(fn)); return {}; },
    useDerivedValue: (fn) => {
      const value = shared(undefined);
      subscribe(() => value.set(fn()), closureInputs(fn));
      return value;
    },
  };
  const gesture = { callbacks: {}, shouldCancelWhenOutside() { return this; } };
  for (const callback of ['onTouchesDown', 'onTouchesMove', 'onTouchesUp', 'onTouchesCancelled', 'onFinalize']) {
    gesture[callback] = function (fn) { this.callbacks[callback] = fn; return this; };
  }
  const modules = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': native,
    'react-native-svg': { __esModule: true, default: 'Svg', G: 'Group', Path: 'Path', Text: 'SvgText', TSpan: 'TSpan' },
    'react-native-reanimated': { __esModule: true, ...reanimated },
    'react-native-worklets': { scheduleOnUI: (fn) => fn(), scheduleOnRN: (fn, ...args) => fn(...args) },
    'react-native-gesture-handler': { Gesture: { Manual: () => gesture }, GestureDetector: 'GestureDetector' },
    './LabeledMap': { __esModule: true, default: 'Floor', MAP_SIZE: { width: 201, height: 258 } },
    './MapLabels': { __esModule: true, default: 'Labels' },
    './labelPlan': require('../src/map/labelPlan.ts'),
    './SelectionPin': { __esModule: true, default: 'Pin' },
    './LiveMarker': { __esModule: true, default: 'LiveMarker' },
    '../ui/theme': { __esModule: true, mapColors: new Proxy({}, { get: () => '#000000' }) },
    './annotationLayout': require('../src/map/annotationLayout.ts'),
    './detailPolicy': require('../src/map/detailPolicy.ts'),
    './mapMath': require('../src/map/mapMath.ts'),
    '../../2026-10-04_floor2-labeled.svg': { __esModule: true, default: map },
  };
  const load = (name, exposeViewport = false) => {
    const filename = resolve(__dirname, '../src/map', name);
    const { code } = transformSync(readFileSync(filename, 'utf8'), {
      filename, babelrc: false, configFile: false,
      presets: ['babel-preset-expo'],
      caller: { name: 'metro', platform: 'ios', supportsStaticESM: false },
    });
    const context = { exports: {}, global: { Error }, require: (id) => {
      if (id.startsWith('@babel/runtime/helpers/')) return require(id);
      assert.ok(id in modules, `unexpected runtime import: ${id}`);
      return modules[id];
    } };
    runInNewContext(code + (exposeViewport ? '\nexports.MapViewport = MapViewport;' : ''), context);
    return context.exports;
  };
  return { shared, hooks, changed, flush, cancelled, gesture, load };
}

test('real gesture callbacks rebase finger transitions, cancel, reset, and resume cleanly', () => {
  const harness = componentHarness();
  const controlsRef = { current: null };
  const tree = harness.load('InteractiveMap.tsx', true).MapViewport({ width: 390, height: 650,
    floor: floor2View, controlsRef });
  const detector = tree.props.children;
  const surface = detector.props.children;
  const [layer, labels] = surface.props.children;
  assert.equal(layer.props.children.type, 'Svg', 'geometry is a vector layer moved by the camera');
  assert.equal(labels.type, 'Labels');
  const { camera } = labels.props;
  const reset = () => controlsRef.current.reset();
  const { callbacks } = harness.gesture;
  let ended = 0; let failed = 0; let activated = 0;
  const manager = { activate: () => activated++, end: () => ended++, fail: () => failed++ };
  const event = (allTouches, changedTouches = allTouches) => ({ allTouches, changedTouches });
  const start = [{ id: 3, x: 145, y: 325 }, { id: 8, x: 245, y: 325 }];
  callbacks.onTouchesDown(event(start), manager);
  callbacks.onTouchesMove(event([{ id: 3, x: 195, y: 175 }, { id: 8, x: 195, y: 475 }]));
  harness.flush();
  // Two-finger twist is disabled in the UI; pinch still zooms (the fingers
  // turned 90° and spread 3×).
  near(camera.zoom.value, 3);
  assert.equal(activated, 1);
  const before = { x: camera.x.value, y: camera.y.value };
  callbacks.onTouchesUp(event([{ id: 3, x: 195, y: 175 }, { id: 8, x: 195, y: 475 }],
    [{ id: 8, x: 195, y: 475 }]), manager);
  callbacks.onTouchesMove(event([{ id: 3, x: 205, y: 160 }]));
  near(camera.x.value, before.x + 10);
  near(camera.y.value, before.y - 15);
  callbacks.onTouchesCancelled(event([]), manager);
  callbacks.onFinalize();
  assert.equal(failed, 1);
  reset();
  harness.flush();
  near(camera.zoom.value, 1);
  near(camera.x.value, 0);
  near(camera.y.value, 0);
  const cancelCount = harness.cancelled.length;
  callbacks.onTouchesDown(event(start), manager);
  assert.equal(harness.cancelled.length, cancelCount + 5, 'all reset animations and a pending redraw are interrupted');
  callbacks.onTouchesUp(event(start, start), manager);
  callbacks.onFinalize();
  assert.equal(ended, 1, 'manual gesture ends when the last fingers lift');
  assert.equal(camera.zoom.value, 1);
});

test('zoom buttons keep the centered point, stay in limits, and selection centers the place', () => {
  const harness = componentHarness();
  const { MapViewport } = harness.load('InteractiveMap.tsx', true);
  const width = 390; const height = 650;
  const controlsRef = { current: null };
  let tree = MapViewport({ width, height, floor: floor2View, controlsRef });
  let { camera } = tree.props.children.props.children.props.children[1].props;
  camera.x.set(30); camera.y.set(-20); camera.zoom.set(2);
  controlsRef.current.zoomIn();
  harness.flush();
  near(camera.zoom.value, 3.6);
  near(camera.x.value, 54);
  near(camera.y.value, -36);
  for (let i = 0; i < 10; i++) controlsRef.current.zoomIn();
  near(camera.zoom.value, MAX_ZOOM);
  for (let i = 0; i < 20; i++) controlsRef.current.zoomOut();
  near(camera.zoom.value, MIN_ZOOM);
  near(camera.x.value, 0);
  near(camera.y.value, 0);

  const room = map.annotations.find((a) => a.id === '1216').anchor;
  tree = MapViewport({ width, height, floor: floor2View, controlsRef, selected: room });
  ({ camera } = tree.props.children.props.children.props.children[1].props);
  harness.flush();
  const fitted = fitMap(width, height, 201, 258);
  const fitScale = fitted.width / 201;
  assert.ok(camera.zoom.value >= 3.4, 'selection reaches Full detail so its label shows');
  near(width / 2 + camera.x.value + camera.zoom.value * (room.x * fitScale - fitted.width / 2), width / 2);
  near(height / 2 + camera.y.value + camera.zoom.value * (room.y * fitScale - fitted.height / 2), height / 2);
  const pin = tree.props.children.props.children.props.children.find((c) => c?.type === 'Pin');
  assert.ok(pin, 'the selection pin is drawn');
  assert.deepEqual(pin.props.point, room);
});


const { placeAnnotations, placePath, placePoint, placeWalls } = require('../src/map/placement.ts');
const { findRoute, validateNetwork } = require('../src/navigation/routing.ts');
const { CAMPUS_NETWORK } = require('../src/navigation/campusNetwork.ts');
const { nextDetailLevel: nextLevel, layoutMinZoom } = require('../src/map/detailPolicy.ts');
const B1_FLOOR2 = { scale: 0.81439, x: 406.387, y: -5.887 };
const labelIds = (plan) => plan.annotations.map((a) => a.id);
const byId = (plan, id) => plan.annotations.find((a) => a.id === id);

test('campus levels share one frame and keep documented and uncertain items apart', () => {
  campus.forEach((plan, i) => {
    assert.equal(plan.floor, i + 1);
    assert.equal(plan.frame, 'campus');
    assert.equal(plan.viewBox, '0 0 580 210');
    assert.deepEqual(Object.keys(plan.layers).sort(),
      ['covered-areas', 'dividers', 'footprint', 'hills', 'open-areas', 'ramp', 'ramp-marks', 'site', 'stairs',
        'uncertain-lines', 'uncertain-symbols', 'walls']);
    const groups = campusSource[i].match(/<g id="[^"]*"/g).join(' ');
    assert.ok(!/door|walkway|route-network|path-graph/i.test(groups), 'no door or walkway layers are traced');
    assert.equal(new Set(labelIds(plan)).size, plan.annotations.length, 'unique label ids');
    for (const label of plan.annotations) {
      assert.ok(label.anchor.x >= 0 && label.anchor.x <= 580 && label.anchor.y >= 0 && label.anchor.y <= 210, label.id);
      assert.ok(['documented', 'uncertain'].includes(label.status));
      if (label.kind === 'room') assert.ok(['1', '2', '3'].includes(label.building), `${label.id} has a building`);
    }
    for (const c of plan.routeCandidates) {
      assert.equal(c.status, 'uncertain', 'route candidates are never marked verified');
      assert.ok(['stair', 'elevator', 'entrance', 'exit', 'ramp'].includes(c.type));
    }
  });
  // Floor 2 includes the traced Building 1 (12xx) plan, drawn like Floor 1:
  // a filled footprint, solid outer walls and dashed room dividers.
  assert.match(campus[1].layers.walls, /C/, 'the library bump stays a curve');
  assert.match(campus[1].layers.footprint, /C/, 'Building 1 Floor 2 is filled, library bump included');
  assert.ok(segments(campus[1].layers.dividers).length > 80, 'Building 1 Floor 2 rooms are divided like Floor 1');
  const ground = campus[0];
  for (const id of ['g-b1-cafeteria', 'g-b1-quad', 'g-b1-library', 'g-b1-admin-offices', 'g-b1-room-1155',
    'g-b2-auditorium', 'g-b2-stage', 'g-b2-room-2107', 'g-b2-room-2101', 'g-b3-gym-3-101', 'g-b3-pool',
    'g-b3-room-3-110a', 'g-b3-tennis']) assert.ok(byId(ground, id), id);
  for (const id of ['g-b3-basement', 'g-b2-wr', 'g-b1-elev-m', 'f2-b2-room-2215']) {
    const label = byId(ground, id) ?? byId(campus[1], id);
    assert.equal(label.status, 'uncertain', id);
    assert.ok(label.note.length > 0, `${id} records why it is uncertain`);
  }
  // The earlier ramp depiction was wrong and teacher parking is not part of this version.
  assert.ok(!campusSource.some((xml) => /curved band west of Building 3/i.test(xml)), 'the wrong ramp stays removed');
  assert.ok(ground.layers.ramp.length > 0 && campus[1].layers.ramp === '', 'the confirmed ramp is drawn on Floor 1');
  assert.ok(!byId(ground, 'g-site-parking') && ground.layers.site === '');
  assert.throws(() => prepareFloorPlanSvg(campusSource[0].replace('data-status="uncertain" data-building',
    'data-status="maybe" data-building')), /Invalid floor plan label/);
});

test('rooms are associated with the correct building and level', () => {
  const rooms = (plan, building) => plan.annotations
    .filter((a) => a.kind === 'room' && a.building === building).map((a) => a.text);
  const [ground, upper2, upper3] = campus;
  // Ground: 11xx in Building 1, 21xx in Building 2, 3-1xx in Building 3.
  assert.ok(rooms(ground, '1').filter((t) => /^\d{4}$/.test(t)).every((t) => t.startsWith('11')));
  assert.ok(rooms(ground, '2').filter((t) => /^\d{4}/.test(t)).every((t) => t.startsWith('21')));
  assert.ok(rooms(ground, '3').filter((t) => /^3-\d/.test(t)).every((t) => /^3-(1|313)/.test(t)));
  // Floor 2: 12xx in Building 1, 22xx in Building 2 and 3-2xx in Building 3.
  // Building 1's 12xx rooms are traced from 2026-10-04_floor-2.svg.
  assert.ok(rooms(upper2, '1').filter((t) => /^\d{4}$/.test(t)).every((t) => t.startsWith('12')));
  assert.equal(rooms(upper2, '1').length, 36);
  assert.ok(rooms(upper2, '2').every((t) => t.startsWith('22')));
  assert.ok(rooms(upper2, '3').filter((t) => /^3-\d/.test(t)).every((t) => t.startsWith('3-2')));
  assert.ok(rooms(upper3, '1').filter((t) => /^\d{4}$/.test(t)).every((t) => t.startsWith('13')));
  assert.ok(!upper3.annotations.some((a) => /^12\d\d$/.test(a.text ?? '')), 'no 12xx on Floor 3');
  // The archived labeled export still describes the 12xx plan only.
  assert.ok(map.annotations.filter((a) => a.kind === 'room').every((a) => a.id.startsWith('12')));
  // Auditorium and drama spaces belong to Building 2; the 22xx plan shows the
  // auditorium's upper level, the ground plan shows Drama and Choir.
  assert.equal(byId(upper2, 'f2-b2-auditorium').building, '2');
  assert.equal(byId(ground, 'g-b2-room-2101').text, '2101 Drama');
  assert.ok(!upper3.annotations.some((a) => /Auditorium|Drama/.test(a.text ?? '')));
});

test('upper floors are placed over their buildings in the campus frame', () => {
  const footprintBox = (plan, building) => {
    const xs = []; const ys = [];
    for (const a of plan.annotations.filter((l) => l.building === building && l.kind !== 'building')) {
      xs.push(a.anchor.x); ys.push(a.anchor.y);
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  const ground = campus[0];
  const inside = (p, b, margin) => p.x >= b.minX - margin && p.x <= b.maxX + margin && p.y >= b.minY - margin && p.y <= b.maxY + margin;
  for (const building of ['2', '3']) {
    const box = footprintBox(ground, building);
    for (const a of campus[1].annotations.filter((l) => l.building === building && l.kind === 'room')) {
      assert.ok(inside(a.anchor, box, 25), `Floor 2 ${a.id} sits over Building ${building}`);
    }
  }
  const b1 = footprintBox(ground, '1');
  const b1Labels = campus[1].annotations.filter((l) => l.building === '1' && l.kind !== 'building');
  assert.equal(b1Labels.length, 39);
  for (const a of b1Labels) assert.ok(inside(a.anchor, b1, 90), `Floor 2 ${a.id} sits over Building 1`);
  // Rooms 1202–1208 sit over the 1138–1144 row; 1213 sits over the 1155 end.
  near(b1Labels.find((a) => a.id === 'f2-b1-1202').anchor.y, byId(ground, 'g-b1-room-1139').anchor.y, '', 1);
  const f2Room1213 = b1Labels.find((a) => a.id === 'f2-b1-1213').anchor;
  near(f2Room1213.x, byId(ground, 'g-b1-room-1155').anchor.x, '', 1);
  near(f2Room1213.y, byId(ground, 'g-b1-room-1155').anchor.y, '', 1);
  // Floor 3 repeats Floor 2's north wing and is fitted onto it.
  near(byId(campus[2], 'f3-b1-steam-lab').anchor.x, byId(campus[1], 'f2-b1-STEAM Lab').anchor.x, '', 1);
  near(byId(campus[2], 'f3-b1-steam-lab').anchor.y, byId(campus[1], 'f2-b1-STEAM Lab').anchor.y, '', 1);
  for (const a of campus[2].annotations.filter((l) => l.kind === 'room')) {
    assert.ok(inside(a.anchor, { minX: 400, maxX: 580, minY: 0, maxY: 120 }, 0), `Floor 3 ${a.id} sits over Building 1's north wing`);
  }
});

test('placing the Floor 2 export moves glyphs, anchors and walls together', () => {
  const t = B1_FLOOR2;
  const label = map.annotations.find((a) => a.id === '1216');
  const [placed] = placeAnnotations([label], t, { idPrefix: 'x-', building: '1', title: () => 'Room 1216' });
  near(placed.anchor.x, label.anchor.x * t.scale + t.x);
  near(placed.glyphHeight, label.glyphHeight * t.scale);
  const bounds = pathBounds(placed.d);
  near(bounds.minX, label.bounds.minX * t.scale + t.x, '', 1e-3);
  near(bounds.maxY, label.bounds.maxY * t.scale + t.y, '', 1e-3);
  assert.equal(placed.id, 'x-1216');
  const wall = placeWalls([{ x1: 10, y1: 20, x2: 30, y2: 20 }], t)[0];
  near(wall.x2, 30 * t.scale + t.x);
  assert.deepEqual(placePoint({ x: 0, y: 0 }, t), { x: t.x, y: t.y });
  assert.match(placePath('M1 2H3V4C1 1 2 2 3 3Z', { scale: 2, x: 1, y: 0 }), /^M 3 4 H 7 V 8 C 3 2 5 4 7 6 Z$/);
  assert.throws(() => placePath('M0 0Q1 1 2 2', t), /Unsupported/);
});

test('campus detail thresholds are configurable and keep hysteresis', () => {
  const t = { mediumEnter: 2.5, mediumExit: 2.2, fullEnter: 6, fullExit: 5.4 };
  assert.deepEqual([...layoutMinZoom(t)], CAMPUS_MIN_ZOOMS);
  assert.equal(nextLevel(2.4, 0, t), 0);
  assert.equal(nextLevel(2.5, 0, t), 1);
  assert.equal(nextLevel(2.3, 1, t), 1);
  assert.equal(nextLevel(2.1, 1, t), 0);
  assert.equal(nextLevel(5.9, 1, t), 1);
  assert.equal(nextLevel(6, 1, t), 2);
  assert.equal(nextLevel(5.5, 2, t), 2);
  assert.equal(nextLevel(5.3, 2, t), 1);
  // Defaults are unchanged for the original single-floor map.
  assert.equal(nextLevel(2, 0), 1);
});

test('Metro accepts the campus map files and rejects any other SVG', () => {
  const root = resolve(__dirname, '..');
  for (const n of [1, 2, 3]) {
    const transformed = transformer.transform({
      filename: resolve(root, `2026-10-21_campus-floor${n}.svg`), src: campusSource[n - 1],
      options: { dev: true, platform: 'ios', projectRoot: root },
    });
    const context = { module: { exports: {} } };
    runInNewContext(generate(transformed.ast).code, context);
    assert.equal(context.module.exports.floor, n);
  }
  assert.throws(() => transformer.transform({ filename: resolve(root, 'other.svg'), src: '<svg/>',
    options: { dev: true, platform: 'ios', projectRoot: root } }), /Unsupported map SVG/);
});

const { BUILDING1_NETWORK } = require('../src/navigation/data/building1.ts');
const { routeBetween, routeSteps, doorFor } = require('../src/navigation/routing.ts');
const { fitGeoReference, gateFix, toCampus } = require('../src/positioning/positionGate.ts');

test('stairs are separate symbols, never merged, and line up across Building 1 floors', () => {
  const stairs = campus.map((plan) => plan.stairs);
  assert.deepEqual(stairs.map((l) => l.length), [16, 11, 5]);
  for (const level of stairs) {
    assert.equal(new Set(level.map((s) => s.id)).size, level.length);
    for (const s of level) assert.ok(s.note.length > 0, `${s.id} records its source`);
  }
  const b1 = stairs.map((l) => l.filter((s) => s.building === '1'));
  for (const s of b1[0]) {
    assert.ok(b1[1].some((t) => Math.hypot(s.x - t.x, s.y - t.y) < 3), `${s.id} has a stair above it on Floor 2`);
  }
  // Stair markers are their own labels and stay apart from each other at every zoom they show.
  const fitScale = fitMap(390, 600, 580, 210, 8).width / 580;
  const labels = planLabels(stairs[0].map((s) => ({ id: s.id, kind: 'stair', lines: [], rotate: 0, anchor: s,
    room: { minX: s.x, minY: s.y, maxX: s.x, maxY: s.y } })), fitScale, 24);
  assert.ok(labels.every((l) => l.appear >= 2.2));
  assertNoOverlaps(labels, fitScale, 'stairs');
});

function specsFor(plan) {
  return plan.annotations.map((a) => ({ id: a.id, kind: a.kind, lines: a.lines ?? [a.text ?? a.id],
    rotate: a.rotate ? -90 : 0, uncertain: a.status === 'uncertain', anchor: a.anchor, room: a.roomBounds }));
}
function assertNoOverlaps(labels, fitScale, what) {
  for (const zoom of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 11, 16, 24]) {
    const visible = labels.filter((l) => labelOpacity(zoom, l.appear, l.vanish) > 0);
    const boxes = visible.map((l) => {
      const e = screenExtent(l);
      return { id: l.id, minX: l.anchor.x * fitScale * zoom - e.w / 2, maxX: l.anchor.x * fitScale * zoom + e.w / 2,
        minY: l.anchor.y * fitScale * zoom - e.h / 2, maxY: l.anchor.y * fitScale * zoom + e.h / 2 };
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]; const b = boxes[j];
      const overlap = a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
      assert.ok(!overlap, `${what} ${zoom}x: ${a.id} overlaps ${b.id}`);
    }
  }
}

test('map labels are readable, fit their rooms, never overlap, and stay uncluttered when zoomed out', () => {
  for (const [width, height] of [[375, 560], [390, 600], [430, 700]]) {
    const fitScale = fitMap(width, height, 580, 210, 8).width / 580;
    campus.forEach((plan, index) => {
      const labels = planLabels(specsFor(plan), fitScale, 24);
      assertNoOverlaps(labels, fitScale, `${width}px F${index + 1}`);
      for (const l of labels) {
        if (!Number.isFinite(l.appear)) continue;
        const e = screenExtent(l);
        const s = fitScale * l.appear;
        assert.ok((l.room.maxX - l.room.minX) * s >= e.w && (l.room.maxY - l.room.minY) * s >= e.h,
          `${l.id} fits its room when it appears`);
        if (l.kind === 'room' && !l.uncertain) assert.ok(l.fontSize >= 14, 'room numbers use a readable size');
        if (l.uncertain) assert.ok(l.appear >= UNCERTAIN_MIN_ZOOM, `${l.id} waits for close zoom`);
        if (l.kind === 'building') assert.equal(l.vanish, BUILDING_VANISH_ZOOM);
      }
      const at = (zoom) => labels.filter((l) => labelOpacity(zoom, l.appear, l.vanish) > 0);
      // Zoomed out: only building names and a few large areas.
      assert.ok(at(1).every((l) => l.kind === 'building' || l.kind === 'area' || l.kind === 'context'));
      if (index === 0) {
        assert.ok(at(1).some((l) => l.id === 'g-building-1'));
        // Every documented Building 1 room number can be read by 10× zoom.
        for (const l of labels.filter((x) => x.id.startsWith('g-b1-room-') && !x.uncertain)) {
          assert.ok(l.appear <= 10, `${width}px ${l.id} appears by 10x (at ${l.appear.toFixed(1)})`);
        }
      }
    });
  }
});

test('labels move with zoom only; panning updates one container', () => {
  const harness = componentHarness();
  const camera = { width: 390, height: 600, fitScale: fitMap(390, 600, 580, 210, 8).width / 580, mapWidth: 580,
    mapHeight: 210, maxZoom: 24, zoom: harness.shared(3), x: harness.shared(0), y: harness.shared(0) };
  const tree = harness.load('MapLabels.tsx').default({ specs: specsFor(campus[0]), camera });
  for (const element of tree.props.children) element.type(element.props);
  harness.flush();
  const counts = harness.hooks.map((hook) => hook.runs);
  camera.x.set(40); camera.y.set(-25);
  harness.flush();
  const panHooks = harness.hooks.filter((hook, i) => hook.runs !== counts[i]);
  assert.equal(panHooks.length, 1, 'pan moves only the label container');
  const before = harness.hooks.map((hook) => hook.runs);
  camera.zoom.set(8);
  harness.flush();
  const zoomHooks = harness.hooks.filter((hook, i) => hook.runs !== before[i]);
  assert.ok(zoomHooks.length > 20 && !zoomHooks.includes(panHooks[0]), 'zoom updates labels, not the container');
  assert.ok(zoomHooks.some((hook) => hook.value?.transform), 'visible labels get a position');
  assert.ok(zoomHooks.some((hook) => hook.value && !hook.value.transform && hook.value.opacity === 0),
    'hidden labels only report opacity');
});

test('the vector layer is only scaled on the GPU between redraws', () => {
  const harness = componentHarness();
  const { MapViewport } = harness.load('InteractiveMap.tsx', true);
  const tree = MapViewport({ width: 390, height: 600, floor: floor2View });
  const { camera } = tree.props.children.props.children.props.children[1].props;
  harness.flush();
  const layerHook = harness.hooks.find((hook) => hook.value?.transform?.length === 3 && 'scale' in hook.value.transform[2]);
  assert.ok(layerHook);
  near(layerHook.value.transform[2].scale, 1);
  camera.zoom.set(2); camera.x.set(30);
  harness.flush();
  near(layerHook.value.transform[2].scale, 2, 'pinch scales the drawn layer until it settles');
  near(layerHook.value.transform[0].translateX, 30);
});

test('Building 1 route data is explicit, separate from the artwork, and passes data checks', () => {
  const ground = campus[0];
  const network = BUILDING1_NETWORK;
  assert.deepEqual(validateNetwork(network, { 1: ground.walls }), []);
  const placeIds = new Set(ground.annotations.map((a) => a.id));
  for (const n of network.nodes) {
    assert.ok(['checked', 'proposed', 'unknown'].includes(n.status));
    if (n.placeId) assert.ok(placeIds.has(n.placeId), `${n.id} serves a real place`);
    if (n.kind === 'door') assert.equal(n.level, 1);
  }
  assert.ok(!network.nodes.some((n) => n.status === 'checked'), 'nothing is marked checked before the school walk-through');
  // Doors are not at the printed labels.
  for (const n of network.nodes.filter((x) => x.kind === 'door' && x.placeId)) {
    const label = byId(ground, n.placeId);
    assert.ok(Math.hypot(label.anchor.x - n.x, label.anchor.y - n.y) > 1, `${n.id} is a door, not the label`);
  }
  for (const id of campusSource.map((x) => x)) assert.ok(!/route-network|b1-n-1155/.test(id), 'route data is not in the SVGs');
});

test('directions require checked data and name what is missing', () => {
  const names = { 'g-b1-room-1155': 'Room 1155', 'g-b1-library': 'Library', 'g-b1-wellness-center': 'Wellness Center' };
  const blocked = routeBetween(CAMPUS_NETWORK, 'g-b1-room-1155', 'g-b1-library', { names });
  assert.equal(blocked.status, 'unavailable');
  const whats = blocked.missing.map((m) => m.what);
  assert.ok(whats.includes('Door of Room 1155') && whats.includes('Door of Library'));
  assert.ok(whats.some((w) => /walkway/.test(w)));
  const review = routeBetween(CAMPUS_NETWORK, 'g-b1-room-1155', 'g-b1-library', { names, review: true });
  assert.equal(review.status, 'available');
  assert.equal(review.reviewOnly, true);
  const { nodes } = review.route;
  assert.equal(nodes[0].id, 'b1-door-1155');
  assert.equal(nodes.at(-1).id, 'b1-door-library', 'routes end at the door');
  assert.match(review.steps[0].text, /Leave Room 1155/);
  assert.match(review.steps.at(-1).text, /Arrive at the door of Library/);
  const noDoor = routeBetween(CAMPUS_NETWORK, 'g-b1-room-1155', 'g-b1-wellness-center', { names, review: true });
  assert.equal(noDoor.status, 'unavailable');
  assert.ok(noDoor.missing.some((m) => m.what === 'Door of Wellness Center'));
  const upstairs = routeBetween(CAMPUS_NETWORK, 'g-b1-room-1155', 'f2-b1-1216', { review: true });
  assert.equal(upstairs.status, 'unavailable', 'Floor 2 doors and hallways are not recorded yet');
  assert.ok(doorFor(CAMPUS_NETWORK, 'g-b1-room-1155'));
});

test('route finder: connected, disconnected, step-free and floor transitions', () => {
  const n = (id, level, x, y, kind = 'junction', status = 'checked', placeId) =>
    ({ id, level, x, y, kind, status, ...(placeId ? { placeId } : {}) });
  const e = (from, to, kind = 'walk', status = 'checked', accessible = kind !== 'stairs', name = 'hall') =>
    ({ id: `${from}~${to}`, from, to, kind, status, accessible, name });
  const network = {
    nodes: [n('a', 1, 0, 0, 'door', 'checked', 'A'), n('b', 1, 10, 0), n('c', 1, 10, 10, 'stair'), n('d', 2, 10, 10, 'stair'),
      n('e', 1, 20, 0, 'elevator'), n('f', 2, 20, 0, 'elevator'), n('g', 2, 30, 10, 'door', 'checked', 'G'),
      n('z', 1, 90, 90, 'door', 'checked', 'Z')],
    edges: [e('a', 'b'), e('b', 'c'), e('c', 'd', 'stairs'), e('d', 'g'), e('b', 'e'), e('e', 'f', 'elevator'), e('f', 'g', 'walk', 'checked', true, 'upper hall')],
  };
  const route = findRoute(network, 'a', 'g');
  assert.deepEqual(route.nodes.map((x) => x.id), ['a', 'b', 'c', 'd', 'g'], 'stairs are shorter here');
  const stepFree = findRoute(network, 'a', 'g', { accessibleOnly: true });
  assert.deepEqual(stepFree.nodes.map((x) => x.id), ['a', 'b', 'e', 'f', 'g']);
  const steps = routeSteps(route, { A: 'Room A', G: 'Room G' });
  assert.ok(steps.some((s) => s.text === 'Take the stairs up to Floor 2' && s.level === 2));
  assert.equal(steps.at(-1).level, 2);
  const connected = routeBetween(network, 'A', 'G', { names: { A: 'Room A', G: 'Room G' } });
  assert.equal(connected.status, 'available');
  assert.equal(connected.reviewOnly, false);
  const disconnected = routeBetween(network, 'A', 'Z', { names: { A: 'Room A', Z: 'Room Z' } });
  assert.equal(disconnected.status, 'unavailable');
  assert.match(disconnected.missing[0].what, /walkable connection between Room A and Room Z/);
  const unchecked = { ...network, edges: network.edges.map((x) => (x.kind === 'stairs' || x.kind === 'elevator' ? { ...x, status: 'unknown' } : x)) };
  const blocked = routeBetween(unchecked, 'A', 'G', {});
  assert.equal(blocked.status, 'unavailable');
  assert.ok(blocked.missing.some((m) => m.id === 'c~d' && m.status === 'unknown'), 'unknown stair link is named');
  assert.equal(routeBetween(unchecked, 'A', 'G', { review: true }).status, 'unavailable', 'review never uses unknown data');
  assert.deepEqual(validateNetwork(network, { 1: [{ x1: 5, y1: -5, x2: 5, y2: 5 }] }), []);
  assert.deepEqual(validateNetwork({ nodes: network.nodes, edges: [e('b', 'e'), { ...e('b', 'd'), id: 'bad' }] },
    { 1: [{ x1: 15, y1: -5, x2: 15, y2: 5 }] }), ['Walk edge b→e crosses a wall', 'Walk edge b→d changes level']);
});

test('a phone fix is used only when its measured accuracy is good enough', () => {
  // Synthetic survey: 2.4 map units per metre, rotated 12°, offset (300, 120).
  const truth = { origin: { latitude: 34.18, longitude: -118.31 }, scale: 2.4, angle: 12 * Math.PI / 180, offset: { x: 300, y: 120 } };
  const geo = [[34.1801, -118.3102], [34.1797, -118.3089], [34.1806, -118.3095], [34.18, -118.31]]
    .map(([latitude, longitude]) => ({ latitude, longitude }));
  const points = geo.map((g) => ({ ...g, ...toCampus(g, truth) }));
  const ref = fitGeoReference(points);
  near(ref.unitsPerMetre, 2.4, 'scale', 1e-4);
  near(ref.angle, truth.angle, 'angle', 1e-4);
  assert.ok(ref.residualMetres < 0.01);
  const now = 1_000_000;
  const fix = { latitude: 34.18015, longitude: -118.3097, accuracy: 3, timestamp: now - 1000 };
  const ok = gateFix(fix, ref, now);
  assert.equal(ok.usable, true);
  near(ok.radius, 3 * 2.4, 'radius', 1e-3);
  assert.deepEqual(gateFix({ ...fix, accuracy: 12 }, ref, now), { usable: false, reason: 'too-inaccurate' });
  assert.deepEqual(gateFix({ ...fix, timestamp: now - 60000 }, ref, now), { usable: false, reason: 'stale' });
  assert.deepEqual(gateFix(fix, null, now), { usable: false, reason: 'no-reference' });
  assert.deepEqual(gateFix({ ...fix, latitude: 34.2 }, ref, now), { usable: false, reason: 'off-campus' });
});

const { buildWalkGrid, areaRoute, isWalkable, snapToWalkable, pointInPolygon } = require('../src/navigation/areaRouting.ts');
const WALK = require('../src/navigation/data/building1Walkable.ts');
const { destinationStatus, planTrip, startFromTap } = require('../src/navigation/directions.ts');
const B1 = ([x, y]) => ({ x: (x + 3897.8 - 120) / 10, y: (y + 2617.6 - 1900) / 10 });
const groundGrid = buildWalkGrid(WALK.B1_GROUND_SPACE, WALK.B1_GROUND_OBSTACLES);
const area = (id) => WALK.B1_AREA_DESTINATIONS.find((a) => a.placeId === id);
function segmentsCross(a, b, w) {
  const d = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(w.x1, w.y1, w.x2, w.y2, a.x, a.y); const d2 = d(w.x1, w.y1, w.x2, w.y2, b.x, b.y);
  const d3 = d(a.x, a.y, b.x, b.y, w.x1, w.y1); const d4 = d(a.x, a.y, b.x, b.y, w.x2, w.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

test('Building 1 corrections: wider gap, Career Center by the Library, open Lunch Shelter, Senior Hill', () => {
  const ground = campus[0];
  // Gap between 2101 Drama's east wall and the Lunch Shelter's west edge, at mid-height.
  const y = B1([0, 300]).y;
  const vertical = (x0, x1) => ground.walls.filter((w) => w.x1 === w.x2 && w.x1 > x0 && w.x1 < x1 && w.y1 <= y && w.y2 >= y);
  const drama = Math.max(...vertical(360, 380).map((w) => w.x1));
  const shelterEdge = byId(ground, 'g-b1-lunch-shelter').roomBounds.minX;
  const gap = shelterEdge - drama;
  assert.ok(gap > 8.5 && gap < 10.5, `gap is about 3× the PDF's 3.2 units (got ${gap.toFixed(1)})`);
  // Nothing solid inside the Lunch Shelter's south and west sides.
  const shelter = byId(ground, 'g-b1-lunch-shelter').roomBounds;
  const blocks = ground.walls.filter((w) => (w.y1 === w.y2 && Math.abs(w.y1 - shelter.maxY) < 0.05 && w.x1 < shelter.maxX - 0.5 && w.x2 > shelter.minX + 0.5)
    || (w.x1 === w.x2 && Math.abs(w.x1 - shelter.minX) < 0.05 && w.y1 < shelter.maxY - 0.5 && w.y2 > shelter.minY + 0.5));
  assert.deepEqual(blocks, [], 'the Lunch Shelter has no wall on its open south and west sides');
  const career = byId(ground, 'g-b1-career-center').roomBounds;
  const library = byId(ground, 'g-b1-library').roomBounds;
  assert.ok(Math.abs(career.maxX - library.minX) < 0.3, 'the Career Center adjoins the Library');
  const hill = byId(ground, 'g-b1-senior-hill');
  assert.ok(pointInPolygon(hill.anchor, area('g-b1-quad').region), 'Senior Hill sits at the edge of the Quad');
  assert.ok(byId(ground, 'g-b1-student-area'));
});

test('walkable space keeps off walls and stairs, and the ramp is not used', () => {
  for (const o of WALK.B1_GROUND_OBSTACLES) {
    const xs = o.outline.map((p) => p.x); const ys = o.outline.map((p) => p.y);
    const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    assert.ok(!isWalkable(groundGrid, centre), `${o.id} is not flat walking space`);
  }
  // Inside buildings and rooms is never walkable.
  for (const id of ['g-b1-cafeteria', 'g-b1-room-1155', 'g-b1-room-1141', 'g-b1-library', 'g-b1-career-center', 'g-b1-admin-offices']) {
    assert.ok(!isWalkable(groundGrid, byId(campus[0], id).anchor), `${id} is not open space`);
  }
  assert.ok(isWalkable(groundGrid, area('g-b1-lunch-shelter').region[0].x !== undefined ? B1([150, 300]) : null));
  assert.equal(WALK.B1_RAMP_PROPOSAL.status, 'proposed');
  assert.equal(startFromTap(byId(campus[0], 'g-b1-room-1155').anchor), null, 'a tap inside a room is not a start');
});

test('area routes reach open destinations around barriers, never through walls', () => {
  const walls = campus[0].walls;
  const trips = [
    ['Student Area → Lunch Shelter', B1([220, 700]), 'g-b1-lunch-shelter', (end) => Math.abs(end.y - B1([0, 478]).y) < 1.5],
    ['gap → Lunch Shelter', B1([5, 300]), 'g-b1-lunch-shelter', (end) => Math.abs(end.x - B1([52, 0]).x) < 1.5],
    ['north walkway → Senior Hill', B1([1600, 452]), 'g-b1-senior-hill', () => true],
    ['Student Area → Senior Hill', B1([300, 880]), 'g-b1-senior-hill', () => true],
    ['Senior Hill → Student Area', B1([1215, 700]), 'g-b1-student-area', () => true],
  ];
  for (const [name, start, id, entersBy] of trips) {
    const r = areaRoute(groundGrid, start, area(id));
    assert.equal(r.status, 'available', name);
    const end = r.path.at(-1);
    assert.ok(pointInPolygon(end, area(id).region), `${name} ends inside the destination`);
    assert.ok(entersBy(end), `${name} enters through the expected open side`);
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1]; const b = r.path[i];
      assert.ok(!walls.some((w) => segmentsCross(a, b, w)), `${name} segment ${i} crosses a wall`);
      for (let t = 0; t <= 1; t += 0.02) {
        assert.ok(isWalkable(groundGrid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), `${name} stays in walkable space`);
      }
    }
    assert.match(r.steps.at(-1).text, /^Arrive at /);
  }
  assert.equal(areaRoute(groundGrid, byId(campus[0], 'g-b1-room-1155').anchor, area('g-b1-quad')).status, 'unavailable',
    'starting inside a room is refused');
});

test('directions are offered only where a checked route can exist', () => {
  const place = (id, building = '1', floorId = 'floor-1') => ({ id, title: id, building, floorId });
  for (const id of ['g-b1-lunch-shelter', 'g-b1-senior-hill', 'g-b1-quad', 'g-b1-student-area']) {
    assert.equal(destinationStatus(place(id), false).offered, true, id);
  }
  for (const id of ['g-b1-room-1155', 'g-b1-room-1141', 'g-b1-book-room', 'g-b1-library', 'g-b1-career-center']) {
    assert.equal(destinationStatus(place(id), false).offered, true, `${id} has a confirmed entrance side`);
  }
  for (const id of ['g-b1-cafeteria', 'g-b1-admin-offices', 'g-b1-room-1-159']) {
    const s = destinationStatus(place(id), false);
    assert.equal(s.offered, false, `${id} has no confirmed entrance`);
  }
  assert.equal(destinationStatus(place('g-b2-room-2107', '2'), false).offered, false);
  assert.equal(destinationStatus(place('f2-b1-1216', '1', 'floor-2'), false).offered, false);
  const start = { title: 'Marked spot', level: 1, point: B1([220, 700]) };
  const ok = planTrip(start, place('g-b1-lunch-shelter'), false, {});
  assert.equal(ok.status, 'available');
  assert.equal(ok.reviewOnly, false);
  assert.equal(ok.route.legs[0].level, 1);
  const room = planTrip(start, place('g-b1-cafeteria'), false, {});
  assert.equal(room.status, 'unavailable');
  assert.match(room.reasons[0], /entrance hasn’t been confirmed/);
});

test('a quick single-finger tap reports the map point under it', () => {
  const harness = componentHarness();
  const taps = [];
  const width = 390; const height = 600;
  harness.load('InteractiveMap.tsx', true).MapViewport({ width, height, floor: floor2View, onMapTap: (p) => taps.push(p) });
  const { callbacks } = harness.gesture;
  const manager = { activate() {}, end() {}, fail() {} };
  const touch = [{ id: 1, x: width / 2, y: height / 2 }];
  callbacks.onTouchesDown({ allTouches: touch, changedTouches: touch }, manager);
  callbacks.onTouchesUp({ allTouches: touch, changedTouches: touch }, manager);
  assert.equal(taps.length, 1);
  near(taps[0].x, 201 / 2, 'centre tap', 1e-6);
  near(taps[0].y, 258 / 2, 'centre tap', 1e-6);
  // A drag is not a tap.
  callbacks.onTouchesDown({ allTouches: touch, changedTouches: touch }, manager);
  const moved = [{ id: 1, x: width / 2 + 30, y: height / 2 }];
  callbacks.onTouchesMove({ allTouches: moved, changedTouches: moved });
  callbacks.onTouchesUp({ allTouches: moved, changedTouches: moved }, manager);
  assert.equal(taps.length, 1);
});

const { entranceFor } = require('../src/navigation/directions.ts');

test('Building 1 entrances: each row is entered from its confirmed side, at approximate door points', () => {
  const walls = campus[0].walls;
  const place = (id) => ({ id, title: id, building: '1', floorId: 'floor-1' });
  const starts = { 'Student Area': B1([220, 700]), Quad: B1([900, 700]), 'north walkway': B1([1600, 452]) };
  const north = ['1155', '1156', '1157', '1158', '1160', '1161', '1162'].map((n) => `g-b1-room-${n}`);
  const south = ['1139', '1140', '1141', '1142', '1143', '1144'].map((n) => `g-b1-room-${n}`).concat('g-b1-book-room');
  assert.equal(WALK.B1_ENTRANCES.length, 17);
  for (const e of WALK.B1_ENTRANCES) {
    assert.equal(e.sideStatus, 'checked', `${e.placeId}: the side is confirmed`);
    assert.equal(e.positionStatus, 'approximate', `${e.placeId}: the door point along the wall is not measured`);
    assert.ok(isWalkable(groundGrid, e.approach), `${e.placeId}: approach point is in walkable space`);
    // The door sits on the room's own outline.
    const box = byId(campus[0], e.placeId).roomBounds;
    assert.ok(e.door.x >= box.minX - 0.6 && e.door.x <= box.maxX + 0.6 && e.door.y >= box.minY - 0.6 && e.door.y <= box.maxY + 0.6,
      `${e.placeId}: door is on its room`);
  }
  for (const id of north) {
    const e = entranceFor(id);
    assert.ok(e.approach.y > e.door.y, `${id}: entered from its bottom side, facing the Quad`);
    assert.equal(e.facing, 'the Quad');
  }
  for (const id of south) {
    const e = entranceFor(id);
    assert.ok(e.approach.y < e.door.y, `${id}: entered from its top side`);
  }
  const library = entranceFor('g-b1-library');
  assert.ok(library.approach.x < library.door.x, 'Library: entered from the gap by the Career Center and Book Room');
  const career = entranceFor('g-b1-career-center');
  assert.ok(career.approach.y > career.door.y, 'Career Center: entered on its bottom side');
  for (const id of [...north, ...south, 'g-b1-room-1138', 'g-b1-library', 'g-b1-career-center']) {
    for (const [name, point] of Object.entries(starts)) {
      const trip = planTrip({ title: 'Marked spot', level: 1, point }, place(id), false, {});
      assert.equal(trip.status, 'available', `${name} → ${id}`);
      const pts = trip.route.legs[0].points;
      const e = entranceFor(id);
      assert.deepEqual(pts.at(-1), e.door, `${name} → ${id} ends at the door`);
      assert.ok(Math.hypot(pts.at(-2).x - e.approach.x, pts.at(-2).y - e.approach.y) < 1.2, `${name} → ${id} arrives by the approach point`);
      // Every segment before the last step to the door stays off walls.
      for (let i = 1; i < pts.length - 1; i++) {
        assert.ok(!walls.some((w) => segmentsCross(pts[i - 1], pts[i], w)), `${name} → ${id} segment ${i} crosses a wall`);
      }
      assert.match(trip.steps.at(-1).text, new RegExp(`^Arrive at the .* entrance, facing ${e.facing}$`));
    }
  }
  const leave = planTrip({ title: 'Room 1162', level: 1, point: WALK.B1_ENTRANCES[0].approach, placeId: 'g-b1-room-1162' },
    place('g-b1-library'), false, {});
  assert.equal(leave.status, 'available');
  assert.deepEqual(leave.route.legs[0].points[0], entranceFor('g-b1-room-1162').door);
  assert.equal(leave.steps[0].text, 'Leave Room 1162 by its entrance facing the Quad');
  const fromLive = planTrip({ title: 'Your location', level: 1, point: B1([900, 700]), live: true }, place('g-b1-library'), false, {});
  assert.match(fromLive.steps[0].text, /^Start at your location/);
});

const tracker = require('../src/positioning/tracker.ts');
const calibration = require('../src/positioning/calibration.ts');
// Synthetic alignment: 2 map units per metre, map north = true north.
const REF = { origin: { latitude: 34.18, longitude: -118.31 }, scale: 2, angle: 0, offset: { x: 100, y: 100 },
  unitsPerMetre: 2, residualMetres: 1 };
const geoAt = (eastMetres, southMetres) => ({
  latitude: 34.18 - southMetres / 111320,
  longitude: -118.31 + eastMetres / (111320 * Math.cos(34.18 * Math.PI / 180)),
});

test('live tracker: fixes blend by accuracy, coarse fixes and missing alignment are ignored', () => {
  const t0 = 1_000_000;
  let s = tracker.emptyTracker();
  const fix = (east, south, accuracy, at) => ({ ...geoAt(east, south), accuracy, timestamp: at });
  assert.equal(tracker.applyFix(s, fix(0, 0, 3, t0), null), s, 'no alignment, no position');
  assert.equal(tracker.applyFix(s, fix(0, 0, 40, t0), REF).estimate, null, 'a 40 m fix is ignored');
  s = tracker.applyFix(s, fix(10, 0, 4, t0), REF);
  near(s.estimate.x, 120, 'east 10 m = 20 units', 0.05);
  near(s.estimate.y, 100, 'north', 0.05);
  near(s.estimate.radius, Math.hypot(4, 1), 'radius includes the alignment error', 1e-9);
  assert.equal(tracker.quality(s.estimate, t0), 'approximate');
  const blended = tracker.applyFix(s, fix(20, 0, 4, t0), REF);
  assert.ok(blended.estimate.x > 120 && blended.estimate.x < 140, 'equal accuracies meet in the middle');
  assert.ok(blended.estimate.radius < s.estimate.radius, 'agreeing fixes shrink the uncertainty');
  // Uncertainty grows while nothing new arrives.
  assert.ok(tracker.currentRadius(s.estimate, t0 + 10_000) > s.estimate.radius + 2.9);
  assert.equal(tracker.quality(s.estimate, t0 + 60_000), 'unknown');
  assert.equal(tracker.quality(null, t0), 'unknown');
});

test('live tracker: steps move along a calibrated heading and only widen the circle otherwise', () => {
  const t0 = 2_000_000;
  let s = tracker.setManual(tracker.emptyTracker(), { x: 100, y: 100 }, t0);
  assert.equal(tracker.quality(s.estimate, t0), 'precise');
  s = tracker.applySteps(s, 0, REF, t0); // first count is the baseline
  near(s.estimate.x, 100);
  // Heading east, well calibrated: 10 steps × 0.7 m = 7 m = 14 units east.
  s = tracker.applyHeading(s, { degrees: 90, quality: 3, at: t0 });
  const moved = tracker.applySteps(s, 10, REF, t0);
  near(moved.estimate.x, 114, 'moved east', 1e-9);
  near(moved.estimate.y, 100, 'no north–south drift', 1e-9);
  near(moved.estimate.radius, 2 + 7 * (0.1 + Math.sin(20 * Math.PI / 180)), 'growth from stride and heading error', 1e-9);
  assert.equal(moved.estimate.source, 'steps');
  // An uncalibrated compass never moves the estimate.
  const lost = tracker.applySteps(tracker.applyHeading(s, { degrees: 90, quality: 0, at: t0 }), 10, REF, t0);
  near(lost.estimate.x, 100);
  near(lost.estimate.radius, 2 + 7, 'a full stride of doubt per step', 1e-9);
  // A stale heading is treated the same way.
  const stale = tracker.applySteps(s, 10, REF, t0 + 6000);
  near(stale.estimate.x, 100);
  // Without an alignment there is no metre scale, so steps are only counted.
  assert.deepEqual(tracker.applySteps(s, 10, null, t0).estimate, s.estimate);
});

test('live position advances steps or reroutes only when precise enough', () => {
  const t0 = 3_000_000;
  const route = [{ x: 100, y: 100 }, { x: 140, y: 100 }];
  const at = (x, y, radius) => ({ x, y, radius, source: 'gps', at: t0 });
  const g = (e, next = { x: 140, y: 100 }, ref = REF) => tracker.routeGuidance(e, t0, ref, route, next).action;
  assert.equal(g(at(139, 100, 2)), 'advance', 'precise and within 3 m of the next turn');
  assert.equal(g(at(139, 100, 6)), 'confirm', 'approximate positions never advance');
  assert.equal(g(at(120, 100, 2)), 'follow');
  assert.equal(g(at(120, 130, 3)), 'reroute', 'precise and 15 m off the route');
  assert.equal(g(at(120, 130, 8)), 'confirm', 'too uncertain to reroute');
  assert.equal(g(at(120, 106, 3)), 'follow', 'a few metres off is within the circle');
  assert.equal(g(null), 'confirm');
  assert.equal(g(at(139, 100, 2), { x: 140, y: 100 }, null), 'confirm', 'no alignment, no live guidance');
  assert.equal(g(at(139, 100, 2), null), 'follow', 'nothing to advance to on the last step');
});

test('reference points come only from measured fixes, and checkpoints report error', () => {
  const now = 4_000_000;
  const good = [3, 4, 5, 4, 3].map((accuracy, i) => ({ ...geoAt(0, 0), accuracy, timestamp: now + i * 1000 }));
  assert.equal(calibration.averageFixes(good.slice(0, 4), { x: 1, y: 2 }, now), null, 'too few fixes');
  assert.equal(calibration.averageFixes(good.map((f) => ({ ...f, accuracy: 25 })), { x: 1, y: 2 }, now), null,
    'coarse fixes are refused');
  const ref = calibration.averageFixes([...good, { ...geoAt(50, 0), accuracy: 30, timestamp: now }], { x: 1, y: 2 }, now);
  assert.equal(ref.samples, 5);
  near(ref.latitude, 34.18, 'the coarse outlier is dropped', 1e-9);
  assert.equal(ref.accuracy, 4);
  assert.equal(calibration.referenceFrom([ref, ref]), null, 'two points cannot show their own error');
  const points = [[0, 0], [40, 0], [0, 30], [40, 30]].map(([e, n]) => ({ ...geoAt(e, n), x: 100 + 2 * e, y: 100 + 2 * n }));
  const fitted = calibration.referenceFrom(points);
  near(fitted.unitsPerMetre, 2, 'scale from the measured points', 0.01);
  const log = [
    calibration.checkpoint({ x: 110, y: 100 }, { x: 114, y: 100, radius: 3, source: 'gps', at: now }, good[0], fitted, now),
    calibration.checkpoint({ x: 110, y: 100 }, { x: 110, y: 120, radius: 4, source: 'steps', at: now }, good[0], fitted, now),
    calibration.checkpoint({ x: 110, y: 100 }, null, null, fitted, now),
  ];
  near(log[0].errorMetres, 2, 'error in metres', 0.02);
  const summary = calibration.summarize(log);
  assert.equal(summary.checkpoints, 3);
  near(summary.gpsMedian, 2, 'GPS-led error', 0.02);
  near(summary.stepsMedian, 10, 'step drift', 0.05);
  near(summary.withinRadius, 0.5, 'half the true spots were inside the shown circle', 1e-9);
  assert.deepEqual(require('../src/positioning/referencePoints.ts').MEASURED_REFERENCES, [],
    'no alignment is shipped until it is measured at school');
});

test('the live marker shows a solid dot only for a precise position', () => {
  const harness = componentHarness();
  const LiveMarker = harness.load('LiveMarker.tsx').default;
  const props = { point: { x: 50, y: 50 }, radius: 3, width: 390, height: 600, fitScale: 1, fittedWidth: 201, fittedHeight: 258,
    zoom: harness.shared(1), x: harness.shared(0), y: harness.shared(0) };
  const kinds = (tree) => [tree.props.children].flat().filter(Boolean).length;
  assert.equal(kinds(LiveMarker({ ...props, quality: 'precise' })), 2, 'ring and dot');
  assert.equal(kinds(LiveMarker({ ...props, quality: 'approximate' })), 1, 'ring only');
  assert.equal(kinds(LiveMarker({ ...props, quality: 'unknown' })), 1, 'ring only');
});
