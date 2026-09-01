/**
 * Client-side OpenFace request queue — serializes remote calls to avoid
 * stampeding the OpenFace server during synced benchmark captures.
 */

import { OPENFACE_REMOTE_MIN_INTERVAL_MS } from '@/lib/engines/openface-constants';

type QueueTask<T> = () => Promise<T>;

let lastEnqueueAt = 0;
let chain: Promise<unknown> = Promise.resolve();

export function enqueueOpenFaceRequest<T>(task: QueueTask<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const now = Date.now();
    const waitMs = Math.max(0, lastEnqueueAt + OPENFACE_REMOTE_MIN_INTERVAL_MS - now);
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    lastEnqueueAt = Date.now();
    return task();
  };

  const result = chain.then(run, run) as Promise<T>;
  chain = result.catch(() => undefined);
  return result;
}

export function resetOpenFaceQueueForTests(): void {
  lastEnqueueAt = 0;
  chain = Promise.resolve();
}
