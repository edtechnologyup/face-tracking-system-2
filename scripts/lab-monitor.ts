#!/usr/bin/env npx tsx
/**
 * Passive Lab Monitor — วัด CPU/RAM จาก OS โดยไม่แตะ browser (ไม่ทำให้เว็บช้า)
 *
 * Usage:
 *   npm run lab:monitor -- --browser
 *   npm run lab:monitor -- --browser --docker openface
 *   npm run lab:monitor -- --pid 12345 --output logs/lab.csv --label "session-abc"
 *   npm run lab:monitor -- --list
 *
 * ขั้นตอน:
 *   1. เปิด terminal นี้ รัน lab:monitor
 *   2. เปิดเว็บ tracking session ใน browser
 *   3. กด Ctrl+C เมื่อจบ — ได้ summary + CSV
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

type TargetKind = 'browser' | 'docker';

interface MonitorTarget {
  kind: TargetKind;
  label: string;
  pid?: number;
  container?: string;
}

interface SampleRow {
  timestampIso: string;
  elapsedMs: number;
  target: string;
  id: string;
  cpuPct: number | null;
  rssMb: number | null;
  memRaw: string | null;
}

interface RunningStats {
  cpu: number[];
  rssMb: number[];
}

const BROWSER_RE =
  /(?:chrome|chromium|google-chrome|brave|microsoft-edge|firefox)(?:\s|$|-)/i;

function parseArgs(argv: string[]) {
  const opts = {
    browser: false,
    docker: '' as string,
    pid: 0,
    intervalMs: 1000,
    durationSec: 0,
    output: '',
    label: '',
    list: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--browser':
        opts.browser = true;
        break;
      case '--docker':
        opts.docker = next ?? 'openface';
        i++;
        break;
      case '--pid':
        opts.pid = Number(next);
        i++;
        break;
      case '--interval':
        opts.intervalMs = Math.max(250, Number(next) || 1000);
        i++;
        break;
      case '--duration':
        opts.durationSec = Math.max(1, Number(next) || 0);
        i++;
        break;
      case '--output':
        opts.output = next ?? '';
        i++;
        break;
      case '--label':
        opts.label = next ?? '';
        i++;
        break;
      case '--list':
        opts.list = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`Lab Monitor — passive CPU/RAM sampling (no DevTools overhead)

Options:
  --browser           Auto-pick heaviest Chrome/Chromium/Firefox tab process
  --pid <n>           Monitor specific process ID
  --docker [name]     Monitor Docker container (default: openface)
  --interval <ms>     Sample every N ms (default: 1000)
  --duration <sec>    Stop after N seconds (default: until Ctrl+C)
  --output <path>     CSV path (default: lab-monitor-<timestamp>.csv)
  --label <text>      Session label column in CSV
  --list              List browser candidate PIDs and exit

Examples:
  npm run lab:monitor -- --browser --docker openface
  npm run lab:monitor -- --pid 8842 --duration 120 --label exam-run-1
`);
}

function runPs(args: string[]): string {
  try {
    return execFileSync('ps', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function listBrowserCandidates(): Array<{ pid: number; cpu: number; rssMb: number; cmd: string }> {
  const out = runPs(['-eo', 'pid=,pcpu=,rss=,comm=']);
  if (!out) return [];

  const rows: Array<{ pid: number; cpu: number; rssMb: number; cmd: string }> = [];
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    const [, pidStr, cpuStr, rssStr, comm] = match;
    const cmd = comm.trim();
    if (!BROWSER_RE.test(cmd)) continue;
    rows.push({
      pid: Number(pidStr),
      cpu: Number(cpuStr),
      rssMb: Number(rssStr) / 1024,
      cmd,
    });
  }

  return rows.sort((a, b) => b.cpu - a.cpu || b.rssMb - a.rssMb);
}

function pickBrowserPid(): number | null {
  const candidates = listBrowserCandidates();
  if (candidates.length === 0) return null;
  return candidates[0].pid;
}

function sampleProcess(pid: number): { cpuPct: number | null; rssMb: number | null } {
  const out = runPs(['-p', String(pid), '-o', 'pcpu=,rss=']);
  if (!out) return { cpuPct: null, rssMb: null };
  const match = out.match(/^([\d.]+)\s+(\d+)/);
  if (!match) return { cpuPct: null, rssMb: null };
  return {
    cpuPct: Number(match[1]),
    rssMb: Number(match[2]) / 1024,
  };
}

function findDockerContainer(nameHint: string): string | null {
  try {
    const out = execFileSync(
      'docker',
      ['ps', '--filter', `name=${nameHint}`, '--format', '{{.Names}}'],
      { encoding: 'utf8' }
    ).trim();
    if (!out) return null;
    return out.split('\n')[0].trim() || null;
  } catch {
    return null;
  }
}

function sampleDocker(container: string): {
  cpuPct: number | null;
  rssMb: number | null;
  memRaw: string | null;
} {
  try {
    const out = execFileSync(
      'docker',
      [
        'stats',
        container,
        '--no-stream',
        '--format',
        '{{.CPUPerc}}\t{{.MemUsage}}',
      ],
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    const [cpuRaw, memRaw] = out.split('\t');
    const cpuPct = cpuRaw ? Number(cpuRaw.replace('%', '')) : null;
    const rssMb = parseDockerMemMb(memRaw);
    return {
      cpuPct: Number.isFinite(cpuPct) ? cpuPct : null,
      rssMb,
      memRaw: memRaw ?? null,
    };
  } catch {
    return { cpuPct: null, rssMb: null, memRaw: null };
  }
}

function parseDockerMemMb(memUsage: string | undefined): number | null {
  if (!memUsage) return null;
  const part = memUsage.split('/')[0]?.trim() ?? '';
  const match = part.match(/^([\d.]+)\s*(MiB|GiB|KiB|MB|GB|KB)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] ?? 'MiB').toUpperCase();
  if (unit.startsWith('G')) return value * 1024;
  if (unit.startsWith('K')) return value / 1024;
  return value;
}

function defaultOutputPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(process.cwd(), `lab-monitor-${stamp}.csv`);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
}

function max(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Number(Math.max(...nums).toFixed(1));
}

function printSummary(
  startedAt: number,
  sampleCount: number,
  outputPath: string,
  stats: Map<string, RunningStats>
) {
  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('\n=== Lab Monitor Summary ===');
  console.log(`Duration: ${durationSec}s · Samples: ${sampleCount}`);
  if (stats.size === 0) {
    console.log('No samples collected.');
    return;
  }
  for (const [label, s] of stats) {
    console.log(
      `${label}: CPU avg ${avg(s.cpu) ?? '—'}% max ${max(s.cpu) ?? '—'}% · RSS avg ${avg(s.rssMb) ?? '—'} MB max ${max(s.rssMb) ?? '—'} MB`
    );
  }
  console.log(`CSV: ${outputPath}`);
  console.log('Tip: จับคู่กับ benchmarkSnapshotId ใน DB ด้วย timestamp / --label');
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    const candidates = listBrowserCandidates();
    if (candidates.length === 0) {
      console.log('No browser processes found.');
      process.exit(1);
    }
    console.log('PID\tCPU%\tRSS(MB)\tCOMM');
    for (const c of candidates.slice(0, 20)) {
      console.log(`${c.pid}\t${c.cpu}\t${c.rssMb.toFixed(1)}\t${c.cmd}`);
    }
    process.exit(0);
  }

  const targets: MonitorTarget[] = [];

  if (opts.pid > 0) {
    targets.push({ kind: 'browser', label: 'browser', pid: opts.pid });
  } else if (opts.browser) {
    const pid = pickBrowserPid();
    if (!pid) {
      console.error('ไม่พบ browser process — เปิด Chrome แล้วลองใหม่ หรือใช้ --list / --pid');
      process.exit(1);
    }
    targets.push({ kind: 'browser', label: 'browser', pid });
  }

  if (opts.docker) {
    const container = findDockerContainer(opts.docker);
    if (!container) {
      console.warn(
        `⚠ Docker container "${opts.docker}" ไม่พบ — ข้าม (รัน docker compose up -d openface ถ้าต้องการ)`
      );
    } else {
      targets.push({ kind: 'docker', label: 'openface', container });
    }
  }

  if (targets.length === 0) {
    printHelp();
    process.exit(1);
  }

  const outputPath = opts.output || defaultOutputPath();
  mkdirSync(dirname(outputPath), { recursive: true });
  const csv = createWriteStream(outputPath, { flags: 'w' });
  csv.write(
    'timestamp_iso,elapsed_ms,session_label,target,id,cpu_pct,rss_mb,mem_raw\n'
  );

  const startedAt = Date.now();
  const stats = new Map<string, RunningStats>();
  let sampleCount = 0;

  const targetDesc = targets
    .map((t) =>
      t.kind === 'browser' ? `browser pid=${t.pid}` : `docker ${t.container}`
    )
    .join(', ');

  console.log('Lab Monitor started (passive — ไม่เปิด DevTools record)');
  console.log(`Targets: ${targetDesc}`);
  console.log(`Interval: ${opts.intervalMs}ms · Output: ${outputPath}`);
  if (opts.label) console.log(`Label: ${opts.label}`);
  console.log('เปิด tracking session ใน browser แล้วกด Ctrl+C เมื่อจบ\n');

  const stopAt =
    opts.durationSec > 0 ? startedAt + opts.durationSec * 1000 : Number.POSITIVE_INFINITY;

  let running = true;
  process.on('SIGINT', () => {
    running = false;
  });
  process.on('SIGTERM', () => {
    running = false;
  });

  while (running && Date.now() < stopAt) {
    const now = Date.now();
    const elapsedMs = now - startedAt;
    const timestampIso = new Date(now).toISOString();
    const lineParts: string[] = [];

    for (const target of targets) {
      let row: SampleRow;

      if (target.kind === 'browser' && target.pid) {
        const { cpuPct, rssMb } = sampleProcess(target.pid);
        row = {
          timestampIso,
          elapsedMs,
          target: target.label,
          id: String(target.pid),
          cpuPct,
          rssMb,
          memRaw: null,
        };
      } else if (target.kind === 'docker' && target.container) {
        const { cpuPct, rssMb, memRaw } = sampleDocker(target.container);
        row = {
          timestampIso,
          elapsedMs,
          target: target.label,
          id: target.container,
          cpuPct,
          rssMb,
          memRaw,
        };
      } else {
        continue;
      }

      if (row.cpuPct != null || row.rssMb != null) {
        const key = `${row.target}:${row.id}`;
        if (!stats.has(key)) stats.set(key, { cpu: [], rssMb: [] });
        const s = stats.get(key)!;
        if (row.cpuPct != null) s.cpu.push(row.cpuPct);
        if (row.rssMb != null) s.rssMb.push(row.rssMb);
      }

      csv.write(
        [
          row.timestampIso,
          row.elapsedMs,
          opts.label.replace(/,/g, ' '),
          row.target,
          row.id,
          row.cpuPct ?? '',
          row.rssMb != null ? row.rssMb.toFixed(1) : '',
          row.memRaw ?? '',
        ].join(',') + '\n'
      );

      const cpu = row.cpuPct != null ? `${row.cpuPct.toFixed(1)}%` : '—';
      const mem = row.rssMb != null ? `${row.rssMb.toFixed(0)}MB` : row.memRaw ?? '—';
      lineParts.push(`${row.target}=${cpu} ${mem}`);
    }

    sampleCount++;
    process.stdout.write(`[${sampleCount}] ${lineParts.join(' · ')}\r`);

    await sleep(opts.intervalMs);
  }

  csv.end();
  console.log('');
  printSummary(startedAt, sampleCount, outputPath, stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
