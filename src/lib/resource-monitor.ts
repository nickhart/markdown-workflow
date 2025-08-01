/**
 * Resource monitoring and limits system
 * Prevents resource exhaustion attacks and ensures system stability
 */

import * as fs from 'fs';
import * as path from 'path';

// Resource limits configuration
const RESOURCE_LIMITS = {
  // Processing timeouts
  MAX_PROCESSING_TIME: 2 * 60 * 1000, // 2 minutes
  MAX_GENERATION_TIME: 3 * 60 * 1000, // 3 minutes (includes overhead)
  
  // File size limits
  MAX_OUTPUT_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_INPUT_CONTENT_SIZE: 50 * 1024, // 50KB
  
  // Concurrent process limits
  MAX_CONCURRENT_PROCESSES: parseInt(process.env.MAX_CONCURRENT_PROCESSES || '3'),
  
  // Memory limits
  MAX_MEMORY_USAGE: 512 * 1024 * 1024, // 512MB per process
  
  // Disk space limits
  MIN_FREE_DISK_SPACE: 100 * 1024 * 1024, // 100MB
  MAX_TEMP_DIR_SIZE: 1024 * 1024 * 1024, // 1GB
};

// Active process tracking
const activeProcesses = new Map<string, {
  startTime: number;
  processId: string;
  type: 'create' | 'format';
  ip: string;
  timeout?: NodeJS.Timeout;
}>();

/**
 * Resource monitor singleton
 */
class ResourceMonitor {
  private memoryCheckInterval?: NodeJS.Timeout;
  private diskCheckInterval?: NodeJS.Timeout;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Start resource monitoring
   */
  private startMonitoring(): void {
    // Memory monitoring every 30 seconds
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30 * 1000);

    // Disk monitoring every 60 seconds
    this.diskCheckInterval = setInterval(() => {
      this.checkDiskUsage();
    }, 60 * 1000);
  }

  /**
   * Stop resource monitoring
   */
  stop(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }
    if (this.diskCheckInterval) {
      clearInterval(this.diskCheckInterval);
    }
  }

  /**
   * Check if we can start a new process
   */
  canStartProcess(type: 'create' | 'format', ip: string): {
    allowed: boolean;
    reason?: string;
  } {
    // Check concurrent process limit
    if (activeProcesses.size >= RESOURCE_LIMITS.MAX_CONCURRENT_PROCESSES) {
      return {
        allowed: false,
        reason: `Maximum concurrent processes reached (${RESOURCE_LIMITS.MAX_CONCURRENT_PROCESSES}). Please try again later.`,
      };
    }

    // Check if same IP has too many active processes
    const ipProcesses = Array.from(activeProcesses.values()).filter(p => p.ip === ip);
    if (ipProcesses.length >= 2) {
      return {
        allowed: false,
        reason: 'Too many active processes from your IP address. Please wait for current operations to complete.',
      };
    }

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > RESOURCE_LIMITS.MAX_MEMORY_USAGE) {
      return {
        allowed: false,
        reason: 'System memory usage too high. Please try again later.',
      };
    }

    // Check disk space
    try {
      const tempDir = path.join(process.cwd(), 'tmp');
      if (!this.checkDiskSpace(tempDir)) {
        return {
          allowed: false,
          reason: 'Insufficient disk space. Please try again later.',
        };
      }
    } catch (error) {
      console.warn('Could not check disk space:', error);
    }

    return { allowed: true };
  }

  /**
   * Register a new process
   */
  registerProcess(processId: string, type: 'create' | 'format', ip: string): void {
    const timeout = setTimeout(() => {
      console.error(`Process ${processId} exceeded maximum processing time, terminating`);
      this.terminateProcess(processId);
    }, type === 'format' ? RESOURCE_LIMITS.MAX_GENERATION_TIME : RESOURCE_LIMITS.MAX_PROCESSING_TIME);

    activeProcesses.set(processId, {
      startTime: Date.now(),
      processId,
      type,
      ip,
      timeout,
    });

    console.log(`Process ${processId} registered (${type}) - Active: ${activeProcesses.size}/${RESOURCE_LIMITS.MAX_CONCURRENT_PROCESSES}`);
  }

  /**
   * Unregister a completed process
   */
  unregisterProcess(processId: string): void {
    const process = activeProcesses.get(processId);
    if (process) {
      if (process.timeout) {
        clearTimeout(process.timeout);
      }
      activeProcesses.delete(processId);
      
      const duration = Date.now() - process.startTime;
      console.log(`Process ${processId} completed in ${duration}ms - Active: ${activeProcesses.size}/${RESOURCE_LIMITS.MAX_CONCURRENT_PROCESSES}`);
    }
  }

  /**
   * Terminate a process (timeout or emergency)
   */
  terminateProcess(processId: string): void {
    const process = activeProcesses.get(processId);
    if (process) {
      if (process.timeout) {
        clearTimeout(process.timeout);
      }
      activeProcesses.delete(processId);
      
      console.warn(`Process ${processId} terminated - Active: ${activeProcesses.size}/${RESOURCE_LIMITS.MAX_CONCURRENT_PROCESSES}`);
      
      // TODO: Implement actual process termination if needed
      // This would require tracking child processes and killing them
    }
  }

  /**
   * Get active process statistics
   */
  getProcessStats(): {
    active: number;
    maxConcurrent: number;
    processes: Array<{
      id: string;
      type: string;
      duration: number;
      ip: string;
    }>;
  } {
    const now = Date.now();
    const processes = Array.from(activeProcesses.values()).map(p => ({
      id: p.processId,
      type: p.type,
      duration: now - p.startTime,
      ip: p.ip,
    }));

    return {
      active: activeProcesses.size,
      maxConcurrent: RESOURCE_LIMITS.MAX_CONCURRENT_PROCESSES,
      processes,
    };
  }

  /**
   * Check memory usage
   */
  private checkMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    const usagePercent = (memoryUsage.heapUsed / RESOURCE_LIMITS.MAX_MEMORY_USAGE) * 100;

    if (usagePercent > 80) {
      console.warn(`High memory usage: ${Math.round(usagePercent)}% (${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB)`);
      
      // Force garbage collection if usage is very high
      if (usagePercent > 90 && global.gc) {
        console.log('Forcing garbage collection due to high memory usage');
        global.gc();
      }
    }
  }

  /**
   * Check disk usage
   */
  private checkDiskUsage(): void {
    try {
      const tempDir = path.join(process.cwd(), 'tmp');
      if (fs.existsSync(tempDir)) {
        const tempDirSize = this.getDirSize(tempDir);
        
        if (tempDirSize > RESOURCE_LIMITS.MAX_TEMP_DIR_SIZE) {
          console.warn(`Temp directory size exceeded: ${Math.round(tempDirSize / 1024 / 1024)}MB`);
          // Cleanup will be handled by the cleanup manager
        }
      }
    } catch (_error) {
      console.error('Error checking disk usage:', _error);
    }
  }

  /**
   * Check available disk space
   */
  private checkDiskSpace(dirPath: string): boolean {
    try {
      const _stats = fs.statSync(dirPath);
      // This is a simplified check - in production you'd want to use statvfs or similar
      return true; // Assuming sufficient space for now
    } catch (_error) {
      console.warn('Could not check disk space:', _error);
      return true; // Assume OK if we can't check
    }
  }

  /**
   * Get directory size recursively
   */
  private getDirSize(dirPath: string): number {
    let totalSize = 0;
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          totalSize += this.getDirSize(itemPath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (_error) {
      console.warn(`Error calculating directory size for ${dirPath}:`, _error);
    }
    
    return totalSize;
  }
}

// Global resource monitor instance
const resourceMonitor = new ResourceMonitor();

/**
 * Validate file size limits
 */
export function validateFileSize(filePath: string): {
  valid: boolean;
  size: number;
  reason?: string;
} {
  try {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    
    if (size > RESOURCE_LIMITS.MAX_OUTPUT_FILE_SIZE) {
      return {
        valid: false,
        size,
        reason: `File size ${Math.round(size / 1024 / 1024)}MB exceeds maximum allowed size of ${Math.round(RESOURCE_LIMITS.MAX_OUTPUT_FILE_SIZE / 1024 / 1024)}MB`,
      };
    }
    
    return { valid: true, size };
  } catch (_error) {
    return {
      valid: false,
      size: 0,
      reason: 'Could not read file size',
    };
  }
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function createTimeoutPromise<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation '${operation}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Resource-aware execution wrapper
 */
export async function executeWithResourceLimits<T>(
  processId: string,
  type: 'create' | 'format',
  ip: string,
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  // Check if we can start the process
  const canStart = resourceMonitor.canStartProcess(type, ip);
  if (!canStart.allowed) {
    throw new Error(canStart.reason || 'Resource limits exceeded');
  }

  // Register the process
  resourceMonitor.registerProcess(processId, type, ip);

  try {
    // Execute with timeout
    const timeoutMs = type === 'format' 
      ? RESOURCE_LIMITS.MAX_GENERATION_TIME 
      : RESOURCE_LIMITS.MAX_PROCESSING_TIME;
      
    const result = await createTimeoutPromise(
      operation(),
      timeoutMs,
      operationName
    );

    return result;
  } finally {
    // Always unregister the process
    resourceMonitor.unregisterProcess(processId);
  }
}

/**
 * Get current resource usage statistics
 */
export function getResourceStats(): {
  processes: ReturnType<ResourceMonitor['getProcessStats']>;
  memory: {
    used: number;
    limit: number;
    percentage: number;
  };
  limits: typeof RESOURCE_LIMITS;
} {
  const memoryUsage = process.memoryUsage();
  
  return {
    processes: resourceMonitor.getProcessStats(),
    memory: {
      used: memoryUsage.heapUsed,
      limit: RESOURCE_LIMITS.MAX_MEMORY_USAGE,
      percentage: (memoryUsage.heapUsed / RESOURCE_LIMITS.MAX_MEMORY_USAGE) * 100,
    },
    limits: RESOURCE_LIMITS,
  };
}

/**
 * Cleanup function for graceful shutdown
 */
export function stopResourceMonitoring(): void {
  resourceMonitor.stop();
}

// Export the resource monitor for direct access if needed
export { resourceMonitor };