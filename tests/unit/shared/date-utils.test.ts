import { formatDate } from '../../../src/shared/date-utils.js';
import { ProjectConfig } from '../../../src/core/schemas.js';

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
});
