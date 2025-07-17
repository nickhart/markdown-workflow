import * as fs from 'fs';
import * as path from 'path';
import { initCommand } from '../../src/cli/commands/init.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/core/ConfigDiscovery.js');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockConfigDiscovery = ConfigDiscovery as jest.Mocked<typeof ConfigDiscovery>;

describe('initCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();

    // Setup default ConfigDiscovery mocks
    mockConfigDiscovery.isInProject.mockReturnValue(false);
    mockConfigDiscovery.resolveConfiguration.mockResolvedValue({
      paths: {
        systemRoot: '/system',
        projectRoot: null,
        projectConfig: undefined,
      },
      availableWorkflows: ['job', 'blog'],
    });
    mockConfigDiscovery.getProjectPaths.mockReturnValue({
      projectDir: '/test/.markdown-workflow',
      configFile: '/test/.markdown-workflow/config.yml',
      workflowsDir: '/test/.markdown-workflow/workflows',
      collectionsDir: '/test/.markdown-workflow/collections',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization validation', () => {
    it('should throw error if already in project without force', async () => {
      mockConfigDiscovery.isInProject.mockReturnValue(true);

      await expect(initCommand({ cwd: '/test' })).rejects.toThrow(
        'Already in a markdown-workflow project. Use --force to reinitialize.',
      );
    });

    it('should proceed if already in project with force', async () => {
      mockConfigDiscovery.isInProject.mockReturnValue(true);

      await expect(initCommand({ cwd: '/test', force: true })).resolves.not.toThrow();
    });

    it('should throw error for unknown workflows', async () => {
      await expect(
        initCommand({
          cwd: '/test',
          workflows: ['unknown-workflow'],
        }),
      ).rejects.toThrow('Unknown workflows: unknown-workflow');
    });

    it('should validate multiple unknown workflows', async () => {
      await expect(
        initCommand({
          cwd: '/test',
          workflows: ['unknown1', 'unknown2'],
        }),
      ).rejects.toThrow('Unknown workflows: unknown1, unknown2');
    });
  });

  describe('project structure creation', () => {
    it('should create project directories', async () => {
      await initCommand({ cwd: '/test' });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/.markdown-workflow', {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/.markdown-workflow/workflows', {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/.markdown-workflow/collections', {
        recursive: true,
      });
    });

    it('should create workflow directories', async () => {
      await initCommand({ cwd: '/test', workflows: ['job'] });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/.markdown-workflow/workflows/job', {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        '/test/.markdown-workflow/workflows/job/templates',
        { recursive: true },
      );
    });

    it('should create README files for workflows', async () => {
      await initCommand({ cwd: '/test', workflows: ['job'] });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/.markdown-workflow/workflows/job/README.md',
        expect.stringContaining('# Job Workflow Customization'),
      );
    });

    it('should create config file', async () => {
      await initCommand({ cwd: '/test' });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/.markdown-workflow/config.yml',
        expect.stringContaining('# Markdown Workflow Configuration'),
      );
    });
  });

  describe('configuration handling', () => {
    it('should use default workflows when none specified', async () => {
      await initCommand({ cwd: '/test' });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/.markdown-workflow/workflows/job', {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/.markdown-workflow/workflows/blog', {
        recursive: true,
      });
    });

    it('should use specified workflows', async () => {
      await initCommand({ cwd: '/test', workflows: ['job'] });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/.markdown-workflow/workflows/job', {
        recursive: true,
      });
      expect(mockFs.mkdirSync).not.toHaveBeenCalledWith('/test/.markdown-workflow/workflows/blog', {
        recursive: true,
      });
    });

    it('should use current directory when no cwd specified', async () => {
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockReturnValue('/current');

      await initCommand({});

      expect(mockConfigDiscovery.isInProject).toHaveBeenCalledWith('/current');

      process.cwd = originalCwd;
    });
  });

  describe('config file content', () => {
    it('should create config with user section', async () => {
      await initCommand({ cwd: '/test' });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/.markdown-workflow/config.yml',
        expect.stringContaining('user:'),
      );
    });

    it('should create config with system section', async () => {
      await initCommand({ cwd: '/test' });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/.markdown-workflow/config.yml',
        expect.stringContaining('system:'),
      );
    });

    it('should create config with workflows section', async () => {
      await initCommand({ cwd: '/test' });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/.markdown-workflow/config.yml',
        expect.stringContaining('workflows:'),
      );
    });

    it('should include default user information', async () => {
      await initCommand({ cwd: '/test' });

      const writeCall = mockFs.writeFileSync.mock.calls.find(
        (call) => call[0] === '/test/.markdown-workflow/config.yml',
      );

      expect(writeCall?.[1]).toContain('name: "Your Name"');
      expect(writeCall?.[1]).toContain('email: "your.email@example.com"');
    });
  });

  describe('console output', () => {
    it('should log initialization messages', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      await initCommand({ cwd: '/test' });

      expect(consoleSpy).toHaveBeenCalledWith('Initializing markdown-workflow project...');
      expect(consoleSpy).toHaveBeenCalledWith('Location: /test');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Project initialized successfully!');
    });

    it('should log workflows being initialized', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      await initCommand({ cwd: '/test', workflows: ['job'] });

      expect(consoleSpy).toHaveBeenCalledWith('Workflows: job');
    });

    it('should log next steps', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      await initCommand({ cwd: '/test' });

      expect(consoleSpy).toHaveBeenCalledWith('Next steps:');
      expect(consoleSpy).toHaveBeenCalledWith(
        '  1. Edit .markdown-workflow/config.yml with your information',
      );
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(initCommand({ cwd: '/test' })).rejects.toThrow('Permission denied');
    });

    it('should handle config discovery errors', async () => {
      mockConfigDiscovery.resolveConfiguration.mockRejectedValue(new Error('Discovery failed'));

      await expect(initCommand({ cwd: '/test' })).rejects.toThrow('Discovery failed');
    });
  });
});
