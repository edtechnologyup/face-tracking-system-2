"""OpenFace inference queue — limits concurrent CPU inference per worker."""
from __future__ import annotations

import asyncio
import os

MAX_CONCURRENT = int(os.environ.get("OPENFACE_MAX_CONCURRENT", "2"))
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)


async def run_in_queue(coro):
    """Run blocking/sync work through concurrency gate (async wrapper)."""
    async with _semaphore:
        return await coro

def run_sync_in_queue(fn, *args, **kwargs):
    """Run sync inference fn with semaphore (for thread pool use)."""
    loop = asyncio.get_event_loop()
    async def _wrapped():
        async with _semaphore:
            return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))
    return _wrapped()
