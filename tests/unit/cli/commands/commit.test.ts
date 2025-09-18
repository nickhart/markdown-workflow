import { execSync } from 'child_process';
import { commitCommand } from '../../../../src/cli/commands/commit';
import { WorkflowOrchestrator } from '../../../../src/services/workflow-orchestrator';
import { ConfigDiscovery } from '../../../../src/engine/config-discovery';
import { Collection } from '../../../../src/engine/types';

// Mock child_process
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// Mock WorkflowOrchestrator
jest.mock('../../../../src/services/workflow-orchestrator');

// Mock ConfigDiscovery
jest.mock('../../../../src/engine/config-discovery');

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('commitCommand', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockOrchestrator: jest.Mocked<WorkflowOrchestrator>;
  let mockExecSync: jest.MockedFunction<typeof execSync>;

  const mockProjectRoot = '/mock/project';
  const mockCollection: Collection = {
    metadata: {
      collection_id: 'test_company_engineer_20250918',
      workflow: 'job',
      status: 'submitted',
      date_created: '2025-09-18T10:00:00.000Z',
      date_modified: '2025-09-18T11:00:00.000Z',
      company: 'Test Company',
      role: 'Engineer',
      status_history: [
        { status: 'active', date: '2025-09-18T10:00:00.000Z' },
        { status: 'submitted', date: '2025-09-18T11:00:00.000Z' },
      ],
    },
    artifacts: ['resume_test_user.md', 'cover_letter_test_user.md'],
    path: '/mock/project/job/submitted/test_company_engineer_20250918',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

    // Setup ConfigDiscovery mock
    mockConfigDiscovery = {
      requireProjectRoot: jest.fn().mockReturnValue(mockProjectRoot),
    } as Partial<ConfigDiscovery> as jest.Mocked<ConfigDiscovery>;

    // Setup WorkflowOrchestrator mock
    mockOrchestrator = {
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      getCollection: jest.fn().mockResolvedValue(mockCollection),
      getProjectConfig: jest.fn().mockResolvedValue(null),
    } as Partial<WorkflowOrchestrator> as jest.Mocked<WorkflowOrchestrator>;

    // Mock the constructor to return our mock
    (WorkflowOrchestrator as jest.MockedClass<typeof WorkflowOrchestrator>).mockImplementation(
      () => mockOrchestrator,
    );

    // Mock git repository check
    mockExecSync.mockImplementation((command: string) => {
      if (command === 'git rev-parse --git-dir') {
        return '.git';
      }
      if (command === 'git status --porcelain') {
        return '';
      }
      return '';
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('validation', () => {
    it('should throw error if not in a project', async () => {
      mockConfigDiscovery.requireProjectRoot.mockImplementation(() => {
        throw new Error('Not in a project');
      });

      await expect(
        commitCommand('job', 'test_collection', {
          configDiscovery: mockConfigDiscovery,
        }),
      ).rejects.toThrow('Not in a project');
    });

    it('should throw error if not in a git repository', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          throw new Error('Not a git repository');
        }
        return '';
      });

      await expect(commitCommand('job', 'test_collection')).rejects.toThrow(
        'Not in a git repository. Initialize git with: git init',
      );
    });

    it('should throw error for unknown workflow', async () => {
      await expect(commitCommand('unknown', 'test_collection')).rejects.toThrow(
        'Unknown workflow: unknown. Available: job, blog',
      );
    });

    it('should throw error if collection not found', async () => {
      mockOrchestrator.getCollection.mockResolvedValue(null);

      await expect(commitCommand('job', 'nonexistent')).rejects.toThrow(
        'Collection not found: nonexistent',
      );
    });
  });

  describe('git changes analysis', () => {
    it('should detect added files for new collection', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          return `A  job/active/test_company_engineer_20250918/collection.yml
A  job/active/test_company_engineer_20250918/resume_test_user.md
A  job/active/test_company_engineer_20250918/cover_letter_test_user.md`;
        }
        return '';
      });

      await commitCommand('job', 'test_company_engineer_20250918', {
        cwd: mockProjectRoot,
        configDiscovery: mockConfigDiscovery,
        message: 'Test commit',
      });

      // Verify git add was called for collection files
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git add'),
        expect.any(Object),
      );
    });

    it('should detect deleted files from status change', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          // Simulate files moved from active to submitted
          return `D  job/active/test_company_engineer_20250918/collection.yml
D  job/active/test_company_engineer_20250918/resume_test_user.md
D  job/active/test_company_engineer_20250918/cover_letter_test_user.md
A  job/submitted/test_company_engineer_20250918/collection.yml
A  job/submitted/test_company_engineer_20250918/resume_test_user.md
A  job/submitted/test_company_engineer_20250918/cover_letter_test_user.md`;
        }
        return '';
      });

      await commitCommand('job', 'test_company_engineer_20250918', {
        cwd: mockProjectRoot,
        configDiscovery: mockConfigDiscovery,
        message: 'Test commit',
      });

      // Verify both deleted and added files are staged
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git add'),
        expect.any(Object),
      );
    });

    it('should detect modified files', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          return `M  job/submitted/test_company_engineer_20250918/collection.yml
M  job/submitted/test_company_engineer_20250918/resume_test_user.md`;
        }
        return '';
      });

      await commitCommand('job', 'test_company_engineer_20250918', {
        cwd: mockProjectRoot,
        configDiscovery: mockConfigDiscovery,
        message: 'Test commit',
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git add'),
        expect.any(Object),
      );
    });
  });

  describe('status change detection', () => {
    it('should detect status change from collection path vs expected path', async () => {
      // Collection is in submitted but path shows active (indicating it was just moved)
      const collectionInActiveDir: Collection = {
        ...mockCollection,
        path: '/mock/project/job/active/test_company_engineer_20250918',
      };

      mockOrchestrator.getCollection.mockResolvedValue(collectionInActiveDir);

      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          return `D  job/active/test_company_engineer_20250918/collection.yml
A  job/submitted/test_company_engineer_20250918/collection.yml`;
        }
        if (command.includes('git commit')) {
          // Verify the commit message includes status change info
          expect(command).toContain('moved Test Company Engineer');
          expect(command).toContain('from active to submitted');
          return '';
        }
        return '';
      });

      await commitCommand('job', 'test_company_engineer_20250918', {
        cwd: mockProjectRoot,
        configDiscovery: mockConfigDiscovery,
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git commit'),
        expect.any(Object),
      );
    });

    it('should detect status change from status history', async () => {
      // Collection with multiple status changes
      const collectionWithHistory: Collection = {
        ...mockCollection,
        metadata: {
          ...mockCollection.metadata,
          status: 'interview',
          status_history: [
            { status: 'active', date: '2025-09-18T10:00:00.000Z' },
            { status: 'submitted', date: '2025-09-18T11:00:00.000Z' },
            { status: 'interview', date: '2025-09-18T12:00:00.000Z' },
          ],
        },
        path: '/mock/project/job/interview/test_company_engineer_20250918',
      };

      mockOrchestrator.getCollection.mockResolvedValue(collectionWithHistory);

      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          return `M  job/interview/test_company_engineer_20250918/collection.yml`;
        }
        if (command.includes('git commit')) {
          // Should not show status change since path matches expected path
          expect(command).toContain('updated Test Company Engineer');
          expect(command).not.toContain('moved');
          return '';
        }
        return '';
      });

      await commitCommand('job', 'test_company_engineer_20250918', {
        cwd: mockProjectRoot,
        configDiscovery: mockConfigDiscovery,
      });
    });
  });

  describe('commit message generation', () => {
    it('should use custom message when provided', async () => {
      const customMessage = 'Custom commit message';

      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          return `M  job/submitted/test_company_engineer_20250918/collection.yml`;
        }
        if (command.includes('git commit')) {
          expect(command).toContain(customMessage);
          return '';
        }
        return '';
      });

      await commitCommand('job', 'test_company_engineer_20250918', {
        cwd: mockProjectRoot,
        configDiscovery: mockConfigDiscovery,
        message: customMessage,
      });
    });

    it('should generate default message for regular updates', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          return `M  job/submitted/test_company_engineer_20250918/resume_test_user.md`;
        }
        if (command.includes('git commit')) {
          expect(command).toContain('updated Test Company Engineer');
          expect(command).toContain('modified');
          expect(command).toContain('resume_test_user.md');
          return '';
        }
        return '';
      });

      await commitCommand('job', 'test_company_engineer_20250918', {
        cwd: mockProjectRoot,
        configDiscovery: mockConfigDiscovery,
      });
    });
  });

  describe('no changes handling', () => {
    it('should handle no changes gracefully', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          return ''; // No changes
        }
        return '';
      });

      await commitCommand('job', 'test_company_engineer_20250918', {
        cwd: mockProjectRoot,
        configDiscovery: mockConfigDiscovery,
      });

      // Should not attempt to commit
      expect(mockExecSync).not.toHaveBeenCalledWith(
        expect.stringContaining('git commit'),
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('should handle git command errors gracefully', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          throw new Error('Git command failed');
        }
        return '';
      });

      // Should not throw - errors in git analysis should be handled gracefully
      await expect(
        commitCommand('job', 'test_company_engineer_20250918', {
          cwd: mockProjectRoot,
          configDiscovery: mockConfigDiscovery,
        }),
      ).resolves.not.toThrow();
    });

    it('should throw on git commit failure', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command === 'git rev-parse --git-dir') {
          return '.git';
        }
        if (command === 'git status --porcelain') {
          return `M  job/submitted/test_company_engineer_20250918/collection.yml`;
        }
        if (command.includes('git commit')) {
          throw new Error('Commit failed');
        }
        return '';
      });

      await expect(
        commitCommand('job', 'test_company_engineer_20250918', {
          cwd: mockProjectRoot,
          configDiscovery: mockConfigDiscovery,
        }),
      ).rejects.toThrow('Git commit failed: Commit failed');
    });
  });
});
