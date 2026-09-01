const fs = require('fs');
const file = '/home/paipu/Project/face-tracking-system/src/app/components/tracking/BehaviorFeatureSync.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const latestQualityRef = useRef\(.*\);/g, 'const latestQualityRef = useRef({ brightnessMean: 0.5, contrastScore: 0.5, blurScore: 0 });');

fs.writeFileSync(file, content);
