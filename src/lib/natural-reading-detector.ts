export interface NaturalReadingState {
  startTime: number | null;
  yawSamples: number[];
}

export interface NaturalReadingInput {
  yaw: number;
  pitch: number;
  now: number;
  hasFace: boolean;
  faceCount: number;
}

const READING_PITCH_MIN = -28;
const READING_PITCH_MAX = -5;
const READING_YAW_MAX = 15;
const READING_MIN_DURATION_MS = 3000;
const READING_SACCADE_MIN_DEG = 2;
const READING_SACCADE_MAX_DEG = 22;
const READING_SAMPLE_WINDOW = 6;

/**
 * Detect natural reading: moderate downward gaze + horizontal micro-saccades + sustained duration.
 */
export function updateNaturalReading(
  state: NaturalReadingState,
  input: NaturalReadingInput
): { state: NaturalReadingState; isNaturalReading: boolean } {
  const { yaw, pitch, now, hasFace, faceCount } = input;

  if (!hasFace || faceCount > 1) {
    return { state: { startTime: null, yawSamples: [] }, isNaturalReading: false };
  }

  const inReadingBand =
    pitch <= READING_PITCH_MAX &&
    pitch >= READING_PITCH_MIN &&
    Math.abs(yaw) < READING_YAW_MAX;

  if (!inReadingBand) {
    return { state: { startTime: null, yawSamples: [] }, isNaturalReading: false };
  }

  const yawSamples = [...state.yawSamples, yaw].slice(-READING_SAMPLE_WINDOW);
  const yawRange = yawSamples.length >= 3
    ? Math.max(...yawSamples) - Math.min(...yawSamples)
    : 0;
  const hasSaccades =
    yawRange >= READING_SACCADE_MIN_DEG &&
    yawRange <= READING_SACCADE_MAX_DEG;

  const startTime = state.startTime ?? now;
  const durationMs = now - startTime;
  const isNaturalReading =
    durationMs >= READING_MIN_DURATION_MS && hasSaccades;

  return {
    state: { startTime, yawSamples },
    isNaturalReading,
  };
}
