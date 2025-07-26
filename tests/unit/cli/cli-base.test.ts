import { ConfigDiscovery } from '../../../src/core/config-discovery.js';
import { WorkflowEngine } from '../../../src/core/workflow-engine.js';
import type { Collection } from '../../../src/core/types.js';
import {
  initializeProject,
  initializeWorkflowEngine,
  validateWorkflow,
  validateCollection,
  findCollectionPath,
} from '../../../src/cli/shared/cli-base.js';

// Mock dependencies
jest.mock('../../../src/core/config-discovery.js');
jest.mock('../../../src/core/workflow-engine.js');

const MockConfigDiscovery = ConfigDiscovery as jest.MockedClass<typeof ConfigDiscovery>;
const MockWorkflowEngine = WorkflowEngine as jest.MockedClass<typeof WorkflowEngine>;

describe('CLI Base Utilities', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockWorkflowEngine: jest.Mocked<WorkflowEngine>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create mock instances
    mockConfigDiscovery = {
      requireProjectRoot: jest.fn().mockReturnValue('/test/project'),
      getProjectPaths: jest.fn().mockReturnValue({
        projectRoot: '/test/project',
        configFile: '/test/project/.markdown-workflow/config.yml',
        collectionsDir: '/test/project',
        workflowsDir: '/test/project/.markdown-workflow/workflows',
      }),
      resolveConfiguration: jest.fn().mockResolvedValue({
        paths: {
          systemRoot: '/test/system',
        },
        availableWorkflows: ['job', 'blog'],
        projectConfig: {
          user: { name: 'Test User' },
        },
      }),
    } as jest.Mocked<ConfigDiscovery>;

    mockWorkflowEngine = {
      getCollections: jest.fn(),
    } as jest.Mocked<WorkflowEngine>;

    MockConfigDiscovery.mockImplementation(() => mockConfigDiscovery);
    MockWorkflowEngine.mockImplementation(() => mockWorkflowEngine);
  });

  describe('initializeProject', () => {
    it('should initialize project context with default cwd', async () => {
      const result = await initializeProject();

      expect(mockConfigDiscovery.requireProjectRoot).toHaveBeenCalledWith(process.cwd());
      expect(mockConfigDiscovery.getProjectPaths).toHaveBeenCalledWith('/test/project');
      expect(mockConfigDiscovery.resolveConfiguration).toHaveBeenCalledWith(process.cwd());
      expect(result).toEqual({
        configDiscovery: mockConfigDiscovery,
        projectRoot: '/test/project',
        projectPaths: expect.any(Object),
        systemConfig: expect.any(Object),
      });
    });

    it('should initialize project context with custom cwd', async () => {
      const customCwd = '/custom/path';
      await initializeProject({ cwd: customCwd });

      expect(mockConfigDiscovery.requireProjectRoot).toHaveBeenCalledWith(customCwd);
      expect(mockConfigDiscovery.resolveConfiguration).toHaveBeenCalledWith(customCwd);
    });

    it('should use provided ConfigDiscovery instance', async () => {
      const customConfigDiscovery = mockConfigDiscovery;
      const result = await initializeProject({ configDiscovery: customConfigDiscovery });
      expect(result.configDiscovery).toBe(customConfigDiscovery);
    });
  });

  describe('initializeWorkflowEngine', () => {
    it('should initialize workflow context with valid workflow', async () => {
      const result = await initializeWorkflowEngine('job');

      expect(result.configDiscovery).toBe(mockConfigDiscovery);
      expect(result.projectRoot).toBe('/test/project');
      expect(result.projectPaths).toEqual(expect.any(Object));
      expect(result.systemConfig).toEqual(expect.any(Object));
      expect(result.workflowEngine).toEqual(expect.any(Object));
      expect(result.workflowName).toBe('job');
      expect(MockWorkflowEngine).toHaveBeenCalledWith('/test/project', mockConfigDiscovery);
    });

    it('should throw error for invalid workflow', async () => {
      await expect(initializeWorkflowEngine('invalid')).rejects.toThrow(
        'Unknown workflow: invalid. Available: job, blog',
      );
    });
  });

  describe('validateWorkflow', () => {
    it('should not throw for valid workflow', () => {
      expect(() => validateWorkflow('job', ['job', 'blog'])).not.toThrow();
    });

    it('should throw for invalid workflow', () => {
      expect(() => validateWorkflow('invalid', ['job', 'blog'])).toThrow(
        'Unknown workflow: invalid. Available: job, blog',
      );
    });
  });

  describe('validateCollection', () => {
    it('should not throw for existing collection', async () => {
      const mockCollection: Collection = {
        metadata: { collection_id: 'test-collection' } as Collection['metadata'],
        artifacts: [],
        path: '/test/path',
      };
      mockWorkflowEngine.getCollections.mockResolvedValue([mockCollection]);

      await expect(
        validateCollection(mockWorkflowEngine, 'job', 'test-collection'),
      ).resolves.not.toThrow();
    });

    it('should throw for non-existing collection', async () => {
      mockWorkflowEngine.getCollections.mockResolvedValue([]);

      await expect(
        validateCollection(mockWorkflowEngine, 'job', 'missing-collection'),
      ).rejects.toThrow("Collection 'missing-collection' not found in workflow 'job'");
    });
  });

  describe('findCollectionPath', () => {
    it('should return path for existing collection', async () => {
      const expectedPath = '/test/project/job/active/test-collection';
      const mockCollection: Collection = {
        metadata: { collection_id: 'test-collection' } as Collection['metadata'],
        artifacts: [],
        path: expectedPath,
      };
      mockWorkflowEngine.getCollections.mockResolvedValue([mockCollection]);

      const result = await findCollectionPath(mockWorkflowEngine, 'job', 'test-collection');

      expect(result).toBe(expectedPath);
    });

    it('should throw for non-existing collection', async () => {
      mockWorkflowEngine.getCollections.mockResolvedValue([]);

      await expect(
        findCollectionPath(mockWorkflowEngine, 'job', 'missing-collection'),
      ).rejects.toThrow("Collection 'missing-collection' not found in workflow 'job'");
    });
  });
});
