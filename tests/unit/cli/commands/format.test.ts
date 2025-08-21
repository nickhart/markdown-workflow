import * as path from 'path';
import { formatCommand, formatAllCommand } from '../../../../src/cli/commands/format.js';
import { ConfigDiscovery } from '../../../../src/engine/config-discovery.js';
import { WorkflowOrchestrator } from '../../../../src/services/workflow-orchestrator.js';

// Mock dependencies
jest.mock('path');
jest.mock('../../../../src/services/workflow-orchestrator.js');

const mockPath = path as jest.Mocked<typeof path>;
const MockedWorkflowOrchestrator = WorkflowOrchestrator as jest.MockedClass<
  typeof WorkflowOrchestrator
>;

describe('formatCommand', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockOrchestrator: jest.Mocked<WorkflowOrchestrator>;

  const createMockWorkflowDef = (formats = ['docx', 'html', 'pdf']) => ({
    workflow: {
      actions: [
        {
          name: 'format',
          formats,
        },
      ],
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));

    // Mock ConfigDiscovery
    mockConfigDiscovery = {
      requireProjectRoot: jest.fn().mockReturnValue('/mock/project'),
      findSystemRoot: jest.fn().mockReturnValue('/mock/system'),
      getProjectPaths: jest.fn().mockReturnValue({
        collectionsDir: '/mock/project/collections',
        workflowsDir: '/mock/project/.markdown-workflow/workflows',
      }),
      discoverSystemConfiguration: jest.fn().mockReturnValue({
        systemRoot: '/mock/system',
        availableWorkflows: ['job', 'blog', 'presentation'],
      }),
    } as jest.Mocked<ConfigDiscovery>;

    // Mock WorkflowOrchestrator
    mockOrchestrator = {
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog', 'presentation']),
      getCollection: jest.fn(),
      loadWorkflow: jest.fn(),
      executeAction: jest.fn(),
      getCollections: jest.fn(),
      updateCollectionStatus: jest.fn(),
      getProjectConfig: jest.fn(),
      getProjectRoot: jest.fn().mockReturnValue('/mock/project'),
      getSystemRoot: jest.fn().mockReturnValue('/mock/system'),
      findCollectionPath: jest.fn(),
    } as jest.Mocked<WorkflowOrchestrator>;

    MockedWorkflowOrchestrator.mockImplementation(() => mockOrchestrator);

    // Set default workflow definition mock
    mockOrchestrator.loadWorkflow.mockResolvedValue(createMockWorkflowDef());
  });

  it('should format all documents in a collection when no artifacts specified', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md', 'cover_letter_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
    mockOrchestrator.loadWorkflow.mockResolvedValue(createMockWorkflowDef());
    mockOrchestrator.executeAction.mockResolvedValue(undefined);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatCommand('job', 'test_collection', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Formatting collection: test_collection');
    expect(console.log).toHaveBeenCalledWith('Format: docx');
    expect(console.log).toHaveBeenCalledWith('Artifacts: all available');
    expect(console.log).toHaveBeenCalledWith(
      'Location: /mock/project/.markdown-workflow/collections/job/test_collection',
    );
    expect(console.log).toHaveBeenCalledWith('✅ Formatting completed successfully!');

    expect(mockOrchestrator.executeAction).toHaveBeenCalledWith(
      'job',
      'test_collection',
      'format',
      {
        format: 'docx',
        artifacts: undefined,
      },
    );
  });

  it('should format specific artifacts when specified', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md', 'cover_letter_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
    mockOrchestrator.executeAction.mockResolvedValue(undefined);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      artifacts: ['resume'],
    };

    await expect(formatCommand('job', 'test_collection', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Artifacts: resume');
    expect(mockOrchestrator.executeAction).toHaveBeenCalledWith(
      'job',
      'test_collection',
      'format',
      {
        format: 'docx',
        artifacts: ['resume'],
      },
    );
  });

  it('should format multiple specific artifacts', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md', 'cover_letter_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
    mockOrchestrator.executeAction.mockResolvedValue(undefined);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      artifacts: ['resume', 'cover_letter'],
    };

    await expect(formatCommand('job', 'test_collection', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Artifacts: resume, cover_letter');
    expect(mockOrchestrator.executeAction).toHaveBeenCalledWith(
      'job',
      'test_collection',
      'format',
      {
        format: 'docx',
        artifacts: ['resume', 'cover_letter'],
      },
    );
  });

  it('should handle execution errors from WorkflowEngine', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
    mockOrchestrator.executeAction.mockRejectedValue(
      new Error('No files found for requested artifacts: unknown_artifact'),
    );

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      artifacts: ['unknown_artifact'],
    };

    await expect(formatCommand('job', 'test_collection', options)).rejects.toThrow(
      'No files found for requested artifacts: unknown_artifact',
    );
  });

  it('should handle different output formats', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
    mockOrchestrator.executeAction.mockResolvedValue(undefined);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      format: 'html' as const,
    };

    await expect(formatCommand('job', 'test_collection', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Format: html');
    expect(mockOrchestrator.executeAction).toHaveBeenCalledWith(
      'job',
      'test_collection',
      'format',
      {
        format: 'html',
        artifacts: undefined,
      },
    );
  });

  it('should handle missing collection', async () => {
    mockOrchestrator.getCollection.mockResolvedValue(null);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatCommand('job', 'nonexistent_collection', options)).rejects.toThrow(
      'Collection not found: nonexistent_collection',
    );
  });

  it('should handle missing workflow', async () => {
    mockOrchestrator.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatCommand('nonexistent', 'test_collection', options)).rejects.toThrow(
      'Unknown workflow: nonexistent. Available: job, blog',
    );
  });

  describe('presentation workflow', () => {
    it('should default to PPTX format for presentation workflow', async () => {
      const mockPresentationCollection = {
        metadata: { collection_id: 'test_presentation' },
        artifacts: ['content.md'],
        path: '/mock/project/presentation/draft/test_presentation',
      };

      const mockPresentationWorkflowDef = {
        workflow: {
          actions: [
            {
              name: 'format',
              formats: ['pptx', 'html', 'pdf'],
            },
          ],
        },
      };

      mockOrchestrator.getCollection.mockResolvedValue(mockPresentationCollection);
      mockOrchestrator.loadWorkflow.mockResolvedValue(mockPresentationWorkflowDef);
      mockOrchestrator.executeAction.mockResolvedValue(undefined);

      const options = {
        cwd: '/mock/project',
        configDiscovery: mockConfigDiscovery,
        // No format specified - should use workflow default
      };

      await formatCommand('presentation', 'test_presentation', options);

      expect(console.log).toHaveBeenCalledWith('Format: pptx');
      expect(mockOrchestrator.executeAction).toHaveBeenCalledWith(
        'presentation',
        'test_presentation',
        'format',
        {
          format: 'pptx',
          artifacts: undefined,
        },
      );
    });

    it('should allow overriding default format for presentation workflow', async () => {
      const mockPresentationCollection = {
        metadata: { collection_id: 'test_presentation' },
        artifacts: ['content.md'],
        path: '/mock/project/presentation/draft/test_presentation',
      };

      const mockWorkflowDef = {
        workflow: {
          actions: [
            {
              name: 'format',
              formats: ['pptx', 'html', 'pdf'],
            },
          ],
        },
      };

      mockOrchestrator.getCollection.mockResolvedValue(mockPresentationCollection);
      mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflowDef);
      mockOrchestrator.executeAction.mockResolvedValue(undefined);

      const options = {
        cwd: '/mock/project',
        configDiscovery: mockConfigDiscovery,
        format: 'html' as const,
      };

      await formatCommand('presentation', 'test_presentation', options);

      expect(console.log).toHaveBeenCalledWith('Format: html');
      expect(mockOrchestrator.executeAction).toHaveBeenCalledWith(
        'presentation',
        'test_presentation',
        'format',
        {
          format: 'html',
          artifacts: undefined,
        },
      );
    });

    it('should fall back to docx when workflow has no format action', async () => {
      const mockCollection = {
        metadata: { collection_id: 'test_collection' },
        artifacts: ['content.md'],
        path: '/mock/project/presentation/draft/test_collection',
      };

      const mockWorkflowDef = {
        workflow: {
          actions: [], // No format action
        },
      };

      mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
      mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflowDef);
      mockOrchestrator.executeAction.mockResolvedValue(undefined);

      const options = {
        cwd: '/mock/project',
        configDiscovery: mockConfigDiscovery,
      };

      await formatCommand('presentation', 'test_collection', options);

      expect(console.log).toHaveBeenCalledWith('Format: docx');
    });
  });
});

describe('formatAllCommand', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockOrchestrator: jest.Mocked<WorkflowOrchestrator>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Mock ConfigDiscovery
    mockConfigDiscovery = {
      requireProjectRoot: jest.fn().mockReturnValue('/mock/project'),
    } as jest.Mocked<ConfigDiscovery>;

    // Mock WorkflowEngine
    mockOrchestrator = {
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      getCollections: jest.fn(),
      executeAction: jest.fn(),
    } as jest.Mocked<WorkflowOrchestrator>;

    MockedWorkflowOrchestrator.mockImplementation(() => mockOrchestrator);
  });

  it('should format all collections in a workflow', async () => {
    const mockCollections = [
      {
        metadata: { collection_id: 'collection1' },
        artifacts: ['resume.md'],
        path: '/mock/collections/collection1',
      },
      {
        metadata: { collection_id: 'collection2' },
        artifacts: ['resume.md'],
        path: '/mock/collections/collection2',
      },
    ];

    mockOrchestrator.getCollections.mockResolvedValue(mockCollections);
    mockOrchestrator.executeAction.mockResolvedValue(undefined);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatAllCommand('job', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith("Formatting 2 collections in workflow 'job'");
    expect(console.log).toHaveBeenCalledWith('Format: docx');
    expect(console.log).toHaveBeenCalledWith('\nFormatting: collection1');
    expect(console.log).toHaveBeenCalledWith('\nFormatting: collection2');
    expect(console.log).toHaveBeenCalledWith('\n✅ Formatting completed!');
    expect(console.log).toHaveBeenCalledWith('Success: 2, Errors: 0');

    expect(mockOrchestrator.executeAction).toHaveBeenCalledTimes(2);
  });

  it('should handle workflow with no collections', async () => {
    mockOrchestrator.getCollections.mockResolvedValue([]);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatAllCommand('blog', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith("No collections found for workflow 'blog'");
  });

  it('should handle missing workflow', async () => {
    mockOrchestrator.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatAllCommand('nonexistent', options)).rejects.toThrow(
      'Unknown workflow: nonexistent. Available: job, blog',
    );
  });

  it('should handle different output formats for all collections', async () => {
    const mockCollections = [
      {
        metadata: { collection_id: 'collection1' },
        artifacts: ['resume.md'],
        path: '/mock/collections/collection1',
      },
    ];

    mockOrchestrator.getCollections.mockResolvedValue(mockCollections);
    mockOrchestrator.executeAction.mockResolvedValue(undefined);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      format: 'html' as const,
    };

    await expect(formatAllCommand('job', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Format: html');
    expect(mockOrchestrator.executeAction).toHaveBeenCalledWith('job', 'collection1', 'format', {
      format: 'html',
    });
  });

  it('should continue processing other collections if one fails', async () => {
    const mockCollections = [
      {
        metadata: { collection_id: 'collection1' },
        artifacts: ['resume.md'],
        path: '/mock/collections/collection1',
      },
      {
        metadata: { collection_id: 'collection2' },
        artifacts: ['resume.md'],
        path: '/mock/collections/collection2',
      },
    ];

    mockOrchestrator.getCollections.mockResolvedValue(mockCollections);
    mockOrchestrator.executeAction
      .mockRejectedValueOnce(new Error('Mock formatting error'))
      .mockResolvedValueOnce(undefined);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatAllCommand('job', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Success: 1, Errors: 1');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('❌ Failed to format collection1: Mock formatting error'),
    );

    expect(mockOrchestrator.executeAction).toHaveBeenCalledTimes(2);
  });
});
