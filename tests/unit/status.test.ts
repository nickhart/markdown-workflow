import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { statusCommand, showStatusesCommand } from '../../src/cli/commands/status.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { WorkflowEngine } from '../../src/core/WorkflowEngine.js';

// Mock dependencies
jest.mock('fs');
jest.mock('../../src/core/ConfigDiscovery.js');
jest.mock('../../src/core/WorkflowEngine.js');

const mockFs = jest.mocked(fs);
const mockConfigDiscovery = jest.mocked(ConfigDiscovery);
const mockWorkflowEngine = jest.mocked(WorkflowEngine);

describe('statusCommand', () => {
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
      loadWorkflow: jest.fn().mockResolvedValue({
        workflow: {
          stages: [
            { name: 'active', description: 'Active applications', next: ['submitted', 'rejected'] },
            {
              name: 'submitted',
              description: 'Submitted applications',
              next: ['interview', 'rejected'],
            },
            {
              name: 'interview',
              description: 'Interview scheduled',
              next: ['offered', 'rejected'],
            },
            { name: 'offered', description: 'Job offers', next: ['accepted', 'rejected'] },
            { name: 'rejected', description: 'Rejected applications', terminal: true },
          ],
        },
      }),
      getCollection: jest.fn().mockResolvedValue({
        metadata: {
          collection_id: 'test_collection',
          status: 'active',
          company: 'Test Company',
          role: 'Engineer',
        },
        artifacts: [],
        path: '/test/path',
      }),
      updateCollectionStatus: jest.fn().mockResolvedValue(undefined),
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

    await expect(statusCommand('job', 'test_collection', 'submitted')).rejects.toThrow(
      'Not in a project',
    );
  });

  it('should validate workflow exists', async () => {
    mockEngine.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    await expect(statusCommand('invalid', 'test_collection', 'submitted')).rejects.toThrow(
      'Unknown workflow: invalid. Available: job, blog',
    );
  });

  it('should validate collection exists', async () => {
    mockEngine.getCollection.mockResolvedValue(null);

    await expect(statusCommand('job', 'nonexistent', 'submitted')).rejects.toThrow(
      'Collection not found: nonexistent',
    );
  });

  it('should validate status exists', async () => {
    await expect(statusCommand('job', 'test_collection', 'invalid_status')).rejects.toThrow(
      'Invalid status',
    );

    expect(logOutput).toContain('ERROR: Invalid status: invalid_status');
    expect(logOutput).toContain(
      'ERROR: Valid statuses: active, submitted, interview, offered, rejected',
    );
  });

  it('should update status successfully', async () => {
    await statusCommand('job', 'test_collection', 'submitted');

    expect(mockEngine.updateCollectionStatus).toHaveBeenCalledWith(
      'job',
      'test_collection',
      'submitted',
    );
    expect(logOutput).toContain('Current status: active');
    expect(logOutput).toContain('Requested status: submitted');
    expect(logOutput).toContain('✅ Status updated: active → submitted');
  });

  it('should show valid transitions', async () => {
    await statusCommand('job', 'test_collection', 'submitted');

    expect(logOutput).toContain("Valid transitions from 'active': submitted, rejected");
  });

  it('should handle update errors', async () => {
    mockEngine.updateCollectionStatus.mockRejectedValue(new Error('Invalid transition'));

    await expect(statusCommand('job', 'test_collection', 'submitted')).rejects.toThrow(
      'Invalid transition',
    );
    expect(logOutput).toContain('ERROR: ❌ Status update failed: Invalid transition');
  });
});

describe('showStatusesCommand', () => {
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
          stages: [
            { name: 'active', description: 'Active applications', next: ['submitted', 'rejected'] },
            {
              name: 'submitted',
              description: 'Submitted applications',
              next: ['interview', 'rejected'],
            },
            { name: 'rejected', description: 'Rejected applications', terminal: true },
          ],
        },
      }),
    };
    mockWorkflowEngine.mockImplementation(() => mockEngine);
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
  });

  it('should display workflow stages', async () => {
    await showStatusesCommand('job');

    expect(logOutput.join('\n')).toContain("STATUS STAGES FOR 'JOB' WORKFLOW");
    expect(logOutput.join('\n')).toContain('1. active');
    expect(logOutput.join('\n')).toContain('Active applications → submitted, rejected');
    expect(logOutput.join('\n')).toContain('2. submitted');
    expect(logOutput.join('\n')).toContain('Submitted applications → interview, rejected');
    expect(logOutput.join('\n')).toContain('3. rejected (terminal)');
    expect(logOutput.join('\n')).toContain('Rejected applications');
  });

  it('should validate workflow exists', async () => {
    mockEngine.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    await expect(showStatusesCommand('invalid')).rejects.toThrow(
      'Unknown workflow: invalid. Available: job, blog',
    );
  });
});
