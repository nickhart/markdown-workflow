import {
  logSuccess,
  logError,
  logWarning,
  logInfo,
  logCollectionCreation,
  logCollectionUpdate,
  logScrapingSuccess,
  logScrapingError,
  logNextSteps,
  logTemplateUsage,
  logFileCreation,
  logForceRecreation,
} from '../../../src/cli/shared/formatting-utils.js';

describe('Formatting Utils', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    error: jest.SpyInstance;
    warn: jest.SpyInstance;
  };

  beforeEach(() => {
    // Setup console spies
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic logging functions', () => {
    it('should log success messages with checkmark', () => {
      logSuccess('Operation completed');
      expect(consoleSpy.log).toHaveBeenCalledWith('✅ Operation completed');
    });

    it('should log error messages with X mark', () => {
      logError('Something went wrong');
      expect(consoleSpy.error).toHaveBeenCalledWith('❌ Something went wrong');
    });

    it('should log warning messages with warning symbol', () => {
      logWarning('Be careful');
      expect(consoleSpy.warn).toHaveBeenCalledWith('⚠️ Be careful');
    });

    it('should log info messages with info symbol', () => {
      logInfo('Here is some information');
      expect(consoleSpy.log).toHaveBeenCalledWith('ℹ️ Here is some information');
    });
  });

  describe('Collection-specific logging', () => {
    it('should log collection creation with standard format', () => {
      logCollectionCreation('test_company_engineer_20250121', '/path/to/collection');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Creating collection: test_company_engineer_20250121',
      );
      expect(consoleSpy.log).toHaveBeenCalledWith('Location: /path/to/collection');
    });

    it('should log collection updates with standard format', () => {
      logCollectionUpdate('test_company_engineer_20250121', '/path/to/collection');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Updating collection: test_company_engineer_20250121',
      );
      expect(consoleSpy.log).toHaveBeenCalledWith('Location: /path/to/collection');
    });

    it('should log force recreation with standard format', () => {
      logForceRecreation('test_company_engineer_20250121', '/path/to/collection');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        'Force recreating collection: test_company_engineer_20250121',
      );
      expect(consoleSpy.log).toHaveBeenCalledWith('Location: /path/to/collection');
    });
  });

  describe('Scraping-specific logging', () => {
    it('should log successful scraping with method and file', () => {
      logScrapingSuccess('wget', 'job_description.html');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '✅ Successfully scraped using wget: job_description.html',
      );
    });

    it('should log scraping errors', () => {
      logScrapingError('Network timeout');
      expect(consoleSpy.error).toHaveBeenCalledWith('❌ Failed to scrape URL: Network timeout');
    });
  });

  describe('Template and file logging', () => {
    it('should log template usage', () => {
      logTemplateUsage('/path/to/template.md');
      expect(consoleSpy.log).toHaveBeenCalledWith('Using template: /path/to/template.md');
    });

    it('should log file creation', () => {
      logFileCreation('resume_john_doe.md');
      expect(consoleSpy.log).toHaveBeenCalledWith('Created: resume_john_doe.md');
    });
  });

  describe('Next steps logging', () => {
    it('should log formatted next steps with proper workflow commands', () => {
      logNextSteps('job', 'test_company_engineer_20250121', '/path/to/collection');

      expect(consoleSpy.log).toHaveBeenCalledWith('');
      expect(consoleSpy.log).toHaveBeenCalledWith('Next steps:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  1. Edit files in /path/to/collection');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '  2. Run wf format job test_company_engineer_20250121 to convert to DOCX',
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '  3. Run wf status job test_company_engineer_20250121 <status> to update status',
      );
    });

    it('should work with different workflow names', () => {
      logNextSteps('blog', 'my_blog_post_20250121', '/path/to/blog');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '  2. Run wf format blog my_blog_post_20250121 to convert to DOCX',
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '  3. Run wf status blog my_blog_post_20250121 <status> to update status',
      );
    });
  });

  describe('Console call verification', () => {
    it('should use console.log for most messages', () => {
      logSuccess('test');
      logInfo('test');
      logCollectionCreation('test', 'test'); // This makes 2 calls: collection and location
      logTemplateUsage('test');

      expect(consoleSpy.log).toHaveBeenCalledTimes(5); // Updated count
      expect(consoleSpy.error).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should use console.error for error messages', () => {
      logError('test error');
      logScrapingError('scrape error');

      expect(consoleSpy.error).toHaveBeenCalledTimes(2);
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should use console.warn for warning messages', () => {
      logWarning('test warning');

      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });
});
