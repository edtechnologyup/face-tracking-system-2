'use client';

import { useEffect, useRef, useState } from 'react';

export interface PageVisibilityState {
  isVisible: boolean;
  hiddenAt: number | null;
  hiddenDurationMs: number;
}

export function usePageVisibility(onHidden?: () => void, onVisible?: () => void) {
  const [state, setState] = useState<PageVisibilityState>({
    isVisible: true,
    hiddenAt: null,
    hiddenDurationMs: 0,
  });
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const visible = document.visibilityState === 'visible';
      const now = Date.now();

      if (!visible && hiddenAtRef.current === null) {
        hiddenAtRef.current = now;
        onHidden?.();
      }

      if (visible && hiddenAtRef.current !== null) {
        const duration = now - hiddenAtRef.current;
        hiddenAtRef.current = null;
        setState({ isVisible: true, hiddenAt: null, hiddenDurationMs: duration });
        onVisible?.();
        return;
      }

      setState((prev) => ({
        isVisible: visible,
        hiddenAt: visible ? null : hiddenAtRef.current,
        hiddenDurationMs: prev.hiddenDurationMs,
      }));
    };

    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [onHidden, onVisible]);

  return state;
}
