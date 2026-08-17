import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Edge-safe JWT verification using Web Crypto API
async function verifyJWT(token: string, secret: string): Promise<{ userId: string; role: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Decode payload safely with base64url padding
    const base64Payload = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = base64Payload.padEnd(base64Payload.length + (4 - (base64Payload.length % 4)) % 4, '=');
    const payloadStr = atob(paddedPayload);
    const payload = JSON.parse(payloadStr);

    // Verify token expiration (exp)
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    // Verify signature
    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const keyData = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature from base64url with padding
    const base64Sig = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    const paddedSig = base64Sig.padEnd(base64Sig.length + (4 - (base64Sig.length % 4)) % 4, '=');
    const signatureBin = Uint8Array.from(
      atob(paddedSig),
      c => c.charCodeAt(0)
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureBin,
      data
    );

    return isValid ? payload : null;
  } catch (err) {
    console.error('JWT verification error in Edge:', err);
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Protected routes
  const protectedRoutes = ['/tracking']
  const adminRoutes = ['/admin']
  
  // ตรวจสอบ admin routes
  const isAdminRoute = adminRoutes.some(route => 
    pathname.startsWith(route)
  )
  
  // ตรวจสอบ protected routes
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  )
  
  if (isAdminRoute || isProtectedRoute) {
    // ดึง token จาก cookies หรือ headers
    const token = request.cookies.get('auth-token')?.value || 
                  request.cookies.get('token')?.value
    const authHeader = request.headers.get('authorization')
    
    // ไม่มี token ให้ redirect ไปหน้า login
    if (!token && !authHeader) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    const tokenToVerify = token || authHeader?.replace('Bearer ', '')
    
    if (tokenToVerify) {
      try {
        const decoded = await verifyJWT(tokenToVerify, process.env.JWT_SECRET || 'fallback-secret')
        
        if (!decoded) {
          // Token ไม่ถูกต้องให้ redirect ไปหน้า login
          return NextResponse.redirect(new URL('/login', request.url))
        }
        
        // ตรวจสอบ admin routes - เฉพาะ ADMIN เท่านั้น
        if (isAdminRoute && decoded.role !== 'ADMIN') {
          return NextResponse.redirect(new URL('/tracking', request.url))
        }
        
        // ตรวจสอบ protected routes (/tracking) - ป้องกัน ADMIN เข้า
        if (isProtectedRoute && decoded.role === 'ADMIN') {
          return NextResponse.redirect(new URL('/admin', request.url))
        }
        
      } catch {
        // Token ไม่ถูกต้องให้ redirect ไปหน้า login
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (assets)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}