/**
 * Integration tests for security middleware components
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '../../../src/middleware';

// Mock all the dependencies
jest.mock('../../../src/middleware/rate-limiting', () => ({
  rateLimit: jest.fn(),
}));

jest.mock('../../../src/lib/redis-client', () => ({
  getRedisClient: jest.fn(() => null),
}));

import { rateLimit } from '../../../src/middleware/rate-limiting';
const mockRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();

  jest.clearAllMocks();

  // Reset environment
  delete process.env.ALLOWED_ORIGINS;
  delete process.env.NODE_ENV;
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  delete process.env.ALLOWED_ORIGINS;
  delete process.env.NODE_ENV;
});

/**
 * Helper function to create a mock NextRequest
 */
function createMockRequest(
  method: string = 'GET',
  pathname: string = '/api/presentations/create',
  headers: Record<string, string> = {},
): NextRequest {
  const url = `http://localhost:3000${pathname}`;

  return new NextRequest(url, {
    method,
    headers: new Headers(headers),
  });
}

describe('Security Middleware Integration', () => {
  describe('OPTIONS request handling', () => {
    it('should handle preflight OPTIONS requests', async () => {
      const request = createMockRequest('OPTIONS', '/api/presentations/create', {
        origin: 'http://localhost:3000',
      });

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    });

    it('should include security headers in OPTIONS response', async () => {
      const request = createMockRequest('OPTIONS', '/api/presentations/create');

      const response = await middleware(request);

      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Strict-Transport-Security')).toBeTruthy();
    });
  });

  describe('CORS configuration', () => {
    it('should allow localhost in development', async () => {
      process.env.NODE_ENV = 'development';
      const request = createMockRequest('GET', '/api/presentations/templates', {
        origin: 'http://localhost:3000',
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    });

    it('should respect ALLOWED_ORIGINS environment variable', async () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com,https://app.example.com';
      const request = createMockRequest('GET', '/api/presentations/templates', {
        origin: 'https://example.com',
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    });

    it('should reject non-whitelisted origins', async () => {
      process.env.ALLOWED_ORIGINS = 'https://example.com';
      const request = createMockRequest('GET', '/api/presentations/templates', {
        origin: 'https://malicious.com',
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('https://malicious.com');
    });

    it('should handle missing origin header', async () => {
      const request = createMockRequest('GET', '/api/presentations/templates');

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      // Should still include CORS headers
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });
  });

  describe('Security headers', () => {
    it('should include all required security headers', async () => {
      const request = createMockRequest('GET', '/api/presentations/templates');
      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      // Check all security headers are present
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
      expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('Permissions-Policy')).toBeTruthy();
    });

    it('should remove server information headers', async () => {
      const request = createMockRequest('GET', '/api/presentations/templates');
      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.headers.get('Server')).toBeNull();
      expect(response.headers.get('X-Powered-By')).toBeNull();
    });

    it('should include CSP with appropriate directives', async () => {
      const request = createMockRequest('GET', '/api/presentations/templates');
      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    });
  });

  describe('Rate limiting integration', () => {
    it('should apply rate limiting to API routes', async () => {
      const request = createMockRequest('POST', '/api/presentations/create');

      await middleware(request);

      expect(mockRateLimit).toHaveBeenCalledWith(request);
    });

    it('should return rate limit response when blocked', async () => {
      const request = createMockRequest('POST', '/api/presentations/create');
      const rateLimitResponse = NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 },
      );

      mockRateLimit.mockResolvedValueOnce(rateLimitResponse);

      const response = await middleware(request);

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe('Rate limit exceeded');

      // Should still include security headers
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it('should continue to next middleware when rate limit passes', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'content-type': 'application/json',
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.status).not.toBe(429);
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });
  });

  describe('Content-Type validation', () => {
    it('should reject POST requests without application/json content-type', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'content-type': 'text/plain',
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.status).toBe(415);
      const body = await response.json();
      expect(body.error).toBe('Invalid content type');
      expect(body.message).toContain('application/json');
    });

    it('should allow POST requests with correct content-type', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'content-type': 'application/json',
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.status).not.toBe(415);
    });

    it('should skip content-type validation for download endpoints', async () => {
      const request = createMockRequest('POST', '/api/presentations/download/test123');

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.status).not.toBe(415);
    });

    it('should allow GET requests without content-type', async () => {
      const request = createMockRequest('GET', '/api/presentations/templates');

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.status).not.toBe(415);
    });
  });

  describe('Content-Length validation', () => {
    it('should reject requests exceeding size limit', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'content-type': 'application/json',
        'content-length': (2 * 1024 * 1024).toString(), // 2MB
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.error).toBe('Request too large');
      expect(body.message).toContain('2048KB exceeds maximum');
    });

    it('should allow requests within size limit', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'content-type': 'application/json',
        'content-length': '1024', // 1KB
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.status).not.toBe(413);
    });

    it('should handle missing content-length header', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'content-type': 'application/json',
      });

      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(response.status).not.toBe(413);
    });
  });

  describe('Request logging', () => {
    it('should log API requests with IP address', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'x-forwarded-for': '192.168.1.100',
        'content-type': 'application/json',
      });

      mockRateLimit.mockResolvedValueOnce(null);

      await middleware(request);

      expect(console.log).toHaveBeenCalledWith(
        'API Request: POST /api/presentations/create from 192.168.1.100',
      );
    });

    it('should handle missing IP address', async () => {
      const request = createMockRequest('GET', '/api/presentations/templates');

      mockRateLimit.mockResolvedValueOnce(null);

      await middleware(request);

      expect(console.log).toHaveBeenCalledWith(
        'API Request: GET /api/presentations/templates from unknown',
      );
    });

    it('should not log non-API requests', async () => {
      const request = createMockRequest('GET', '/presentations/demo');

      await middleware(request);

      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('API Request:'));
    });
  });

  describe('Error handling', () => {
    it('should handle rate limiting errors gracefully', async () => {
      const request = createMockRequest('POST', '/api/presentations/create');

      mockRateLimit.mockRejectedValueOnce(new Error('Rate limiting service unavailable'));

      const response = await middleware(request);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Security check failed');
      expect(body.message).toBe('Please try again later');

      expect(console.error).toHaveBeenCalledWith('Security middleware error:', expect.any(Error));
    });

    it('should include security headers even on errors', async () => {
      const request = createMockRequest('POST', '/api/presentations/create');

      mockRateLimit.mockRejectedValueOnce(new Error('Test error'));

      const response = await middleware(request);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });

  describe('Non-API route handling', () => {
    it('should apply security headers to all routes', async () => {
      const request = createMockRequest('GET', '/presentations/demo');

      const response = await middleware(request);

      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Strict-Transport-Security')).toBeTruthy();
    });

    it('should skip API-specific checks for non-API routes', async () => {
      const request = createMockRequest('POST', '/presentations/demo', {
        'content-type': 'text/html',
      });

      const response = await middleware(request);

      // Should not trigger content-type validation
      expect(response.status).not.toBe(415);
      expect(mockRateLimit).not.toHaveBeenCalled();
    });
  });

  describe('Integration with Next.js routing', () => {
    it('should properly handle middleware configuration matcher', async () => {
      // Test that middleware applies to routes not excluded by matcher
      const includedRoutes = ['/api/presentations/create', '/presentations/demo', '/'];

      for (const route of includedRoutes) {
        const request = createMockRequest('GET', route);
        mockRateLimit.mockResolvedValueOnce(null);

        const response = await middleware(request);

        expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      }
    });

    it('should handle dynamic routes correctly', async () => {
      const request = createMockRequest(
        'GET',
        '/api/presentations/download/some-collection-id-123',
      );
      mockRateLimit.mockResolvedValueOnce(null);

      const response = await middleware(request);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('/api/presentations/download/some-collection-id-123'),
      );
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });
  });

  describe('Performance and efficiency', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array(10)
        .fill(null)
        .map((_, i) => createMockRequest('GET', `/api/presentations/templates?test=${i}`));

      mockRateLimit.mockResolvedValue(null);

      const responses = await Promise.all(requests.map((request) => middleware(request)));

      expect(responses).toHaveLength(10);
      responses.forEach((response) => {
        expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      });

      expect(mockRateLimit).toHaveBeenCalledTimes(10);
    });

    it('should have minimal overhead for static routes', async () => {
      const request = createMockRequest('GET', '/presentations/demo');

      const startTime = Date.now();
      await middleware(request);
      const endTime = Date.now();

      // Should complete quickly (under 100ms in normal conditions)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
