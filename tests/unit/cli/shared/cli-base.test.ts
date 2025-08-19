import { ConfigDiscovery } from '../../../../src/engine/config-discovery.js';
import { WorkflowEngine } from '../../../../src/engine/workflow-engine.js';
import {
  initializeProject,
  initializeWorkflowEngine,
} from '../../../../src/cli/shared/cli-base.js';
import { ConfigService } from '../../../../src/services/config-service.js';

// Mock dependencies
jest.mock('../../../../src/engine/config-discovery.js');
jest.mock('../../../../src/engine/workflow-engine.js');
jest.mock('../../../../src/services/config-service.js');

const MockConfigDiscovery = ConfigDiscovery as jest.MockedClass<typeof ConfigDiscovery>;
const MockWorkflowEngine = WorkflowEngine as jest.MockedClass<typeof WorkflowEngine>;
const MockConfigService = ConfigService as jest.MockedClass<typeof ConfigService>;

describe('CLI Base Utilities', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockWorkflowEngine: jest.Mocked<WorkflowEngine>;
  let mockConfigService: jest.Mocked<ConfigService>;

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

    mockConfigService = {
      initializeProject: jest.fn().mockResolvedValue({
        configDiscovery: mockConfigDiscovery,
        projectRoot: '/test/project',
        projectPaths: {
          projectRoot: '/test/project',
          configFile: '/test/project/.markdown-workflow/config.yml',
          collectionsDir: '/test/project',
          workflowsDir: '/test/project/.markdown-workflow/workflows',
        },
        systemConfig: {
          paths: {
            systemRoot: '/test/system',
          },
          availableWorkflows: ['job', 'blog'],
          projectConfig: {
            user: { name: 'Test User' },
          },
        },
      }),
      initializeWorkflowEngine: jest.fn().mockResolvedValue({
        configDiscovery: mockConfigDiscovery,
        projectRoot: '/test/project',
        projectPaths: {
          projectRoot: '/test/project',
          configFile: '/test/project/.markdown-workflow/config.yml',
          collectionsDir: '/test/project',
          workflowsDir: '/test/project/.markdown-workflow/workflows',
        },
        systemConfig: {
          paths: {
            systemRoot: '/test/system',
          },
          availableWorkflows: ['job', 'blog'],
          projectConfig: {
            user: { name: 'Test User' },
          },
        },
        workflowEngine: mockWorkflowEngine,
        workflowName: 'job',
      }),
      validateWorkflow: jest.fn(),
      validateCollection: jest.fn(),
      findCollectionPath: jest.fn(),
      getConfigDiscovery: jest.fn().mockReturnValue(mockConfigDiscovery),
    } as jest.Mocked<ConfigService>;

    MockConfigDiscovery.mockImplementation(() => mockConfigDiscovery);
    MockWorkflowEngine.mockImplementation(() => mockWorkflowEngine);
    MockConfigService.mockImplementation(() => mockConfigService);
  });

  describe('initializeProject', () => {
    it('should initialize project context with default cwd', async () => {
      const result = await initializeProject();

      expect(result).toHaveProperty('configDiscovery');
      expect(result).toHaveProperty('projectRoot', '/test/project');
      expect(result).toHaveProperty('projectPaths');
      expect(result).toHaveProperty('systemConfig');
    });

    it('should initialize project context with custom cwd', async () => {
      const customCwd = '/custom/path';
      const result = await initializeProject({ cwd: customCwd });

      expect(result).toHaveProperty('configDiscovery');
      expect(result).toHaveProperty('projectRoot', '/test/project');
      expect(result).toHaveProperty('projectPaths');
      expect(result).toHaveProperty('systemConfig');
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

      expect(result).toHaveProperty('configDiscovery');
      expect(result).toHaveProperty('projectRoot', '/test/project');
      expect(result).toHaveProperty('projectPaths');
      expect(result).toHaveProperty('systemConfig');
      expect(result).toHaveProperty('workflowEngine');
      expect(result).toHaveProperty('workflowName', 'job');
    });

    it('should throw error for invalid workflow', async () => {
      // Mock the validateWorkflow method to throw for invalid workflow
      mockConfigService.initializeWorkflowEngine.mockRejectedValueOnce(
        new Error('Unknown workflow: invalid. Available: job, blog'),
      );

      await expect(initializeWorkflowEngine('invalid')).rejects.toThrow(
        'Unknown workflow: invalid. Available: job, blog',
      );
    });
  });

  describe('ConfigService integration', () => {
    it('should validate workflow through ConfigService', () => {
      mockConfigService.validateWorkflow.mockImplementation(() => {});

      expect(() => mockConfigService.validateWorkflow('job', ['job', 'blog'])).not.toThrow();
    });

    it('should validate collection through ConfigService', async () => {
      mockConfigService.validateCollection.mockResolvedValue(undefined);

      await expect(
        mockConfigService.validateCollection(mockWorkflowEngine, 'job', 'test-collection'),
      ).resolves.not.toThrow();
    });

    it('should find collection path through ConfigService', async () => {
      const expectedPath = '/test/project/job/active/test-collection';
      mockConfigService.findCollectionPath.mockResolvedValue(expectedPath);

      const result = await mockConfigService.findCollectionPath(
        mockWorkflowEngine,
        'job',
        'test-collection',
      );

      expect(result).toBe(expectedPath);
      expect(mockConfigService.findCollectionPath).toHaveBeenCalledWith(
        mockWorkflowEngine,
        'job',
        'test-collection',
      );
    });
  });
});
