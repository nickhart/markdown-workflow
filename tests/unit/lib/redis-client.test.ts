/**
 * Unit tests for Redis client and health checks
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the Redis class before importing our module
const mockRedis = {
  ping: jest.fn(),
};

const mockRedisConstructor = jest.fn().mockImplementation(() => mockRedis);

jest.mock('@upstash/redis', () => ({
  Redis: mockRedisConstructor,
}));

// Import the module - we'll handle state in tests
let getRedisClient: () => ReturnType<typeof import('../../../src/lib/redis-client').getRedisClient>;
let checkRedisHealth: () => ReturnType<
  typeof import('../../../src/lib/redis-client').checkRedisHealth
>;

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(async () => {
  console.log = jest.fn();
  console.error = jest.fn();

  // Clear all mocks
  jest.clearAllMocks();

  // Reset environment variables
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  // Clear module cache to reset singleton state
  jest.resetModules();

  // Re-import the module for each test
  const redisModule = await import('../../../src/lib/redis-client');
  getRedisClient = redisModule.getRedisClient;
  checkRedisHealth = redisModule.checkRedisHealth;
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;

  // Clean up environment
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('Redis Client', () => {
  describe('getRedisClient', () => {
    it('should return null when Redis environment variables are not set', () => {
      const client = getRedisClient();

      expect(client).toBeNull();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Redis not configured, using in-memory rate limiting for development',
      );
      expect(mockRedisConstructor).not.toHaveBeenCalled();
    });

    it('should return null when only URL is set', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';

      const client = getRedisClient();

      expect(client).toBeNull();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Redis not configured, using in-memory rate limiting for development',
      );
      expect(mockRedisConstructor).not.toHaveBeenCalled();
    });

    it('should return null when only token is set', () => {
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      const client = getRedisClient();

      expect(client).toBeNull();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️  Redis not configured, using in-memory rate limiting for development',
      );
      expect(mockRedisConstructor).not.toHaveBeenCalled();
    });

    it('should create Redis client when both URL and token are set', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      const client = getRedisClient();

      expect(client).not.toBeNull();
      expect(console.log).toHaveBeenCalledWith('✅ Redis client initialized for production');
      expect(mockRedisConstructor).toHaveBeenCalledWith({
        url: 'https://example.upstash.io',
        token: 'test-token',
      });
    });

    it('should return the same client instance on subsequent calls (singleton)', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      const client1 = getRedisClient();
      const client2 = getRedisClient();

      expect(client1).toBe(client2);
      expect(mockRedisConstructor).toHaveBeenCalledTimes(1);
    });

    it('should handle Redis initialization errors gracefully', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      // Mock Redis constructor to throw an error
      mockRedisConstructor.mockImplementationOnce(() => {
        throw new Error('Redis connection failed');
      });

      const client = getRedisClient();

      expect(client).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        '❌ Failed to initialize Redis client:',
        expect.any(Error),
      );
    });

    it('should validate URL format', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'invalid-url';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      // The Redis constructor might throw for invalid URLs
      mockRedisConstructor.mockImplementationOnce(() => {
        throw new Error('Invalid URL format');
      });

      const client = getRedisClient();

      expect(client).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        '❌ Failed to initialize Redis client:',
        expect.any(Error),
      );
    });

    it('should handle empty environment variables', () => {
      process.env.UPSTASH_REDIS_REST_URL = '';
      process.env.UPSTASH_REDIS_REST_TOKEN = '';

      const client = getRedisClient();

      expect(client).toBeNull();
      expect(mockRedisConstructor).not.toHaveBeenCalled();
    });
  });

  describe('checkRedisHealth', () => {
    beforeEach(() => {
      // Reset the singleton by clearing mocks
      jest.clearAllMocks();
    });

    it('should return false when Redis client is not configured', async () => {
      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(false);
      expect(mockRedis.ping).not.toHaveBeenCalled();
    });

    it('should return true when Redis ping succeeds', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      mockRedis.ping.mockResolvedValueOnce('PONG');

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalledTimes(1);
    });

    it('should return false when Redis ping fails', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      mockRedis.ping.mockRejectedValueOnce(new Error('Connection timeout'));

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Redis health check failed:', expect.any(Error));
    });

    it('should return false when Redis ping returns unexpected response', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      mockRedis.ping.mockResolvedValueOnce('UNEXPECTED_RESPONSE');

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(false);
    });

    it('should handle network timeouts', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      mockRedis.ping.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Network timeout')), 100);
        });
      });

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Redis health check failed:', expect.any(Error));
    });

    it('should handle multiple concurrent health checks', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      mockRedis.ping.mockResolvedValue('PONG');

      const healthChecks = Array(5)
        .fill(null)
        .map(() => checkRedisHealth());
      const results = await Promise.all(healthChecks);

      expect(results.every((result) => result === true)).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalledTimes(5);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle Redis client methods being undefined', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      // Mock a Redis client without ping method
      const brokenRedis = {};
      mockRedisConstructor.mockImplementationOnce(() => brokenRedis);

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Redis health check failed:', expect.any(Error));
    });

    it('should handle very long URLs and tokens', () => {
      const longUrl = 'https://example.upstash.io/' + 'a'.repeat(1000);
      const longToken = 'b'.repeat(1000);

      process.env.UPSTASH_REDIS_REST_URL = longUrl;
      process.env.UPSTASH_REDIS_REST_TOKEN = longToken;

      const client = getRedisClient();

      // Should either succeed or fail gracefully
      expect(typeof client === 'object' || client === null).toBe(true);
      expect(mockRedisConstructor).toHaveBeenCalledWith({
        url: longUrl,
        token: longToken,
      });
    });

    it('should handle special characters in environment variables', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io/?param=test%20value';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'token_with-special.chars:123';

      const _client = getRedisClient();

      expect(mockRedisConstructor).toHaveBeenCalledWith({
        url: 'https://example.upstash.io/?param=test%20value',
        token: 'token_with-special.chars:123',
      });
    });

    it('should handle Redis ping returning null or undefined', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      mockRedis.ping.mockResolvedValueOnce(null);

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(false);
    });

    it('should handle Redis ping returning empty string', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      mockRedis.ping.mockResolvedValueOnce('');

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Environment variable validation', () => {
    it('should handle whitespace in environment variables', () => {
      process.env.UPSTASH_REDIS_REST_URL = '  https://example.upstash.io  ';
      process.env.UPSTASH_REDIS_REST_TOKEN = '  test-token  ';

      const client = getRedisClient();

      // The client should still be created (trimming is handled by the Redis constructor)
      expect(client).not.toBeNull();
      expect(mockRedisConstructor).toHaveBeenCalledWith({
        url: '  https://example.upstash.io  ',
        token: '  test-token  ',
      });
    });

    it('should handle URL with non-standard ports', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io:8080';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

      const client = getRedisClient();

      expect(client).not.toBeNull();
      expect(mockRedisConstructor).toHaveBeenCalledWith({
        url: 'https://example.upstash.io:8080',
        token: 'test-token',
      });
    });

    it('should handle localhost URLs for development', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'http://localhost:6379';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'local-token';

      const client = getRedisClient();

      expect(client).not.toBeNull();
      expect(mockRedisConstructor).toHaveBeenCalledWith({
        url: 'http://localhost:6379',
        token: 'local-token',
      });
    });
  });
});
