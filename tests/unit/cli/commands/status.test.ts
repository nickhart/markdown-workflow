import * as path from 'path';
import { statusCommand, showStatusesCommand } from '../../../../src/cli/commands/status.js';
import { ConfigDiscovery } from '../../../../src/engine/config-discovery.js';
import { WorkflowOrchestrator } from '../../../../src/services/workflow-orchestrator.js';

// Mock dependencies
jest.mock('path');
jest.mock('../../../../src/services/workflow-orchestrator.js');

const mockPath = path as jest.Mocked<typeof path>;
const MockedWorkflowOrchestrator = WorkflowOrchestrator as jest.MockedClass<
  typeof WorkflowOrchestrator
>;

describe('statusCommand', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockOrchestrator: jest.Mocked<WorkflowOrchestrator>;

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
        availableWorkflows: ['job', 'blog'],
      }),
    } as jest.Mocked<ConfigDiscovery>;

    // Mock WorkflowOrchestrator
    mockOrchestrator = {
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      loadWorkflow: jest.fn(),
      getCollection: jest.fn(),
      updateCollectionStatus: jest.fn(),
      executeAction: jest.fn(),
      getCollections: jest.fn(),
      getProjectConfig: jest.fn(),
      getProjectRoot: jest.fn().mockReturnValue('/mock/project'),
      getSystemRoot: jest.fn().mockReturnValue('/mock/system'),
      findCollectionPath: jest.fn(),
    } as jest.Mocked<WorkflowOrchestrator>;

    MockedWorkflowOrchestrator.mockImplementation(() => mockOrchestrator);
  });

  it('should update collection status successfully', async () => {
    const mockWorkflow = {
      workflow: {
        stages: [
          { name: 'active', description: 'New applications', next: ['submitted', 'rejected'] },
          {
            name: 'submitted',
            description: 'Submitted applications',
            next: ['interview', 'rejected'],
          },
          { name: 'interview', description: 'Interview scheduled', next: ['offered', 'rejected'] },
          { name: 'rejected', description: 'Rejected applications', terminal: true },
        ],
      },
    };

    const mockCollection = {
      metadata: {
        collection_id: 'test_collection',
        status: 'active',
        workflow: 'job',
      },
      artifacts: ['resume.md', 'cover_letter.md'],
      path: '/mock/project/job/active/test_collection',
    };

    mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflow);
    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
    mockOrchestrator.updateCollectionStatus.mockResolvedValue(undefined);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(
      statusCommand('job', 'test_collection', 'submitted', options),
    ).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('ℹ️ Current status: active');
    expect(console.log).toHaveBeenCalledWith('ℹ️ Requested status: submitted');
    expect(console.log).toHaveBeenCalledWith(
      "ℹ️ Valid transitions from 'active': submitted, rejected",
    );
    expect(console.log).toHaveBeenCalledWith('✅ Status updated: active → submitted');

    expect(mockOrchestrator.updateCollectionStatus).toHaveBeenCalledWith(
      'job',
      'test_collection',
      'submitted',
    );
  });

  it('should handle missing collection', async () => {
    const mockWorkflow = {
      workflow: {
        stages: [{ name: 'active', description: 'New applications', next: ['submitted'] }],
      },
    };

    mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflow);
    mockOrchestrator.getCollection.mockResolvedValue(null);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(
      statusCommand('job', 'nonexistent_collection', 'submitted', options),
    ).rejects.toThrow('Collection not found: nonexistent_collection');
  });

  it('should handle missing workflow', async () => {
    mockOrchestrator.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(
      statusCommand('nonexistent', 'test_collection', 'submitted', options),
    ).rejects.toThrow('Unknown workflow: nonexistent. Available: job, blog');
  });

  it('should validate invalid status', async () => {
    const mockWorkflow = {
      workflow: {
        stages: [
          { name: 'active', description: 'New applications', next: ['submitted'] },
          { name: 'submitted', description: 'Submitted applications', next: ['interview'] },
        ],
      },
    };

    const mockCollection = {
      metadata: {
        collection_id: 'test_collection',
        status: 'active',
        workflow: 'job',
      },
      artifacts: ['resume.md'],
      path: '/mock/project/job/active/test_collection',
    };

    mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflow);
    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(
      statusCommand('job', 'test_collection', 'invalid_status', options),
    ).rejects.toThrow('Invalid status');

    expect(console.error).toHaveBeenCalledWith('❌ Invalid status: invalid_status');
    expect(console.error).toHaveBeenCalledWith('❌ Valid statuses: active, submitted');
  });

  it('should handle WorkflowEngine errors', async () => {
    const mockWorkflow = {
      workflow: {
        stages: [
          { name: 'active', description: 'New applications', next: ['submitted'] },
          { name: 'submitted', description: 'Submitted applications', next: ['interview'] },
        ],
      },
    };

    const mockCollection = {
      metadata: {
        collection_id: 'test_collection',
        status: 'active',
        workflow: 'job',
      },
      artifacts: ['resume.md'],
      path: '/mock/project/job/active/test_collection',
    };

    mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflow);
    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
    mockOrchestrator.updateCollectionStatus.mockRejectedValue(
      new Error('Invalid status transition: active → interview'),
    );

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(statusCommand('job', 'test_collection', 'submitted', options)).rejects.toThrow(
      'Invalid status transition: active → interview',
    );

    expect(console.error).toHaveBeenCalledWith(
      '❌ Status update failed: Invalid status transition: active → interview',
    );
  });

  it('should show transitions for current status', async () => {
    const mockWorkflow = {
      workflow: {
        stages: [
          { name: 'active', description: 'New applications', next: ['submitted', 'rejected'] },
          {
            name: 'submitted',
            description: 'Submitted applications',
            next: ['interview', 'rejected'],
          },
          { name: 'interview', description: 'Interview scheduled', next: ['offered', 'rejected'] },
          { name: 'rejected', description: 'Rejected applications', terminal: true },
        ],
      },
    };

    const mockCollection = {
      metadata: {
        collection_id: 'test_collection',
        status: 'submitted',
        workflow: 'job',
      },
      artifacts: ['resume.md'],
      path: '/mock/project/job/submitted/test_collection',
    };

    mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflow);
    mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
    mockOrchestrator.updateCollectionStatus.mockResolvedValue(undefined);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await statusCommand('job', 'test_collection', 'interview', options);

    expect(console.log).toHaveBeenCalledWith(
      "ℹ️ Valid transitions from 'submitted': interview, rejected",
    );
  });
});

describe('showStatusesCommand', () => {
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
      loadWorkflow: jest.fn(),
    } as jest.Mocked<WorkflowOrchestrator>;

    MockedWorkflowOrchestrator.mockImplementation(() => mockOrchestrator);
  });

  it('should show available statuses for a workflow', async () => {
    const mockWorkflow = {
      workflow: {
        stages: [
          { name: 'active', description: 'New applications', next: ['submitted', 'rejected'] },
          {
            name: 'submitted',
            description: 'Submitted applications',
            next: ['interview', 'rejected'],
          },
          { name: 'interview', description: 'Interview scheduled', next: ['offered', 'rejected'] },
          { name: 'offered', description: 'Job offers received', next: ['accepted', 'declined'] },
          { name: 'rejected', description: 'Rejected applications', terminal: true },
        ],
      },
    };

    mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflow);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(showStatusesCommand('job', options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith("ℹ️ \nSTATUS STAGES FOR 'JOB' WORKFLOW\n");
    expect(console.log).toHaveBeenCalledWith('ℹ️ 1. active');
    expect(console.log).toHaveBeenCalledWith('ℹ️    New applications → submitted, rejected');
    expect(console.log).toHaveBeenCalledWith('ℹ️ 2. submitted');
    expect(console.log).toHaveBeenCalledWith('ℹ️    Submitted applications → interview, rejected');
    expect(console.log).toHaveBeenCalledWith('ℹ️ 5. rejected (terminal)');
    expect(console.log).toHaveBeenCalledWith('ℹ️    Rejected applications');
  });

  it('should handle missing workflow', async () => {
    mockOrchestrator.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(showStatusesCommand('nonexistent', options)).rejects.toThrow(
      'Unknown workflow: nonexistent. Available: job, blog',
    );
  });
});
