const fs = require('fs');
const file = '/home/paipu/Project/face-tracking-system/src/app/components/tracking/BehaviorFeatureSync.tsx';
let content = fs.readFileSync(file, 'utf8');

// Update Props
content = content.replace(
  'export interface BehaviorFeatureSyncProps {',
  'export interface BehaviorFeatureSyncProps {\n  participantCode?: string;'
);

content = content.replace(
  '  openFaceData\n}: BehaviorFeatureSyncProps) {',
  '  openFaceData,\n  participantCode\n}: BehaviorFeatureSyncProps) {'
);

// Add fields to logEntry
content = content.replace(
  "timestamp: new Date().toISOString(),",
  "participantCode: participantCode || null,\n      featureSchemaVersion: '1.0',\n      timestamp: new Date().toISOString(),"
);

content = content.replace(
  "actionUnitsJson: null,",
  "actionUnitsJson: openFaceData?.actionUnits || null,"
);

// Add gaze Left and Right based on openFaceData or mediaPipeData
content = content.replace(
  "gazePitch: mediaPipeData?.orientation?.pitch ? mediaPipeData.orientation.pitch * 1.2 : null,",
  `gazePitch: mediaPipeData?.orientation?.pitch ? mediaPipeData.orientation.pitch * 1.2 : null,
      gazeLeftX: openFaceData?.gazeLeftVector?.x || null,
      gazeLeftY: openFaceData?.gazeLeftVector?.y || null,
      gazeLeftZ: openFaceData?.gazeLeftVector?.z || null,
      gazeRightX: openFaceData?.gazeRightVector?.x || null,
      gazeRightY: openFaceData?.gazeRightVector?.y || null,
      gazeRightZ: openFaceData?.gazeRightVector?.z || null,`
);

// Fix blurScore and occlusionScore if we have any data (or keep 0 but now API allows 0)
// The API now accepts 0 because we used ?? instead of ||
// Still, we can try to find blur/occlusion score. If not available, we can leave them as 0.

fs.writeFileSync(file, content);
console.log('Fixed BehaviorFeatureSync.tsx');
