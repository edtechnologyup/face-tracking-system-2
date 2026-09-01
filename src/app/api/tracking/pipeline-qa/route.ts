import { NextRequest, NextResponse } from 'next/server';
import {
  CURRENT_FEATURE_SCHEMA_VERSION,
  CURRENT_PIPELINE_VERSION,
  EXPECTED_FIELD_RANGES,
  FRESHNESS_WINDOWS_MS,
  NULL_HANDLING_POLICY,
  QA_SCENARIO_TEST_MATRIX,
  VALID_EXPERIMENT_PHASES,
  VALID_FEATURE_VALID_PHASES,
  VALID_PHASES,
  VALID_SCENARIOS,
  validateBehaviorLogBatch,
  validateBehaviorLogEntryFull,
  validateBehaviorCsv,
} from '@/lib/pipeline-qa';
import { runBehaviorScenarioRegression } from '@/lib/pipeline-qa-regression';

/** GET — เอกสาร QA pipeline สำหรับ research/admin team */
export async function GET() {
  const regression = runBehaviorScenarioRegression();

  return NextResponse.json({
    featureSchemaVersion: CURRENT_FEATURE_SCHEMA_VERSION,
    pipelineVersion: CURRENT_PIPELINE_VERSION,
    validScenarios: VALID_SCENARIOS,
    validExperimentPhases: VALID_EXPERIMENT_PHASES,
    validFeatureValidPhases: VALID_FEATURE_VALID_PHASES,
    /** @deprecated use validFeatureValidPhases */
    validPhases: VALID_PHASES,
    expectedFieldRanges: EXPECTED_FIELD_RANGES,
    freshnessWindowsMs: FRESHNESS_WINDOWS_MS,
    nullHandlingPolicy: NULL_HANDLING_POLICY,
    scenarioTestMatrix: QA_SCENARIO_TEST_MATRIX,
    regressionSuite: {
      passed: regression.passed,
      failed: regression.failed,
      total: regression.passed + regression.failed,
      results: regression.results,
    },
  });
}

/** POST — validate log batch หรือ CSV text (Phase 9) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { logs, csvText, includeProvenance = true } = body as {
      logs?: Record<string, unknown>[];
      csvText?: string;
      includeProvenance?: boolean;
    };

    if (csvText && typeof csvText === 'string') {
      const csvReport = validateBehaviorCsv(csvText);
      return NextResponse.json({ success: csvReport.valid, mode: 'csv', ...csvReport });
    }

    if (!logs || !Array.isArray(logs)) {
      return NextResponse.json(
        { error: 'Provide logs array or csvText string' },
        { status: 400 }
      );
    }

    const batchReport = validateBehaviorLogBatch(logs);
    const entryReports = includeProvenance
      ? logs.map((log, index) => ({
          index,
          ...validateBehaviorLogEntryFull(log),
        }))
      : [];

    return NextResponse.json({
      success: batchReport.valid,
      mode: 'logs',
      batch: batchReport,
      entries: entryReports,
    });
  } catch (error: unknown) {
    console.error('[pipeline-qa POST]', error);
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 });
  }
}
