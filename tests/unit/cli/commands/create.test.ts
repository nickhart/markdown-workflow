import * as fs from 'fs';
import * as path from 'path';
import { createCommand } from '../../../../src/cli/commands/create.js';
import { ConfigDiscovery } from '../../../../src/core/config-discovery.js';
import { MockSystemInterface } from '../../mocks/mock-system-interface.js';
import {
  createMockFileSystem,
  createEnhancedMockFileSystem,
} from '../../helpers/file-system-helpers.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../../../src/shared/web-scraper.js', () => ({
  scrapeUrl: jest.fn().mockResolvedValue({
    success: true,
    outputFile: 'job_description.html',
    method: 'wget',
  }),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('createCommand', () => {
  let mockSystemInterface: MockSystemInterface;
  let configDiscovery: ConfigDiscovery;

  beforeEach(async () => {
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

    // Create a comprehensive mock file system with both system and project structure
    mockSystemInterface = createEnhancedMockFileSystem();

    // Add project structure to the system
    const projectPath = '/mock/project';
    mockSystemInterface.addMockDirectory(projectPath);
    mockSystemInterface.addMockDirectory(`${projectPath}/.markdown-workflow`);
    mockSystemInterface.addMockDirectory(`${projectPath}/.markdown-workflow/workflows`);
    mockSystemInterface.addMockDirectory(`${projectPath}/.markdown-workflow/collections`);
    mockSystemInterface.addMockFile(
      `${projectPath}/.markdown-workflow/config.yml`,
      `user:
  name: "Test User"
  preferred_name: "test_user"
  email: "test@example.com"
  phone: "(555) 123-4567"
  address: "123 Test St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "linkedin.com/in/testuser"
  github: "github.com/testuser"
  website: "testuser.com"

system:
  scraper: "wget"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  output_formats:
    - "docx"
    - "html"
    - "pdf"
  git:
    auto_commit: false
    commit_message_template: "Update {{workflow}} collection {{collection_id}}"
  collection_id:
    date_format: "YYYYMMDD"
    sanitize_spaces: "_"
    max_length: 50

workflows: {}`,
    );

    configDiscovery = new ConfigDiscovery(mockSystemInterface);

    // Mock system setup is now working correctly!

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
          configDiscovery: noProjectConfig,
        }),
      ).rejects.toThrow('Not in a markdown-workflow project');
    });

    it('should throw error for unknown workflow', async () => {
      await expect(
        createCommand('unknown', 'Acme Corp', 'Developer', {
          cwd: '/mock/project',
          configDiscovery,
        }),
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
          configDiscovery,
        }),
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
        configDiscovery,
      });

      // Should create collection directory
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('acme_corp_developer_'),
        { recursive: true },
      );

      // Should create metadata file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining('collection_id: "acme_corp_developer_'),
      );

      // Should log success
      expect(console.log).toHaveBeenCalledWith('✅ Collection created successfully!');
    });

    it('should generate correct collection ID', async () => {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      await createCommand('job', 'Acme Corp', 'Developer', {
        cwd: '/mock/project',
        configDiscovery,
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining(`acme_corp_developer_${dateStr}`),
      );
    });

    it('should include URL in metadata when provided', async () => {
      await createCommand('job', 'Acme Corp', 'Developer', {
        url: 'https://example.com/job',
        cwd: '/mock/project',
        configDiscovery,
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining('url: "https://example.com/job"'),
      );
    });

    it('should process templates', async () => {
      await createCommand('job', 'Acme Corp', 'Developer', {
        cwd: '/mock/project',
        configDiscovery,
      });

      // Should create collection directory
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('acme_corp_developer_'),
        { recursive: true },
      );

      // Should create metadata file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining('collection_id: "acme_corp_developer_'),
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
        configDiscovery,
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringMatching(/acme_corp_co_senior_developer_remote_\d{8}/),
      );
    });

    it('should truncate long collection IDs', async () => {
      const longCompany = 'A'.repeat(30);
      const longRole = 'B'.repeat(30);

      await createCommand('job', longCompany, longRole, {
        cwd: '/mock/project',
        configDiscovery,
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/collection\.yml$/),
        expect.stringMatching(/collection_id: "[^"]{1,50}"/),
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
          configDiscovery,
        }),
      ).resolves.not.toThrow();

      // Should log warning
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Template not found'));
    });

    it('should handle template processing errors gracefully', async () => {
      mockFs.readFileSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.includes('templates/')) {
          throw new Error('Read error');
        }
        if (typeof path !== 'string') {
          throw new Error('Expected string path');
        }
        return mockSystemInterface.readFileSync(path);
      });

      // Should not throw error
      await expect(
        createCommand('job', 'Acme Corp', 'Developer', {
          cwd: '/mock/project',
          configDiscovery,
        }),
      ).resolves.not.toThrow();

      // Should create collection successfully even with template errors
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('acme_corp_developer_'),
        { recursive: true },
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
      const customSystem = createEnhancedMockFileSystem();
      // Add the custom project structure
      customSystem.addMockDirectory('/custom');
      customSystem.addMockDirectory('/custom/.markdown-workflow');
      customSystem.addMockDirectory('/custom/.markdown-workflow/workflows');
      customSystem.addMockDirectory('/custom/.markdown-workflow/collections');
      customSystem.addMockFile(
        '/custom/.markdown-workflow/config.yml',
        `user:
  name: "Custom User"
  preferred_name: "custom_user"

system:
  scraper: "wget"

workflows: {}`,
      );
      const customConfig = new ConfigDiscovery(customSystem);

      await createCommand('job', 'Acme Corp', 'Developer', {
        cwd: '/custom',
        configDiscovery: customConfig,
      });

      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });

    it('should handle template variant option', async () => {
      await createCommand('job', 'Acme Corp', 'Developer', {
        template_variant: 'mobile',
        cwd: '/mock/project',
        configDiscovery,
      });

      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });
  });
});
