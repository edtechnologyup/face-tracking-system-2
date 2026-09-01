const fs = require('fs');
const file = 'src/app/components/tracking/FaceTracker.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = /\/\/ 🛡️ ดักจับเหตุการณ์ปิดแท็บ, ย้ายหน้า, ซ่อนแอป \(beforeunload, pagehide\)[\s\S]*?\}, \[flushSessionData\]\)/;
const replace1 = `// 📱 Handle page unload and mobile visibility changes gracefully
  useEffect(() => {
    // Only permanently disconnect on true page close
    const handleBeforeUnload = () => {
      flushSessionData('DISCONNECTED', true)
    }

    // Handle mobile tab-switch / app-switch: pause instead of disconnect
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Flush current data but keep session IN_PROGRESS (don't disconnect)
        flushSessionData('IN_PROGRESS', true)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [flushSessionData])`;

content = content.replace(target1, replace1);

const target2a = /try\s*{\s*setIsLoading\(true\)\s*const token = localStorage\.getItem\('token'\)/;
const replace2a = `try {
      if (!isKeepAlive) setIsLoading(true)
      const token = localStorage.getItem('token')`;
content = content.replace(target2a, replace2a);

const target2b = /return null\s*}\s*finally\s*{\s*setIsLoading\(false\)\s*}/;
const replace2b = `return null
    } finally {
      if (!isKeepAlive) setIsLoading(false)
    }`;
content = content.replace(target2b, replace2b);

fs.writeFileSync(file, content);
