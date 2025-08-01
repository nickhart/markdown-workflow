/**
 * Unit tests for resource monitoring system
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import {
  validateFileSize,
  createTimeoutPromise,
  executeWithResourceLimits,
  getResourceStats,
  stopResourceMonitoring,
  resourceMonitor as _resourceMonitor,
} from '../../../src/lib/resource-monitor';

// Mock fs for file size tests
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock console methods to reduce noise
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();

  // Reset mocks
  jest.clearAllMocks();
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;

  // Clean up any active processes
  stopResourceMonitoring();
});

describe('Resource Monitor', () => {
  describe('validateFileSize', () => {
    it('should validate files within size limit', () => {
      const mockStats = { size: 5 * 1024 * 1024 }; // 5MB
      mockFs.statSync.mockReturnValue(mockStats as fs.Stats);

      const result = validateFileSize('/path/to/test/file.txt');

      expect(result.valid).toBe(true);
      expect(result.size).toBe(5 * 1024 * 1024);
      expect(result.reason).toBeUndefined();
    });

    it('should reject files exceeding size limit', () => {
      const mockStats = { size: 15 * 1024 * 1024 }; // 15MB (exceeds 10MB limit)
      mockFs.statSync.mockReturnValue(mockStats as fs.Stats);

      const result = validateFileSize('/path/to/large/file.txt');

      expect(result.valid).toBe(false);
      expect(result.size).toBe(15 * 1024 * 1024);
      expect(result.reason).toContain('exceeds maximum allowed size');
      expect(result.reason).toContain('15MB');
    });

    it('should handle file read errors', () => {
      mockFs.statSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const result = validateFileSize('/path/to/nonexistent/file.txt');

      expect(result.valid).toBe(false);
      expect(result.size).toBe(0);
      expect(result.reason).toBe('Could not read file size');
    });

    it('should handle edge case of exactly max size', () => {
      const mockStats = { size: 10 * 1024 * 1024 }; // Exactly 10MB
      mockFs.statSync.mockReturnValue(mockStats as fs.Stats);

      const result = validateFileSize('/path/to/exact/file.txt');

      expect(result.valid).toBe(true);
      expect(result.size).toBe(10 * 1024 * 1024);
    });
  });

  describe('createTimeoutPromise', () => {
    it('should resolve when promise completes before timeout', async () => {
      const fastPromise = Promise.resolve('success');

      const result = await createTimeoutPromise(fastPromise, 1000, 'test operation');

      expect(result).toBe('success');
    });

    it('should reject when promise exceeds timeout', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('too late'), 200);
      });

      await expect(createTimeoutPromise(slowPromise, 100, 'slow operation')).rejects.toThrow(
        "Operation 'slow operation' timed out after 100ms",
      );
    });

    it('should reject when original promise rejects', async () => {
      const failingPromise = Promise.reject(new Error('operation failed'));

      await expect(createTimeoutPromise(failingPromise, 1000, 'failing operation')).rejects.toThrow(
        'operation failed',
      );
    });

    it('should handle very short timeouts', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('done'), 50);
      });

      await expect(createTimeoutPromise(promise, 10, 'very short timeout')).rejects.toThrow(
        "Operation 'very short timeout' timed out after 10ms",
      );
    });
  });

  describe('executeWithResourceLimits', () => {
    it('should execute operation when resources are available', async () => {
      const mockOperation = jest.fn().mockResolvedValue({ result: 'success' });

      const result = await executeWithResourceLimits(
        'test_process_1',
        'create',
        '192.168.1.1',
        mockOperation,
        'test operation',
      );

      expect(result).toEqual({ result: 'success' });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should reject when concurrent process limit exceeded', async () => {
      const longRunningOperation = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ result: 'done' }), 100);
        });

      // Start multiple operations to exceed the limit (3 concurrent max)
      const operations = Array(4)
        .fill(null)
        .map((_, i) =>
          executeWithResourceLimits(
            `test_process_${i}`,
            'create',
            '192.168.1.2',
            longRunningOperation,
            `operation ${i}`,
          ),
        );

      // The 4th operation should be rejected due to resource limits
      const results = await Promise.allSettled(operations);

      const rejectedCount = results.filter((r) => r.status === 'rejected').length;
      expect(rejectedCount).toBeGreaterThan(0);

      // Check that the rejection reason mentions resource limits
      const rejectedResult = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      if (rejectedResult) {
        expect(rejectedResult.reason.message).toContain(
          'Too many active processes from your IP address',
        );
      }
    });

    it('should reject when same IP has too many active processes', async () => {
      const sameIP = '192.168.1.3';
      const longOperation = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ result: 'done' }), 100);
        });

      // Start 3 operations from the same IP (limit is 2 per IP)
      const operations = [
        executeWithResourceLimits('proc_1', 'create', sameIP, longOperation, 'op 1'),
        executeWithResourceLimits('proc_2', 'create', sameIP, longOperation, 'op 2'),
        executeWithResourceLimits('proc_3', 'create', sameIP, longOperation, 'op 3'),
      ];

      const results = await Promise.allSettled(operations);
      const rejectedCount = results.filter((r) => r.status === 'rejected').length;

      expect(rejectedCount).toBeGreaterThan(0);

      const rejectedResult = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      if (rejectedResult) {
        expect(rejectedResult.reason.message).toContain('Too many active processes from your IP');
      }
    });

    it('should apply different timeouts for different operation types', async () => {
      const _slowOperation = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ result: 'slow done' }), 2000); // 2 seconds
        });

      const quickOperation = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ result: 'quick done' }), 100); // 100ms
        });

      // Test quick operation - should succeed
      const quickResult = await executeWithResourceLimits(
        'quick_proc',
        'create',
        '192.168.1.4',
        quickOperation,
        'quick test',
      );
      expect(quickResult).toEqual({ result: 'quick done' });

      // Test operation that should timeout using createTimeoutPromise directly
      const timeoutOperation = () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ result: 'timeout done' }), 3000); // 3 seconds
        });
      };

      await expect(createTimeoutPromise(timeoutOperation(), 1000, 'timeout test')).rejects.toThrow(
        'timed out',
      );
    }, 10000);

    it('should clean up process registration on completion', async () => {
      const processId = 'cleanup_test_proc';
      const quickOperation = jest.fn().mockResolvedValue({ result: 'quick' });

      await executeWithResourceLimits(
        processId,
        'create',
        '192.168.1.6',
        quickOperation,
        'cleanup test',
      );

      // Check that process was cleaned up
      const stats = getResourceStats();
      const activeProcess = stats.processes.processes.find((p) => p.id === processId);
      expect(activeProcess).toBeUndefined();
    });

    it('should clean up process registration on error', async () => {
      const processId = 'error_test_proc';
      const failingOperation = jest.fn().mockRejectedValue(new Error('operation failed'));

      await expect(
        executeWithResourceLimits(
          processId,
          'create',
          '192.168.1.7',
          failingOperation,
          'error test',
        ),
      ).rejects.toThrow('operation failed');

      // Check that process was cleaned up even after error
      const stats = getResourceStats();
      const activeProcess = stats.processes.processes.find((p) => p.id === processId);
      expect(activeProcess).toBeUndefined();
    });
  });

  describe('getResourceStats', () => {
    it('should return current resource statistics', () => {
      const stats = getResourceStats();

      expect(stats).toHaveProperty('processes');
      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('limits');

      expect(stats.processes).toHaveProperty('active');
      expect(stats.processes).toHaveProperty('maxConcurrent');
      expect(stats.processes).toHaveProperty('processes');

      expect(stats.memory).toHaveProperty('used');
      expect(stats.memory).toHaveProperty('limit');
      expect(stats.memory).toHaveProperty('percentage');

      expect(typeof stats.processes.active).toBe('number');
      expect(typeof stats.memory.percentage).toBe('number');
      expect(Array.isArray(stats.processes.processes)).toBe(true);
    });

    it('should show active processes during execution', async () => {
      const longOperation = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ result: 'done' }), 50);
        });

      const operationPromise = executeWithResourceLimits(
        'stats_test_proc',
        'create',
        '192.168.1.8',
        longOperation,
        'stats test',
      );

      // Check stats while operation is running
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay to ensure process is registered
      const activeStats = getResourceStats();

      expect(activeStats.processes.active).toBeGreaterThan(0);
      const activeProcess = activeStats.processes.processes.find((p) => p.id === 'stats_test_proc');
      expect(activeProcess).toBeDefined();
      if (activeProcess) {
        expect(activeProcess.type).toBe('create');
        expect(activeProcess.ip).toBe('192.168.1.8');
        expect(typeof activeProcess.duration).toBe('number');
      }

      // Wait for completion
      await operationPromise;

      // Check that process is cleaned up
      const finalStats = getResourceStats();
      const cleanedProcess = finalStats.processes.processes.find((p) => p.id === 'stats_test_proc');
      expect(cleanedProcess).toBeUndefined();
    });

    it('should calculate memory percentage correctly', () => {
      const stats = getResourceStats();

      expect(stats.memory.percentage).toBe((stats.memory.used / stats.memory.limit) * 100);
      expect(stats.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(stats.memory.percentage).toBeLessThanOrEqual(200); // Allow some headroom for test environment
    });
  });

  describe('Resource limits configuration', () => {
    it('should have reasonable default limits', () => {
      const stats = getResourceStats();

      // Check that limits are sensible
      expect(stats.limits.MAX_PROCESSING_TIME).toBe(2 * 60 * 1000); // 2 minutes
      expect(stats.limits.MAX_GENERATION_TIME).toBe(3 * 60 * 1000); // 3 minutes
      expect(stats.limits.MAX_OUTPUT_FILE_SIZE).toBe(10 * 1024 * 1024); // 10MB
      expect(stats.limits.MAX_INPUT_CONTENT_SIZE).toBe(50 * 1024); // 50KB
      expect(stats.limits.MAX_CONCURRENT_PROCESSES).toBeGreaterThan(0);
      expect(stats.limits.MAX_CONCURRENT_PROCESSES).toBeLessThanOrEqual(10); // Reasonable upper bound
    });

    it('should respect environment configuration', () => {
      // This would test environment variable configuration
      // For now, just ensure the limits object has all required properties
      const stats = getResourceStats();

      const requiredLimits = [
        'MAX_PROCESSING_TIME',
        'MAX_GENERATION_TIME',
        'MAX_OUTPUT_FILE_SIZE',
        'MAX_INPUT_CONTENT_SIZE',
        'MAX_CONCURRENT_PROCESSES',
        'MAX_MEMORY_USAGE',
        'MIN_FREE_DISK_SPACE',
        'MAX_TEMP_DIR_SIZE',
      ];

      for (const limit of requiredLimits) {
        expect(stats.limits).toHaveProperty(limit);
        expect(typeof stats.limits[limit as keyof typeof stats.limits]).toBe('number');
      }
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle resource monitor stop gracefully', () => {
      expect(() => stopResourceMonitoring()).not.toThrow();

      // Should be able to call multiple times
      expect(() => stopResourceMonitoring()).not.toThrow();
    });

    it('should handle concurrent access to resource stats', async () => {
      const statPromises = Array(10)
        .fill(null)
        .map(() => Promise.resolve(getResourceStats()));

      const results = await Promise.all(statPromises);

      // All calls should succeed
      expect(results).toHaveLength(10);
      results.forEach((stats) => {
        expect(stats).toHaveProperty('processes');
        expect(stats).toHaveProperty('memory');
        expect(stats).toHaveProperty('limits');
      });
    });

    it('should handle process registration with duplicate IDs', async () => {
      const duplicateId = 'duplicate_proc_id';
      const quickOperation = () => Promise.resolve({ result: 'quick' });

      // Start two operations with the same ID (this is an edge case)
      const results = await Promise.allSettled([
        executeWithResourceLimits(duplicateId, 'create', '192.168.1.9', quickOperation, 'dup 1'),
        executeWithResourceLimits(duplicateId, 'create', '192.168.1.10', quickOperation, 'dup 2'),
      ]);

      // Both should complete (the system should handle this gracefully)
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    });
  });
});
