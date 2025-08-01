/**
 * Rate limiting middleware with progressive penalties
 * Implements per-IP rate limits with escalating timeouts for violations
 */

import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { getRedisClient } from '@/lib/redis-client';

// In-memory storage for development when Redis is not available
const memoryStorage = new Map<string, { count: number; reset: number; violations: number; blockedUntil?: number }>();

interface RateLimitConfig {
  requests: number;
  window: number; // Duration in milliseconds
  windowString: string; // Human readable string
  description: string;
}

// Rate limit configurations by endpoint
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/presentations/templates': {
    requests: 20,
    window: 60 * 1000, // 1 minute
    windowString: '1m',
    description: 'Template fetching',
  },
  '/api/presentations/create': {
    requests: 10,
    window: 60 * 1000, // 1 minute
    windowString: '1m',
    description: 'Collection creation',
  },
  '/api/presentations/format': {
    requests: 5,
    window: 60 * 1000, // 1 minute
    windowString: '1m',
    description: 'PPTX generation',
  },
  '/api/presentations/download': {
    requests: 10,
    window: 60 * 1000, // 1 minute
    windowString: '1m',
    description: 'File downloads',
  },
};

// Progressive penalty timeouts (in milliseconds)
const PENALTY_TIMEOUTS = [
  60 * 1000,      // 1 minute
  5 * 60 * 1000,  // 5 minutes  
  15 * 60 * 1000, // 15 minutes
  60 * 60 * 1000, // 1 hour
];

/**
 * Get client IP address from request
 */
function getClientIP(request: NextRequest): string {
  // Check for forwarded IP (from proxy/load balancer)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Check for real IP (from Cloudflare/proxy)
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fallback - no direct IP access in Next.js middleware
  return 'unknown';
}

/**
 * Get rate limit configuration for endpoint
 */
function getRateLimitConfig(pathname: string): RateLimitConfig | null {
  // Check for exact match first
  if (RATE_LIMITS[pathname]) {
    return RATE_LIMITS[pathname];
  }

  // Check for pattern matches (e.g., download endpoints with dynamic IDs)
  if (pathname.startsWith('/api/presentations/download/')) {
    return RATE_LIMITS['/api/presentations/download'];
  }

  return null;
}

/**
 * In-memory rate limiting for development
 */
function checkInMemoryRateLimit(ip: string, config: RateLimitConfig): {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
  violations: number;
  blockedUntil?: Date;
} {
  const now = Date.now();
  const windowMs = config.window;
  const key = ip;

  let entry = memoryStorage.get(key);
  
  // Check if IP is currently blocked
  if (entry?.blockedUntil && now < entry.blockedUntil) {
    return {
      success: false,
      limit: config.requests,
      remaining: 0,
      reset: new Date(entry.reset),
      violations: entry.violations,
      blockedUntil: new Date(entry.blockedUntil),
    };
  }

  // Initialize or reset if window expired
  if (!entry || now >= entry.reset) {
    entry = {
      count: 0,
      reset: now + windowMs,
      violations: entry?.violations || 0,
    };
  }

  // Check rate limit
  if (entry.count >= config.requests) {
    // Rate limit exceeded - apply progressive penalty
    entry.violations++;
    const penaltyIndex = Math.min(entry.violations - 1, PENALTY_TIMEOUTS.length - 1);
    const penaltyDuration = PENALTY_TIMEOUTS[penaltyIndex];
    entry.blockedUntil = now + penaltyDuration;
    
    memoryStorage.set(key, entry);
    
    return {
      success: false,
      limit: config.requests,
      remaining: 0,
      reset: new Date(entry.reset),
      violations: entry.violations,
      blockedUntil: new Date(entry.blockedUntil),
    };
  }

  // Allow request
  entry.count++;
  memoryStorage.set(key, entry);

  return {
    success: true,
    limit: config.requests,
    remaining: config.requests - entry.count,
    reset: new Date(entry.reset),
    violations: entry.violations,
  };
}


/**
 * Rate limiting middleware
 */
export async function rateLimit(request: NextRequest): Promise<NextResponse | null> {
  // Skip rate limiting in test environment
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  // Skip if rate limiting is disabled
  if (process.env.RATE_LIMIT_ENABLED === 'false') {
    return null;
  }

  const { pathname } = request.nextUrl;
  const config = getRateLimitConfig(pathname);
  
  // No rate limit configured for this endpoint
  if (!config) {
    return null;
  }

  const ip = getClientIP(request);
  const redis = getRedisClient();

  let result: {
    success: boolean;
    limit: number;
    remaining: number;
    reset: Date;
    violations?: number;
    blockedUntil?: Date;
  };

  if (redis) {
    // Use Redis-based rate limiting for production
    try {
      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.requests, `${config.window}ms`),
        analytics: true,
      });

      const rateLimitResult = await ratelimit.limit(ip);
      
      result = {
        success: rateLimitResult.success,
        limit: rateLimitResult.limit,
        remaining: rateLimitResult.remaining,
        reset: new Date(rateLimitResult.reset),
      };
    } catch (error) {
      console.error('Redis rate limiting error, falling back to in-memory:', error);
      result = checkInMemoryRateLimit(ip, config);
    }
  } else {
    // Use in-memory rate limiting for development
    result = checkInMemoryRateLimit(ip, config);
  }

  // Add rate limit headers
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', result.limit.toString());
  headers.set('X-RateLimit-Remaining', result.remaining.toString());
  headers.set('X-RateLimit-Reset', result.reset.toISOString());

  if (result.blockedUntil) {
    headers.set('X-RateLimit-Blocked-Until', result.blockedUntil.toISOString());
  }

  // Rate limit exceeded
  if (!result.success) {
    const message = result.blockedUntil 
      ? `Rate limit exceeded. IP temporarily blocked until ${result.blockedUntil.toISOString()}. Violation #${result.violations}.`
      : `Rate limit exceeded for ${config.description}. Try again after ${result.reset.toISOString()}.`;

    console.warn(`Rate limit exceeded for IP ${ip} on ${pathname}: ${message}`);

    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message,
        retryAfter: result.blockedUntil || result.reset,
      },
      { 
        status: 429,
        headers,
      }
    );
  }

  // Rate limit passed - add headers for client awareness
  return NextResponse.next({
    headers,
  });
}

/**
 * Cleanup expired entries from in-memory storage
 * Should be called periodically to prevent memory leaks
 */
export function cleanupInMemoryStorage(): void {
  const now = Date.now();
  
  for (const [key, entry] of memoryStorage.entries()) {
    // Remove expired entries and unblocked IPs
    if (now >= entry.reset && (!entry.blockedUntil || now >= entry.blockedUntil)) {
      memoryStorage.delete(key);
    }
  }
}