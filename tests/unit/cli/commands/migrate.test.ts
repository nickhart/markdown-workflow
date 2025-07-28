import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { migrateCommand, listMigrationWorkflows } from '../../../../src/cli/commands/migrate.js';

// Mock JobApplicationMigrator
const mockMigrateJobApplications = jest.fn();
jest.mock('../../../../src/core/job-application-migrator.js', () => ({
  JobApplicationMigrator: jest.fn().mockImplementation(() => ({
    migrateJobApplications: mockMigrateJobApplications,
  })),
}));

// Mock ConfigDiscovery
const mockRequireProjectRoot = jest.fn().mockReturnValue('/mock/project');
jest.mock('../../../../src/core/config-discovery.js', () => ({
  ConfigDiscovery: jest.fn().mockImplementation(() => ({
    requireProjectRoot: mockRequireProjectRoot,
  })),
}));

// Mock console methods
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {}),
};

describe('migrate command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('migrateCommand', () => {
    it('should successfully migrate job applications', async () => {
      const mockSummary = {
        total: 5,
        successful: 5,
        failed: 0,
        results: [
          {
            success: true,
            applicationId: 'app1',
            sourcePath: '/source/app1',
            targetPath: '/target/app1',
          },
          {
            success: true,
            applicationId: 'app2',
            sourcePath: '/source/app2',
            targetPath: '/target/app2',
          },
          {
            success: true,
            applicationId: 'app3',
            sourcePath: '/source/app3',
            targetPath: '/target/app3',
          },
          {
            success: true,
            applicationId: 'app4',
            sourcePath: '/source/app4',
            targetPath: '/target/app4',
          },
          {
            success: true,
            applicationId: 'app5',
            sourcePath: '/source/app5',
            targetPath: '/target/app5',
          },
        ],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      await migrateCommand('job', '/source/path', {
        dryRun: false,
        force: false,
      });

      // Verify migrator was called with correct parameters
      expect(mockMigrateJobApplications).toHaveBeenCalledWith('/source/path', {
        dryRun: false,
        force: false,
      });

      // Verify success message was logged
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Successfully migrated 5 applications'),
      );
    });

    it('should handle dry run mode', async () => {
      const mockSummary = {
        total: 3,
        successful: 3,
        failed: 0,
        results: [],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      await migrateCommand('job', '/source/path', {
        dryRun: true,
        force: false,
      });

      expect(mockMigrateJobApplications).toHaveBeenCalledWith('/source/path', {
        dryRun: true,
        force: false,
      });

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('DRY RUN: No changes will be made'),
      );
    });

    it('should handle force mode', async () => {
      const mockSummary = {
        total: 2,
        successful: 2,
        failed: 0,
        results: [],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      await migrateCommand('job', '/source/path', {
        dryRun: false,
        force: true,
      });

      expect(mockMigrateJobApplications).toHaveBeenCalledWith('/source/path', {
        dryRun: false,
        force: true,
      });

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('FORCE MODE: Existing collections will be overwritten'),
      );
    });

    it('should handle migration failures', async () => {
      const mockSummary = {
        total: 3,
        successful: 1,
        failed: 2,
        results: [
          {
            success: true,
            applicationId: 'app1',
            sourcePath: '/source/app1',
            targetPath: '/target/app1',
          },
          {
            success: false,
            applicationId: 'app2',
            sourcePath: '/source/app2',
            error: 'Missing application.yml',
          },
          {
            success: false,
            applicationId: 'app3',
            sourcePath: '/source/app3',
            error: 'Target already exists',
          },
        ],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      // Mock process.exit to prevent actual exit
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      await migrateCommand('job', '/source/path', {});

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Migration completed with 2 failures'),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle no applications to migrate', async () => {
      const mockSummary = {
        total: 0,
        successful: 0,
        failed: 0,
        results: [],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      await migrateCommand('job', '/source/path', {});

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('No applications found to migrate'),
      );
    });

    it('should reject unsupported workflow types', async () => {
      await expect(migrateCommand('blog', '/source/path', {})).rejects.toThrow(
        'Unsupported workflow for migration: blog',
      );
    });

    it('should handle project root detection', async () => {
      mockRequireProjectRoot.mockReturnValue('/detected/project');

      const mockSummary = {
        total: 1,
        successful: 1,
        failed: 0,
        results: [],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      await migrateCommand('job', '/source/path', {
        cwd: '/custom/working/dir',
      });

      expect(mockRequireProjectRoot).toHaveBeenCalledWith('/custom/working/dir');
    });

    it('should handle migration errors', async () => {
      const error = new Error('Migration failed due to disk space');
      mockMigrateJobApplications.mockRejectedValue(error);

      await expect(migrateCommand('job', '/source/path', {})).rejects.toThrow(
        'Migration failed due to disk space',
      );

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '❌ Migration failed: Migration failed due to disk space',
      );
    });

    it('should provide next steps after successful migration', async () => {
      const mockSummary = {
        total: 2,
        successful: 2,
        failed: 0,
        results: [],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      await migrateCommand('job', '/source/path', {
        dryRun: false,
      });

      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('Next steps:'));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('wf list job'));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('wf format job'));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('wf status job'));
    });

    it('should not show next steps for dry run', async () => {
      const mockSummary = {
        total: 2,
        successful: 2,
        failed: 0,
        results: [],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      await migrateCommand('job', '/source/path', {
        dryRun: true,
      });

      expect(consoleSpy.log).not.toHaveBeenCalledWith(expect.stringContaining('Next steps:'));
    });
  });

  describe('listMigrationWorkflows', () => {
    it('should list available migration workflows', async () => {
      await listMigrationWorkflows();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('AVAILABLE WORKFLOWS FOR MIGRATION'),
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('1. job'));
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('wf migrate job <source_path>'),
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('--dry-run'));
      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('--force'));
    });

    it('should provide usage examples', async () => {
      await listMigrationWorkflows();

      expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('Examples:'));
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('./old-writing-system --dry-run'),
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('~/legacy-markdown-workflow --force'),
      );
    });

    it('should explain command line options', async () => {
      await listMigrationWorkflows();

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Preview changes without modifying files'),
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Overwrite existing collections'),
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('"applications" directory'),
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('application.yml format'),
      );
    });
  });

  describe('integration with ConfigDiscovery', () => {
    it('should use default cwd when not provided', async () => {
      const mockSummary = {
        total: 1,
        successful: 1,
        failed: 0,
        results: [],
      };

      mockMigrateJobApplications.mockResolvedValue(mockSummary);

      await migrateCommand('job', '/source/path', {});

      expect(mockRequireProjectRoot).toHaveBeenCalledWith(process.cwd());
    });
  });
});
