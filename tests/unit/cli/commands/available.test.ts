import * as fs from 'fs';
import * as path from 'path';
import { availableCommand } from '../../../../src/cli/commands/available.js';
import { ConfigDiscovery } from '../../../../src/core/config-discovery.js';
import { MockSystemInterface } from '../../mocks/mock-system-interface.js';
import { createEnhancedMockFileSystem } from '../../helpers/file-system-helpers.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('availableCommand', () => {
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

    // Create enhanced mock file system (includes system structure)
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

  it('should list available workflows', async () => {
    const options = { configDiscovery };

    await expect(availableCommand(options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Available Workflows:\n');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('job'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Job application workflow'));
  });

  it('should handle no available workflows', async () => {
    // Create a mock system with no workflows
    const emptySystemInterface = new MockSystemInterface();
    emptySystemInterface.addMockDirectory('/mock/system/root');
    emptySystemInterface.addMockFile(
      '/mock/system/root/package.json',
      JSON.stringify({ name: 'markdown-workflow' }),
    );
    emptySystemInterface.addMockDirectory('/mock/system/root/workflows');

    const emptyConfigDiscovery = new ConfigDiscovery(emptySystemInterface);
    const options = { configDiscovery: emptyConfigDiscovery };

    await expect(availableCommand(options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('No workflows available.');
  });

  it('should handle invalid workflow definitions gracefully', async () => {
    // Create a fresh system interface to have full control
    const customSystemInterface = new MockSystemInterface();

    // Add system root structure
    customSystemInterface.addMockDirectory('/mock/system/root');
    customSystemInterface.addMockFile(
      '/mock/system/root/package.json',
      JSON.stringify({ name: 'markdown-workflow' }),
    );
    customSystemInterface.addMockDirectory('/mock/system/root/workflows');

    // Add valid workflow
    customSystemInterface.addMockDirectory('/mock/system/root/workflows/job');
    customSystemInterface.addMockFile(
      '/mock/system/root/workflows/job/workflow.yml',
      'workflow:\n  name: "job"\n  description: "Job workflow"\n  version: "1.0.0"\n  stages: []\n  templates: []\n  actions: []',
    );

    // Add invalid workflow
    customSystemInterface.addMockDirectory('/mock/system/root/workflows/invalid');
    customSystemInterface.addMockFile(
      '/mock/system/root/workflows/invalid/workflow.yml',
      'invalid: yaml: content: {',
    );

    // Setup filesystem mocks for this custom interface
    mockFs.existsSync.mockImplementation((filePath: string) =>
      customSystemInterface.existsSync(filePath as string),
    );
    mockFs.readFileSync.mockImplementation((filePath: string) =>
      customSystemInterface.readFileSync(filePath as string),
    );
    mockFs.statSync.mockImplementation((filePath: string) =>
      customSystemInterface.statSync(filePath as string),
    );
    mockFs.readdirSync.mockImplementation((filePath: string) =>
      customSystemInterface.readdirSync(filePath as string),
    );

    const customConfigDiscovery = new ConfigDiscovery(customSystemInterface);
    const options = { configDiscovery: customConfigDiscovery };

    await expect(availableCommand(options)).resolves.not.toThrow();

    expect(console.log).toHaveBeenCalledWith('Available Workflows:\n');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('invalid'));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('(error reading workflow definition)'),
    );
  });

  it('should handle system discovery failures', async () => {
    // Create a mock that will fail system discovery
    const failingSystemInterface = new MockSystemInterface();
    const failingConfigDiscovery = new ConfigDiscovery(failingSystemInterface);
    const options = { configDiscovery: failingConfigDiscovery };

    await expect(availableCommand(options)).rejects.toThrow('System root not found');
  });

  it('should work without project context', async () => {
    // This command should work even without being in a project
    const options = { configDiscovery };

    await expect(availableCommand(options)).resolves.not.toThrow();

    // Should still show available workflows
    expect(console.log).toHaveBeenCalledWith('Available Workflows:\n');
  });

  it('should format workflow names consistently', async () => {
    const options = { configDiscovery };

    await expect(availableCommand(options)).resolves.not.toThrow();

    // Check that workflow names are padded consistently
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^[a-z]+\s+- .+$/));
  });
});
