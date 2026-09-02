/**
 * CBMI Parameter Adjustment Guide — canonical thresholds.
 * @see cbmi-parameter-guide.html
 */
export const YAW_THRESHOLD = 20;
export const PITCH_UP_THRESHOLD = 14.0;
export const PITCH_DOWN_THRESHOLD = 12.0;
export const HYSTERESIS_MARGIN = 5.0;
export const DISTANCE_THRESHOLD_CM = 70;
export const BRIGHTNESS_MIN_THRESHOLD = 0.20;
/** Section 7 protocol: DIM_LIGHT between LOW_LIGHT (0.20) and baseline (~0.44) */
export const BRIGHTNESS_DIM_LIGHT_THRESHOLD = 0.35;
/** Section 5: baseline contrast ~0.15+, degraded ~0.05 */
export const CONTRAST_MIN_THRESHOLD = 0.08;
/** Section 5: Laplacian sharpness normalized; blurry frames below this */
export const SHARPNESS_MIN_THRESHOLD = 0.15;
export const SUSTAINED_DURATION_SEC = 2;
export const EAR_THRESHOLD = 0.10;
export const HEAD_PITCH_DISENGAGEMENT_THRESHOLD = 10;
/** Phase 2 gaze disengagement — aligned with head orientation thresholds */
export const GAZE_YAW_THRESHOLD = YAW_THRESHOLD;
export const GAZE_PITCH_DOWN_THRESHOLD = PITCH_DOWN_THRESHOLD;
export const GAZE_PITCH_UP_THRESHOLD = PITCH_UP_THRESHOLD;
export const GAZE_MIN_CONFIDENCE = 0.55;
export const OCCLUSION_VALID_THRESHOLD = 0.5;
export const OCCLUSION_SCENARIO_THRESHOLD = 0.8;
