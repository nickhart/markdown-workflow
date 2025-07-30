import { listAliasesCommand } from '../../../../src/cli/commands/aliases.js';
import { ConfigDiscovery } from '../../../../src/core/config-discovery.js';

// Mock dependencies
jest.mock('../../../../src/core/config-discovery.js');

const mockConfigDiscovery = ConfigDiscovery as jest.MockedClass<typeof ConfigDiscovery>;

describe('aliases command', () => {
  let consoleSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('listAliasesCommand', () => {
    it('should handle system discovery errors gracefully', async () => {
      // Mock system config discovery to throw error
      mockConfigDiscovery.prototype.discoverSystemConfiguration.mockImplementation(() => {
        throw new Error('System discovery failed');
      });

      // Should throw the error (as designed)
      await expect(listAliasesCommand()).rejects.toThrow('System discovery failed');
    });

    it('should handle workflows with no aliases', async () => {
      // Mock system config with no workflows
      mockConfigDiscovery.prototype.discoverSystemConfiguration.mockReturnValue({
        availableWorkflows: [],
        systemRoot: '/mock/system/root',
      });

      await listAliasesCommand();

      // Should show no aliases message
      expect(consoleSpy).toHaveBeenCalledWith('ℹ️ No workflow aliases configured.');
    });

    it('should handle non-existent workflow filter', async () => {
      // Mock system config with some workflows
      mockConfigDiscovery.prototype.discoverSystemConfiguration.mockReturnValue({
        availableWorkflows: ['job'],
        systemRoot: '/mock/system/root',
      });

      await listAliasesCommand('nonexistent');

      // Should show error for specific workflow
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ No aliases found for workflow: nonexistent');
    });

    it('should call ConfigDiscovery to discover system configuration', async () => {
      // Mock system config
      mockConfigDiscovery.prototype.discoverSystemConfiguration.mockReturnValue({
        availableWorkflows: ['job'],
        systemRoot: '/mock/system/root',
      });

      await listAliasesCommand();

      // Should have called discoverSystemConfiguration
      expect(mockConfigDiscovery.prototype.discoverSystemConfiguration).toHaveBeenCalled();
    });
  });
});
