#!/usr/bin/env npx tsx
/**
 * CSV validator สำหรับ research team — Phase 9
 *
 * Usage:
 *   npm run qa:validate-csv -- path/to/export.csv
 *   cat export.csv | npm run qa:validate-csv
 */
import { readFileSync } from 'node:fs';
import { validateBehaviorCsv } from '../src/lib/pipeline-qa';

function readInput(pathArg: string | undefined): string {
  if (pathArg && pathArg !== '-') {
    return readFileSync(pathArg, 'utf8');
  }
  return readFileSync(0, 'utf8');
}

const filePath = process.argv[2];
const csvText = readInput(filePath);
const report = validateBehaviorCsv(csvText);

console.log('Behavior Feature CSV QA Report');
console.log('--------------------------------');
console.log(`Rows: ${report.entryCount}`);
console.log(`Valid: ${report.valid}`);
console.log(`Errors: ${report.summary.errorCount}`);
console.log(`Warnings: ${report.summary.warnCount}`);

if (report.issues.length > 0) {
  console.log('\nIssues:');
  for (const issue of report.issues.slice(0, 50)) {
    console.log(`  [${issue.severity}] ${issue.field}: ${issue.message}`);
  }
  if (report.issues.length > 50) {
    console.log(`  ... and ${report.issues.length - 50} more`);
  }
}

process.exit(report.valid ? 0 : 1);
