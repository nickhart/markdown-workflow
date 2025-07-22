import * as fs from 'fs';
import * as path from 'path';
import { initCommand } from '../../src/cli/commands/init.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { MockSystemInterface } from '../mocks/MockSystemInterface.js';
import { createEnhancedMockFileSystem } from '../helpers/FileSystemHelpers.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('initCommand', () => {
  let mockSystemInterface: MockSystemInterface;
  let configDiscovery: ConfigDiscovery;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr === '/' || pathStr === '') return '/';
      const lastSlash = pathStr.lastIndexOf('/');
      if (lastSlash === 0) return '/';
      if (lastSlash === -1) return '.';
      return pathStr.substring(0, lastSlash);
    });
    mockPath.parse.mockImplementation((p) => {
      const pathStr = String(p);
      const lastSlash = pathStr.lastIndexOf('/');
      const lastDot = pathStr.lastIndexOf('.');
      return {
        root: '/',
        dir: lastSlash >= 0 ? pathStr.substring(0, lastSlash) || '/' : '/',
        base: lastSlash >= 0 ? pathStr.substring(lastSlash + 1) : pathStr,
        ext: lastDot > lastSlash ? pathStr.substring(lastDot) : '',
        name:
          lastSlash >= 0
            ? lastDot > lastSlash
              ? pathStr.substring(lastSlash + 1, lastDot)
              : pathStr.substring(lastSlash + 1)
            : lastDot >= 0
              ? pathStr.substring(0, lastDot)
              : pathStr,
      };
    });

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create enhanced mock filesystem with system structure
    mockSystemInterface = createEnhancedMockFileSystem();
    configDiscovery = new ConfigDiscovery(mockSystemInterface);

    // Setup fs mocks
    mockFs.mkdirSync.mockImplementation();
    mockFs.writeFileSync.mockImplementation();
    mockFs.existsSync.mockImplementation((path) => {
      return mockSystemInterface.existsSync(path.toString());
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('clean directory initialization', () => {
    it('should initialize project successfully in clean directory', async () => {
      // Test directory without any existing project
      const testDir = '/test/clean-directory';

      await initCommand({
        cwd: testDir,
        configDiscovery,
      });

      // Should create project directories
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(`${testDir}/.markdown-workflow`, {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(`${testDir}/.markdown-workflow/workflows`, {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(`${testDir}/.markdown-workflow/collections`, {
        recursive: true,
      });

      // Should create config file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        `${testDir}/.markdown-workflow/config.yml`,
        expect.stringContaining('# Markdown Workflow Configuration'),
      );

      // Should create workflow directories for available workflows
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(`${testDir}/.markdown-workflow/workflows/job`, {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        `${testDir}/.markdown-workflow/workflows/blog`,
        { recursive: true },
      );

      // Should create README files for workflows
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        `${testDir}/.markdown-workflow/workflows/job/README.md`,
        expect.stringContaining('# Job Workflow Customization'),
      );

      // Should log success
      expect(console.log).toHaveBeenCalledWith('✅ Project initialized successfully!');
    });

    it('should initialize with specific workflows when requested', async () => {
      const testDir = '/test/specific-workflows';

      await initCommand({
        cwd: testDir,
        workflows: ['job'],
        configDiscovery,
      });

      // Should only create job workflow directory
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(`${testDir}/.markdown-workflow/workflows/job`, {
        recursive: true,
      });

      // Should NOT create blog workflow directory
      expect(mockFs.mkdirSync).not.toHaveBeenCalledWith(
        `${testDir}/.markdown-workflow/workflows/blog`,
        { recursive: true },
      );
    });

    it('should reject unknown workflows', async () => {
      const testDir = '/test/unknown-workflow';

      await expect(
        initCommand({
          cwd: testDir,
          workflows: ['unknown', 'invalid'],
          configDiscovery,
        }),
      ).rejects.toThrow('Unknown workflows: unknown, invalid. Available: blog, job');
    });
  });

  describe('existing project handling', () => {
    beforeEach(() => {
      // Create a mock system with an existing project
      mockSystemInterface.addMockDirectory('/test/existing-project/.markdown-workflow');
      mockSystemInterface.addMockFile(
        '/test/existing-project/.markdown-workflow/config.yml',
        'user:\n  name: "Existing User"',
      );
    });

    it('should throw error when project already exists without --force', async () => {
      const testDir = '/test/existing-project';

      await expect(
        initCommand({
          cwd: testDir,
          configDiscovery,
        }),
      ).rejects.toThrow('Already in a markdown-workflow project. Use --force to reinitialize.');

      // Should not create any directories
      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should reinitialize successfully with --force', async () => {
      const testDir = '/test/existing-project';

      await initCommand({
        cwd: testDir,
        force: true,
        configDiscovery,
      });

      // Should create project directories (reinitialize)
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(`${testDir}/.markdown-workflow`, {
        recursive: true,
      });

      // Should create new config file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        `${testDir}/.markdown-workflow/config.yml`,
        expect.stringContaining('# Markdown Workflow Configuration'),
      );

      // Should log success
      expect(console.log).toHaveBeenCalledWith('✅ Project initialized successfully!');
    });
  });

  describe('configuration file creation', () => {
    it('should create default config with proper structure', async () => {
      const testDir = '/test/config-test';

      await initCommand({
        cwd: testDir,
        configDiscovery,
      });

      // Find the config file creation call
      const configCall = mockFs.writeFileSync.mock.calls.find((call) =>
        call[0].toString().includes('config.yml'),
      );

      expect(configCall).toBeDefined();
      const configContent = configCall![1] as string;

      // Should contain user section
      expect(configContent).toContain('user:');
      expect(configContent).toContain('name: "Your Name"');
      expect(configContent).toContain('email: "your.email@example.com"');

      // Should contain system section
      expect(configContent).toContain('system:');
      expect(configContent).toContain('scraper: "wget"');

      // Should contain workflows section
      expect(configContent).toContain('workflows:');
      expect(configContent).toContain('job:');
    });

    it('should create workflow README files', async () => {
      const testDir = '/test/readme-test';

      await initCommand({
        cwd: testDir,
        workflows: ['job'],
        configDiscovery,
      });

      // Should create job workflow README
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        `${testDir}/.markdown-workflow/workflows/job/README.md`,
        expect.stringContaining('# Job Workflow Customization'),
      );

      // Find the README content
      const readmeCall = mockFs.writeFileSync.mock.calls.find((call) =>
        call[0].toString().includes('job/README.md'),
      );

      expect(readmeCall).toBeDefined();
      const readmeContent = readmeCall![1] as string;

      expect(readmeContent).toContain('workflow.yml');
      expect(readmeContent).toContain('templates/');
      expect(readmeContent).toContain('Template Resolution');
    });
  });

  describe('error handling', () => {
    it('should handle filesystem errors gracefully', async () => {
      const testDir = '/test/error-handling';

      // Mock filesystem error
      mockFs.mkdirSync.mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      await expect(
        initCommand({
          cwd: testDir,
          configDiscovery,
        }),
      ).rejects.toThrow('Permission denied');
    });
  });
});
