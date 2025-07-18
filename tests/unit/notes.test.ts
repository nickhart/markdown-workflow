import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { notesCommand, listNoteTypesCommand } from '../../src/cli/commands/notes.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { WorkflowEngine } from '../../src/core/WorkflowEngine.js';

// Mock dependencies
jest.mock('fs');
jest.mock('../../src/core/ConfigDiscovery.js');
jest.mock('../../src/core/WorkflowEngine.js');

const mockFs = jest.mocked(fs);
const mockConfigDiscovery = jest.mocked(ConfigDiscovery);
const mockWorkflowEngine = jest.mocked(WorkflowEngine);

describe('notesCommand', () => {
  const mockProjectRoot = '/test/project';
  let mockEngine: any;
  let originalConsoleLog: any;
  let originalConsoleError: any;
  let logOutput: string[];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock console methods
    logOutput = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn((message) => logOutput.push(message));
    console.error = jest.fn((message) => logOutput.push(`ERROR: ${message}`));

    // Mock ConfigDiscovery
    mockConfigDiscovery.requireProjectRoot.mockReturnValue(mockProjectRoot);

    // Mock WorkflowEngine
    mockEngine = {
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      getCollection: jest.fn().mockResolvedValue({
        metadata: {
          collection_id: 'test_collection',
          status: 'active',
          company: 'Test Company',
          role: 'Engineer',
        },
        artifacts: ['resume.md', 'cover_letter.md'],
        path: '/test/path',
      }),
      loadWorkflow: jest.fn().mockResolvedValue({
        workflow: {
          actions: [{ name: 'create' }, { name: 'format' }, { name: 'notes' }],
        },
      }),
      executeAction: jest.fn().mockResolvedValue(undefined),
    };
    mockWorkflowEngine.mockImplementation(() => mockEngine);
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('should require project root', async () => {
    mockConfigDiscovery.requireProjectRoot.mockImplementation(() => {
      throw new Error('Not in a project');
    });

    await expect(notesCommand('job', 'test_collection', 'recruiter')).rejects.toThrow(
      'Not in a project',
    );
  });

  it('should validate workflow exists', async () => {
    mockEngine.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    await expect(notesCommand('invalid', 'test_collection', 'recruiter')).rejects.toThrow(
      'Unknown workflow: invalid. Available: job, blog',
    );
  });

  it('should validate collection exists', async () => {
    mockEngine.getCollection.mockResolvedValue(null);

    await expect(notesCommand('job', 'nonexistent', 'recruiter')).rejects.toThrow(
      'Collection not found: nonexistent',
    );
  });

  it('should validate notes action exists', async () => {
    mockEngine.loadWorkflow.mockResolvedValue({
      workflow: {
        actions: [{ name: 'create' }, { name: 'format' }],
      },
    });

    await expect(notesCommand('job', 'test_collection', 'recruiter')).rejects.toThrow(
      "Notes action not available for workflow 'job'",
    );
  });

  it('should create notes successfully', async () => {
    await notesCommand('job', 'test_collection', 'recruiter');

    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'notes', {
      note_type: 'recruiter',
    });
    expect(logOutput).toContain('Creating recruiter notes for collection: test_collection');
    expect(logOutput).toContain('Location: /test/path');
    expect(logOutput).toContain('✅ Notes created successfully!');
  });

  it('should create notes with interviewer', async () => {
    await notesCommand('job', 'test_collection', 'technical', { interviewer: 'John Doe' });

    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'notes', {
      note_type: 'technical',
      interviewer: 'John Doe',
    });
  });

  it('should handle notes creation errors', async () => {
    mockEngine.executeAction.mockRejectedValue(new Error('Notes creation failed'));

    await expect(notesCommand('job', 'test_collection', 'recruiter')).rejects.toThrow(
      'Notes creation failed',
    );
    expect(logOutput).toContain('ERROR: ❌ Notes creation failed: Notes creation failed');
  });
});

describe('listNoteTypesCommand', () => {
  const mockProjectRoot = '/test/project';
  let mockEngine: any;
  let originalConsoleLog: any;
  let logOutput: string[];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock console methods
    logOutput = [];
    originalConsoleLog = console.log;
    console.log = jest.fn((message) => logOutput.push(message));

    // Mock ConfigDiscovery
    mockConfigDiscovery.requireProjectRoot.mockReturnValue(mockProjectRoot);

    // Mock WorkflowEngine
    mockEngine = {
      getAvailableWorkflows: jest.fn().mockReturnValue(['job', 'blog']),
      loadWorkflow: jest.fn().mockResolvedValue({
        workflow: {
          actions: [{ name: 'create' }, { name: 'format' }, { name: 'notes' }],
        },
      }),
    };
    mockWorkflowEngine.mockImplementation(() => mockEngine);
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
  });

  it('should validate workflow exists', async () => {
    mockEngine.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    await expect(listNoteTypesCommand('invalid')).rejects.toThrow(
      'Unknown workflow: invalid. Available: job, blog',
    );
  });

  it('should handle workflow without notes action', async () => {
    mockEngine.loadWorkflow.mockResolvedValue({
      workflow: {
        actions: [{ name: 'create' }, { name: 'format' }],
      },
    });

    await listNoteTypesCommand('job');

    expect(logOutput).toContain("No notes action available for workflow 'job'");
  });

  it('should display available note types', async () => {
    await listNoteTypesCommand('job');

    expect(logOutput.join('\n')).toContain("AVAILABLE NOTE TYPES FOR 'JOB' WORKFLOW");
    expect(logOutput.join('\n')).toContain('1. recruiter');
    expect(logOutput.join('\n')).toContain('Initial recruiter screening call');
    expect(logOutput.join('\n')).toContain('2. phone');
    expect(logOutput.join('\n')).toContain('Phone interview');
    expect(logOutput.join('\n')).toContain('3. technical');
    expect(logOutput.join('\n')).toContain('Technical interview');
    expect(logOutput.join('\n')).toContain('4. panel');
    expect(logOutput.join('\n')).toContain('Panel interview');
    expect(logOutput.join('\n')).toContain('5. behavioral');
    expect(logOutput.join('\n')).toContain('Behavioral interview');
    expect(logOutput.join('\n')).toContain('6. final');
    expect(logOutput.join('\n')).toContain('Final interview');
    expect(logOutput.join('\n')).toContain('7. onsite');
    expect(logOutput.join('\n')).toContain('Onsite interview');
    expect(logOutput.join('\n')).toContain('8. followup');
    expect(logOutput.join('\n')).toContain('Follow-up notes');
    expect(logOutput.join('\n')).toContain(
      'Usage: wf-notes <workflow> <collection_id> <note_type>',
    );
  });
});
