import * as fs from 'fs';
import * as path from 'path';
import { createWithHelpCommand } from '../../../../src/cli/commands/create-with-help.js';
import { ConfigDiscovery } from '../../../../src/core/config-discovery.js';
import { MockSystemInterface } from '../../mocks/mock-system-interface.js';
import { createEnhancedMockFileSystem } from '../../helpers/file-system-helpers.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('createWithHelpCommand', () => {
  let mockSystemInterface: MockSystemInterface;
  let configDiscovery: ConfigDiscovery;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((p) => {
      const parts = p.split('/');
      return parts.slice(0, -1).join('/') || '/';
    });
    mockPath.parse.mockImplementation((p) => ({
      root: '/',
      dir: p.substring(0, p.lastIndexOf('/')),
      base: p.substring(p.lastIndexOf('/') + 1),
      ext: p.substring(p.lastIndexOf('.')),
      name: p.substring(p.lastIndexOf('/') + 1, p.lastIndexOf('.')),
    }));

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create mock file system
    mockSystemInterface = createEnhancedMockFileSystem();
    configDiscovery = new ConfigDiscovery(mockSystemInterface);

    // Setup filesystem mocks
    mockFs.existsSync.mockImplementation((filePath: string) =>
      mockSystemInterface.existsSync(filePath as string),
    );
    mockFs.readFileSync.mockImplementation((filePath: string) =>
      mockSystemInterface.readFileSync(filePath as string),
    );
    mockFs.statSync.mockImplementation((filePath: string) =>
      mockSystemInterface.statSync(filePath as string),
    );
    mockFs.readdirSync.mockImplementation((filePath: string) =>
      mockSystemInterface.readdirSync(filePath as string),
    );
  });

  it('should show general help when no arguments provided', async () => {
    const options = { configDiscovery };

    await expect(createWithHelpCommand([], options)).rejects.toThrow('Missing workflow argument');

    expect(console.error).toHaveBeenCalledWith('Usage: wf create <workflow> <args...>');
    expect(console.error).toHaveBeenCalledWith('Available workflows:');
  });

  it('should show workflow-specific usage for job workflow', async () => {
    const options = { configDiscovery };

    await expect(createWithHelpCommand(['job'], options)).rejects.toThrow(
      'Missing required arguments',
    );

    expect(console.error).toHaveBeenCalledWith(
      'Usage: wf create job <company> <role> [--url <job_posting_url>] [--template-variant <variant>]',
    );
    expect(console.error).toHaveBeenCalledWith('Create new collection');
  });

  it('should show workflow-specific usage for blog workflow', async () => {
    const options = { configDiscovery };

    await expect(createWithHelpCommand(['blog'], options)).rejects.toThrow(
      'Missing required arguments',
    );

    expect(console.error).toHaveBeenCalledWith(
      'Usage: wf create blog <title> <description> [--url <url>] [--template-variant <variant>]',
    );
    expect(console.error).toHaveBeenCalledWith('Create new post');
  });

  it('should handle unknown workflow', async () => {
    const options = { configDiscovery };

    await expect(createWithHelpCommand(['unknown'], options)).rejects.toThrow(
      'Unknown workflow: unknown',
    );

    expect(console.error).toHaveBeenCalledWith('Unknown workflow: unknown');
    expect(console.error).toHaveBeenCalledWith('Available workflows: blog, job');
  });

  it('should handle workflow with partial arguments', async () => {
    const options = { configDiscovery };

    await expect(createWithHelpCommand(['job', 'OnlyCompany'], options)).rejects.toThrow(
      'Missing required arguments',
    );

    expect(console.error).toHaveBeenCalledWith(
      'Usage: wf create job <company> <role> [--url <job_posting_url>] [--template-variant <variant>]',
    );
  });

  it('should proceed to create command when enough arguments provided', async () => {
    const options = { configDiscovery };

    // This will fail because we're not in a project, but it should reach the createCommand
    await expect(createWithHelpCommand(['job', 'Company', 'Role'], options)).rejects.toThrow(
      'Not in a markdown-workflow project',
    );
  });

  it('should handle system discovery failures', async () => {
    const failingSystemInterface = new MockSystemInterface();
    const failingConfigDiscovery = new ConfigDiscovery(failingSystemInterface);
    const options = { configDiscovery: failingConfigDiscovery };

    await expect(createWithHelpCommand([], options)).rejects.toThrow('Missing workflow argument');

    // Should still show general help even if system discovery fails
    expect(console.error).toHaveBeenCalledWith('Usage: wf create <workflow> <args...>');
    expect(console.error).toHaveBeenCalledWith('  (Unable to load workflows)');
  });
});
