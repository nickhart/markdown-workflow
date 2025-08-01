/**
 * Redis client configuration for rate limiting
 * Supports both local development (in-memory) and production (Upstash Redis)
 */

import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

/**
 * Get Redis client instance
 * Returns null in development when Redis is not configured
 * This allows rate limiting to gracefully degrade to in-memory storage
 */
export function getRedisClient(): Redis | null {
  // Only initialize once
  if (redis) return redis;

  // Check for production Redis configuration
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      redis = new Redis({
        url: redisUrl,
        token: redisToken,
      });
      console.log('✅ Redis client initialized for production');
      return redis;
    } catch (error) {
      console.error('❌ Failed to initialize Redis client:', error);
      return null;
    }
  }

  // In development, return null to use in-memory rate limiting
  console.log('ℹ️  Redis not configured, using in-memory rate limiting for development');
  return null;
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}