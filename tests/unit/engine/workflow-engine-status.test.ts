import * as path from 'path';
import * as YAML from 'yaml';
import { WorkflowEngine } from '../../../src/engine/workflow-engine.js';
import { ConfigDiscovery } from '../../../src/engine/config-discovery.js';
import { MockSystemInterface } from '../mocks/mock-system-interface.js';
import { createEnhancedMockFileSystem } from '../helpers/file-system-helpers.js';

// Mock dependencies
jest.mock('path');
jest.mock('yaml');

const mockPath = path as jest.Mocked<typeof path>;
const mockYAML = YAML as jest.Mocked<typeof YAML>;

describe('WorkflowEngine - updateCollectionStatus', () => {
  let workflowEngine: WorkflowEngine;
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;
  let mockSystemInterface: MockSystemInterface;

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

    // Create enhanced mock file system
    mockSystemInterface = createEnhancedMockFileSystem();

    // Mock ConfigDiscovery
    mockConfigDiscovery = {
      getProjectPaths: jest.fn().mockReturnValue({
        projectDir: '/mock/project/.markdown-workflow',
        configFile: '/mock/project/.markdown-workflow/config.yml',
        workflowsDir: '/mock/project/.markdown-workflow/workflows',
        collectionsDir: '/mock/project', // Collections at project root
      }),
      findSystemRoot: jest.fn().mockReturnValue('/mock/system'),
      discoverSystemConfiguration: jest.fn().mockReturnValue({
        systemRoot: '/mock/system',
        availableWorkflows: ['job', 'blog'],
      }),
      resolveConfiguration: jest.fn().mockResolvedValue({
        projectConfig: null,
        paths: {
          systemRoot: '/mock/system',
          projectRoot: '/mock/project',
        },
        availableWorkflows: ['job', 'blog'],
      }),
    } as jest.Mocked<ConfigDiscovery>;

    workflowEngine = new WorkflowEngine('/mock/project', mockConfigDiscovery, mockSystemInterface);
  });

  it('should move collection directory when status changes', async () => {
    // Create complete workflow definition
    const mockWorkflow = {
      workflow: {
        name: 'job',
        description: 'Track job applications through hiring process',
        version: '1.0.0',
        stages: [
          {
            name: 'active',
            description: 'New applications',
            color: 'blue',
            next: ['submitted', 'rejected'],
          },
          {
            name: 'submitted',
            description: 'Submitted applications',
            color: 'yellow',
            next: ['interview', 'rejected'],
          },
          {
            name: 'interview',
            description: 'Interview scheduled',
            color: 'orange',
            next: ['offered', 'rejected'],
          },
          { name: 'rejected', description: 'Rejected applications', color: 'red', terminal: true },
        ],
        templates: [
          {
            name: 'resume',
            file: 'templates/resume/default.md',
            output: 'resume_{{user.preferred_name}}.md',
            description: 'Resume',
          },
        ],
        statics: [],
        actions: [
          {
            name: 'create',
            description: 'Create new job application',
            usage: 'wf create job <company> <role>',
            templates: ['resume'],
            metadata_file: 'collection.yml',
            parameters: [],
          },
        ],
        metadata: {
          required_fields: ['company', 'role', 'date_created', 'status'],
          optional_fields: ['url'],
          auto_generated: ['collection_id', 'date_created', 'date_modified', 'status_history'],
        },
        collection_id: {
          pattern: '{{company}}_{{role}}_{{date}}',
          max_length: 50,
        },
      },
    };

    // Mock collection metadata
    const mockCollectionMetadata = {
      collection_id: 'test_collection',
      workflow: 'job',
      status: 'active',
      date_created: '2025-01-21T10:00:00.000Z',
      date_modified: '2025-01-21T10:00:00.000Z',
      status_history: [{ status: 'active', date: '2025-01-21T10:00:00.000Z' }],
      company: 'Test Company',
      role: 'Software Engineer',
    };

    // Setup file system structure
    const projectPath = '/mock/project';
    const systemPath = '/mock/system';

    // Add project structure
    mockSystemInterface.addMockDirectory(projectPath);
    mockSystemInterface.addMockDirectory(`${projectPath}/job`);
    mockSystemInterface.addMockDirectory(`${projectPath}/job/active`);
    mockSystemInterface.addMockDirectory(`${projectPath}/job/active/test_collection`);

    // Add system workflow file
    mockSystemInterface.addMockDirectory(`${systemPath}/workflows/job`);
    mockSystemInterface.addMockFile(
      `${systemPath}/workflows/job/workflow.yml`,
      JSON.stringify(mockWorkflow),
    );

    // Add collection metadata file
    mockSystemInterface.addMockFile(
      `${projectPath}/job/active/test_collection/collection.yml`,
      JSON.stringify(mockCollectionMetadata),
    );

    // Add some artifact files
    mockSystemInterface.addMockFile(
      `${projectPath}/job/active/test_collection/resume.md`,
      '# Resume content',
    );

    // Mock getCurrentISODate for deterministic testing
    jest.doMock('../../../src/utils/date-utils.js', () => ({
      getCurrentISODate: jest.fn().mockReturnValue('2025-01-21T11:00:00.000Z'),
    }));

    // Execute the status change
    await workflowEngine.updateCollectionStatus('job', 'test_collection', 'submitted');

    // Verify new status directory was created
    expect(mockSystemInterface.mkdirSync).toHaveBeenCalledWith('/mock/project/job/submitted', {
      recursive: true,
    });

    // Verify collection directory was moved
    expect(mockSystemInterface.renameSync).toHaveBeenCalledWith(
      '/mock/project/job/active/test_collection',
      '/mock/project/job/submitted/test_collection',
    );

    // Verify metadata was updated and written
    expect(mockSystemInterface.writeFileSync).toHaveBeenCalledWith(
      '/mock/project/job/submitted/test_collection/collection.yml',
      expect.stringContaining('"status": "submitted"'),
    );

    // Verify status history was updated
    const writeCall = mockSystemInterface.writeFileSync.mock.calls.find((call) =>
      call[0].toString().includes('collection.yml'),
    );
    expect(writeCall).toBeDefined();
    const writtenMetadata = JSON.parse(writeCall![1] as string);
    expect(writtenMetadata.status_history).toHaveLength(2);
    expect(writtenMetadata.status_history[1].status).toBe('submitted');
  });

  it('should not move directory if status does not change', async () => {
    // Mock workflow definition with all required fields - allow same-status transitions
    const mockWorkflow = {
      workflow: {
        name: 'job',
        description: 'Track job applications through hiring process',
        version: '1.0.0',
        stages: [
          {
            name: 'active',
            description: 'New applications',
            color: 'blue',
            next: ['active', 'submitted'],
          }, // Allow active -> active
        ],
        templates: [
          {
            name: 'resume',
            file: 'templates/resume/default.md',
            output: 'resume_{{user.preferred_name}}.md',
            description: 'Resume',
          },
        ],
        statics: [],
        actions: [
          {
            name: 'create',
            description: 'Create new job application',
            usage: 'wf create job <company> <role>',
            templates: ['resume'],
            metadata_file: 'collection.yml',
            parameters: [],
          },
        ],
        metadata: {
          required_fields: ['company', 'role', 'date_created', 'status'],
          optional_fields: ['url'],
          auto_generated: ['collection_id', 'date_created', 'date_modified', 'status_history'],
        },
        collection_id: {
          pattern: '{{company}}_{{role}}_{{date}}',
          max_length: 50,
        },
      },
    };

    // Mock collection metadata with same status
    const mockCollectionMetadata = {
      collection_id: 'test_collection',
      workflow: 'job',
      status: 'active',
      date_created: '2025-01-21T10:00:00.000Z',
      date_modified: '2025-01-21T10:00:00.000Z',
      status_history: [{ status: 'active', date: '2025-01-21T10:00:00.000Z' }],
      company: 'Test Company',
      role: 'Software Engineer',
    };

    // Setup file system structure
    const projectPath = '/mock/project';
    const systemPath = '/mock/system';

    mockSystemInterface.addMockDirectory(projectPath);
    mockSystemInterface.addMockDirectory(`${projectPath}/job`);
    mockSystemInterface.addMockDirectory(`${projectPath}/job/active`);
    mockSystemInterface.addMockDirectory(`${projectPath}/job/active/test_collection`);

    mockSystemInterface.addMockDirectory(`${systemPath}/workflows/job`);
    mockSystemInterface.addMockFile(
      `${systemPath}/workflows/job/workflow.yml`,
      JSON.stringify(mockWorkflow),
    );

    mockSystemInterface.addMockFile(
      `${projectPath}/job/active/test_collection/collection.yml`,
      JSON.stringify(mockCollectionMetadata),
    );

    // Execute status change to same status
    await workflowEngine.updateCollectionStatus('job', 'test_collection', 'active');

    // Verify directory was NOT moved (renameSync should not be called)
    expect(mockSystemInterface.renameSync).not.toHaveBeenCalled();

    // Verify metadata was still updated (date_modified should change)
    expect(mockSystemInterface.writeFileSync).toHaveBeenCalledWith(
      '/mock/project/job/active/test_collection/collection.yml',
      expect.stringContaining('"status": "active"'),
    );
  });

  it('should validate status transitions', async () => {
    // Mock workflow definition with restricted transitions
    const mockWorkflow = {
      workflow: {
        name: 'job',
        description: 'Track job applications through hiring process',
        version: '1.0.0',
        stages: [
          { name: 'active', description: 'New applications', color: 'blue', next: ['submitted'] }, // Cannot go to interview directly
          {
            name: 'submitted',
            description: 'Submitted applications',
            color: 'yellow',
            next: ['interview'],
          },
          {
            name: 'interview',
            description: 'Interview scheduled',
            color: 'orange',
            next: ['offered'],
          },
        ],
        templates: [
          {
            name: 'resume',
            file: 'templates/resume/default.md',
            output: 'resume_{{user.preferred_name}}.md',
            description: 'Resume',
          },
        ],
        statics: [],
        actions: [
          {
            name: 'create',
            description: 'Create new job application',
            usage: 'wf create job <company> <role>',
            templates: ['resume'],
            metadata_file: 'collection.yml',
            parameters: [],
          },
        ],
        metadata: {
          required_fields: ['company', 'role', 'date_created', 'status'],
          optional_fields: ['url'],
          auto_generated: ['collection_id', 'date_created', 'date_modified', 'status_history'],
        },
        collection_id: {
          pattern: '{{company}}_{{role}}_{{date}}',
          max_length: 50,
        },
      },
    };

    // Mock collection metadata
    const mockCollectionMetadata = {
      collection_id: 'test_collection',
      workflow: 'job',
      status: 'active',
      date_created: '2025-01-21T10:00:00.000Z',
      date_modified: '2025-01-21T10:00:00.000Z',
      status_history: [{ status: 'active', date: '2025-01-21T10:00:00.000Z' }],
      company: 'Test Company',
      role: 'Software Engineer',
    };

    // Setup file system structure
    const projectPath = '/mock/project';
    const systemPath = '/mock/system';

    mockSystemInterface.addMockDirectory(projectPath);
    mockSystemInterface.addMockDirectory(`${projectPath}/job`);
    mockSystemInterface.addMockDirectory(`${projectPath}/job/active`);
    mockSystemInterface.addMockDirectory(`${projectPath}/job/active/test_collection`);

    mockSystemInterface.addMockDirectory(`${systemPath}/workflows/job`);
    mockSystemInterface.addMockFile(
      `${systemPath}/workflows/job/workflow.yml`,
      JSON.stringify(mockWorkflow),
    );

    mockSystemInterface.addMockFile(
      `${projectPath}/job/active/test_collection/collection.yml`,
      JSON.stringify(mockCollectionMetadata),
    );

    // Try to transition from active to interview (should fail)
    await expect(
      workflowEngine.updateCollectionStatus('job', 'test_collection', 'interview'),
    ).rejects.toThrow('Invalid status transition: active → interview');

    // Verify no directory movement occurred
    expect(mockSystemInterface.renameSync).not.toHaveBeenCalled();
  });
});
