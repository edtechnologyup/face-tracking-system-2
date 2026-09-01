import { YOLO_LOG_MAX_STALE_MS } from '@/lib/engines/yolo-constants';
import { DLIB_LOG_MAX_STALE_MS } from '@/lib/engines/dlib-constants';
import { L2CS_LOG_MAX_STALE_MS } from '@/lib/engines/l2cs-constants';
import { OPENFACE_LOG_MAX_STALE_MS } from '@/lib/engines/openface-constants';
import {
  EXPERIMENT_PHASES,
  FEATURE_VALID_PHASES,
} from '@/lib/experiment-phase';
import {
  BRIGHTNESS_MIN_THRESHOLD,
  DISTANCE_THRESHOLD_CM,
  OCCLUSION_VALID_THRESHOLD,
  YAW_THRESHOLD,
} from '@/lib/mediapipe-detector';

/** featureSchemaVersion ปัจจุบัน */
export const CURRENT_FEATURE_SCHEMA_VERSION = '2.8';
/** pipelineVersion ปัจจุบัน */
export const CURRENT_PIPELINE_VERSION = 'hybrid-4.1-tracking-profile';

/** Freshness windows (ms) — engine result เก่ากว่านี้ถือว่า stale → null */
export const FRESHNESS_WINDOWS_MS = {
  yolo: YOLO_LOG_MAX_STALE_MS,
  dlib: DLIB_LOG_MAX_STALE_MS,
  l2cs: L2CS_LOG_MAX_STALE_MS,
  openface: OPENFACE_LOG_MAX_STALE_MS,
  quality: 3000,
  sampleInterval: 500,
} as const;

/** ช่วงค่าที่คาดหวังต่อ column (sanity check) */
export const EXPECTED_FIELD_RANGES: Record<
  string,
  { min?: number; max?: number; nullable?: boolean; note?: string }
> = {
  brightnessMean: { min: 0, max: 1, note: '0=มืด 1=สว่าง' },
  contrastScore: { min: 0, max: 1 },
  sharpnessScore: { min: 0, max: 1, note: 'Laplacian variance normalized; สูง=คมชัด' },
  occlusionScore: { min: 0, max: 1, note: 'สูง=บังมาก' },
  faceDistanceCm: { min: 20, max: 200, nullable: true, note: 'null เมื่อไม่น่าเชื่อถือ' },
  headYaw: { min: -90, max: 90 },
  headPitch: { min: -90, max: 90 },
  headRoll: { min: -90, max: 90, nullable: true },
  leftEAR: { min: 0, max: 0.5, nullable: true },
  rightEAR: { min: 0, max: 0.5, nullable: true },
  leftEyeOpenness: { min: 0, max: 1, nullable: true },
  rightEyeOpenness: { min: 0, max: 1, nullable: true },
  gazeYaw: { min: -90, max: 90, nullable: true },
  gazePitch: { min: -90, max: 90, nullable: true },
  gazeConfidence: { min: 0, max: 1, nullable: true },
  faceCount: { min: 0, max: 10, nullable: true },
  yoloConfidence: { min: 0, max: 1, nullable: true },
  mediapipeConfidence: { min: 0, max: 1, nullable: true },
  dlibConfidence: { min: 0, max: 1, nullable: true },
  openfaceConfidence: { min: 0, max: 1, nullable: true },
  landmarkCount: { min: 0, max: 468, nullable: true },
  detectionFps: { min: 1, max: 120, nullable: true, note: 'MediaPipe detection loop FPS' },
  cameraStreamFps: { min: 1, max: 120, nullable: true, note: 'getSettings().frameRate' },
  sampleRateHz: { min: 1, max: 10, nullable: true, note: 'behavior log sample rate (currently 2)' },
  sampleIndex: { min: 0, max: 1_000_000 },
  elapsedMs: { min: 0, max: 86_400_000 },
};

export const VALID_SCENARIOS = [
  'CENTER_SCREEN',
  'BRIEF_GLANCE_LEFT',
  'BRIEF_GLANCE_RIGHT',
  'SUSTAINED_LOOK_AWAY_LEFT',
  'SUSTAINED_LOOK_AWAY_RIGHT',
  'LOOK_DOWN',
  'LOOK_UP',
  'FACE_MISSING',
  'OCCLUSION',
  'MULTIPLE_FACES',
  'LOW_LIGHT',
  'DISTANCE_1M',
  'EYES_CLOSED_DISENGAGED',
  'NATURAL_READING',
] as const;

export const VALID_EXPERIMENT_PHASES = EXPERIMENT_PHASES;
export const VALID_FEATURE_VALID_PHASES = FEATURE_VALID_PHASES;
/** @deprecated use VALID_FEATURE_VALID_PHASES */
export const VALID_PHASES = FEATURE_VALID_PHASES;

export interface QaIssue {
  field: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
}

export interface QaReport {
  valid: boolean;
  issues: QaIssue[];
  summary: {
    errorCount: number;
    warnCount: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogEntry = Record<string, any>;

function checkRange(
  field: string,
  value: unknown,
  range: (typeof EXPECTED_FIELD_RANGES)[string]
): QaIssue | null {
  if (value == null) {
    if (range.nullable === false) {
      return { field, severity: 'warn', message: `${field} is null but expected non-null` };
    }
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { field, severity: 'error', message: `${field} is not a finite number` };
  }
  if (range.min != null && value < range.min) {
    return { field, severity: 'warn', message: `${field}=${value} below min ${range.min}` };
  }
  if (range.max != null && value > range.max) {
    return { field, severity: 'warn', message: `${field}=${value} above max ${range.max}` };
  }
  return null;
}

/** ตรวจ sanity ของ log entry เดียว */
export function validateBehaviorLogEntry(log: LogEntry): QaReport {
  const issues: QaIssue[] = [];

  if (log.featureSchemaVersion && log.featureSchemaVersion !== CURRENT_FEATURE_SCHEMA_VERSION) {
    issues.push({
      field: 'featureSchemaVersion',
      severity: 'info',
      message: `schema ${log.featureSchemaVersion} != current ${CURRENT_FEATURE_SCHEMA_VERSION}`,
    });
  }

  if (log.scenario && !VALID_SCENARIOS.includes(log.scenario)) {
    issues.push({
      field: 'scenario',
      severity: 'error',
      message: `unknown scenario: ${log.scenario}`,
    });
  }

  if (log.phase && !VALID_EXPERIMENT_PHASES.includes(log.phase)) {
    issues.push({
      field: 'phase',
      severity: 'error',
      message: `unknown experiment phase: ${log.phase}`,
    });
  }

  if (Array.isArray(log.validPhases)) {
    for (const p of log.validPhases) {
      if (!VALID_FEATURE_VALID_PHASES.includes(p)) {
        issues.push({ field: 'validPhases', severity: 'error', message: `unknown validPhase: ${p}` });
      }
    }
  } else if (Array.isArray(log.phase) && log.phase.length > 0) {
    issues.push({
      field: 'phase',
      severity: 'warn',
      message: 'legacy array phase — use validPhases + experiment phase string',
    });
  }

  for (const [field, range] of Object.entries(EXPECTED_FIELD_RANGES)) {
    const issue = checkRange(field, log[field], range);
    if (issue) issues.push(issue);
  }

  if (log.blurScore != null && log.sharpnessScore == null) {
    issues.push({
      field: 'blurScore',
      severity: 'warn',
      message: 'deprecated column blurScore — migrate to sharpnessScore (schema v2.8)',
    });
  }
  if (log.cameraFps != null && log.detectionFps == null) {
    issues.push({
      field: 'cameraFps',
      severity: 'warn',
      message: 'deprecated column cameraFps — use detectionFps, cameraStreamFps, sampleRateHz',
    });
  }

  // Cross-field consistency
  if (log.faceDetected === false && log.scenario !== 'FACE_MISSING') {
    issues.push({
      field: 'scenario',
      severity: 'warn',
      message: 'faceDetected=false but scenario is not FACE_MISSING',
    });
  }

  if (log.faceDetected === false) {
    const staleFields = [
      'headYaw',
      'headPitch',
      'leftEAR',
      'gazeYaw',
      'landmarkCount',
      'faceCount',
      'bboxX',
    ].filter((field) => log[field] != null);
    if (staleFields.length > 0) {
      issues.push({
        field: 'faceDetected',
        severity: 'error',
        message: `faceDetected=false but feature columns still set: ${staleFields.join(', ')}`,
      });
    }
    if (Array.isArray(log.validPhases) && log.validPhases.length > 0) {
      issues.push({
        field: 'validPhases',
        severity: 'error',
        message: 'faceDetected=false but validPhases is non-empty',
      });
    }
  }

  const hasGazeValid =
    log.faceDetected !== false &&
    Array.isArray(log.validPhases) &&
    log.validPhases.includes('gazeValid');
  const gazeColumns = [
    'gazeYaw',
    'gazePitch',
    'gazeConfidence',
    'gazeLeftX',
    'gazeLeftY',
    'gazeLeftZ',
    'gazeRightX',
    'gazeRightY',
    'gazeRightZ',
  ] as const;

  if (hasGazeValid) {
    if (log.gazeYaw == null || log.gazePitch == null) {
      issues.push({
        field: 'gazeYaw',
        severity: 'error',
        message: 'gazeValid in validPhases but gazeYaw/gazePitch is null',
      });
    }
  } else if (log.faceDetected !== false) {
    const populated = gazeColumns.filter((field) => log[field] != null);
    if (populated.length > 0) {
      issues.push({
        field: 'gazeYaw',
        severity: 'error',
        message: `gazeValid absent but gaze columns set: ${populated.join(', ')}`,
      });
    }
  }

  if (
    log.gazeLeftX != null &&
    log.gazeRightX != null &&
    log.gazeLeftX === log.gazeRightX &&
    log.gazeLeftY === log.gazeRightY &&
    log.gazeLeftZ === log.gazeRightZ
  ) {
    issues.push({
      field: 'gazeLeftX',
      severity: 'error',
      message: 'gazeLeft and gazeRight vectors are identical — use iris per-eye or null',
    });
  }

  if (log.isValid === true && log.invalidReason) {
    issues.push({
      field: 'isValid',
      severity: 'error',
      message: 'isValid=true but invalidReason is set',
    });
  }

  if (
    log.scenario === 'LOW_LIGHT' &&
    typeof log.brightnessMean === 'number' &&
    log.brightnessMean >= BRIGHTNESS_MIN_THRESHOLD
  ) {
    issues.push({
      field: 'scenario',
      severity: 'warn',
      message: 'LOW_LIGHT scenario but brightness above threshold',
    });
  }

  if (
    log.scenario === 'DISTANCE_1M' &&
    log.faceDistanceCm != null &&
    log.faceDistanceCm <= DISTANCE_THRESHOLD_CM
  ) {
    issues.push({
      field: 'scenario',
      severity: 'warn',
      message: 'DISTANCE_1M but faceDistanceCm within threshold',
    });
  }

  if (
    log.occlusionScore != null &&
    log.occlusionScore >= OCCLUSION_VALID_THRESHOLD &&
    log.isValid === true
  ) {
    issues.push({
      field: 'occlusionScore',
      severity: 'warn',
      message: 'high occlusion but isValid=true',
    });
  }

  if (
    log.scenario === 'BRIEF_GLANCE_LEFT' &&
    typeof log.headYaw === 'number' &&
    log.headYaw > -YAW_THRESHOLD
  ) {
    issues.push({
      field: 'headYaw',
      severity: 'warn',
      message: 'BRIEF_GLANCE_LEFT but headYaw above threshold',
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;

  return {
    valid: errorCount === 0,
    issues,
    summary: { errorCount, warnCount },
  };
}

/** ตรวจ batch logs พร้อมสรุป */
export function validateBehaviorLogBatch(logs: LogEntry[]): QaReport & { entryCount: number } {
  const allIssues: QaIssue[] = [];
  for (let i = 0; i < logs.length; i++) {
    const report = validateBehaviorLogEntry(logs[i]);
    for (const issue of report.issues) {
      allIssues.push({ ...issue, field: `[${i}].${issue.field}` });
    }
  }

  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warnCount = allIssues.filter((i) => i.severity === 'warn').length;

  return {
    valid: errorCount === 0,
    issues: allIssues,
    summary: { errorCount, warnCount },
    entryCount: logs.length,
  };
}

/** Null handling policy สำหรับ documentation */
export const NULL_HANDLING_POLICY = {
  engineStale: 'Engine result older than freshness window → column null, provenance level NULL',
  unreliableDistance:
    'faceDistanceCm null when headRoll>30°, landmarkQuality<0.45, or face too small',
  mockRemoved: 'Previously mock columns (openface/dlib/yolo when unavailable) stay null',
  gazeFallback:
    'gazeYaw/Pitch: L2CS L0 when fresh, else iris-landmark L2; per-eye vectors iris-only; null when gazeValid absent',
  gazeSource:
    'featureProvenance.engines.gaze.source = l2cs-onnx | iris-landmark | none',
  schemaV28Renames:
    'blurScore→sharpnessScore; cameraFps→detectionFps + cameraStreamFps + sampleRateHz',
} as const;

const VALID_PROVENANCE_LEVELS = new Set([
  'L0',
  'L1',
  'L2',
  'L3',
  'PIXEL',
  'NULL',
]);

/** Manual + automated QA test matrix (Phase 9) */
export const QA_SCENARIO_TEST_MATRIX = [
  {
    id: 'center-screen',
    situation: 'หน้าเดียว มองจอ',
    checks: ['scenario=CENTER_SCREEN', 'faceCount=1', 'isValid=true'],
  },
  {
    id: 'sustained-left',
    situation: 'หันซ้าย >2s',
    checks: ['scenario=SUSTAINED_LOOK_AWAY_LEFT', 'headYaw<-20'],
  },
  {
    id: 'multi-face',
    situation: '2 คนในเฟรม',
    checks: ['scenario=MULTIPLE_FACES', 'faceCount>=2', 'invalidReason=MULTIPLE_FACES_DETECTED'],
  },
  {
    id: 'eyes-closed',
    situation: 'ปิดตา + ก้มหน้า',
    checks: ['scenario=EYES_CLOSED_DISENGAGED', 'isValid=false'],
  },
  {
    id: 'low-light',
    situation: 'แสงน้อย',
    checks: ['scenario=LOW_LIGHT', 'invalidReason=LOW_BRIGHTNESS'],
  },
  {
    id: 'openface-down',
    situation: 'OpenFace server offline',
    checks: ['openfaceConfidence=null', 'provenance.engines.openface.source=none'],
  },
] as const;

export interface ProvenanceValidationResult {
  valid: boolean;
  issues: QaIssue[];
}

/** ตรวจ featureProvenance JSON structure + level ที่รองรับ */
export function validateFeatureProvenance(provenance: unknown): ProvenanceValidationResult {
  const issues: QaIssue[] = [];

  if (provenance == null) {
    issues.push({
      field: 'featureProvenance',
      severity: 'warn',
      message: 'missing featureProvenance',
    });
    return { valid: issues.every((i) => i.severity !== 'error'), issues };
  }

  if (typeof provenance !== 'object') {
    issues.push({
      field: 'featureProvenance',
      severity: 'error',
      message: 'featureProvenance is not an object',
    });
    return { valid: false, issues };
  }

  const record = provenance as Record<string, unknown>;
  const schema = record._schema;
  if (
    schema !== 'feature-provenance-v2' &&
    schema !== 'feature-provenance-v2-slim'
  ) {
    issues.push({
      field: 'featureProvenance._schema',
      severity: 'warn',
      message: `unexpected schema: ${String(schema)}`,
    });
  }

  const fields = record.fields;
  if (!fields || typeof fields !== 'object') {
    issues.push({
      field: 'featureProvenance.fields',
      severity: 'error',
      message: 'missing fields map',
    });
  } else {
    for (const [name, meta] of Object.entries(fields as Record<string, unknown>)) {
      if (!meta || typeof meta !== 'object') {
        issues.push({
          field: `featureProvenance.fields.${name}`,
          severity: 'error',
          message: 'invalid field metadata',
        });
        continue;
      }
      const level = (meta as { level?: string }).level;
      if (!level || !VALID_PROVENANCE_LEVELS.has(level)) {
        issues.push({
          field: `featureProvenance.fields.${name}.level`,
          severity: 'error',
          message: `invalid level: ${String(level)}`,
        });
      }
    }
  }

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
  };
}

/** ตรวจ log entry รวม provenance */
export function validateBehaviorLogEntryFull(log: LogEntry): QaReport {
  const base = validateBehaviorLogEntry(log);
  const prov = validateFeatureProvenance(log.featureProvenance);
  const issues = [...base.issues, ...prov.issues];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;
  return {
    valid: errorCount === 0,
    issues,
    summary: { errorCount, warnCount },
  };
}

/** สร้าง log entry ขั้นต่ำที่ valid สำหรับ unit tests */
export function createMinimalValidLog(overrides: LogEntry = {}): LogEntry {
  return {
    featureSchemaVersion: CURRENT_FEATURE_SCHEMA_VERSION,
    pipelineVersion: CURRENT_PIPELINE_VERSION,
    timestamp: new Date().toISOString(),
    elapsedMs: 1000,
    sampleIndex: 0,
    scenario: 'CENTER_SCREEN',
    phase: 'NATURAL_TASK',
    validPhases: ['faceValid', 'headValid'],
    faceDetected: true,
    faceCount: 1,
    headYaw: 0,
    headPitch: 0,
    brightnessMean: 0.5,
    occlusionScore: 0.1,
    sharpnessScore: 0.5,
    sampleRateHz: 2,
    detectionFps: 10,
    isValid: true,
    invalidReason: null,
    openfaceConfidence: null,
    ...overrides,
  };
}

/** Parse แถว CSV แบบง่าย (รองรับ quoted fields) */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function coerceCsvValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') return num;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/** แปลง CSV text → log entries แล้ว validate ทั้ง batch */
export function validateBehaviorCsv(csvText: string): QaReport & {
  entryCount: number;
  headers: string[];
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      valid: false,
      entryCount: 0,
      headers: [],
      issues: [{ field: 'csv', severity: 'error', message: 'CSV must have header + at least 1 row' }],
      summary: { errorCount: 1, warnCount: 0 },
    };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const logs: LogEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: LogEntry = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = coerceCsvValue(cells[c] ?? '');
    }
    logs.push(row);
  }

  const batch = validateBehaviorLogBatch(logs);
  const provenanceIssues: QaIssue[] = [];
  for (let i = 0; i < logs.length; i++) {
    const prov = validateFeatureProvenance(logs[i].featureProvenance);
    for (const issue of prov.issues) {
      provenanceIssues.push({ ...issue, field: `[${i}].${issue.field}` });
    }
  }

  const issues = [...batch.issues, ...provenanceIssues];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warn').length;

  return {
    valid: errorCount === 0,
    issues,
    summary: { errorCount, warnCount },
    entryCount: logs.length,
    headers,
  };
}
