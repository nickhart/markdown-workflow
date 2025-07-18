import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { formatCommand, formatAllCommand } from '../../src/cli/commands/format.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { WorkflowEngine } from '../../src/core/WorkflowEngine.js';

// Mock dependencies
jest.mock('fs');
jest.mock('../../src/core/ConfigDiscovery.js');
jest.mock('../../src/core/WorkflowEngine.js');

const mockFs = jest.mocked(fs);
const mockConfigDiscovery = jest.mocked(ConfigDiscovery);
const mockWorkflowEngine = jest.mocked(WorkflowEngine);

describe('formatCommand', () => {
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

    await expect(formatCommand('job', 'test_collection')).rejects.toThrow('Not in a project');
  });

  it('should validate workflow exists', async () => {
    mockEngine.getAvailableWorkflows.mockReturnValue(['job', 'blog']);

    await expect(formatCommand('invalid', 'test_collection')).rejects.toThrow(
      'Unknown workflow: invalid. Available: job, blog',
    );
  });

  it('should validate collection exists', async () => {
    mockEngine.getCollection.mockResolvedValue(null);

    await expect(formatCommand('job', 'nonexistent')).rejects.toThrow(
      'Collection not found: nonexistent',
    );
  });

  it('should format collection successfully with default format', async () => {
    await formatCommand('job', 'test_collection');

    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'format', {
      format: 'docx',
    });
    expect(logOutput).toContain('Formatting collection: test_collection');
    expect(logOutput).toContain('Format: docx');
    expect(logOutput).toContain('Location: /test/path');
    expect(logOutput).toContain('✅ Formatting completed successfully!');
  });

  it('should format collection with specified format', async () => {
    await formatCommand('job', 'test_collection', { format: 'pdf' });

    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection', 'format', {
      format: 'pdf',
    });
    expect(logOutput).toContain('Format: pdf');
  });

  it('should handle formatting errors', async () => {
    mockEngine.executeAction.mockRejectedValue(new Error('Formatting failed'));

    await expect(formatCommand('job', 'test_collection')).rejects.toThrow('Formatting failed');
    expect(logOutput).toContain('ERROR: ❌ Formatting failed: Formatting failed');
  });
});

describe('formatAllCommand', () => {
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
      getCollections: jest.fn().mockResolvedValue([
        {
          metadata: {
            collection_id: 'test_collection_1',
            status: 'active',
            company: 'Test Company 1',
            role: 'Engineer',
          },
          artifacts: ['resume.md'],
          path: '/test/path1',
        },
        {
          metadata: {
            collection_id: 'test_collection_2',
            status: 'submitted',
            company: 'Test Company 2',
            role: 'Manager',
          },
          artifacts: ['resume.md'],
          path: '/test/path2',
        },
      ]),
      executeAction: jest.fn().mockResolvedValue(undefined),
    };
    mockWorkflowEngine.mockImplementation(() => mockEngine);
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  it('should handle empty collections', async () => {
    mockEngine.getCollections.mockResolvedValue([]);

    await formatAllCommand('job');

    expect(logOutput).toContain("No collections found for workflow 'job'");
  });

  it('should format all collections successfully', async () => {
    await formatAllCommand('job');

    expect(mockEngine.executeAction).toHaveBeenCalledTimes(2);
    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection_1', 'format', {
      format: 'docx',
    });
    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection_2', 'format', {
      format: 'docx',
    });
    expect(logOutput).toContain("Formatting 2 collections in workflow 'job'");
    expect(logOutput.join('\n')).toContain('Formatting: test_collection_1');
    expect(logOutput.join('\n')).toContain('Formatting: test_collection_2');
    expect(logOutput).toContain('Success: 2, Errors: 0');
  });

  it('should handle partial failures', async () => {
    mockEngine.executeAction
      .mockResolvedValueOnce(undefined) // First call succeeds
      .mockRejectedValueOnce(new Error('Format failed')); // Second call fails

    await formatAllCommand('job');

    expect(logOutput).toContain('ERROR: ❌ Failed to format test_collection_2: Format failed');
    expect(logOutput).toContain('Success: 1, Errors: 1');
  });

  it('should format with specified format', async () => {
    await formatAllCommand('job', { format: 'html' });

    expect(mockEngine.executeAction).toHaveBeenCalledWith('job', 'test_collection_1', 'format', {
      format: 'html',
    });
    expect(logOutput).toContain('Format: html');
  });
});
