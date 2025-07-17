import * as fs from 'fs';
import * as path from 'path';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { ConfigPaths, ResolvedConfig } from '../../src/core/types.js';

// Mock only fs module, not path
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findSystemRoot', () => {
    it('should find system root by package.json', () => {
      const mockPackageJson = { name: 'markdown-workflow' };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

      const result = ConfigDiscovery.findSystemRoot();

      expect(result).toBeDefined();
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });

    it('should handle invalid package.json gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      const result = ConfigDiscovery.findSystemRoot();

      expect(result).toBeDefined();
    });

    it('should return fallback path when package.json not found', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = ConfigDiscovery.findSystemRoot();

      expect(result).toBeDefined();
    });
  });

  describe('findProjectRoot', () => {
    it('should find project root when marker exists', () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      const result = ConfigDiscovery.findProjectRoot(testPath);

      expect(result).toBe(testPath);
    });

    it('should return null when no project root found', () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(false);

      const result = ConfigDiscovery.findProjectRoot(testPath);

      expect(result).toBeNull();
    });
  });

  describe('discoverConfiguration', () => {
    it('should return configuration paths', () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      const result = ConfigDiscovery.discoverConfiguration(testPath);

      expect(result).toMatchObject({
        systemRoot: expect.any(String),
        projectRoot: expect.any(String),
        projectConfig: expect.any(String),
      });
    });

    it('should handle missing project root', () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(false);

      const result = ConfigDiscovery.discoverConfiguration(testPath);

      expect(result).toMatchObject({
        systemRoot: expect.any(String),
        projectRoot: null,
        projectConfig: undefined,
      });
    });
  });

  describe('loadProjectConfig', () => {
    it('should return null for non-existent config', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await ConfigDiscovery.loadProjectConfig('/test/config.yml');

      expect(result).toBeNull();
    });

    it('should handle file read errors', async () => {
      mockFs.existsSync.mockReturnValue(true);
      // Mock console.log to throw an error to trigger the catch block
      const originalConsoleLog = console.log;
      console.log = jest.fn().mockImplementation(() => {
        throw new Error('File read error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await ConfigDiscovery.loadProjectConfig('/test/config.yml');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading project config from /test/config.yml:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
      console.log = originalConsoleLog;
    });
  });

  describe('getAvailableWorkflows', () => {
    it('should return workflow directories', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'job', isDirectory: () => true },
        { name: 'blog', isDirectory: () => true },
        { name: 'file.txt', isDirectory: () => false },
      ] as any);

      const result = ConfigDiscovery.getAvailableWorkflows('/system');

      expect(result).toEqual(['job', 'blog']);
    });

    it('should return empty array when workflows directory missing', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = ConfigDiscovery.getAvailableWorkflows('/system');

      expect(result).toEqual([]);
    });

    it('should handle readdir errors', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = ConfigDiscovery.getAvailableWorkflows('/system');

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('resolveConfiguration', () => {
    it('should resolve complete configuration', async () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
      mockFs.readdirSync.mockReturnValue([
        { name: 'job', isDirectory: () => true },
        { name: 'blog', isDirectory: () => true },
      ] as any);

      const result = await ConfigDiscovery.resolveConfiguration(testPath);

      expect(result).toMatchObject({
        paths: expect.any(Object),
        availableWorkflows: ['job', 'blog'],
      });
    });
  });

  describe('isInProject', () => {
    it('should return true when in project', () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      const result = ConfigDiscovery.isInProject(testPath);

      expect(result).toBe(true);
    });

    it('should return false when not in project', () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(false);

      const result = ConfigDiscovery.isInProject(testPath);

      expect(result).toBe(false);
    });
  });

  describe('requireProjectRoot', () => {
    it('should return project root when found', () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);

      const result = ConfigDiscovery.requireProjectRoot(testPath);

      expect(result).toBe(testPath);
    });

    it('should throw error when not in project', () => {
      const testPath = '/test/project';
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        ConfigDiscovery.requireProjectRoot(testPath);
      }).toThrow('Not in a markdown-workflow project');
    });
  });

  describe('getProjectPaths', () => {
    it('should return correct project paths', () => {
      const projectRoot = '/test/project';

      const result = ConfigDiscovery.getProjectPaths(projectRoot);

      expect(result).toEqual({
        projectDir: path.join(projectRoot, '.markdown-workflow'),
        configFile: path.join(projectRoot, '.markdown-workflow', 'config.yml'),
        workflowsDir: path.join(projectRoot, '.markdown-workflow', 'workflows'),
        collectionsDir: path.join(projectRoot, '.markdown-workflow', 'collections'),
      });
    });
  });
});
