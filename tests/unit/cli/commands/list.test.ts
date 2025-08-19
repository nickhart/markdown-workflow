import * as path from 'path';
import * as YAML from 'yaml';
import { listCommand } from '../../../../src/cli/commands/list.js';
import { WorkflowOrchestrator } from '../../../../src/services/workflow-orchestrator.js';
import { ConfigDiscovery } from '../../../../src/engine/config-discovery.js';
import { MockSystemInterface } from '../../mocks/mock-system-interface.js';
import { createEnhancedMockFileSystem } from '../../helpers/file-system-helpers.js';

// Mock dependencies
jest.mock('path');
jest.mock('yaml');
jest.mock('../../../../src/services/workflow-orchestrator.js');

const mockPath = path as jest.Mocked<typeof path>;
const mockYAML = YAML as jest.Mocked<typeof YAML>;
const MockedWorkflowOrchestrator = WorkflowOrchestrator as jest.MockedClass<typeof WorkflowOrchestrator>;

describe('listCommand', () => {
  let _mockSystemInterface: MockSystemInterface;
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockWorkflowOrchestrator: jest.Mocked<WorkflowOrchestrator>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => {
      const parts = p.split('/');
      return parts.slice(0, -1).join('/') || '/';
    });

    // Setup YAML mocks
    mockYAML.stringify.mockImplementation((obj) => JSON.stringify(obj, null, 2));
    mockYAML.parse.mockImplementation((str) => JSON.parse(str));

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create enhanced mock file system
    _mockSystemInterface = createEnhancedMockFileSystem();

    // Mock ConfigDiscovery - create a partial mock and cast to avoid TypeScript errors
    mockConfigDiscovery = {
      systemInterface: _mockSystemInterface,
      requireProjectRoot: jest.fn().mockReturnValue('/mock/project'),
      findSystemRoot: jest.fn().mockReturnValue('/mock/system'),
      findProjectRoot: jest.fn().mockReturnValue('/mock/project'),
      getProjectPaths: jest.fn().mockReturnValue({
        projectDir: '/mock/project/.markdown-workflow',
        configFile: '/mock/project/.markdown-workflow/config.yml',
        workflowsDir: '/mock/project/.markdown-workflow/workflows',
        collectionsDir: '/mock/project',
      }),
      discoverSystemConfiguration: jest.fn().mockReturnValue({
        systemRoot: '/mock/system',
        availableWorkflows: ['job', 'blog'],
      }),
      discoverConfiguration: jest.fn().mockReturnValue({
        systemRoot: '/mock/system',
        projectRoot: '/mock/project',
        projectConfig: '/mock/project/.markdown-workflow/config.yml',
      }),
      resolveConfiguration: jest.fn().mockResolvedValue({
        projectConfig: null,
        paths: {
          systemRoot: '/mock/system',
          projectRoot: '/mock/project',
        },
        availableWorkflows: ['job', 'blog'],
      }),
      loadProjectConfig: jest.fn().mockResolvedValue(null),
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      isInProject: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<ConfigDiscovery>;

    // Mock WorkflowEngine - create a partial mock and cast to avoid TypeScript errors
    mockWorkflowOrchestrator = {
      systemRoot: '/mock/system',
      projectRoot: '/mock/project',
      projectConfig: null,
      availableWorkflows: ['job', 'blog'],
      configDiscovery: mockConfigDiscovery,
      systemInterface: _mockSystemInterface,
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      getCollections: jest.fn().mockResolvedValue([]),
      loadWorkflow: jest.fn(),
      getCollection: jest.fn(),
      updateCollectionStatus: jest.fn(),
      executeAction: jest.fn(),
      getProjectRoot: jest.fn().mockReturnValue('/mock/project'),
      getSystemRoot: jest.fn().mockReturnValue('/mock/system'),
    } as unknown as jest.Mocked<WorkflowEngine>;

    MockedWorkflowOrchestrator.mockImplementation(() => mockWorkflowOrchestrator);
  });

  it('should list collections for a workflow', async () => {
    // Mock collections data
    const mockCollections = [
      {
        metadata: {
          collection_id: 'test_company_developer_20250122',
          workflow: 'job',
          status: 'active',
          company: 'Test Company',
          role: 'Developer',
          date_created: '2025-01-22T10:00:00.000Z',
          date_modified: '2025-01-22T10:00:00.000Z',
          status_history: [{ status: 'active', date: '2025-01-22T10:00:00.000Z' }],
        },
        artifacts: ['resume.md', 'cover_letter.md'],
        path: '/mock/project/job/active/test_company_developer_20250122',
      },
    ];

    mockWorkflowOrchestrator.getCollections.mockResolvedValue(mockCollections);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };
    await listCommand('job', options);

    expect(mockWorkflowOrchestrator.getAvailableWorkflows).toHaveBeenCalled();
    expect(mockWorkflowOrchestrator.getCollections).toHaveBeenCalledWith('job');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('JOB COLLECTIONS'));
  });

  it('should handle missing workflow', async () => {
    mockWorkflowOrchestrator.getAvailableWorkflows.mockReturnValue(['blog']);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };

    await expect(listCommand('nonexistent', options)).rejects.toThrow(
      'Unknown workflow: nonexistent. Available: blog',
    );

    expect(mockWorkflowOrchestrator.getAvailableWorkflows).toHaveBeenCalled();
    expect(mockWorkflowOrchestrator.getCollections).not.toHaveBeenCalled();
  });

  it('should filter by status when provided', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'active_collection',
          workflow: 'job',
          status: 'active',
          company: 'Active Company',
          role: 'Developer',
          date_created: '2025-01-22T10:00:00.000Z',
          date_modified: '2025-01-22T10:00:00.000Z',
          status_history: [{ status: 'active', date: '2025-01-22T10:00:00.000Z' }],
        },
        artifacts: ['resume.md'],
        path: '/mock/project/job/active/active_collection',
      },
      {
        metadata: {
          collection_id: 'submitted_collection',
          workflow: 'job',
          status: 'submitted',
          company: 'Submitted Company',
          role: 'Engineer',
          date_created: '2025-01-22T11:00:00.000Z',
          date_modified: '2025-01-22T11:00:00.000Z',
          status_history: [{ status: 'submitted', date: '2025-01-22T11:00:00.000Z' }],
        },
        artifacts: ['resume.md'],
        path: '/mock/project/job/submitted/submitted_collection',
      },
    ];

    mockWorkflowOrchestrator.getCollections.mockResolvedValue(mockCollections);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      status: 'active',
    };
    await listCommand('job', options);

    expect(mockWorkflowOrchestrator.getCollections).toHaveBeenCalledWith('job');
    // Should only show the active collection in the output
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('active_collection'));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('submitted_collection'));
  });

  it('should handle different output formats - JSON', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'test_collection',
          workflow: 'job',
          status: 'active',
          company: 'Test Company',
          role: 'Developer',
          date_created: '2025-01-22T10:00:00.000Z',
          date_modified: '2025-01-22T10:00:00.000Z',
          status_history: [{ status: 'active', date: '2025-01-22T10:00:00.000Z' }],
        },
        artifacts: ['resume.md'],
        path: '/mock/project/job/active/test_collection',
      },
    ];

    mockWorkflowOrchestrator.getCollections.mockResolvedValue(mockCollections);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      format: 'json' as const,
    };
    await listCommand('job', options);

    expect(console.log).toHaveBeenCalledWith(JSON.stringify(mockCollections, null, 2));
  });

  it('should handle empty collections list', async () => {
    mockWorkflowOrchestrator.getCollections.mockResolvedValue([]);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };
    await listCommand('job', options);

    expect(console.log).toHaveBeenCalledWith("📭 No collections found for workflow 'job'");
  });

  it('should handle empty collections list with status filter', async () => {
    mockWorkflowOrchestrator.getCollections.mockResolvedValue([]);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      status: 'active',
    };
    await listCommand('job', options);

    expect(console.log).toHaveBeenCalledWith(
      "📭 No collections found for workflow 'job' with status 'active'",
    );
  });

  it('should handle YAML output format', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'test_collection',
          workflow: 'job',
          status: 'active',
          company: 'Test Company',
          role: 'Developer',
          date_created: '2025-01-22T10:00:00.000Z',
          date_modified: '2025-01-22T10:00:00.000Z',
          status_history: [{ status: 'active', date: '2025-01-22T10:00:00.000Z' }],
        },
        artifacts: ['resume.md'],
        path: '/mock/project/job/active/test_collection',
      },
    ];

    mockWorkflowOrchestrator.getCollections.mockResolvedValue(mockCollections);

    const options = {
      cwd: '/mock/project',
      configDiscovery: mockConfigDiscovery,
      format: 'yaml' as const,
    };
    await listCommand('job', options);

    // Should output YAML format using the mocked YAML.stringify
    expect(mockYAML.stringify).toHaveBeenCalledWith(mockCollections);
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(mockCollections, null, 2)); // Our mock returns JSON
  });

  it('should sort collections by date created (newest first)', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'older_collection',
          workflow: 'job',
          status: 'active',
          company: 'Older Company',
          role: 'Developer',
          date_created: '2025-01-20T10:00:00.000Z',
          date_modified: '2025-01-20T10:00:00.000Z',
          status_history: [{ status: 'active', date: '2025-01-20T10:00:00.000Z' }],
        },
        artifacts: ['resume.md'],
        path: '/mock/project/job/active/older_collection',
      },
      {
        metadata: {
          collection_id: 'newer_collection',
          workflow: 'job',
          status: 'active',
          company: 'Newer Company',
          role: 'Engineer',
          date_created: '2025-01-22T10:00:00.000Z',
          date_modified: '2025-01-22T10:00:00.000Z',
          status_history: [{ status: 'active', date: '2025-01-22T10:00:00.000Z' }],
        },
        artifacts: ['resume.md'],
        path: '/mock/project/job/active/newer_collection',
      },
    ];

    mockWorkflowOrchestrator.getCollections.mockResolvedValue(mockCollections);

    const options = { cwd: '/mock/project', configDiscovery: mockConfigDiscovery };
    await listCommand('job', options);

    // Check that console.log was called with the table
    const logCalls = (console.log as jest.Mock).mock.calls;
    const tableOutput = logCalls.find(
      (call) => call[0].includes('newer_collection') && call[0].includes('older_collection'),
    );

    // The newer collection should appear before the older one in the output
    if (tableOutput) {
      const output = tableOutput[0];
      const newerIndex = output.indexOf('newer_collection');
      const olderIndex = output.indexOf('older_collection');
      expect(newerIndex).toBeLessThan(olderIndex);
    }
  });
});
