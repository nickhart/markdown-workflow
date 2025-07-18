import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { listCommand } from '../../src/cli/commands/list.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { WorkflowEngine } from '../../src/core/WorkflowEngine.js';

// Mock dependencies
jest.mock('fs');
jest.mock('../../src/core/ConfigDiscovery.js');
jest.mock('../../src/core/WorkflowEngine.js');

const mockFs = jest.mocked(fs);
const mockConfigDiscovery = jest.mocked(ConfigDiscovery);
const mockWorkflowEngine = jest.mocked(WorkflowEngine);

describe('listCommand', () => {
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
      getCollections: jest.fn().mockResolvedValue([]),
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

    await expect(listCommand('job')).rejects.toThrow('Not in a project');
  });

  it('should validate workflow exists', async () => {
    mockEngine.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    await expect(listCommand('invalid')).rejects.toThrow(
      'Unknown workflow: invalid. Available: job, blog',
    );
  });

  it('should handle empty collections', async () => {
    mockEngine.getCollections.mockResolvedValue([]);

    await listCommand('job');

    expect(logOutput).toContain("No collections found for workflow 'job'");
  });

  it('should display collections in table format', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'test_company_engineer_20240101',
          company: 'Test Company',
          role: 'Engineer',
          status: 'active',
          date_created: '2024-01-01T00:00:00Z',
          date_modified: '2024-01-01T00:00:00Z',
        },
        artifacts: ['resume.md', 'cover_letter.md'],
        path: '/test/path',
      },
    ];

    mockEngine.getCollections.mockResolvedValue(mockCollections);

    await listCommand('job');

    expect(logOutput.join('\n')).toContain('JOB COLLECTIONS');
    expect(logOutput.join('\n')).toContain('test_company_engineer_20240101');
    expect(logOutput.join('\n')).toContain('Test Company');
    expect(logOutput.join('\n')).toContain('Engineer');
    expect(logOutput.join('\n')).toContain('active');
    expect(logOutput.join('\n')).toContain('Total: 1 collections');
  });

  it('should filter collections by status', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'test1',
          company: 'Test Company 1',
          role: 'Engineer',
          status: 'active',
          date_created: '2024-01-01T00:00:00Z',
          date_modified: '2024-01-01T00:00:00Z',
        },
        artifacts: [],
        path: '/test/path1',
      },
      {
        metadata: {
          collection_id: 'test2',
          company: 'Test Company 2',
          role: 'Manager',
          status: 'submitted',
          date_created: '2024-01-02T00:00:00Z',
          date_modified: '2024-01-02T00:00:00Z',
        },
        artifacts: [],
        path: '/test/path2',
      },
    ];

    mockEngine.getCollections.mockResolvedValue(mockCollections);

    await listCommand('job', { status: 'active' });

    expect(logOutput.join('\n')).toContain('test1');
    expect(logOutput.join('\n')).not.toContain('test2');
  });

  it('should handle JSON output format', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'test_collection',
          company: 'Test Company',
          role: 'Engineer',
          status: 'active',
          date_created: '2024-01-01T00:00:00Z',
          date_modified: '2024-01-01T00:00:00Z',
        },
        artifacts: [],
        path: '/test/path',
      },
    ];

    mockEngine.getCollections.mockResolvedValue(mockCollections);

    await listCommand('job', { format: 'json' });

    const output = logOutput.join('\n');
    expect(output).toContain('"collection_id": "test_collection"');
    expect(output).toContain('"company": "Test Company"');
  });

  it('should handle YAML output format (not implemented)', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'test_collection',
          company: 'Test Company',
          role: 'Engineer',
          status: 'active',
          date_created: '2024-01-01T00:00:00Z',
          date_modified: '2024-01-01T00:00:00Z',
        },
        artifacts: [],
        path: '/test/path',
      },
    ];

    mockEngine.getCollections.mockResolvedValue(mockCollections);

    await listCommand('job', { format: 'yaml' });

    expect(logOutput).toContain('YAML output not yet implemented');
  });

  it('should sort collections by date created (newest first)', async () => {
    const mockCollections = [
      {
        metadata: {
          collection_id: 'older',
          company: 'Test Company',
          role: 'Engineer',
          status: 'active',
          date_created: '2024-01-01T00:00:00Z',
          date_modified: '2024-01-01T00:00:00Z',
        },
        artifacts: [],
        path: '/test/path1',
      },
      {
        metadata: {
          collection_id: 'newer',
          company: 'Test Company',
          role: 'Manager',
          status: 'active',
          date_created: '2024-01-02T00:00:00Z',
          date_modified: '2024-01-02T00:00:00Z',
        },
        artifacts: [],
        path: '/test/path2',
      },
    ];

    mockEngine.getCollections.mockResolvedValue(mockCollections);

    await listCommand('job');

    const output = logOutput.join('\n');
    const newerIndex = output.indexOf('newer');
    const olderIndex = output.indexOf('older');

    expect(newerIndex).toBeLessThan(olderIndex);
  });
});
