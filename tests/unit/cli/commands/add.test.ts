import { addCommand, listTemplatesCommand } from '../../../../src/cli/commands/add.js';
import { WorkflowOrchestrator } from '../../../../src/services/workflow-orchestrator.js';
import { ConfigDiscovery } from '../../../../src/engine/config-discovery.js';

// Mock the WorkflowOrchestrator
jest.mock('../../../../src/services/workflow-orchestrator.js');
const MockedWorkflowOrchestrator = WorkflowOrchestrator as jest.MockedClass<
  typeof WorkflowOrchestrator
>;

// Mock the ConfigDiscovery
jest.mock('../../../../src/engine/config-discovery.js');
const MockedConfigDiscovery = ConfigDiscovery as jest.MockedClass<typeof ConfigDiscovery>;

// Mock console methods
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

describe('Add Command', () => {
  let mockOrchestrator: jest.Mocked<WorkflowOrchestrator>;
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigDiscovery = new MockedConfigDiscovery() as jest.Mocked<ConfigDiscovery>;
    mockConfigDiscovery.requireProjectRoot.mockReturnValue('/test/project/root');

    mockOrchestrator = new MockedWorkflowOrchestrator() as jest.Mocked<WorkflowOrchestrator>;
    MockedWorkflowOrchestrator.mockImplementation(() => mockOrchestrator);
  });

  afterEach(() => {
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('addCommand', () => {
    const mockCollection = {
      path: '/test/project/root/job/active/test_collection',
      metadata: {
        collection_id: 'test_collection',
        company: 'Test Company',
        role: 'Test Role',
        status: 'active',
        date_created: '2025-01-21',
        date_modified: '2025-01-21',
      },
      artifacts: ['resume_test.md', 'cover_letter_test.md'],
      statics: [],
    };

    const mockWorkflow = {
      workflow: {
        name: 'job',
        description: 'Test workflow',
        version: '1.0.0',
        stages: [],
        templates: [
          {
            name: 'notes',
            file: 'templates/notes/default.md',
            output: '{{prefix}}_notes.md',
            description: 'Notes template for interviews, meetings, or general notes',
          },
          {
            name: 'resume',
            file: 'templates/resume/default.md',
            output: 'resume_{{user.preferred_name}}.md',
            description: 'Resume template',
          },
        ],
        statics: [],
        actions: [],
        metadata: { required_fields: [], optional_fields: [], auto_generated: [] },
        collection_id: { pattern: '', max_length: 50 },
      },
    };

    beforeEach(() => {
      mockOrchestrator.getAvailableWorkflows.mockReturnValue(['job', 'blog']);
      mockOrchestrator.getCollection.mockResolvedValue(mockCollection);
      mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflow);
      mockOrchestrator.executeAction.mockResolvedValue();
    });

    it('should successfully add notes template with prefix', async () => {
      await addCommand('job', 'test_collection', 'notes', 'recruiter', {
        configDiscovery: mockConfigDiscovery,
      });

      expect(mockOrchestrator.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'add', {
        template: 'notes',
        prefix: 'recruiter',
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('Adding notes to collection: test_collection');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ notes added successfully!');
    });

    it('should successfully add notes template without prefix', async () => {
      await addCommand('job', 'test_collection', 'notes', undefined, {
        configDiscovery: mockConfigDiscovery,
      });

      expect(mockOrchestrator.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'add', {
        template: 'notes',
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('Adding notes to collection: test_collection');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ notes added successfully!');
    });

    it('should throw error for unknown workflow', async () => {
      mockOrchestrator.getAvailableWorkflows.mockReturnValue(['blog']);

      await expect(
        addCommand('invalid', 'test_collection', 'notes', 'recruiter', {
          configDiscovery: mockConfigDiscovery,
        }),
      ).rejects.toThrow('Unknown workflow: invalid. Available: blog');
    });

    it('should throw error for non-existent collection', async () => {
      mockOrchestrator.getCollection.mockResolvedValue(null);

      await expect(
        addCommand('job', 'invalid_collection', 'notes', 'recruiter', {
          configDiscovery: mockConfigDiscovery,
        }),
      ).rejects.toThrow('Collection not found: invalid_collection');
    });

    it('should throw error for invalid template', async () => {
      await expect(
        addCommand('job', 'test_collection', 'invalid_template', 'recruiter', {
          configDiscovery: mockConfigDiscovery,
        }),
      ).rejects.toThrow(
        "Template 'invalid_template' not found in workflow 'job'. Available templates: notes, resume",
      );
    });

    it('should handle execution errors gracefully', async () => {
      const error = new Error('Template file not found');
      mockOrchestrator.executeAction.mockRejectedValue(error);

      await expect(
        addCommand('job', 'test_collection', 'notes', 'recruiter', {
          configDiscovery: mockConfigDiscovery,
        }),
      ).rejects.toThrow('Template file not found');
    });
  });

  describe('listTemplatesCommand', () => {
    const mockWorkflow = {
      workflow: {
        name: 'job',
        description: 'Test workflow',
        version: '1.0.0',
        stages: [],
        templates: [
          {
            name: 'notes',
            file: 'templates/notes/default.md',
            output: '{{prefix}}_notes.md',
            description: 'Notes template for interviews, meetings, or general notes',
          },
          {
            name: 'resume',
            file: 'templates/resume/default.md',
            output: 'resume_{{user.preferred_name}}.md',
            description: 'Resume template',
          },
        ],
        statics: [],
        actions: [],
        metadata: { required_fields: [], optional_fields: [], auto_generated: [] },
        collection_id: { pattern: '', max_length: 50 },
      },
    };

    beforeEach(() => {
      mockOrchestrator.getAvailableWorkflows.mockReturnValue(['job', 'blog']);
      mockOrchestrator.loadWorkflow.mockResolvedValue(mockWorkflow);
    });

    it('should list available templates for workflow', async () => {
      await listTemplatesCommand('job', {
        configDiscovery: mockConfigDiscovery,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith("\nAVAILABLE TEMPLATES FOR 'JOB' WORKFLOW\n");
      expect(consoleLogSpy).toHaveBeenCalledWith('1. notes');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '   Notes template for interviews, meetings, or general notes',
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('   Output: {{prefix}}_notes.md');
      expect(consoleLogSpy).toHaveBeenCalledWith('2. resume');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Resume template');
      expect(consoleLogSpy).toHaveBeenCalledWith('   Output: resume_{{user.preferred_name}}.md');
    });

    it('should handle workflow with no templates', async () => {
      const emptyWorkflow = {
        ...mockWorkflow,
        workflow: {
          ...mockWorkflow.workflow,
          templates: [],
        },
      };
      mockOrchestrator.loadWorkflow.mockResolvedValue(emptyWorkflow);

      await listTemplatesCommand('job', {
        configDiscovery: mockConfigDiscovery,
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('No templates available for this workflow.');
    });

    it('should throw error for unknown workflow', async () => {
      mockOrchestrator.getAvailableWorkflows.mockReturnValue(['blog']);

      await expect(
        listTemplatesCommand('invalid', {
          configDiscovery: mockConfigDiscovery,
        }),
      ).rejects.toThrow('Unknown workflow: invalid. Available: blog');
    });
  });
});
