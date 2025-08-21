import { formatDate, generateCollectionId } from '../../../src/utils/date-utils.js';
import { ProjectConfig } from '../../../src/engine/schemas.js';

describe('date-utils', () => {
  describe('formatDate', () => {
    it('should format LONG_DATE correctly', () => {
      const testDate = new Date('2025-07-28T10:00:00.000Z');
      const result = formatDate(testDate, 'LONG_DATE');

      // Expected format: "Monday, July 28, 2025"
      expect(result).toBe('Monday, July 28, 2025');
    });

    it('should format YYYY-MM-DD correctly', () => {
      const testDate = new Date('2025-07-28T10:00:00.000Z');
      const result = formatDate(testDate, 'YYYY-MM-DD');

      expect(result).toBe('2025-07-28');
    });

    it('should format YYYYMMDD correctly', () => {
      const testDate = new Date('2025-07-28T10:00:00.000Z');
      const result = formatDate(testDate, 'YYYYMMDD');

      expect(result).toBe('20250728');
    });

    it('should handle timezone overrides for LONG_DATE', () => {
      const testDate = new Date('2025-07-28T10:00:00.000Z');
      const config = {
        system: {
          testing: {
            override_timezone: 'UTC',
          },
        },
      };

      const result = formatDate(testDate, 'LONG_DATE', config as ProjectConfig);
      expect(result).toBe('Monday, July 28, 2025');
    });
  });

  describe('generateCollectionId', () => {
    const testConfig: ProjectConfig = {
      user: {
        name: 'Test User',
        preferred_name: 'Test',
        email: 'test@example.com',
        phone: '555-1234',
        address: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zip: '12345',
        linkedin: 'linkedin.com/in/test',
        github: 'github.com/test',
        website: 'test.com',
      },
      system: {
        scraper: 'wget',
        web_download: { timeout: 30, add_utf8_bom: true, html_cleanup: 'scripts' },
        output_formats: ['docx'],
        git: { auto_commit: false, commit_message_template: '' },
        collection_id: { date_format: 'YYYYMMDD', sanitize_spaces: '_', max_length: 50 },
        testing: {
          deterministic_ids: true,
          override_current_date: '2025-07-30T12:00:00.000Z',
        },
      },
      workflows: {},
    };

    it('should generate job application IDs with company and role', () => {
      const result = generateCollectionId('Google Inc', 'Software Engineer', testConfig);
      expect(result).toBe('google_inc_software_engineer_20250730');
    });

    it('should generate blog post IDs with title only', () => {
      const result = generateCollectionId('test blog post', '', testConfig);
      expect(result).toBe('test_blog_post_20250730');
    });

    it('should handle special characters in titles', () => {
      const result = generateCollectionId('My Amazing Blog Post!', '', testConfig);
      expect(result).toBe('my_amazing_blog_post_20250730');
    });

    it('should truncate long blog titles properly', () => {
      const shortConfig = {
        ...testConfig,
        system: {
          ...testConfig.system,
          collection_id: { ...testConfig.system.collection_id, max_length: 25 },
        },
      };

      const result = generateCollectionId('This is a very long blog post title', '', shortConfig);
      // Should be truncated to fit within 25 chars: title_20250730 (needs 11 chars for date)
      // So title part gets 25 - 11 - 1 = 13 chars
      expect(result).toBe('this_is_a_very_l_20250730');
      expect(result.length).toBeLessThanOrEqual(25);
    });

    it('should handle multiple spaces and collapse underscores', () => {
      const result = generateCollectionId('  test   blog    post  ', '', testConfig);
      expect(result).toBe('test_blog_post_20250730');
    });

    it('should work without config (use defaults)', () => {
      const result = generateCollectionId('test title', '');
      // Should use current date but we can't predict it, so just check format
      expect(result).toMatch(/^test_title_\d{8}$/);
    });
  });
});
