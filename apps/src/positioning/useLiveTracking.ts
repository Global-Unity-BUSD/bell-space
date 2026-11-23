import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';

import { averageFixes, CAPTURE, checkpoint, referenceFrom, summarize, type CapturedReference,
  type Checkpoint } from './calibration';
import { MEASURED_REFERENCES } from './referencePoints';
import { applyFix, applyHeading, applySteps, emptyTracker, quality, setManual, type Fix,
  type HeadingReading, type TrackerState } from './tracker';

export type LiveStatus = 'off' | 'starting' | 'on' | 'denied' | 'error';

type Readings = { fix: Fix | null; heading: HeadingReading | null; steps: number | null; stepsAvailable: boolean | null };

/**
 * Live tracking for the walking experiment (expo-location + expo-sensors,
 * Expo SDK 58). Permissions are requested only when `enabled` turns on.
 * Location and heading are watched in the foreground only.
 */
export function useLiveTracking(enabled: boolean) {
  const [status, setStatus] = useState<LiveStatus>('off');
  const [message, setMessage] = useState<string | null>(null);
  const [readings, setReadings] = useState<Readings>({ fix: null, heading: null, steps: null, stepsAvailable: null });
  const [tracker, setTracker] = useState<TrackerState>(emptyTracker);
  const [session, setSession] = useState<CapturedReference[]>([]);
  const [capturing, setCapturing] = useState(false);
  // Read only from sensor callbacks and timers, never during render.
  const captureRef = useRef<{ point: { x: number; y: number }; fixes: Fix[] } | null>(null);
  const referenceRef = useRef<ReturnType<typeof referenceFrom>>(null);
  const lastFixRef = useRef<Fix | null>(null);
  const [log, setLog] = useState<Checkpoint[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const reference = useMemo(() => referenceFrom([...MEASURED_REFERENCES, ...session]), [session]);
  useEffect(() => { referenceRef.current = reference; }, [reference]);

  // Clock for drift growth and capture timing while tracking.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const subscriptions: { remove: () => void }[] = [];
    (async () => {
      setStatus('starting');
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted) { setStatus('denied'); setMessage('Location permission was not granted.'); return; }
        if (permission.ios?.accuracy === 'reduced') setMessage('Precise Location is off for this app; readings will be coarse.');
        subscriptions.push(await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0, timeInterval: 1000 },
          (p) => {
            const fix: Fix = { latitude: p.coords.latitude, longitude: p.coords.longitude,
              accuracy: p.coords.accuracy ?? Infinity, timestamp: p.timestamp };
            lastFixRef.current = fix;
            setReadings((r) => ({ ...r, fix }));
            setTracker((s) => applyFix(s, fix, referenceRef.current));
            captureRef.current?.fixes.push(fix);
          },
          (reason) => setMessage(`Location error: ${reason}`)));
        let lastHeading = 0;
        subscriptions.push(await Location.watchHeadingAsync((h) => {
          const t = Date.now();
          if (t - lastHeading < 250) return; // 4 updates a second is plenty
          lastHeading = t;
          const degrees = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          const heading: HeadingReading = { degrees, quality: Math.max(0, Math.min(3, Math.round(h.accuracy))) as 0 | 1 | 2 | 3, at: t };
          setReadings((r) => ({ ...r, heading }));
          setTracker((s) => applyHeading(s, heading));
        }));
        const available = await Pedometer.isAvailableAsync();
        setReadings((r) => ({ ...r, stepsAvailable: available }));
        if (available) {
          const motion = await Pedometer.requestPermissionsAsync();
          if (motion.granted) {
            subscriptions.push(Pedometer.watchStepCount(({ steps }) => {
              setReadings((r) => ({ ...r, steps }));
              setTracker((s) => applySteps(s, steps, referenceRef.current, Date.now()));
            }));
          } else {
            setMessage('Motion permission was not granted; steps are unavailable.');
          }
        }
        if (cancelled) { subscriptions.forEach((s) => s.remove()); return; }
        setStatus('on');
      } catch (e) {
        setStatus('error');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      subscriptions.forEach((s) => s.remove());
      setStatus('off');
    };
  }, [enabled]);

  // Collect fixes while the student stands on the tapped spot, then average them.
  const startCapture = useCallback((point: { x: number; y: number }) => {
    captureRef.current = { point, fixes: [] };
    setCapturing(true);
    setMessage(`Stand still on that spot for ${CAPTURE.seconds} s…`);
    setTimeout(() => {
      const c = captureRef.current;
      captureRef.current = null;
      setCapturing(false);
      const ref = c ? averageFixes(c.fixes, c.point, Date.now()) : null;
      if (ref) {
        setSession((list) => [...list, ref]);
        setMessage(`Reference point added (${ref.samples} fixes, ±${ref.accuracy.toFixed(1)} m).`);
      } else {
        setMessage(`Not enough fixes better than ${CAPTURE.maxAccuracy} m; try again outdoors and stand still.`);
      }
    }, CAPTURE.seconds * 1000);
  }, []);
  const correct = useCallback((point: { x: number; y: number }) => setTracker((s) => setManual(s, point, Date.now())), []);
  const estimate = tracker.estimate;
  const addCheckpoint = useCallback((truth: { x: number; y: number }) => {
    setLog((l) => [...l, checkpoint(truth, estimate, lastFixRef.current, referenceRef.current, Date.now())]);
  }, [estimate]);
  const reset = useCallback(() => { setSession([]); setLog([]); setTracker(emptyTracker()); }, []);

  return {
    status, message, readings, reference, references: [...MEASURED_REFERENCES, ...session], capturing,
    estimate: tracker.estimate, quality: quality(tracker.estimate, now), now,
    log, summary: summarize(log), startCapture, correct, addCheckpoint, reset,
  };
}

export type LiveTracking = ReturnType<typeof useLiveTracking>;
