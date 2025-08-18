import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import {
  loadWorkflowDefinition,
  scrapeUrlForCollection,
  findCollectionPath,
} from '../../../../src/cli/shared/workflow-operations.js';
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
jest.mock('fs');
jest.mock('path');
jest.mock('yaml');
jest.mock('../../../../src/services/web-scraper.js');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockYAML = YAML as jest.Mocked<typeof YAML>;
const mockScrapeUrl = scrapeUrl as jest.MockedFunction<typeof scrapeUrl>;

describe('Workflow Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  describe('loadWorkflowDefinition', () => {
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
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('workflow content');
      mockYAML.parse.mockReturnValue(mockWorkflowData);

      const result = await loadWorkflowDefinition('/system/root', 'job');

      expect(mockPath.join).toHaveBeenCalledWith(
        '/system/root',
        'workflows',
        'job',
        'workflow.yml',
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith('/system/root/workflows/job/workflow.yml');
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        '/system/root/workflows/job/workflow.yml',
        'utf8',
      );
      expect(mockYAML.parse).toHaveBeenCalledWith('workflow content');
      expect(result).toBe(mockWorkflowData);
    });

    it('should throw error if workflow file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(loadWorkflowDefinition('/system/root', 'job')).rejects.toThrow(
        'Workflow definition not found: /system/root/workflows/job/workflow.yml',
      );
    });

    it('should throw error if workflow validation fails', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('workflow content');
      mockYAML.parse.mockReturnValue(mockWorkflowData);

      jest.spyOn(WorkflowFileSchema, 'safeParse').mockReturnValue({
        success: false,
        error: { message: 'Invalid workflow' },
      } as { success: false; error: { message: string } });

      await expect(loadWorkflowDefinition('/system/root', 'job')).rejects.toThrow(
        'Invalid workflow format: Invalid workflow',
      );
    });

    it('should handle YAML parsing errors', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('workflow content');
      mockYAML.parse.mockImplementation(() => {
        throw new Error('YAML parsing failed');
      });

      await expect(loadWorkflowDefinition('/system/root', 'job')).rejects.toThrow(
        'Failed to load workflow definition: Error: YAML parsing failed',
      );
    });
  });

  describe('scrapeUrlForCollection', () => {
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

      await scrapeUrlForCollection(
        '/collection/path',
        'https://example.com',
        mockWorkflowDefinition as WorkflowFile,
      );

      expect(mockScrapeUrl).toHaveBeenCalledWith('https://example.com', {
        outputFile: 'custom_job_description.html',
        outputDir: '/collection/path',
      });
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️ Scraping job description from: https://example.com',
      );
      expect(console.log).toHaveBeenCalledWith(
        '✅ Successfully scraped using wget: custom_job_description.html',
      );
    });

    it('should use default output file when no scrape action configured', async () => {
      const workflowWithoutScrape: WorkflowDefinition = { workflow: { actions: [] } };
      mockScrapeUrl.mockResolvedValue({
        success: true,
        outputFile: 'url-download.html',
        method: 'curl',
      });

      await scrapeUrlForCollection(
        '/collection/path',
        'https://example.com',
        workflowWithoutScrape as WorkflowFile,
      );

      expect(mockScrapeUrl).toHaveBeenCalledWith('https://example.com', {
        outputFile: 'url-download.html',
        outputDir: '/collection/path',
      });
    });

    it('should handle scraping failure', async () => {
      mockScrapeUrl.mockResolvedValue({
        success: false,
        error: 'Network timeout',
      });

      await scrapeUrlForCollection(
        '/collection/path',
        'https://example.com',
        mockWorkflowDefinition as WorkflowFile,
      );

      expect(console.error).toHaveBeenCalledWith('❌ Failed to scrape URL: Network timeout');
    });

    it('should handle scraping exceptions', async () => {
      mockScrapeUrl.mockRejectedValue(new Error('Connection failed'));

      await scrapeUrlForCollection(
        '/collection/path',
        'https://example.com',
        mockWorkflowDefinition as WorkflowFile,
      );

      expect(console.error).toHaveBeenCalledWith('❌ Scraping error: Error: Connection failed');
    });
  });

  describe('findCollectionPath', () => {
    const mockWorkflowDefinition = {
      workflow: {
        stages: [{ name: 'active' }, { name: 'submitted' }, { name: 'rejected' }],
      },
    };

    beforeEach(() => {
      // Mock fs calls for workflow loading
      mockFs.existsSync.mockImplementation((filePath: string) => {
        if (filePath.includes('workflow.yml')) return true;
        return false; // Will be overridden in individual tests
      });
      mockFs.readFileSync.mockReturnValue('workflow content');
      mockYAML.parse.mockReturnValue(mockWorkflowDefinition);
      jest.spyOn(WorkflowFileSchema, 'safeParse').mockReturnValue({
        success: true,
        data: mockWorkflowDefinition,
      } as { success: true; data: WorkflowFile });
    });

    it('should find collection in first stage', async () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        if (filePath.includes('workflow.yml')) return true;
        return filePath === '/project/job/active/test-collection';
      });

      const result = await findCollectionPath('/system', '/project', 'job', 'test-collection');

      expect(result).toBe('/project/job/active/test-collection');
    });

    it('should find collection in later stage', async () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        if (filePath.includes('workflow.yml')) return true;
        return filePath === '/project/job/submitted/test-collection';
      });

      const result = await findCollectionPath('/system', '/project', 'job', 'test-collection');

      expect(result).toBe('/project/job/submitted/test-collection');
    });

    it('should throw error when collection not found', async () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        if (filePath.includes('workflow.yml')) return true;
        return false; // Collection not found
      });

      await expect(
        findCollectionPath('/system', '/project', 'job', 'missing-collection'),
      ).rejects.toThrow("Collection 'missing-collection' not found in any stage of workflow 'job'");
    });
  });
});
