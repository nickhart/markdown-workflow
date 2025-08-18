/**
 * Testing utilities for comprehensive variable mocking in E2E tests
 * Provides deterministic values for dates, IDs, user info, and other variables
 */

import { ProjectConfig } from '../engine/schemas.js';

// Global state for deterministic testing
let mockState = {
  idCounter: 1,
  frozenTime: null as Date | null,
  seedRandom: null as string | null,
};

/**
 * Reset mock state to initial values
 */
export function resetMockState(): void {
  mockState = {
    idCounter: 1,
    frozenTime: null,
    seedRandom: null,
  };
}

/**
 * Initialize mock state from configuration
 */
export function initializeMockState(config?: ProjectConfig): void {
  const testing = config?.system?.testing;
  if (!testing) return;

  // Initialize counter
  if (testing.id_counter_start) {
    mockState.idCounter = testing.id_counter_start;
  }

  // Initialize frozen time
  if (testing.freeze_time && testing.override_current_date) {
    mockState.frozenTime = new Date(testing.override_current_date);
  }

  // Initialize seed
  if (testing.seed_random) {
    mockState.seedRandom = testing.seed_random;
  }
}

/**
 * Get deterministic date for testing
 */
export function getMockDate(config?: ProjectConfig): Date {
  const testing = config?.system?.testing;

  // If time is frozen, always return the frozen time
  if (testing?.freeze_time && mockState.frozenTime) {
    return new Date(mockState.frozenTime);
  }

  // Check if we have a testing override for current date
  const overrideDate = testing?.override_current_date;
  if (overrideDate) {
    const parsedDate = new Date(overrideDate);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return new Date();
}

/**
 * Generate deterministic ID for testing
 */
export function getMockId(config?: ProjectConfig, prefix?: string): string {
  const testing = config?.system?.testing;

  if (!testing?.deterministic_ids) {
    // Return a timestamp-based ID if not in deterministic mode
    return Date.now().toString(36);
  }

  const idPrefix = prefix || testing.id_prefix || 'test';
  const paddedCounter = mockState.idCounter.toString().padStart(3, '0');
  mockState.idCounter++;

  return `${idPrefix}_${paddedCounter}`;
}

/**
 * Get mock user information with overrides
 */
export function getMockUser(config?: ProjectConfig): Record<string, string> {
  const defaultUser = {
    name: 'Test User',
    preferred_name: 'test_user',
    email: 'test@example.com',
    phone: '(555) 123-4567',
    address: '123 Test Street',
    city: 'Test City',
    state: 'TS',
    zip: '12345',
    linkedin: 'linkedin.com/in/testuser',
    github: 'github.com/testuser',
    website: 'testuser.com',
  };

  const testing = config?.system?.testing;
  const userOverrides = testing?.override_user;

  if (!userOverrides) {
    return defaultUser;
  }

  return {
    ...defaultUser,
    ...Object.fromEntries(
      Object.entries(userOverrides).filter(([_, value]) => value !== undefined),
    ),
  };
}

/**
 * Generate deterministic random number based on seed
 */
export function getMockRandom(config?: ProjectConfig): number {
  const testing = config?.system?.testing;

  if (!testing?.seed_random) {
    return Math.random();
  }

  // Simple seeded PRNG implementation
  const seed = hashString(testing.seed_random + mockState.idCounter);
  mockState.idCounter++;

  return (seed % 1000000) / 1000000;
}

/**
 * Generate deterministic UUID for testing
 */
export function getMockUUID(config?: ProjectConfig): string {
  const testing = config?.system?.testing;

  if (!testing?.deterministic_ids) {
    // Return a real UUID-style string
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Return deterministic UUID-style string
  const counter = mockState.idCounter.toString().padStart(8, '0');
  mockState.idCounter++;

  return `${counter.slice(0, 8)}-${counter.slice(0, 4)}-4${counter.slice(0, 3)}-a${counter.slice(0, 3)}-${counter}0000`.slice(
    0,
    36,
  );
}

/**
 * Get mock file timestamp
 */
export function getMockTimestamp(config?: ProjectConfig): Date {
  const testing = config?.system?.testing;

  if (testing?.mock_file_timestamps) {
    return getMockDate(config);
  }

  return new Date();
}

/**
 * Check if we should mock external APIs
 */
export function shouldMockExternalAPIs(config?: ProjectConfig): boolean {
  return config?.system?.testing?.mock_external_apis ?? false;
}

/**
 * Hash a string to a number (simple implementation)
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Create a deterministic delay for testing
 */
export function getMockDelay(config?: ProjectConfig, baseMs: number = 100): number {
  const testing = config?.system?.testing;

  if (testing?.deterministic_ids) {
    // Return a fixed delay in deterministic mode
    return baseMs;
  }

  return baseMs + Math.random() * baseMs;
}

/**
 * Log mock values for debugging (only in test mode)
 */
export function logMockState(config?: ProjectConfig): void {
  const testing = config?.system?.testing;

  if (testing && process.env.NODE_ENV === 'test') {
    console.log('Mock State:', {
      idCounter: mockState.idCounter,
      frozenTime: mockState.frozenTime?.toISOString(),
      seedRandom: mockState.seedRandom,
      deterministicIds: testing.deterministic_ids,
      freezeTime: testing.freeze_time,
    });
  }
}

/**
 * Utility to wrap a function with mock state initialization
 */
export function withMockState<T extends unknown[], R>(
  config: ProjectConfig | undefined,
  fn: (...args: T) => R,
): (...args: T) => R {
  return (...args: T): R => {
    resetMockState();
    initializeMockState(config);
    return fn(...args);
  };
}

/**
 * Environment check utilities
 */
export const TestingEnvironment = {
  isE2E(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.TESTING_MODE === 'e2e';
  },

  isMockPandoc(): boolean {
    return process.env.MOCK_PANDOC === 'true';
  },

  isCI(): boolean {
    return process.env.CI === 'true';
  },

  shouldLogMockValues(): boolean {
    return process.env.DEBUG_MOCKS === 'true';
  },
};
