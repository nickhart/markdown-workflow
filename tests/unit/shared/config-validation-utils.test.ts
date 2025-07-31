/**
 * Unit tests for configuration validation utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  validateProjectConfig,
  formatValidationResult,
  generateSampleTestingConfig,
  checkE2EOptimization,
} from '../../../src/shared/config-validation-utils.js';

describe('Config Validation Utils', () => {
  describe('validateProjectConfig', () => {
    it('should validate a correct configuration', () => {
      const validConfig = {
        user: {
          name: 'Test User',
          preferred_name: 'test_user',
          email: 'test@example.com',
          phone: '(555) 123-4567',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          linkedin: 'linkedin.com/in/testuser',
          github: 'github.com/testuser',
          website: 'testuser.com',
        },
        system: {
          scraper: 'wget',
          web_download: {
            timeout: 30,
            add_utf8_bom: true,
            html_cleanup: 'scripts',
          },
          output_formats: ['docx', 'html'],
          git: {
            auto_commit: true,
            commit_message_template: 'Add {{workflow}} collection: {{collection_id}}',
          },
          collection_id: {
            date_format: 'YYYYMMDD',
            sanitize_spaces: '_',
            max_length: 50,
          },
          mermaid: {
            output_format: 'png',
            theme: 'default',
            timeout: 30,
          },
          testing: {
            override_current_date: '2025-01-21T10:00:00.000Z',
            freeze_time: true,
            deterministic_ids: true,
            id_prefix: 'test',
            id_counter_start: 1,
          },
        },
        workflows: {},
      };

      const result = validateProjectConfig(validConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid date format in testing config', () => {
      const configWithInvalidDate = {
        user: {
          name: 'Test User',
          preferred_name: 'test_user',
          email: 'test@example.com',
          phone: '(555) 123-4567',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          linkedin: 'linkedin.com/in/testuser',
          github: 'github.com/testuser',
          website: 'testuser.com',
        },
        system: {
          scraper: 'wget',
          web_download: {
            timeout: 30,
            add_utf8_bom: true,
            html_cleanup: 'scripts',
          },
          output_formats: ['docx'],
          git: {
            auto_commit: true,
            commit_message_template: 'Test',
          },
          collection_id: {
            date_format: 'YYYYMMDD',
            sanitize_spaces: '_',
            max_length: 50,
          },
          testing: {
            override_current_date: 'invalid-date-format',
          },
        },
        workflows: {},
      };

      const result = validateProjectConfig(configWithInvalidDate);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.path === 'system.testing.override_current_date')).toBe(
        true,
      );
      expect(result.errors.some((e) => e.message.includes('Invalid date format'))).toBe(true);
    });

    it('should detect invalid timezone', () => {
      const configWithInvalidTimezone = {
        user: {
          name: 'Test User',
          preferred_name: 'test_user',
          email: 'test@example.com',
          phone: '(555) 123-4567',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          linkedin: 'linkedin.com/in/testuser',
          github: 'github.com/testuser',
          website: 'testuser.com',
        },
        system: {
          scraper: 'wget',
          web_download: {
            timeout: 30,
            add_utf8_bom: true,
            html_cleanup: 'scripts',
          },
          output_formats: ['docx'],
          git: {
            auto_commit: true,
            commit_message_template: 'Test',
          },
          collection_id: {
            date_format: 'YYYYMMDD',
            sanitize_spaces: '_',
            max_length: 50,
          },
          testing: {
            override_timezone: 'Invalid/Timezone',
          },
        },
        workflows: {},
      };

      const result = validateProjectConfig(configWithInvalidTimezone);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.path === 'system.testing.override_timezone')).toBe(true);
      expect(result.errors.some((e) => e.message.includes('Invalid timezone'))).toBe(true);
    });

    it('should warn about freeze_time without override_current_date', () => {
      const configWithInconsistentFreezeTime = {
        user: {
          name: 'Test User',
          preferred_name: 'test_user',
          email: 'test@example.com',
          phone: '(555) 123-4567',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          linkedin: 'linkedin.com/in/testuser',
          github: 'github.com/testuser',
          website: 'testuser.com',
        },
        system: {
          scraper: 'wget',
          web_download: {
            timeout: 30,
            add_utf8_bom: true,
            html_cleanup: 'scripts',
          },
          output_formats: ['docx'],
          git: {
            auto_commit: true,
            commit_message_template: 'Test',
          },
          collection_id: {
            date_format: 'YYYYMMDD',
            sanitize_spaces: '_',
            max_length: 50,
          },
          testing: {
            freeze_time: true,
            // Missing override_current_date
          },
        },
        workflows: {},
      };

      const result = validateProjectConfig(configWithInconsistentFreezeTime);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.path === 'system.testing.freeze_time')).toBe(true);
      expect(
        result.errors.some((e) => e.message.includes('override_current_date is not set')),
      ).toBe(true);
    });

    it('should validate user email format in overrides', () => {
      const configWithInvalidEmail = {
        user: {
          name: 'Test User',
          preferred_name: 'test_user',
          email: 'test@example.com',
          phone: '(555) 123-4567',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          linkedin: 'linkedin.com/in/testuser',
          github: 'github.com/testuser',
          website: 'testuser.com',
        },
        system: {
          scraper: 'wget',
          web_download: {
            timeout: 30,
            add_utf8_bom: true,
            html_cleanup: 'scripts',
          },
          output_formats: ['docx'],
          git: {
            auto_commit: true,
            commit_message_template: 'Test',
          },
          collection_id: {
            date_format: 'YYYYMMDD',
            sanitize_spaces: '_',
            max_length: 50,
          },
          testing: {
            override_user: {
              email: 'invalid-email-format',
            },
          },
        },
        workflows: {},
      };

      const result = validateProjectConfig(configWithInvalidEmail);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.path === 'system.testing.override_user.email')).toBe(true);
      expect(result.errors.some((e) => e.message.includes('Invalid email format'))).toBe(true);
    });

    it('should provide warnings for optimization opportunities', () => {
      const minimalConfig = {
        user: {
          name: 'Test User',
          preferred_name: 'test_user',
          email: 'test@example.com',
          phone: '(555) 123-4567',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          linkedin: 'linkedin.com/in/testuser',
          github: 'github.com/testuser',
          website: 'testuser.com',
        },
        system: {
          scraper: 'wget',
          web_download: {
            timeout: 30,
            add_utf8_bom: true,
            html_cleanup: 'scripts',
          },
          output_formats: ['docx'],
          git: {
            auto_commit: true,
            commit_message_template: 'Test',
          },
          collection_id: {
            date_format: 'YYYYMMDD',
            sanitize_spaces: '_',
            max_length: 50,
          },
          mermaid: {
            output_format: 'png',
            timeout: 30,
          },
          testing: {
            deterministic_ids: true,
            // Missing id_prefix - should warn
          },
        },
        workflows: {},
      };

      const result = validateProjectConfig(minimalConfig);

      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.path === 'system.testing.id_prefix')).toBe(true);
    });
  });

  describe('formatValidationResult', () => {
    it('should format valid configuration result', () => {
      const validResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const formatted = formatValidationResult(validResult);

      expect(formatted).toContain('✅ Configuration is valid');
    });

    it('should format invalid configuration with errors and warnings', () => {
      const invalidResult = {
        isValid: false,
        errors: [
          {
            path: 'system.testing.override_current_date',
            message: 'Invalid date format',
            suggestion: 'Use ISO 8601 format',
          },
        ],
        warnings: [
          {
            path: 'system.testing.id_prefix',
            message: 'Missing id_prefix',
            suggestion: 'Add id_prefix for better readability',
          },
        ],
      };

      const formatted = formatValidationResult(invalidResult);

      expect(formatted).toContain('❌ Configuration has errors');
      expect(formatted).toContain('🚨 ERRORS:');
      expect(formatted).toContain('⚠️  WARNINGS:');
      expect(formatted).toContain('Invalid date format');
      expect(formatted).toContain('Missing id_prefix');
      expect(formatted).toContain('Use ISO 8601 format');
      expect(formatted).toContain('Add id_prefix for better readability');
    });
  });

  describe('generateSampleTestingConfig', () => {
    it('should generate valid sample configuration', () => {
      const sample = generateSampleTestingConfig();

      expect(sample).toContain('override_current_date');
      expect(sample).toContain('deterministic_ids');
      expect(sample).toContain('override_user');
      expect(sample).toContain('Best Practices:');
      expect(sample).toContain('# '); // Should contain comments
    });
  });

  describe('checkE2EOptimization', () => {
    it('should score a well-optimized configuration highly', () => {
      const optimizedConfig = {
        system: {
          testing: {
            override_current_date: '2025-01-21T10:00:00.000Z',
            freeze_time: true,
            deterministic_ids: true,
            id_prefix: 'test',
            override_user: {
              name: 'Test User',
              email: 'test@example.com',
            },
            mock_external_apis: true,
            mock_file_timestamps: true,
            seed_random: 'test-seed-123',
          },
        },
      };

      const result = checkE2EOptimization(optimizedConfig);

      expect(result.score).toBeGreaterThan(7); // Should score highly
      expect(result.recommendations.length).toBeLessThan(3); // Should have few recommendations
    });

    it('should score a minimal configuration lowly and provide recommendations', () => {
      const minimalConfig = {
        system: {},
      };

      const result = checkE2EOptimization(minimalConfig);

      expect(result.score).toBeLessThan(3);
      expect(result.recommendations.length).toBeGreaterThan(1);
      expect(result.recommendations.some((r) => r.includes('Add system.testing'))).toBe(true);
    });

    it('should provide specific recommendations for partially configured testing', () => {
      const partialConfig = {
        system: {
          testing: {
            override_current_date: '2025-01-21T10:00:00.000Z',
            deterministic_ids: true,
            // Missing other optimizations
          },
        },
      };

      const result = checkE2EOptimization(partialConfig);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(6);
      expect(result.recommendations.length).toBeGreaterThan(2);
      expect(result.recommendations.some((r) => r.includes('freeze_time'))).toBe(true);
      expect(result.recommendations.some((r) => r.includes('id_prefix'))).toBe(true);
    });

    it('should handle configuration without testing section', () => {
      const noTestingConfig = {
        system: {
          scraper: 'wget',
        },
      };

      const result = checkE2EOptimization(noTestingConfig);

      expect(result.score).toBe(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some((r) => r.includes('system.testing'))).toBe(true);
    });
  });
});
