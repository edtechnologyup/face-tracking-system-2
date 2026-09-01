const fs = require('fs');
const file = 'src/hooks/useHybridFaceDetection.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Add isActiveRef to track if we should continue loop
code = code.replace(
  'const [isActive, setIsActive] = useState(false)',
  'const [isActive, setIsActive] = useState(false)\n  const isActiveRef = useRef(false)\n\n  useEffect(() => {\n    isActiveRef.current = isActive\n  }, [isActive])'
);

// 2. Change setInterval to recursive setTimeout for Primary Loop
code = code.replace(
  /primaryIntervalRef\.current = setInterval\(\(\) => \{\s+if \(videoRef\.current\) \{\s+performPrimaryDetection\(videoRef\.current\)\s+\}\s+\}, primaryIntervalMs\)/,
  `const runPrimaryLoop = async () => {
      if (!isActiveRef.current) return
      if (videoRef.current) {
        await performPrimaryDetection(videoRef.current)
      }
      primaryIntervalRef.current = setTimeout(runPrimaryLoop, primaryIntervalMs)
    }
    runPrimaryLoop()`
);

// 3. Change setInterval to recursive setTimeout for YOLO Loop
code = code.replace(
  /yoloIntervalRef\.current = setInterval\(\(\) => \{\s+if \(videoRef\.current\) \{\s+performBackgroundYoloScan\(videoRef\.current\)\s+\}\s+\}, yoloIntervalMs\)/,
  `const runYoloLoop = async () => {
      if (!isActiveRef.current) return
      if (videoRef.current) {
        await performBackgroundYoloScan(videoRef.current)
      }
      yoloIntervalRef.current = setTimeout(runYoloLoop, yoloIntervalMs)
    }
    runYoloLoop()`
);

// 4. Change clearInterval to clearTimeout in start
code = code.replace(
  /if \(primaryIntervalRef\.current\) clearInterval\(primaryIntervalRef\.current\)\n\s+if \(yoloIntervalRef\.current\) clearInterval\(yoloIntervalRef\.current\)/g,
  'if (primaryIntervalRef.current) clearTimeout(primaryIntervalRef.current)\n    if (yoloIntervalRef.current) clearTimeout(yoloIntervalRef.current)'
);

// 5. Change clearInterval to clearTimeout in stop
code = code.replace(
  /clearInterval\(primaryIntervalRef\.current\)/g,
  'clearTimeout(primaryIntervalRef.current)'
);
code = code.replace(
  /clearInterval\(yoloIntervalRef\.current\)/g,
  'clearTimeout(yoloIntervalRef.current)'
);

fs.writeFileSync(file, code);
