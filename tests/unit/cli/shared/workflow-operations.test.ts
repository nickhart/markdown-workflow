import * as YAML from 'yaml';
import { WorkflowService } from '../../../../src/services/workflow-service.js';
import { CollectionService } from '../../../../src/services/collection-service.js';
import { NodeSystemInterface } from '../../../../src/engine/system-interface.js';
import { ConfigDiscovery } from '../../../../src/engine/config-discovery.js';
import { WorkflowFileSchema, type WorkflowFile } from '../../../../src/engine/schemas.js';
import { scrapeUrl } from '../../../../src/services/web-scraper.js';

type WorkflowDefinition = {
  workflow: {
    actions: Array<{
      name: string;
      parameters?: Array<{
        name: string;
        default?: string;
      }>;
    }>;
  };
};

// Mock dependencies
jest.mock('yaml');
jest.mock('../../../../src/services/web-scraper.js');
jest.mock('../../../../src/engine/system-interface.js');
jest.mock('../../../../src/engine/config-discovery.js');

const mockScrapeUrl = scrapeUrl as jest.MockedFunction<typeof scrapeUrl>;
const mockYAML = YAML as jest.Mocked<typeof YAML>;

// Create mock system interface
const mockSystemInterface = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
} as jest.Mocked<NodeSystemInterface>;

// Mock NodeSystemInterface constructor
(NodeSystemInterface as jest.MockedClass<typeof NodeSystemInterface>).mockImplementation(
  () => mockSystemInterface,
);

// Create mock config discovery
const mockConfigDiscovery = {
  getProjectPaths: jest.fn(),
} as jest.Mocked<ConfigDiscovery>;

(ConfigDiscovery as jest.MockedClass<typeof ConfigDiscovery>).mockImplementation(
  () => mockConfigDiscovery,
);

describe('Workflow and Collection Services', () => {
  let workflowService: WorkflowService;
  let collectionService: CollectionService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Setup config discovery mock
    mockConfigDiscovery.getProjectPaths.mockReturnValue({
      projectRoot: '/project',
      collectionsDir: '/project/collections',
      configFile: '/project/config.yml',
      workflowsDir: '/project/workflows',
    });

    // Create service instances
    workflowService = new WorkflowService({
      systemRoot: '/system/root',
      systemInterface: mockSystemInterface,
    });

    collectionService = new CollectionService({
      projectRoot: '/project',
      systemInterface: mockSystemInterface,
      configDiscovery: mockConfigDiscovery,
    });
  });

  describe('WorkflowService.loadWorkflowDefinition', () => {
    const mockWorkflowData = {
      workflow: {
        name: 'job',
        description: 'Job applications',
        stages: [
          { name: 'active', description: 'Active applications', next: ['submitted'] },
          { name: 'submitted', description: 'Submitted applications', next: [] },
        ],
        templates: [],
        actions: [],
      },
    };

    beforeEach(() => {
      // Mock successful Zod validation
      jest.spyOn(WorkflowFileSchema, 'safeParse').mockReturnValue({
        success: true,
        data: mockWorkflowData,
      } as { success: true; data: WorkflowFile });
    });

    it('should load and validate workflow definition successfully', async () => {
      mockSystemInterface.existsSync.mockReturnValue(true);
      mockSystemInterface.readFileSync.mockReturnValue('workflow content');
      mockYAML.parse.mockReturnValue(mockWorkflowData);

      const result = await workflowService.loadWorkflowDefinition('job');

      expect(mockSystemInterface.existsSync).toHaveBeenCalledWith(
        '/system/root/workflows/job/workflow.yml',
      );
      expect(mockSystemInterface.readFileSync).toHaveBeenCalledWith(
        '/system/root/workflows/job/workflow.yml',
      );
      expect(result).toBe(mockWorkflowData);
    });

    it('should throw error if workflow file does not exist', async () => {
      mockSystemInterface.existsSync.mockReturnValue(false);

      await expect(workflowService.loadWorkflowDefinition('job')).rejects.toThrow(
        'Workflow definition not found: job',
      );
    });

    it('should throw error if workflow validation fails', async () => {
      mockSystemInterface.existsSync.mockReturnValue(true);
      mockSystemInterface.readFileSync.mockReturnValue('workflow content');
      mockYAML.parse.mockReturnValue(mockWorkflowData);

      jest.spyOn(WorkflowFileSchema, 'safeParse').mockReturnValue({
        success: false,
        error: { message: 'Invalid workflow' },
      } as { success: false; error: { message: string } });

      await expect(workflowService.loadWorkflowDefinition('job')).rejects.toThrow(
        'Invalid workflow format: Invalid workflow',
      );
    });
  });

  describe('CollectionService.scrapeUrlForCollection', () => {
    const mockWorkflowDefinition: WorkflowDefinition = {
      workflow: {
        actions: [
          {
            name: 'scrape',
            parameters: [
              {
                name: 'output_file',
                default: 'custom_job_description.html',
              },
            ],
          },
        ],
      },
    };

    it('should scrape URL successfully with custom output file', async () => {
      mockScrapeUrl.mockResolvedValue({
        success: true,
        outputFile: 'custom_job_description.html',
        method: 'wget',
      });

      const result = await collectionService.scrapeUrlForCollection(
        '/collection/path',
        'https://example.com',
        mockWorkflowDefinition as WorkflowFile,
      );

      expect(mockScrapeUrl).toHaveBeenCalledWith('https://example.com', {
        outputFile: 'custom_job_description.html',
        outputDir: '/collection/path',
      });
      expect(result).toEqual({
        success: true,
        outputFile: 'custom_job_description.html',
        method: 'wget',
      });
    });

    it('should use default output file when no scrape action configured', async () => {
      const workflowWithoutScrape: WorkflowDefinition = { workflow: { actions: [] } };
      mockScrapeUrl.mockResolvedValue({
        success: true,
        outputFile: 'url-download.html',
        method: 'curl',
      });

      const result = await collectionService.scrapeUrlForCollection(
        '/collection/path',
        'https://example.com',
        workflowWithoutScrape as WorkflowFile,
      );

      expect(mockScrapeUrl).toHaveBeenCalledWith('https://example.com', {
        outputFile: 'url-download.html',
        outputDir: '/collection/path',
      });
      expect(result.success).toBe(true);
    });

    it('should handle scraping failure', async () => {
      mockScrapeUrl.mockResolvedValue({
        success: false,
        error: 'Network timeout',
      });

      const result = await collectionService.scrapeUrlForCollection(
        '/collection/path',
        'https://example.com',
        mockWorkflowDefinition as WorkflowFile,
      );

      expect(result).toEqual({
        success: false,
        error: 'Network timeout',
      });
    });

    it('should handle scraping exceptions', async () => {
      mockScrapeUrl.mockRejectedValue(new Error('Connection failed'));

      const result = await collectionService.scrapeUrlForCollection(
        '/collection/path',
        'https://example.com',
        mockWorkflowDefinition as WorkflowFile,
      );

      expect(result).toEqual({
        success: false,
        error: 'Connection failed',
      });
    });
  });

  describe('CollectionService.findCollectionPath', () => {
    const mockWorkflowDefinition = {
      workflow: {
        stages: [{ name: 'active' }, { name: 'submitted' }, { name: 'rejected' }],
      },
    };

    it('should find collection in first stage', async () => {
      mockSystemInterface.existsSync.mockImplementation((filePath: string) => {
        return filePath === '/project/collections/job/active/test-collection';
      });

      const result = await collectionService.findCollectionPath(
        'job',
        'test-collection',
        mockWorkflowDefinition as WorkflowFile,
      );

      expect(result).toBe('/project/collections/job/active/test-collection');
    });

    it('should find collection in later stage', async () => {
      mockSystemInterface.existsSync.mockImplementation((filePath: string) => {
        return filePath === '/project/collections/job/submitted/test-collection';
      });

      const result = await collectionService.findCollectionPath(
        'job',
        'test-collection',
        mockWorkflowDefinition as WorkflowFile,
      );

      expect(result).toBe('/project/collections/job/submitted/test-collection');
    });

    it('should throw error when collection not found', async () => {
      mockSystemInterface.existsSync.mockReturnValue(false);

      await expect(
        collectionService.findCollectionPath(
          'job',
          'missing-collection',
          mockWorkflowDefinition as WorkflowFile,
        ),
      ).rejects.toThrow("Collection 'missing-collection' not found in any stage of workflow 'job'");
    });
  });
});
