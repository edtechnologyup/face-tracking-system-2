/**
 * Tracking profile + device tier for dual-pipeline scaling (exam vs research).
 * Phase 1: client-side auto-detect + env override — no server round-trip required.
 */

export type TrackingProfile = 'exam' | 'research';
export type DeviceTier = 'T0' | 'T1' | 'T2' | 'T3';
export type OverlayMode = 'full' | 'contours' | 'minimal';

export interface DeviceTierSpec {
  label: string;
  sampleIntervalMs: number;
  primaryIntervalMs: number;
  yoloIntervalMs: number;
  syncedBenchmarkIntervalMs: number;
  enableL2csInPrimaryLoop: boolean;
  enableDlibInPrimaryLoop: boolean;
  openFaceContinuousLoop: boolean;
  provenanceFullEveryN: number;
  /** Sci-Fi mesh density on canvas overlay */
  overlayMode: OverlayMode;
  /** YOLO/Dlib/OpenFace debug overlays on canvas */
  showEngineOverlays: boolean;
  /** Pause detection loops when tab is hidden (Phase 3) */
  pauseWhenHidden: boolean;
}

export interface TrackingRuntimeConfig extends DeviceTierSpec {
  profile: TrackingProfile;
  tier: DeviceTier;
  sampleRateHz: number;
  userAgent: string;
  deviceMemoryGb: number | null;
}

const TIER_SPECS: Record<DeviceTier, DeviceTierSpec> = {
  T0: {
    label: 'PC / Laptop (8GB+)',
    sampleIntervalMs: 500,
    primaryIntervalMs: 100,
    yoloIntervalMs: 1200,
    syncedBenchmarkIntervalMs: 30_000,
    enableL2csInPrimaryLoop: true,
    enableDlibInPrimaryLoop: true,
    openFaceContinuousLoop: false,
    provenanceFullEveryN: 60,
    overlayMode: 'full',
    showEngineOverlays: true,
    pauseWhenHidden: true,
  },
  T1: {
    label: 'iPad (A12+)',
    sampleIntervalMs: 500,
    primaryIntervalMs: 100,
    yoloIntervalMs: 1500,
    syncedBenchmarkIntervalMs: 45_000,
    enableL2csInPrimaryLoop: true,
    enableDlibInPrimaryLoop: true,
    openFaceContinuousLoop: false,
    provenanceFullEveryN: 60,
    overlayMode: 'full',
    showEngineOverlays: true,
    pauseWhenHidden: true,
  },
  T2: {
    label: 'Older iPad / mid Android',
    sampleIntervalMs: 1000,
    primaryIntervalMs: 120,
    yoloIntervalMs: 2000,
    syncedBenchmarkIntervalMs: 60_000,
    enableL2csInPrimaryLoop: false,
    enableDlibInPrimaryLoop: false,
    openFaceContinuousLoop: false,
    provenanceFullEveryN: 30,
    overlayMode: 'contours',
    showEngineOverlays: false,
    pauseWhenHidden: true,
  },
  T3: {
    label: 'iPhone / small mobile',
    sampleIntervalMs: 1000,
    primaryIntervalMs: 150,
    yoloIntervalMs: 2500,
    syncedBenchmarkIntervalMs: 90_000,
    enableL2csInPrimaryLoop: false,
    enableDlibInPrimaryLoop: false,
    openFaceContinuousLoop: false,
    provenanceFullEveryN: 30,
    overlayMode: 'minimal',
    showEngineOverlays: false,
    pauseWhenHidden: true,
  },
};

export function resolveTrackingProfile(
  envValue?: string | null
): TrackingProfile {
  const raw =
    envValue ??
    (typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_TRACKING_PROFILE
      : undefined);
  return raw === 'research' ? 'research' : 'exam';
}

/** Detect device tier from UA + optional deviceMemory (Chrome). */
export function detectDeviceTier(input: {
  userAgent: string;
  deviceMemoryGb?: number | null;
  maxTouchPoints?: number;
  platform?: string;
}): DeviceTier {
  const ua = input.userAgent;
  const memory = input.deviceMemoryGb ?? null;
  const maxTouchPoints = input.maxTouchPoints ?? 0;
  const platform = input.platform ?? '';

  const isIPhone = /iPhone/i.test(ua);
  const isIPad =
    /iPad/i.test(ua) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobileUa = /Mobile/i.test(ua);

  if (!isIPhone && !isIPad && !isAndroid && !isMobileUa) {
    return 'T0';
  }

  if (isIPhone) {
    return 'T3';
  }

  if (isIPad) {
    return memory != null && memory >= 4 ? 'T1' : 'T2';
  }

  if (isAndroid) {
    if (/Tablet/i.test(ua)) {
      return memory != null && memory >= 4 ? 'T1' : 'T2';
    }
    return memory != null && memory >= 6 ? 'T2' : 'T3';
  }

  return 'T2';
}

export function buildTrackingRuntimeConfig(input?: {
  profile?: TrackingProfile;
  tier?: DeviceTier;
  userAgent?: string;
  deviceMemoryGb?: number | null;
  maxTouchPoints?: number;
  platform?: string;
}): TrackingRuntimeConfig {
  const userAgent =
    input?.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  const deviceMemoryGb =
    input?.deviceMemoryGb ??
    (typeof navigator !== 'undefined' &&
    'deviceMemory' in navigator &&
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory ===
      'number'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null
      : null);

  const tier =
    input?.tier ??
    detectDeviceTier({
      userAgent,
      deviceMemoryGb,
      maxTouchPoints:
        input?.maxTouchPoints ??
        (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0),
      platform:
        input?.platform ??
        (typeof navigator !== 'undefined' ? navigator.platform : ''),
    });

  const profile = input?.profile ?? resolveTrackingProfile();
  const spec = TIER_SPECS[tier];

  // Research on desktop may re-enable continuous OpenFace (still not recommended at scale).
  const openFaceContinuousLoop =
    profile === 'research' &&
    tier === 'T0' &&
    spec.openFaceContinuousLoop;

  return {
    profile,
    tier,
    userAgent,
    deviceMemoryGb,
    ...spec,
    openFaceContinuousLoop,
    sampleRateHz: Math.round(1000 / spec.sampleIntervalMs),
  };
}

export function getDeviceTierSpec(tier: DeviceTier): DeviceTierSpec {
  return TIER_SPECS[tier];
}

/** Whether a behavior log row qualifies for research dataset export. */
export function isResearchEligible(input: {
  profile: TrackingProfile;
  tier: DeviceTier;
  isValid: boolean;
  experimentPhase: string;
}): boolean {
  if (!input.isValid) return false;
  if (input.experimentPhase === 'SYSTEM_STABILIZATION') return false;
  if (input.profile === 'research') return true;
  return input.tier === 'T0' || input.tier === 'T1';
}
