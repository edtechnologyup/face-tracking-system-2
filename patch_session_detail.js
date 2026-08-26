const fs = require('fs');
const path = 'src/app/components/admin/SessionDetail.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  '  logs: TrackingLog[]',
  `  logs: TrackingLog[]
  mediapipeLogs?: Array<Record<string, unknown>>
  yolov8Logs?: Array<Record<string, unknown>>
  dlibLogs?: Array<Record<string, unknown>>
  openFaceLogs?: Array<Record<string, unknown>>`
);

const oldLogic = `{/* Live Benchmark Matrix Card (If Recorded in DB) */}
      {(() => {
        const benchmarkLog = sessionDetail.logs.find(log => log.detectionType === 'BENCHMARK_METRICS')
        const metrics = benchmarkLog?.detectionData as Record<string, unknown> | undefined
        if (!metrics) return null

        const mp = metrics.mediapipe as Record<string, unknown> | undefined
        const yolo = metrics.yolov8 as Record<string, unknown> | undefined
        const dlib = metrics.dlib as Record<string, unknown> | undefined
        const openface = metrics.openface as Record<string, unknown> | undefined`;

const newLogic = `{/* Live Benchmark Matrix Card (If Recorded in DB) */}
      {(() => {
        const mpLog = sessionDetail.mediapipeLogs?.[sessionDetail.mediapipeLogs.length - 1]
        const yoloLog = sessionDetail.yolov8Logs?.[sessionDetail.yolov8Logs.length - 1]
        const dlibLog = sessionDetail.dlibLogs?.[sessionDetail.dlibLogs.length - 1]
        const ofLog = sessionDetail.openFaceLogs?.[sessionDetail.openFaceLogs.length - 1]

        if (!mpLog && !yoloLog && !dlibLog && !ofLog) return null

        const mp = mpLog
        const yolo = yoloLog
        const dlib = dlibLog
        const openface = ofLog`;

if (content.includes(oldLogic)) {
  content = content.replace(oldLogic, newLogic);
  fs.writeFileSync(path, content);
  console.log("Patched SessionDetail.tsx successfully");
} else {
  console.log("Could not find the old code block in SessionDetail.tsx");
}
