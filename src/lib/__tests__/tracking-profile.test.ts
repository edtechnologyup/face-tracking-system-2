import { describe, expect, it } from 'vitest';
import {
  buildTrackingRuntimeConfig,
  detectDeviceTier,
  isResearchEligible,
  resolveTrackingProfile,
} from '@/lib/tracking-profile';

describe('resolveTrackingProfile', () => {
  it('defaults to exam', () => {
    expect(resolveTrackingProfile(undefined)).toBe('exam');
    expect(resolveTrackingProfile('')).toBe('exam');
    expect(resolveTrackingProfile('exam')).toBe('exam');
  });

  it('accepts research', () => {
    expect(resolveTrackingProfile('research')).toBe('research');
  });
});

describe('detectDeviceTier', () => {
  it('classifies desktop as T0', () => {
    expect(
      detectDeviceTier({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      })
    ).toBe('T0');
  });

  it('classifies iPhone as T3', () => {
    expect(
      detectDeviceTier({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      })
    ).toBe('T3');
  });

  it('classifies iPad with memory as T1', () => {
    expect(
      detectDeviceTier({
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        deviceMemoryGb: 8,
      })
    ).toBe('T1');
  });

  it('classifies iPad without memory as T2', () => {
    expect(
      detectDeviceTier({
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      })
    ).toBe('T2');
  });
});

describe('buildTrackingRuntimeConfig', () => {
  it('disables OpenFace continuous loop in exam mode', () => {
    const cfg = buildTrackingRuntimeConfig({
      profile: 'exam',
      tier: 'T0',
      userAgent: 'desktop',
    });
    expect(cfg.openFaceContinuousLoop).toBe(false);
    expect(cfg.enableOpenFaceBackgroundLoop).toBe(true);
    expect(cfg.openFaceIntervalMs).toBe(5000);
    expect(cfg.sampleRateHz).toBe(2);
    expect(cfg.overlayMode).toBe('contours');
    expect(cfg.showEngineOverlays).toBe(true);
    expect(cfg.enableDeepAnalyticsSnapshots).toBe(false);
    expect(cfg.enableDlibBackgroundLoop).toBe(true);
    expect(cfg.dlibIntervalMs).toBe(2000);
  });

  it('uses 1 Hz sampling on T3', () => {
    const cfg = buildTrackingRuntimeConfig({
      profile: 'exam',
      tier: 'T3',
      userAgent: 'iphone',
    });
    expect(cfg.sampleIntervalMs).toBe(1000);
    expect(cfg.sampleRateHz).toBe(1);
    expect(cfg.enableL2csInPrimaryLoop).toBe(false);
    expect(cfg.overlayMode).toBe('contours');
    expect(cfg.showEngineOverlays).toBe(true);
  });

  it('marks research eligibility', () => {
    expect(
      isResearchEligible({
        profile: 'exam',
        tier: 'T0',
        isValid: true,
        experimentPhase: 'NATURAL_TASK',
      })
    ).toBe(true);
    expect(
      isResearchEligible({
        profile: 'exam',
        tier: 'T3',
        isValid: true,
        experimentPhase: 'NATURAL_TASK',
      })
    ).toBe(false);
    expect(
      isResearchEligible({
        profile: 'exam',
        tier: 'T0',
        isValid: true,
        experimentPhase: 'SYSTEM_STABILIZATION',
      })
    ).toBe(false);
  });
});
