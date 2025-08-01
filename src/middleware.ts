/**
 * Global security middleware for Next.js
 * Applies security measures to all API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from './middleware/rate-limiting';

/**
 * Security headers configuration
 */
const SECURITY_HEADERS = {
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/eval
    "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),

  // HTTP Strict Transport Security (HTTPS only)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // XSS Protection
  'X-XSS-Protection': '1; mode=block',

  // Referrer Policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions Policy (formerly Feature Policy)
  'Permissions-Policy': ['camera=()', 'microphone=()', 'geolocation=()', 'interest-cohort=()'].join(
    ', ',
  ),
};

/**
 * CORS configuration
 */
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

  // In development, allow localhost
  if (process.env.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400', // 24 hours
  };

  // Check if origin is allowed
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (allowedOrigins.length === 0) {
    // If no origins configured, allow all (not recommended for production)
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return headers;
}

/**
 * Apply security headers to response
 */
function applySecurityHeaders(response: NextResponse, request: NextRequest): void {
  // Apply security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Apply CORS headers
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // Remove server information
  response.headers.delete('Server');
  response.headers.delete('X-Powered-By');
}

/**
 * Main middleware function
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Handle preflight OPTIONS requests
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 200 });
    applySecurityHeaders(response, request);
    return response;
  }

  // Apply security measures to API routes only
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Rate limiting
      const rateLimitResult = await rateLimit(request);
      if (rateLimitResult && rateLimitResult.status === 429) {
        applySecurityHeaders(rateLimitResult, request);
        return rateLimitResult;
      }

      // 2. Request logging for security monitoring
      const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
      console.log(`API Request: ${request.method} ${pathname} from ${clientIP}`);

      // 3. Content-Type validation for POST requests
      if (request.method === 'POST' && !pathname.startsWith('/api/presentations/download/')) {
        const contentType = request.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const response = NextResponse.json(
            {
              error: 'Invalid content type',
              message: 'Content-Type must be application/json',
            },
            { status: 415 },
          );
          applySecurityHeaders(response, request);
          return response;
        }
      }

      // 4. Content-Length validation
      const contentLength = request.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength);
        const maxSize = 1024 * 1024; // 1MB max request size

        if (size > maxSize) {
          const response = NextResponse.json(
            {
              error: 'Request too large',
              message: `Request size ${Math.round(size / 1024)}KB exceeds maximum allowed size of ${Math.round(maxSize / 1024)}KB`,
            },
            { status: 413 },
          );
          applySecurityHeaders(response, request);
          return response;
        }
      }
    } catch (error) {
      console.error('Security middleware error:', error);

      const response = NextResponse.json(
        {
          error: 'Security check failed',
          message: 'Please try again later',
        },
        { status: 500 },
      );
      applySecurityHeaders(response, request);
      return response;
    }
  }

  // Continue to the next middleware/route
  const response = NextResponse.next();

  // Apply security headers to all responses
  applySecurityHeaders(response, request);

  return response;
}

/**
 * Configure which routes the middleware should run on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
