import * as path from 'path';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { MockSystemInterface } from '../mocks/MockSystemInterface.js';

describe('ConfigDiscovery', () => {
  let mockSystemInterface: MockSystemInterface;
  let configDiscovery: ConfigDiscovery;

  beforeEach(() => {
    mockSystemInterface = new MockSystemInterface();
    configDiscovery = new ConfigDiscovery(mockSystemInterface);
  });

  describe('findSystemRoot', () => {
    it('should find system root by package.json from current file path', () => {
      const mockPackageJson = { name: 'markdown-workflow' };
      mockSystemInterface.addMockFile(
        '/mock/system/root/package.json',
        JSON.stringify(mockPackageJson),
      );

      // MockSystemInterface.getCurrentFilePath() returns '/mock/system/root'
      const result = configDiscovery.findSystemRoot('/mock/system/root');

      expect(result).toBe('/mock/system/root');
    });

    it('should find system root by package.json from custom start path', () => {
      const mockPackageJson = { name: 'markdown-workflow' };
      mockSystemInterface.addMockFile('/custom/path/package.json', JSON.stringify(mockPackageJson));

      const result = configDiscovery.findSystemRoot('/custom/path/subdir');

      expect(result).toBe('/custom/path');
    });

    it('should return null when system repo not found from start path', () => {
      const mockPackageJson = { name: 'other-project' };
      mockSystemInterface.addMockFile('/custom/path/package.json', JSON.stringify(mockPackageJson));

      const result = configDiscovery.findSystemRoot('/custom/path/subdir');

      expect(result).toBeNull();
    });

    it('should handle invalid package.json gracefully', () => {
      mockSystemInterface.addMockFile('/mock/system/root/package.json', 'invalid json');

      const result = configDiscovery.findSystemRoot();

      expect(result).toBeNull();
    });

    it('should return null when package.json not found', () => {
      // No mock files added, so package.json doesn't exist
      const result = configDiscovery.findSystemRoot('/some/path');

      expect(result).toBeNull();
    });
  });

  describe('findProjectRoot', () => {
    it('should find project root when marker exists', () => {
      const testPath = '/test/project';
      mockSystemInterface.addMockDirectory('/test/project/.markdown-workflow');

      const result = configDiscovery.findProjectRoot(testPath);

      expect(result).toBe(testPath);
    });

    it('should return null when no project root found', () => {
      const testPath = '/test/project';
      // No mock directories added, so marker doesn't exist

      const result = configDiscovery.findProjectRoot(testPath);

      expect(result).toBeNull();
    });
  });

  describe('discoverConfiguration', () => {
    it('should return configuration paths when in project directory', () => {
      const testPath = '/test/project';
      mockSystemInterface.addMockDirectory('/test/project/.markdown-workflow');
      mockSystemInterface.addMockFile(
        '/mock/system/root/package.json',
        JSON.stringify({ name: 'markdown-workflow' }),
      );

      const result = configDiscovery.discoverConfiguration(testPath);

      expect(result).toMatchObject({
        systemRoot: expect.any(String),
        projectRoot: expect.any(String),
        projectConfig: expect.any(String),
      });
    });

    it('should throw error when system root not found', () => {
      const testPath = '/test/project';
      mockSystemInterface.addMockDirectory('/test/project/.markdown-workflow');
      // No system package.json added

      expect(() => {
        configDiscovery.discoverConfiguration(testPath);
      }).toThrow('System root not found. Ensure markdown-workflow is installed.');
    });

    it('should throw error when project root not found', () => {
      const testPath = '/test/project';
      mockSystemInterface.addMockFile(
        '/mock/system/root/package.json',
        JSON.stringify({ name: 'markdown-workflow' }),
      );
      // No project marker directory added

      expect(() => {
        configDiscovery.discoverConfiguration(testPath);
      }).toThrow('Project root not found. Ensure you are in a markdown-workflow project.');
    });
  });

  describe('discoverSystemConfiguration', () => {
    it('should return system configuration without requiring project', () => {
      mockSystemInterface.addMockFile(
        '/mock/system/root/package.json',
        JSON.stringify({ name: 'markdown-workflow' }),
      );
      mockSystemInterface.addMockDirectory('/mock/system/root/workflows');
      mockSystemInterface.addMockDirectory('/mock/system/root/workflows/job');
      mockSystemInterface.addMockDirectory('/mock/system/root/workflows/blog');

      const result = configDiscovery.discoverSystemConfiguration();

      expect(result).toEqual({
        systemRoot: '/mock/system/root',
        availableWorkflows: ['job', 'blog'],
      });
    });

    it('should throw error when system root not found', () => {
      // No system package.json added

      expect(() => {
        configDiscovery.discoverSystemConfiguration();
      }).toThrow('System root not found. Ensure markdown-workflow is installed.');
    });
  });

  describe('loadProjectConfig', () => {
    it('should return null for non-existent config', async () => {
      // No mock file added, so config doesn't exist
      const result = await configDiscovery.loadProjectConfig('/test/config.yml');

      expect(result).toBeNull();
    });

    it('should handle file read errors', async () => {
      // Add file that exists but will cause YAML parsing error
      mockSystemInterface.addMockFile('/test/config.yml', 'invalid: yaml: content: [');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await configDiscovery.loadProjectConfig('/test/config.yml');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading project config from /test/config.yml:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getAvailableWorkflows', () => {
    it('should return workflow directories', () => {
      mockSystemInterface.addMockDirectory('/system/workflows');
      mockSystemInterface.addMockDirectory('/system/workflows/job');
      mockSystemInterface.addMockDirectory('/system/workflows/blog');
      mockSystemInterface.addMockFile('/system/workflows/file.txt', 'content');

      const result = configDiscovery.getAvailableWorkflows('/system');

      expect(result).toEqual(['job', 'blog']);
    });

    it('should return empty array when workflows directory missing', () => {
      // No workflows directory added
      const result = configDiscovery.getAvailableWorkflows('/system');

      expect(result).toEqual([]);
    });

    it('should handle readdir errors', () => {
      // Add workflows directory but don't add any subdirectories
      mockSystemInterface.addMockDirectory('/system/workflows');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = configDiscovery.getAvailableWorkflows('/system');

      expect(result).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('resolveConfiguration', () => {
    it('should resolve complete configuration', async () => {
      const testPath = '/test/project';
      mockSystemInterface.addMockDirectory('/test/project/.markdown-workflow');
      mockSystemInterface.addMockFile(
        '/mock/system/root/package.json',
        JSON.stringify({ name: 'markdown-workflow' }),
      );
      mockSystemInterface.addMockDirectory('/mock/system/root/workflows');
      mockSystemInterface.addMockDirectory('/mock/system/root/workflows/job');
      mockSystemInterface.addMockDirectory('/mock/system/root/workflows/blog');

      const result = await configDiscovery.resolveConfiguration(testPath);

      expect(result).toMatchObject({
        paths: expect.any(Object),
        availableWorkflows: ['job', 'blog'],
      });
    });
  });

  describe('isInProject', () => {
    it('should return true when in project', () => {
      const testPath = '/test/project';
      mockSystemInterface.addMockDirectory('/test/project/.markdown-workflow');

      const result = configDiscovery.isInProject(testPath);

      expect(result).toBe(true);
    });

    it('should return false when not in project', () => {
      const testPath = '/test/project';
      // No project marker directory added

      const result = configDiscovery.isInProject(testPath);

      expect(result).toBe(false);
    });
  });

  describe('requireProjectRoot', () => {
    it('should return project root when found', () => {
      const testPath = '/test/project';
      mockSystemInterface.addMockDirectory('/test/project/.markdown-workflow');

      const result = configDiscovery.requireProjectRoot(testPath);

      expect(result).toBe(testPath);
    });

    it('should throw error when not in project', () => {
      const testPath = '/test/project';
      // No project marker directory added

      expect(() => {
        configDiscovery.requireProjectRoot(testPath);
      }).toThrow('Not in a markdown-workflow project');
    });
  });

  describe('getProjectPaths', () => {
    it('should return correct project paths', () => {
      const projectRoot = '/test/project';

      const result = configDiscovery.getProjectPaths(projectRoot);

      expect(result).toEqual({
        projectDir: path.join(projectRoot, '.markdown-workflow'),
        configFile: path.join(projectRoot, '.markdown-workflow', 'config.yml'),
        workflowsDir: path.join(projectRoot, '.markdown-workflow', 'workflows'),
        collectionsDir: projectRoot, // Collections at project root (job/, blog/, etc.)
      });
    });
  });
});
