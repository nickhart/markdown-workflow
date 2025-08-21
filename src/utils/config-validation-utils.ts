/**
 * Configuration validation utilities for testing overrides
 * Validates testing configuration settings and provides helpful error messages
 */

import { ProjectConfigSchema } from '../engine/schemas';
import { z } from 'zod';

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    path: string;
    message: string;
    suggestion?: string;
  }>;
  warnings: Array<{
    path: string;
    message: string;
    suggestion?: string;
  }>;
}

/**
 * Validate project configuration with enhanced testing-specific checks
 */
export function validateProjectConfig(config: unknown): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  try {
    // First, validate against the schema
    ProjectConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      result.isValid = false;

      for (const issue of error.issues) {
        const path = issue.path.join('.');
        result.errors.push({
          path,
          message: issue.message,
          suggestion: getSchemaValidationSuggestion(issue),
        });
      }
    }
  }

  // Additional testing-specific validations
  if (typeof config === 'object' && config !== null && 'system' in config) {
    const systemConfig = (config as { system?: { testing?: unknown } }).system;
    if (systemConfig?.testing) {
      validateTestingConfig(systemConfig.testing, result);
    }
  }

  return result;
}

/**
 * Validate testing configuration for common issues and best practices
 */
function validateTestingConfig(testingConfig: unknown, result: ValidationResult): void {
  if (typeof testingConfig !== 'object' || testingConfig === null) {
    return;
  }

  const config = testingConfig as Record<string, unknown>;
  // Validate date override format
  if (config.override_current_date) {
    const dateValue = config.override_current_date;
    const parsedDate = new Date(dateValue as string);

    if (isNaN(parsedDate.getTime())) {
      result.errors.push({
        path: 'system.testing.override_current_date',
        message: `Invalid date format: ${dateValue}`,
        suggestion: 'Use ISO 8601 format like "2025-01-21T10:00:00.000Z"',
      });
      result.isValid = false;
    } else {
      // Check if date is in the past for realistic testing
      const now = new Date();
      if (parsedDate > now) {
        result.warnings.push({
          path: 'system.testing.override_current_date',
          message: 'Override date is in the future',
          suggestion: 'Consider using a past or current date for more realistic testing',
        });
      }
    }
  }

  // Validate timezone override
  if (config.override_timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: config.override_timezone as string });
    } catch {
      result.errors.push({
        path: 'system.testing.override_timezone',
        message: `Invalid timezone: ${config.override_timezone}`,
        suggestion: 'Use a valid IANA timezone like "UTC", "America/New_York", etc.',
      });
      result.isValid = false;
    }
  }

  // Validate deterministic IDs configuration
  if (config.deterministic_ids && !config.id_prefix) {
    result.warnings.push({
      path: 'system.testing.id_prefix',
      message: 'deterministic_ids is enabled but id_prefix is not set',
      suggestion: 'Add id_prefix: "test" for more predictable test IDs',
    });
  }

  if (config.id_counter_start && typeof config.id_counter_start !== 'number') {
    result.errors.push({
      path: 'system.testing.id_counter_start',
      message: 'id_counter_start must be a number',
      suggestion: 'Use a positive integer like 1 or 1000',
    });
    result.isValid = false;
  }

  if (config.id_counter_start && (config.id_counter_start as number) < 1) {
    result.warnings.push({
      path: 'system.testing.id_counter_start',
      message: 'id_counter_start should be positive',
      suggestion: 'Use a positive integer starting from 1',
    });
  }

  // Validate freeze_time consistency
  if (config.freeze_time && !config.override_current_date) {
    result.errors.push({
      path: 'system.testing.freeze_time',
      message: 'freeze_time is enabled but override_current_date is not set',
      suggestion: 'Set override_current_date when using freeze_time',
    });
    result.isValid = false;
  }

  // Validate user overrides
  if (config.override_user) {
    validateUserOverrides(config.override_user, result);
  }

  // Validate seed_random
  if (config.seed_random && typeof config.seed_random !== 'string') {
    result.errors.push({
      path: 'system.testing.seed_random',
      message: 'seed_random must be a string',
      suggestion: 'Use a string like "test-seed-123"',
    });
    result.isValid = false;
  }

  // Best practice warnings
  if (!config.deterministic_ids && !config.override_current_date) {
    result.warnings.push({
      path: 'system.testing',
      message: 'No deterministic overrides configured',
      suggestion: 'Enable deterministic_ids or override_current_date for consistent testing',
    });
  }
}

/**
 * Validate user override configuration
 */
function validateUserOverrides(userOverrides: unknown, result: ValidationResult): void {
  if (typeof userOverrides !== 'object' || userOverrides === null) {
    return;
  }

  const overrides = userOverrides as Record<string, unknown>;
  // Validate email format if provided
  if (overrides.email && typeof overrides.email === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(overrides.email)) {
      result.errors.push({
        path: 'system.testing.override_user.email',
        message: `Invalid email format: ${overrides.email}`,
        suggestion: 'Use a valid email format like "test@example.com"',
      });
      result.isValid = false;
    }
  }

  // Validate phone format if provided
  if (overrides.phone && typeof overrides.phone === 'string') {
    // Simple validation for common phone formats
    const phoneRegex = /^[\+]?[0-9\(\)\-\s\.]+$/;
    if (!phoneRegex.test(overrides.phone)) {
      result.warnings.push({
        path: 'system.testing.override_user.phone',
        message: 'Phone number format may not be valid',
        suggestion: 'Use formats like "(555) 123-4567" or "+1-555-123-4567"',
      });
    }
  }

  // Check for consistent test data
  if (
    overrides.name &&
    overrides.preferred_name &&
    typeof overrides.name === 'string' &&
    typeof overrides.preferred_name === 'string'
  ) {
    if (
      overrides.name.toLowerCase().includes('test') !==
      overrides.preferred_name.toLowerCase().includes('test')
    ) {
      result.warnings.push({
        path: 'system.testing.override_user',
        message: 'Inconsistent test naming pattern between name and preferred_name',
        suggestion: 'Use consistent "test" prefix/suffix for both fields in testing',
      });
    }
  }
}

/**
 * Get suggestion for schema validation errors
 */
function getSchemaValidationSuggestion(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type': {
      const typeIssue = issue as unknown as { expected: string; received: string };
      return `Expected ${typeIssue.expected}, got ${typeIssue.received}`;
    }

    case 'too_small': {
      const sizeIssue = issue as unknown as { minimum: number };
      return `Value must be at least ${sizeIssue.minimum}`;
    }

    case 'too_big': {
      const sizeIssue = issue as unknown as { maximum: number };
      return `Value must be at most ${sizeIssue.maximum}`;
    }

    case 'invalid_format':
      return 'Check the format requirements (e.g., valid email, URL, etc.)';

    case 'unrecognized_keys': {
      const keysIssue = issue as unknown as { keys: string[] };
      return `Unrecognized keys: ${keysIssue.keys?.join(', ') || 'unknown keys'}`;
    }

    case 'invalid_union':
      return 'Value does not match any of the allowed types';

    case 'custom': {
      const customIssue = issue as unknown as { message?: string };
      return customIssue.message || 'Custom validation failed';
    }

    default:
      return 'Check the configuration format';
  }
}

/**
 * Format validation result for display
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines = [];

  if (result.isValid) {
    lines.push('✅ Configuration is valid');
  } else {
    lines.push('❌ Configuration has errors');
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('🚨 ERRORS:');
    result.errors.forEach((error, index) => {
      lines.push(`${index + 1}. ${error.path}: ${error.message}`);
      if (error.suggestion) {
        lines.push(`   💡 ${error.suggestion}`);
      }
    });
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('⚠️  WARNINGS:');
    result.warnings.forEach((warning, index) => {
      lines.push(`${index + 1}. ${warning.path}: ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`   💡 ${warning.suggestion}`);
      }
    });
  }

  return lines.join('\n');
}

/**
 * Generate a sample testing configuration with explanations
 */
export function generateSampleTestingConfig(): string {
  return `# Sample Testing Configuration
# This configuration ensures deterministic behavior for E2E tests

system:
  testing:
    # Date/Time overrides for predictable testing
    override_current_date: "2025-01-21T10:00:00.000Z"  # Fixed date for all tests
    override_timezone: "UTC"                           # Consistent timezone
    freeze_time: true                                  # Always return the same time

    # ID generation overrides for deterministic IDs
    deterministic_ids: true                            # Use predictable IDs
    id_prefix: "test"                                  # Prefix for generated IDs
    id_counter_start: 1                                # Starting counter value

    # User variable overrides for consistent templates
    override_user:
      name: "Test User"
      preferred_name: "test_user"
      email: "test@example.com"
      phone: "(555) 123-4567"
      city: "Test City"
      state: "TS"

    # System variable overrides for deterministic behavior
    mock_file_timestamps: true                         # Use fixed timestamps
    mock_external_apis: true                           # Mock external calls
    seed_random: "test-seed-123"                       # Seed for random values

# Best Practices:
# 1. Use "test" prefix/suffix for all test data
# 2. Set override_current_date to a fixed past date
# 3. Enable freeze_time for completely deterministic dates
# 4. Use deterministic_ids for predictable collection IDs
# 5. Mock external dependencies with mock_external_apis
# 6. Use seed_random for reproducible random values`;
}

/**
 * Check if configuration is optimized for E2E testing
 */
export function checkE2EOptimization(config: unknown): {
  score: number;
  recommendations: string[];
} {
  let score = 0;
  const recommendations = [];

  if (typeof config !== 'object' || config === null) {
    return {
      score: 0,
      recommendations: ['Invalid configuration provided'],
    };
  }

  const configObj = config as Record<string, unknown>;
  const system = configObj.system as Record<string, unknown> | undefined;
  const testing = system?.testing as Record<string, unknown> | undefined;

  if (!testing) {
    return {
      score: 0,
      recommendations: [
        'Add system.testing configuration for E2E test optimization',
        'Use generateSampleTestingConfig() to get started',
      ],
    };
  }

  // Check date determinism (2 points)
  if (testing.override_current_date) {
    score += 1;
    if (testing.freeze_time) {
      score += 1;
    } else {
      recommendations.push('Enable freeze_time for completely deterministic dates');
    }
  } else {
    recommendations.push('Set override_current_date for predictable test dates');
  }

  // Check ID determinism (2 points)
  if (testing.deterministic_ids) {
    score += 1;
    if (testing.id_prefix) {
      score += 1;
    } else {
      recommendations.push('Add id_prefix for more readable deterministic IDs');
    }
  } else {
    recommendations.push('Enable deterministic_ids for predictable collection IDs');
  }

  // Check user overrides (2 points)
  if (testing.override_user) {
    score += 1;
    const userOverride = testing.override_user as Record<string, unknown>;
    if (userOverride.name && userOverride.email) {
      score += 1;
    } else {
      recommendations.push('Set comprehensive user overrides (name, email, etc.)');
    }
  } else {
    recommendations.push('Add override_user for consistent template variables');
  }

  // Check external mocking (2 points)
  if (testing.mock_external_apis) {
    score += 1;
  } else {
    recommendations.push('Enable mock_external_apis for isolated testing');
  }

  if (testing.mock_file_timestamps) {
    score += 1;
  } else {
    recommendations.push('Enable mock_file_timestamps for consistent snapshots');
  }

  // Check randomness control (2 points)
  if (testing.seed_random) {
    score += 2;
  } else {
    recommendations.push('Add seed_random for reproducible random values');
  }

  return { score, recommendations };
}
