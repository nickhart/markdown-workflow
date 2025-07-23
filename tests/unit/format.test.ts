import * as path from 'path';
import { formatCommand, formatAllCommand } from '../../src/cli/commands/format.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { WorkflowEngine } from '../../src/core/WorkflowEngine.js';

// Mock dependencies
jest.mock('path');
jest.mock('../../src/core/WorkflowEngine.js');

const mockPath = path as jest.Mocked<typeof path>;
const MockedWorkflowEngine = WorkflowEngine as jest.MockedClass<typeof WorkflowEngine>;

describe('formatCommand', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockEngine: jest.Mocked<WorkflowEngine>;

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
    } as jest.Mocked<ConfigDiscovery>;

    // Mock WorkflowEngine
    mockEngine = {
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      getCollection: jest.fn(),
      executeAction: jest.fn(),
      getCollections: jest.fn(),
    } as jest.Mocked<WorkflowEngine>;

    MockedWorkflowEngine.mockImplementation(() => mockEngine);
  });

  it('should format all documents in a collection when no artifacts specified', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md', 'cover_letter_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockEngine.getCollection.mockResolvedValue(mockCollection);
    mockEngine.executeAction.mockResolvedValue(undefined);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatCommand('job', 'test_collection', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Formatting collection: test_collection');
    expect(console.log).toHaveBeenCalledWith('Format: docx');
    expect(console.log).toHaveBeenCalledWith('Artifacts: all available');
    expect(console.log).toHaveBeenCalledWith(
      'Location: /mock/project/.markdown-workflow/collections/job/test_collection',
    );
    expect(console.log).toHaveBeenCalledWith('✅ Formatting completed successfully!');

    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'format', {
      format: 'docx',
      artifacts: undefined,
    });
  });

  it('should format specific artifacts when specified', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md', 'cover_letter_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockEngine.getCollection.mockResolvedValue(mockCollection);
    mockEngine.executeAction.mockResolvedValue(undefined);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      artifacts: ['resume'],
    };

    await expect(formatCommand('job', 'test_collection', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Artifacts: resume');
    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'format', {
      format: 'docx',
      artifacts: ['resume'],
    });
  });

  it('should format multiple specific artifacts', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md', 'cover_letter_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockEngine.getCollection.mockResolvedValue(mockCollection);
    mockEngine.executeAction.mockResolvedValue(undefined);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      artifacts: ['resume', 'cover_letter'],
    };

    await expect(formatCommand('job', 'test_collection', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Artifacts: resume, cover_letter');
    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'format', {
      format: 'docx',
      artifacts: ['resume', 'cover_letter'],
    });
  });

  it('should handle execution errors from WorkflowEngine', async () => {
    const mockCollection = {
      metadata: { collection_id: 'test_collection' },
      artifacts: ['resume_test.md'],
      path: '/mock/project/.markdown-workflow/collections/job/test_collection',
    };

    mockEngine.getCollection.mockResolvedValue(mockCollection);
    mockEngine.executeAction.mockRejectedValue(
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

    mockEngine.getCollection.mockResolvedValue(mockCollection);
    mockEngine.executeAction.mockResolvedValue(undefined);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      format: 'html' as const,
    };

    await expect(formatCommand('job', 'test_collection', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Format: html');
    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'format', {
      format: 'html',
      artifacts: undefined,
    });
  });

  it('should handle missing collection', async () => {
    mockEngine.getCollection.mockResolvedValue(null);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatCommand('job', 'nonexistent_collection', options)).rejects.toThrow(
      'Collection not found: nonexistent_collection',
    );
  });

  it('should handle missing workflow', async () => {
    mockEngine.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatCommand('nonexistent', 'test_collection', options)).rejects.toThrow(
      'Unknown workflow: nonexistent. Available: job, blog',
    );
  });
});

describe('formatAllCommand', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockEngine: jest.Mocked<WorkflowEngine>;

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
    mockEngine = {
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      getCollections: jest.fn(),
      executeAction: jest.fn(),
    } as jest.Mocked<WorkflowEngine>;

    MockedWorkflowEngine.mockImplementation(() => mockEngine);
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

    mockEngine.getCollections.mockResolvedValue(mockCollections);
    mockEngine.executeAction.mockResolvedValue(undefined);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatAllCommand('job', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith("Formatting 2 collections in workflow 'job'");
    expect(console.log).toHaveBeenCalledWith('Format: docx');
    expect(console.log).toHaveBeenCalledWith('\nFormatting: collection1');
    expect(console.log).toHaveBeenCalledWith('\nFormatting: collection2');
    expect(console.log).toHaveBeenCalledWith('\n✅ Formatting completed!');
    expect(console.log).toHaveBeenCalledWith('Success: 2, Errors: 0');

    expect(mockEngine.executeAction).toHaveBeenCalledTimes(2);
  });

  it('should handle workflow with no collections', async () => {
    mockEngine.getCollections.mockResolvedValue([]);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatAllCommand('blog', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith("No collections found for workflow 'blog'");
  });

  it('should handle missing workflow', async () => {
    mockEngine.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

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

    mockEngine.getCollections.mockResolvedValue(mockCollections);
    mockEngine.executeAction.mockResolvedValue(undefined);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      format: 'html' as const,
    };

    await expect(formatAllCommand('job', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Format: html');
    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'collection1', 'format', {
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

    mockEngine.getCollections.mockResolvedValue(mockCollections);
    mockEngine.executeAction
      .mockRejectedValueOnce(new Error('Mock formatting error'))
      .mockResolvedValueOnce(undefined);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(formatAllCommand('job', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Success: 1, Errors: 1');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('❌ Failed to format collection1: Mock formatting error'),
    );

    expect(mockEngine.executeAction).toHaveBeenCalledTimes(2);
  });
});
