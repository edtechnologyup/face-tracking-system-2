import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limiter';

const DEFAULT_TIMEOUT_MS = 15000;

export async function POST(request: NextRequest) {
  const clientKey =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'anonymous';

  const { allowed } = await checkRateLimit({
    key: `openface:${clientKey}`,
    ...RATE_LIMITS.openfaceAnalyze,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const serviceUrl = process.env.OPENFACE_SERVICE_URL;
  if (!serviceUrl) {
    return NextResponse.json(
      { error: 'OPENFACE_SERVICE_URL is not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const imageBase64 = body?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = process.env.OPENFACE_API_KEY;
    if (apiKey) {
      headers['X-OpenFace-Key'] = apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const upstream = await fetch(`${serviceUrl.replace(/\/$/, '')}/v1/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageBase64 }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const payload = await upstream.json().catch(() => ({ error: 'Invalid upstream JSON' }));

    if (!upstream.ok) {
      return NextResponse.json(payload, { status: upstream.status });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('OpenFace proxy error:', error);
    return NextResponse.json(
      {
        error: 'OpenFace proxy failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
