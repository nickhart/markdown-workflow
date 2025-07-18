import * as fs from 'fs';
import * as path from 'path';
import { createCommand } from '../../src/cli/commands/create.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';
import { MockSystemInterface } from '../mocks/MockSystemInterface.js';
import { createMockFileSystem, createProjectFileSystem, populateFileSystem } from '../helpers/FileSystemHelpers.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('createCommand', () => {
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

    // Create filesystem with both system and project layout
    mockSystemInterface = createMockFileSystem();
    populateFileSystem(mockSystemInterface, createProjectFileSystem('/mock/project'));
    configDiscovery = new ConfigDiscovery(mockSystemInterface);
    
    // Setup fs mocks for loadWorkflowDefinition and template processing
    mockFs.existsSync.mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('workflow.yml')) {
        return true;
      }
      if (typeof path === 'string' && path.includes('templates/')) {
        return mockSystemInterface.existsSync(path);
      }
      return false;
    });
    
    mockFs.mkdirSync.mockImplementation();
    mockFs.writeFileSync.mockImplementation();
    mockFs.readFileSync.mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('workflow.yml')) {
        return mockSystemInterface.readFileSync(path);
      }
      if (typeof path === 'string' && path.includes('templates/')) {
        try {
          return mockSystemInterface.readFileSync(path);
        } catch {
          return '# Template: {{user.name}} at {{company}}';
        }
      }
      if (typeof path === 'string' && path.includes('config.yml')) {
        return mockSystemInterface.readFileSync(path);
      }
      return 'mock content';
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validation', () => {
    it('should throw error if not in project', async () => {
      // Create system without project marker
      const noProjectSystem = createMockFileSystem();
      const noProjectConfig = new ConfigDiscovery(noProjectSystem);

      await expect(
        createCommand('job', 'Acme Corp', 'Developer', { 
          cwd: '/mock/project',
          configDiscovery: noProjectConfig 
        })
      ).rejects.toThrow('Not in a markdown-workflow project');
    });

    it('should throw error for unknown workflow', async () => {
      await expect(
        createCommand('unknown', 'Acme Corp', 'Developer', { 
          cwd: '/mock/project',
          configDiscovery 
        })
      ).rejects.toThrow('Unknown workflow: unknown');
    });

    it('should throw error if collection already exists', async () => {
      // Mock that collection directory already exists
      mockFs.existsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('acme_corp_developer_')) {
          return true;
        }
        if (typeof path === 'string' && path.includes('workflow.yml')) {
          return true;
        }
        return false;
      });

      await expect(
        createCommand('job', 'Acme Corp', 'Developer', { 
          cwd: '/mock/project',
          configDiscovery 
        })
      ).rejects.toThrow('Collection already exists');
    });
  });

  describe('collection creation', () => {
    beforeEach(() => {
      // Mock that collection directory doesn't exist initially
      mockFs.existsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('acme_corp_developer_')) {
          return false;
        }
        if (typeof path === 'string' && path.includes('workflow.yml')) {
          return true;
        }
        return false;
      });
    });

    it('should create collection successfully', async () => {
      await createCommand('job', 'Acme Corp', 'Developer', { 
        cwd: '/mock/project',
        configDiscovery 
      });

      // Should create collection directory
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('acme_corp_developer_'),
        { recursive: true }
      );

      // Should create metadata file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining('company: "Acme Corp"')
      );

      // Should log success
      expect(console.log).toHaveBeenCalledWith('✅ Collection created successfully!');
    });

    it('should generate correct collection ID', async () => {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      
      await createCommand('job', 'Acme Corp', 'Developer', { 
        cwd: '/mock/project',
        configDiscovery 
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining(`acme_corp_developer_${dateStr}`)
      );
    });

    it('should include URL in metadata when provided', async () => {
      await createCommand('job', 'Acme Corp', 'Developer', { 
        url: 'https://example.com/job',
        cwd: '/mock/project',
        configDiscovery 
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining('url: "https://example.com/job"')
      );
    });

    it('should process templates', async () => {
      await createCommand('job', 'Acme Corp', 'Developer', { 
        cwd: '/mock/project',
        configDiscovery 
      });

      // Should create collection directory
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('acme_corp_developer_'),
        { recursive: true }
      );

      // Should create metadata file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining('company: "Acme Corp"')
      );
    });
  });

  describe('collection ID generation', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('workflow.yml')) {
          return true;
        }
        return false;
      });
    });

    it('should sanitize company and role names', async () => {
      await createCommand('job', 'Acme Corp & Co!', 'Senior Developer (Remote)', { 
        cwd: '/mock/project',
        configDiscovery 
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringMatching(/acme_corp_co_senior_developer_remote_\d{8}/)
      );
    });

    it('should truncate long collection IDs', async () => {
      const longCompany = 'A'.repeat(30);
      const longRole = 'B'.repeat(30);
      
      await createCommand('job', longCompany, longRole, { 
        cwd: '/mock/project',
        configDiscovery 
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/collection\.yml$/),
        expect.stringMatching(/collection_id: "[^"]{1,50}"/)
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('workflow.yml')) {
          return true;
        }
        return false;
      });
    });

    it('should handle missing template files gracefully', async () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('templates/')) {
          return false;
        }
        if (typeof path === 'string' && path.includes('workflow.yml')) {
          return true;
        }
        return false;
      });

      // Should not throw error
      await expect(
        createCommand('job', 'Acme Corp', 'Developer', { 
          cwd: '/mock/project',
          configDiscovery 
        })
      ).resolves.not.toThrow();

      // Should log warning
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Template not found')
      );
    });

    it('should handle template processing errors gracefully', async () => {
      mockFs.readFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('templates/')) {
          throw new Error('Read error');
        }
        return mockSystemInterface.readFileSync(path);
      });

      // Should not throw error
      await expect(
        createCommand('job', 'Acme Corp', 'Developer', { 
          cwd: '/mock/project',
          configDiscovery 
        })
      ).resolves.not.toThrow();

      // Should create collection successfully even with template errors
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('acme_corp_developer_'),
        { recursive: true }
      );
    });
  });

  describe('options handling', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('workflow.yml')) {
          return true;
        }
        return false;
      });
    });

    it('should use custom working directory', async () => {
      // Create a custom project filesystem at /custom path
      const customSystem = createMockFileSystem();
      populateFileSystem(customSystem, createProjectFileSystem('/custom'));
      const customConfig = new ConfigDiscovery(customSystem);

      await createCommand('job', 'Acme Corp', 'Developer', { 
        cwd: '/custom',
        configDiscovery: customConfig
      });

      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });

    it('should handle template variant option', async () => {
      await createCommand('job', 'Acme Corp', 'Developer', { 
        template_variant: 'mobile',
        cwd: '/mock/project',
        configDiscovery
      });

      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });
  });
});