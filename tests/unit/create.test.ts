import * as fs from 'fs';
import * as path from 'path';
import { createCommand } from '../../src/cli/commands/create.js';
import { ConfigDiscovery } from '../../src/core/ConfigDiscovery.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/core/ConfigDiscovery.js');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockConfigDiscovery = ConfigDiscovery as jest.Mocked<typeof ConfigDiscovery>;

// Helper function to create mock workflow YAML
function createMockWorkflowYAML(): string {
  return `workflow:
  name: "job"
  description: "Job application workflow"
  version: "1.0.0"
  stages:
    - name: "active"
      description: "Active applications"
      color: "blue"
  templates:
    - name: "resume"
      file: "templates/resume/default.md"
      output: "resume_john_doe.md"
      description: "Resume template"
    - name: "cover_letter"
      file: "templates/cover_letter/default.md"
      output: "cover_letter_john_doe.md"
      description: "Cover letter template"
  statics: []
  actions:
    - name: "create"
      description: "Create new collection"
      templates: ["resume", "cover_letter"]
  metadata:
    required_fields: ["company", "role"]
    optional_fields: ["url"]
    auto_generated: ["collection_id", "date_created"]
  collection_id:
    pattern: "{{company}}_{{role}}_{{date}}"
    max_length: 50`;
}

describe('createCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.resolve.mockImplementation((...args) => args.join('/'));
    
    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Setup default ConfigDiscovery mocks
    mockConfigDiscovery.requireProjectRoot.mockReturnValue('/project');
    mockConfigDiscovery.getProjectPaths.mockReturnValue({
      projectDir: '/project/.markdown-workflow',
      configFile: '/project/.markdown-workflow/config.yml',
      workflowsDir: '/project/.markdown-workflow/workflows',
      collectionsDir: '/project/.markdown-workflow/collections'
    });
    mockConfigDiscovery.resolveConfiguration.mockResolvedValue({
      paths: {
        systemRoot: '/system',
        projectRoot: '/project',
        projectConfig: '/project/.markdown-workflow/config.yml'
      },
      availableWorkflows: ['job', 'blog']
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validation', () => {
    it('should throw error if not in project', async () => {
      mockConfigDiscovery.requireProjectRoot.mockImplementation(() => {
        throw new Error('Not in a markdown-workflow project');
      });
      
      await expect(createCommand('job', 'Company', 'Role')).rejects.toThrow(
        'Not in a markdown-workflow project'
      );
    });

    it('should throw error for unknown workflow', async () => {
      await expect(createCommand('unknown', 'Company', 'Role')).rejects.toThrow(
        'Unknown workflow: unknown'
      );
    });

    it('should throw error if collection already exists', async () => {
      mockFs.existsSync.mockImplementation((path: string) => {
        // Return true for workflow files and collection directories
        return path.includes('workflow.yml') || path.includes('templates/') || path.includes('collections/');
      });
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('workflow.yml')) {
          return createMockWorkflowYAML();
        }
        return 'Template content';
      });
      
      await expect(createCommand('job', 'Company', 'Role')).rejects.toThrow(
        'Collection already exists'
      );
    });
  });

  describe('collection creation', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path: string) => {
        // Return true for workflow files, false for collection directories
        return path.includes('workflow.yml') || path.includes('templates/');
      });
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('workflow.yml')) {
          return createMockWorkflowYAML();
        }
        return 'Template content with {{company}} and {{role}}';
      });
    });

    it('should create collection directory', async () => {
      await createCommand('job', 'Test Company', 'Developer');
      
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('test_company_developer'),
        { recursive: true }
      );
    });

    it('should generate collection ID correctly', async () => {
      await createCommand('job', 'Test Company!', 'Senior Developer');
      
      const expectedId = expect.stringMatching(/test_company_senior_developer_\d{8}/);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('test_company_senior_developer'),
        { recursive: true }
      );
    });

    it('should create metadata file', async () => {
      await createCommand('job', 'Test Company', 'Developer');
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining('collection_id:')
      );
    });

    it('should include URL in metadata when provided', async () => {
      await createCommand('job', 'Test Company', 'Developer', {
        url: 'https://example.com/job'
      });
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('collection.yml'),
        expect.stringContaining('url: "https://example.com/job"')
      );
    });

    it('should process templates with variable substitution', async () => {
      await createCommand('job', 'Test Company', 'Developer');
      
      // Should write processed template files
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('resume_john_doe.md'),
        expect.stringContaining('Test Company')
      );
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('cover_letter_john_doe.md'),
        expect.stringContaining('Developer')
      );
    });
  });

  describe('collection ID generation', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path: string) => {
        // Return true for workflow files, false for collection directories
        return path.includes('workflow.yml') || path.includes('templates/');
      });
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('workflow.yml')) {
          return createMockWorkflowYAML();
        }
        return 'Template content';
      });
    });

    it('should sanitize company and role names', async () => {
      await createCommand('job', 'Test & Company!', 'Senior Developer (Remote)');
      
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('test_company_senior_developer_remote'),
        { recursive: true }
      );
    });

    it('should include date in collection ID', async () => {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      
      await createCommand('job', 'Company', 'Role');
      
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(`company_role_${dateStr}`),
        { recursive: true }
      );
    });

    it('should truncate long collection IDs', async () => {
      const longCompany = 'Very Long Company Name That Exceeds Normal Length';
      const longRole = 'Very Long Role Name That Also Exceeds Normal Length';
      
      await createCommand('job', longCompany, longRole);
      
      const callArg = mockFs.mkdirSync.mock.calls[0][0] as string;
      const collectionId = callArg.split('/').pop() || '';
      expect(collectionId.length).toBeLessThanOrEqual(50);
    });
  });

  describe('template processing', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path: string) => {
        // Return true for workflow files, false for collection directories
        return path.includes('workflow.yml') || path.includes('templates/');
      });
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('workflow.yml')) {
          return createMockWorkflowYAML();
        }
        return 'Template content';
      });
    });

    it('should handle missing template files gracefully', async () => {
      mockFs.existsSync.mockImplementation((path: string) => {
        // Return true for workflow files, false for template files
        return path.includes('workflow.yml') && !path.includes('templates/');
      });
      
      const consoleSpy = jest.spyOn(console, 'warn');
      
      await createCommand('job', 'Company', 'Role');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Template not found')
      );
    });

    it('should handle template processing errors', async () => {
      mockFs.readFileSync.mockImplementation((path: string) => {
        // Return workflow definition for workflow.yml, throw error for templates
        if (path.includes('workflow.yml')) {
          return createMockWorkflowYAML();
        }
        throw new Error('Read error');
      });
      
      const consoleSpy = jest.spyOn(console, 'error');
      
      await createCommand('job', 'Company', 'Role');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error processing template'),
        expect.any(Error)
      );
    });

    it('should substitute variables in templates', async () => {
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('workflow.yml')) {
          return createMockWorkflowYAML();
        }
        return 'Company: {{company}}, Role: {{role}}, Date: {{date}}';
      });
      
      await createCommand('job', 'Test Corp', 'Engineer');
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Company: Test Corp, Role: Engineer')
      );
    });
  });

  describe('console output', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path: string) => {
        // Return true for workflow files, false for collection directories
        return path.includes('workflow.yml') || path.includes('templates/');
      });
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('workflow.yml')) {
          return createMockWorkflowYAML();
        }
        return 'Template content';
      });
    });

    it('should log creation progress', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await createCommand('job', 'Test Company', 'Developer');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Creating collection:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Location:')
      );
      expect(consoleSpy).toHaveBeenCalledWith('✅ Collection created successfully!');
    });

    it('should log next steps', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await createCommand('job', 'Test Company', 'Developer');
      
      expect(consoleSpy).toHaveBeenCalledWith('Next steps:');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('wf format')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('wf status')
      );
    });

    it('should log created files', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await createCommand('job', 'Test Company', 'Developer');
      
      expect(consoleSpy).toHaveBeenCalledWith('Created: resume_john_doe.md');
      expect(consoleSpy).toHaveBeenCalledWith('Created: cover_letter_john_doe.md');
    });
  });

  describe('options handling', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path: string) => {
        // Return true for workflow files, false for collection directories
        return path.includes('workflow.yml') || path.includes('templates/');
      });
      mockFs.readFileSync.mockImplementation((path: string) => {
        if (path.includes('workflow.yml')) {
          return createMockWorkflowYAML();
        }
        return 'Template content';
      });
    });

    it('should use custom working directory', async () => {
      await createCommand('job', 'Company', 'Role', { cwd: '/custom' });
      
      expect(mockConfigDiscovery.requireProjectRoot).toHaveBeenCalledWith('/custom');
    });

    it('should use current directory by default', async () => {
      await createCommand('job', 'Company', 'Role');
      
      expect(mockConfigDiscovery.requireProjectRoot).toHaveBeenCalledWith(process.cwd());
    });

    it('should handle template variant option', async () => {
      await createCommand('job', 'Company', 'Role', { template_variant: 'mobile' });
      
      // Should pass template_variant to template processing
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });
});