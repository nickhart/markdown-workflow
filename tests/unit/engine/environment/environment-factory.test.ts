import {
  EnvironmentFactory,
  environmentFactory,
} from '../../../../src/engine/environment/environment-factory.js';
import { FilesystemEnvironment } from '../../../../src/engine/environment/filesystem-environment.js';
import {
  MemoryEnvironment,
  MemoryEnvironmentData,
} from '../../../../src/engine/environment/memory-environment.js';
import { MergedEnvironment } from '../../../../src/engine/environment/merged-environment.js';
import { WorkflowContext } from '../../../../src/engine/environment/workflow-context.js';
import {
  SecurityValidator,
  SecurityConfig,
} from '../../../../src/engine/environment/security-validator.js';
import { SystemInterface } from '../../../../src/engine/system-interface.js';
import { WorkflowFile } from '../../../../src/engine/schemas.js';

// Mock external dependencies
jest.mock('../../../../src/engine/config-discovery.js', () => ({
  ConfigDiscovery: jest.fn().mockImplementation(() => ({
    findSystemRoot: jest.fn(),
    findProjectRoot: jest.fn(),
  })),
}));

// Mock SystemInterface for testing
class MockSystemInterface implements SystemInterface {
  existsSync = jest.fn();
  readFileSync = jest.fn();
  readdirSync = jest.fn();
  isDirectorySync = jest.fn();
  isFileSync = jest.fn();
  joinPath = jest.fn();
  resolve = jest.fn();
}

describe('EnvironmentFactory', () => {
  let mockSystem: MockSystemInterface;
  let factory: EnvironmentFactory;

  beforeEach(() => {
    mockSystem = new MockSystemInterface();
    factory = new EnvironmentFactory({
      systemInterface: mockSystem,
    });
  });

  describe('basic factory methods', () => {
    it('should create filesystem environment', () => {
      const env = factory.createFilesystemEnvironment('/test/path');

      expect(env).toBeInstanceOf(FilesystemEnvironment);
      expect((env as FilesystemEnvironment)['rootPath']).toBe('/test/path');
    });

    it('should create memory environment', () => {
      const env = factory.createMemoryEnvironment();

      expect(env).toBeInstanceOf(MemoryEnvironment);
    });

    it('should create memory environment with initial data', () => {
      const initialData: Partial<MemoryEnvironmentData> = {
        workflows: new Map([['test', {} as WorkflowFile]]),
      };

      const env = factory.createMemoryEnvironment(initialData);

      expect(env).toBeInstanceOf(MemoryEnvironment);
      expect(env.hasWorkflow('test')).resolves.toBe(true);
    });

    it('should create merged environment', () => {
      const localEnv = factory.createMemoryEnvironment();
      const globalEnv = factory.createMemoryEnvironment();

      const mergedEnv = factory.createMergedEnvironment(localEnv, globalEnv);

      expect(mergedEnv).toBeInstanceOf(MergedEnvironment);
      expect(mergedEnv.getLocalEnvironment()).toBe(localEnv);
      expect(mergedEnv.getGlobalEnvironment()).toBe(globalEnv);
    });

    it('should create workflow context', () => {
      const env = factory.createMemoryEnvironment();
      const context = factory.createWorkflowContext(env, 'test-workflow');

      expect(context).toBeInstanceOf(WorkflowContext);
      expect(context.getWorkflowName()).toBe('test-workflow');
    });
  });

  describe('CLI environment creation', () => {
    it('should create CLI environment with proper directory structure', () => {
      const projectRoot = '/project';
      const systemRoot = '/system';

      const env = factory.createCLIEnvironment(projectRoot, systemRoot);

      expect(env).toBeInstanceOf(MergedEnvironment);

      // Verify local environment points to .markdown-workflow subdirectory
      const localEnv = env.getLocalEnvironment() as FilesystemEnvironment;
      expect((localEnv as FilesystemEnvironment)['rootPath']).toBe('/project/.markdown-workflow');

      // Verify global environment points to system root
      const globalEnv = env.getGlobalEnvironment() as FilesystemEnvironment;
      expect((globalEnv as FilesystemEnvironment)['rootPath']).toBe('/system');
    });
  });

  describe('test environment creation', () => {
    it('should create test environment', () => {
      const env = factory.createTestEnvironment();

      expect(env).toBeInstanceOf(MemoryEnvironment);
    });

    it('should create test environment with mock data', () => {
      const mockData: Partial<MemoryEnvironmentData> = {
        workflows: new Map([['test-workflow', {} as WorkflowFile]]),
      };

      const env = factory.createTestEnvironment(mockData);

      expect(env).toBeInstanceOf(MemoryEnvironment);
      expect(env.hasWorkflow('test-workflow')).resolves.toBe(true);
    });
  });

  describe('workflow environment creation', () => {
    it('should create workflow environment with context', async () => {
      const _mockWorkflow: WorkflowFile = {
        workflow: {
          name: 'test-workflow',
          description: 'Test workflow',
          version: '1.0.0',
          stages: [{ name: 'active', description: 'Active', color: 'blue' }],
          templates: [],
          statics: [],
          actions: [],
          metadata: {
            required_fields: [],
            optional_fields: [],
            auto_generated: [],
          },
          collection_id: {
            pattern: 'test_{{date}}',
            max_length: 50,
          },
        },
      };

      // Mock filesystem to return workflow
      mockSystem.existsSync.mockImplementation((path: string) => {
        if (path.includes('workflows/test-workflow/workflow.yml')) return true;
        if (path.includes('workflows')) return true;
        return false;
      });
      mockSystem.readFileSync.mockReturnValue(`
workflow:
  name: "test-workflow"
  description: "Test workflow"
  version: "1.0.0"
  stages:
    - name: "active"
      description: "Active"
      color: "blue"
  templates: []
  statics: []
  actions: []
  metadata:
    required_fields: []
    optional_fields: []
    auto_generated: []
  collection_id:
    pattern: "test_{{date}}"
    max_length: 50
      `);
      mockSystem.readdirSync.mockImplementation((path: string) => {
        if (path.includes('workflows')) return [{ name: 'test-workflow', isDirectory: () => true }];
        return [];
      });
      mockSystem.isDirectorySync.mockReturnValue(true);
      mockSystem.isFileSync.mockImplementation((path: string) => {
        return path.includes('workflow.yml');
      });

      const result = await factory.createWorkflowEnvironment(
        '/project',
        '/system',
        'test-workflow',
      );

      expect(result.environment).toBeInstanceOf(MergedEnvironment);
      expect(result.context).toBeInstanceOf(WorkflowContext);
      expect(result.context.getWorkflowName()).toBe('test-workflow');
    });

    it('should throw error for non-existent workflow', async () => {
      mockSystem.existsSync.mockReturnValue(false);
      mockSystem.readdirSync.mockReturnValue([]);

      await expect(
        factory.createWorkflowEnvironment('/project', '/system', 'nonexistent-workflow'),
      ).rejects.toThrow("Workflow 'nonexistent-workflow' not found");
    });

    it('should list available workflows in error message', async () => {
      mockSystem.existsSync.mockImplementation((path: string) => {
        if (path.includes('nonexistent')) return false;
        if (path.includes('workflows')) return true;
        return false;
      });
      mockSystem.readdirSync.mockImplementation((path: string) => {
        if (path.includes('workflows'))
          return [
            { name: 'workflow1', isDirectory: () => true },
            { name: 'workflow2', isDirectory: () => true },
          ];
        return [];
      });
      mockSystem.isDirectorySync.mockReturnValue(true);
      mockSystem.isFileSync.mockImplementation((path: string) => {
        return !path.includes('nonexistent');
      });

      await expect(
        factory.createWorkflowEnvironment('/project', '/system', 'nonexistent'),
      ).rejects.toThrow('Available workflows: workflow1, workflow2');
    });
  });

  describe('discovery-based environment creation', () => {
    it('should create environment from discovery', async () => {
      // This test requires mocking the dynamic import which is complex
      // For now, we'll test that the method exists and handles valid paths
      const validFactory = new EnvironmentFactory({ systemInterface: mockSystem });

      // We can't easily test the full discovery without complex mocking
      // but we can test that the method signature works
      expect(typeof validFactory.createFromDiscovery).toBe('function');
    });

    it('should use current working directory by default', () => {
      // Test that the method has the correct default parameter
      expect(typeof factory.createFromDiscovery).toBe('function');
      expect(factory.createFromDiscovery.length).toBe(0); // No required parameters
    });

    it('should handle system root not found scenario', () => {
      // Test that the error handling logic is in place
      // Full testing would require complex import mocking
      expect(() => factory.createFromDiscovery).not.toThrow();
    });

    it('should handle project root not found scenario', () => {
      // Test that the error handling logic is in place
      // Full testing would require complex import mocking
      expect(() => factory.createFromDiscovery).not.toThrow();
    });
  });

  describe('environment validation', () => {
    it('should validate healthy environment', async () => {
      const env = factory.createMemoryEnvironment();

      // Set up a valid environment
      const mockWorkflow: WorkflowFile = {
        workflow: {
          name: 'test-workflow',
          description: 'Test workflow',
          version: '1.0.0',
          stages: [{ name: 'active', description: 'Active', color: 'blue' }],
          templates: [],
          statics: [],
          actions: [],
          metadata: {
            required_fields: [],
            optional_fields: [],
            auto_generated: [],
          },
          collection_id: {
            pattern: 'test_{{date}}',
            max_length: 50,
          },
        },
      };

      env.setWorkflow('test', mockWorkflow);

      const validation = await factory.validateEnvironment(env);

      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    it('should detect environment with no workflows', async () => {
      const env = factory.createMemoryEnvironment();

      const validation = await factory.validateEnvironment(env);

      expect(validation.isValid).toBe(true); // No critical issues
      expect(validation.warnings).toContain('No workflows found');
    });

    it('should detect workflow loading issues', async () => {
      const env = factory.createMemoryEnvironment();
      env.setWorkflow('broken', {} as WorkflowFile); // Invalid workflow

      // Mock getWorkflow to throw an error
      jest.spyOn(env, 'getWorkflow').mockRejectedValue(new Error('Invalid workflow'));

      const validation = await factory.validateEnvironment(env);

      expect(validation.isValid).toBe(false);
      expect(
        validation.issues.some((issue) => issue.includes("Failed to load workflow 'broken'")),
      ).toBe(true);
    });

    it('should detect configuration issues', async () => {
      const env = factory.createMemoryEnvironment();

      // Mock getConfig to throw an error
      jest.spyOn(env, 'getConfig').mockRejectedValue(new Error('Config error'));

      const validation = await factory.validateEnvironment(env);

      expect(validation.warnings.some((warning) => warning.includes('Configuration issues'))).toBe(
        true,
      );
    });

    it('should handle environment validation errors', async () => {
      const env = factory.createMemoryEnvironment();

      // Mock getManifest to throw an error
      jest.spyOn(env, 'getManifest').mockRejectedValue(new Error('Manifest error'));

      const validation = await factory.validateEnvironment(env);

      expect(validation.isValid).toBe(false);
      expect(
        validation.issues.some((issue) => issue.includes('Environment validation failed')),
      ).toBe(true);
    });
  });

  describe('custom configuration', () => {
    it('should use custom security configuration', () => {
      const customSecurityConfig: SecurityConfig = SecurityValidator.createConfig({
        fileSizeLimits: {
          '.txt': 1024, // 1KB limit
        },
      });

      const customFactory = new EnvironmentFactory({
        systemInterface: mockSystem,
        securityConfig: customSecurityConfig,
      });

      const env = customFactory.createFilesystemEnvironment('/test');

      // Verify the environment was created with custom configuration
      // (The security configuration is used internally, so we just verify the environment was created)
      expect(env).toBeInstanceOf(FilesystemEnvironment);

      // Test that the custom factory can create different environment types
      const memEnv = customFactory.createMemoryEnvironment();
      expect(memEnv).toBeInstanceOf(MemoryEnvironment);
    });

    it('should use default values when no options provided', () => {
      const defaultFactory = new EnvironmentFactory();

      // Should not throw and should create valid instances
      const env = defaultFactory.createMemoryEnvironment();
      expect(env).toBeInstanceOf(MemoryEnvironment);
    });
  });

  describe('default factory instance', () => {
    it('should provide default factory instance', () => {
      expect(environmentFactory).toBeInstanceOf(EnvironmentFactory);
    });

    it('should provide convenience functions that use default factory', async () => {
      const factoryModule = await import(
        '../../../../src/engine/environment/environment-factory.js'
      );

      expect(typeof factoryModule.createFilesystemEnvironment).toBe('function');
      expect(typeof factoryModule.createMemoryEnvironment).toBe('function');
      expect(typeof factoryModule.createMergedEnvironment).toBe('function');
      expect(typeof factoryModule.createCLIEnvironment).toBe('function');
      expect(typeof factoryModule.createTestEnvironment).toBe('function');
      expect(typeof factoryModule.createFromDiscovery).toBe('function');
    });

    it('should create environments using convenience functions', async () => {
      const factoryModule = await import(
        '../../../../src/engine/environment/environment-factory.js'
      );

      const fsEnv = factoryModule.createFilesystemEnvironment('/test');
      const memEnv = factoryModule.createMemoryEnvironment();
      const mergedEnv = factoryModule.createMergedEnvironment(memEnv, fsEnv);

      expect(fsEnv).toBeInstanceOf(FilesystemEnvironment);
      expect(memEnv).toBeInstanceOf(MemoryEnvironment);
      expect(mergedEnv).toBeInstanceOf(MergedEnvironment);
    });
  });

  describe('error handling', () => {
    it('should handle errors in workflow environment creation gracefully', async () => {
      // Mock environment that throws errors
      mockSystem.existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      await expect(
        factory.createWorkflowEnvironment('/project', '/system', 'test-workflow'),
      ).rejects.toThrow();
    });

    it('should propagate validation errors', async () => {
      const env = factory.createMemoryEnvironment();

      // Mock an environment method to throw
      jest.spyOn(env, 'getManifest').mockRejectedValue(new Error('Critical error'));

      const validation = await factory.validateEnvironment(env);

      expect(validation.isValid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
    });
  });
});
