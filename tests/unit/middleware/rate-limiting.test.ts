/**
 * Unit tests for rate limiting middleware
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { rateLimit, cleanupInMemoryStorage } from '../../../src/middleware/rate-limiting';

// Mock the Redis client
jest.mock('../../../src/lib/redis-client', () => ({
  getRedisClient: jest.fn(() => null), // Always return null for testing in-memory logic
}));

// Mock console methods to avoid noise in tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.RATE_LIMIT_ENABLED = 'true';
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  // Clean up in-memory storage after each test
  cleanupInMemoryStorage();

  // Reset environment
  delete process.env.NODE_ENV;
  delete process.env.RATE_LIMIT_ENABLED;
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

  const request = new NextRequest(url, {
    method,
    headers: new Headers(headers),
  });

  return request;
}

describe('Rate Limiting Middleware', () => {
  describe('Environment-based behavior', () => {
    it('should skip rate limiting in test environment by default', async () => {
      process.env.NODE_ENV = 'test';
      const request = createMockRequest('POST', '/api/presentations/create');

      const result = await rateLimit(request);

      expect(result).toBeNull();
    });

    it('should skip rate limiting when disabled', async () => {
      process.env.NODE_ENV = 'production';
      process.env.RATE_LIMIT_ENABLED = 'false';
      const request = createMockRequest('POST', '/api/presentations/create');

      const result = await rateLimit(request);

      expect(result).toBeNull();
    });

    it('should skip rate limiting for unconfigured endpoints', async () => {
      process.env.NODE_ENV = 'production';
      const request = createMockRequest('GET', '/api/some/other/endpoint');

      const result = await rateLimit(request);

      expect(result).toBeNull();
    });
  });

  describe('IP extraction', () => {
    it('should extract IP from x-forwarded-for header', async () => {
      process.env.NODE_ENV = 'production';
      const request = createMockRequest('POST', '/api/presentations/create', {
        'x-forwarded-for': '192.168.1.100, 10.0.0.1',
      });

      // This will test the IP extraction logic internally
      const result = await rateLimit(request);

      // Should proceed with rate limiting (not null)
      expect(result).not.toBeNull();
    });

    it('should extract IP from x-real-ip header when x-forwarded-for is not present', async () => {
      process.env.NODE_ENV = 'production';
      const request = createMockRequest('POST', '/api/presentations/create', {
        'x-real-ip': '192.168.1.200',
      });

      const result = await rateLimit(request);

      expect(result).not.toBeNull();
    });

    it('should handle unknown IP gracefully', async () => {
      process.env.NODE_ENV = 'production';
      const request = createMockRequest('POST', '/api/presentations/create');

      const result = await rateLimit(request);

      expect(result).not.toBeNull();
    });
  });

  describe('In-memory rate limiting', () => {
    beforeEach(() => {
      // Force production environment to enable rate limiting
      process.env.NODE_ENV = 'production';
    });

    it('should allow requests within rate limit', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'x-forwarded-for': '192.168.1.1',
      });

      // First request should be allowed
      const result1 = await rateLimit(request);
      expect(result1?.status).not.toBe(429);

      // Second request should also be allowed (limit is 10/min for create)
      const result2 = await rateLimit(request);
      expect(result2?.status).not.toBe(429);
    });

    it('should block requests exceeding rate limit', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'x-forwarded-for': '192.168.1.2',
      });

      // Make 11 requests (limit is 10 for create endpoint)
      const results = [];
      for (let i = 0; i < 11; i++) {
        const result = await rateLimit(request);
        results.push(result);
      }

      // Last request should be rate limited
      const lastResult = results[results.length - 1];
      expect(lastResult?.status).toBe(429);

      // Check that it's actually a NextResponse with rate limit error
      if (lastResult) {
        const body = await lastResult.json();
        expect(body.error).toBe('Rate limit exceeded');
        // Progressive penalties cause blocking with violation numbers
        expect(body.message).toMatch(/(Try again after|temporarily blocked|Violation)/);
      }
    });

    it('should include rate limit headers', async () => {
      const request = createMockRequest('POST', '/api/presentations/create', {
        'x-forwarded-for': '192.168.1.3',
      });

      const result = await rateLimit(request);

      if (result && result.status !== 429) {
        // For allowed requests, headers should be in the NextResponse
        expect(result.headers.get('X-RateLimit-Limit')).toBe('10');
        expect(result.headers.get('X-RateLimit-Remaining')).toBe('9');
        expect(result.headers.get('X-RateLimit-Reset')).toBeTruthy();
      } else if (result && result.status === 429) {
        // For blocked requests, headers should also be present
        expect(result.headers.get('X-RateLimit-Limit')).toBeTruthy();
        expect(result.headers.get('X-RateLimit-Remaining')).toBe('0');
        expect(result.headers.get('X-RateLimit-Reset')).toBeTruthy();
      }
    });

    it('should apply different limits for different endpoints', async () => {
      const createRequest = createMockRequest('POST', '/api/presentations/create', {
        'x-forwarded-for': '192.168.1.4',
      });
      const formatRequest = createMockRequest('POST', '/api/presentations/format', {
        'x-forwarded-for': '192.168.1.4',
      });

      // Create endpoint allows 10 requests/min
      const createResult = await rateLimit(createRequest);
      expect(createResult?.headers.get('X-RateLimit-Limit')).toBe('10');

      // Format endpoint allows 5 requests/min
      const formatResult = await rateLimit(formatRequest);
      expect(formatResult?.headers.get('X-RateLimit-Limit')).toBe('5');
    });

    it('should handle dynamic download routes', async () => {
      const downloadRequest = createMockRequest('GET', '/api/presentations/download/test123', {
        'x-forwarded-for': '192.168.1.5',
      });

      const result = await rateLimit(downloadRequest);

      // Should match the download endpoint configuration (10 requests/min)
      if (result && result.status !== 429) {
        expect(result.headers.get('X-RateLimit-Limit')).toBe('10');
      }
    });
  });

  describe('Progressive penalties', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should apply progressive penalties for repeated violations', async () => {
      const request = createMockRequest('POST', '/api/presentations/format', {
        'x-forwarded-for': '192.168.1.6',
      });

      // Exhaust rate limit (5 requests for format endpoint)
      for (let i = 0; i < 5; i++) {
        await rateLimit(request);
      }

      // First violation - should get 1 minute penalty
      const violation1 = await rateLimit(request);
      expect(violation1?.status).toBe(429);
      if (violation1) {
        const body = await violation1.json();
        expect(body.message).toContain('temporarily blocked');
        expect(body.message).toMatch(/Violation #\d+/);
      }

      // Attempt another request while blocked - should maintain or increase violation
      const violation2 = await rateLimit(request);
      expect(violation2?.status).toBe(429);
      if (violation2) {
        const body = await violation2.json();
        expect(body.message).toMatch(/Violation #\d+/);
      }
    });

    it('should include blocked-until header during penalty', async () => {
      const request = createMockRequest('POST', '/api/presentations/format', {
        'x-forwarded-for': '192.168.1.7',
      });

      // Exhaust rate limit
      for (let i = 0; i < 6; i++) {
        await rateLimit(request);
      }

      const blockedResult = await rateLimit(request);
      expect(blockedResult?.status).toBe(429);
      expect(blockedResult?.headers.get('X-RateLimit-Blocked-Until')).toBeTruthy();
    });
  });

  describe('Memory cleanup', () => {
    it('should clean up expired entries', () => {
      // This test would need to manipulate the internal storage
      // For now, we just ensure the cleanup function exists and can be called
      expect(() => cleanupInMemoryStorage()).not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle malformed requests gracefully', async () => {
      process.env.NODE_ENV = 'production';

      // Create a request with malformed headers
      const request = createMockRequest('POST', '/api/presentations/create', {
        'x-forwarded-for': '', // Empty header
      });

      const result = await rateLimit(request);

      // Should not throw an error, should handle gracefully
      expect(result).not.toBeNull();
    });

    it('should handle concurrent requests from same IP', async () => {
      process.env.NODE_ENV = 'production';

      const requests = Array(5)
        .fill(null)
        .map(() =>
          createMockRequest('POST', '/api/presentations/create', {
            'x-forwarded-for': '192.168.1.8',
          }),
        );

      // Make concurrent requests
      const results = await Promise.all(requests.map((req) => rateLimit(req)));

      // All should be handled without errors
      results.forEach((result) => {
        expect(result).not.toBeNull();
        if (result) {
          expect([200, 429]).toContain(result.status);
        }
      });
    });
  });

  describe('Configuration validation', () => {
    it('should have valid rate limit configurations', () => {
      // Test that the rate limits are reasonable
      const endpoints = [
        '/api/presentations/templates',
        '/api/presentations/create',
        '/api/presentations/format',
        '/api/presentations/download',
      ];

      // Each endpoint should have a configuration
      for (const endpoint of endpoints) {
        const request = createMockRequest('POST', endpoint, {
          'x-forwarded-for': '192.168.1.9',
        });

        // Should not return null (meaning it found a configuration)
        expect(async () => {
          process.env.NODE_ENV = 'production';
          const result = await rateLimit(request);
          expect(result).not.toBeNull();
        }).not.toThrow();
      }
    });
  });
});
