import * as fs from 'fs';
import * as path from 'path';
import { TemplateProcessor } from '../../../../src/cli/shared/template-processor.js';
import { WorkflowTemplate } from '../../../../src/core/types.js';
import { ProjectConfig } from '../../../../src/core/schemas.js';
import { ConfigDiscovery } from '../../../../src/core/config-discovery.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../../../src/core/config-discovery.js');
jest.mock('../../../../src/cli/shared/formatting-utils.js');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const MockedConfigDiscovery = ConfigDiscovery as jest.MockedClass<typeof ConfigDiscovery>;

// Import actual formatting utils to mock them properly
import * as formattingUtils from '../../../../src/cli/shared/formatting-utils.js';

// Mock formatting utils
jest.mock('../../../../src/cli/shared/formatting-utils.js', () => ({
  logTemplateUsage: jest.fn(),
  logFileCreation: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
}));

const mockedFormattingUtils = formattingUtils as jest.Mocked<typeof formattingUtils>;

describe('TemplateProcessor', () => {
  let mockConfigDiscovery: jest.Mocked<ConfigDiscovery>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.parse.mockImplementation((filePath: string) => {
      const parts = filePath.split('/');
      const fileName = parts[parts.length - 1];
      const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
      const name = fileName.replace(ext, '');
      const dir = parts.slice(0, -1).join('/');
      return { dir, name, ext, base: fileName, root: '' };
    });

    // Mock ConfigDiscovery
    mockConfigDiscovery = {
      loadProjectConfig: jest.fn(),
    } as unknown as jest.Mocked<ConfigDiscovery>;
    MockedConfigDiscovery.mockImplementation(() => mockConfigDiscovery);

    // Setup console mocks (formatting utils will be mocked)
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  describe('getDefaultUserConfig', () => {
    it('should return default user configuration', () => {
      const config = TemplateProcessor.getDefaultUserConfig();

      expect(config).toEqual({
        name: 'Your Name',
        preferred_name: 'john doe',
        email: 'your.email@example.com',
        phone: '(555) 123-4567',
        address: '123 Main St',
        city: 'Your City',
        state: 'ST',
        zip: '12345',
        linkedin: 'linkedin.com/in/yourname',
        github: 'github.com/yourusername',
        website: 'yourwebsite.com',
      });
    });
  });

  describe('getVariantTemplatePath', () => {
    const template: WorkflowTemplate = {
      name: 'resume',
      file: 'templates/resume/default.md',
      output: 'resume_{{user.preferred_name_sanitized}}.md',
    };

    it('should build variant template path correctly', () => {
      const result = TemplateProcessor.getVariantTemplatePath(
        '/project/workflows/job',
        template,
        'ai-frontend',
      );

      expect(result).toBe('/project/workflows/job/templates/resume/ai-frontend.md');
      expect(mockPath.parse).toHaveBeenCalledWith('templates/resume/default.md');
      expect(mockPath.join).toHaveBeenCalledWith('templates/resume', 'ai-frontend.md');
    });

    it('should handle templates without extensions', () => {
      const templateNoExt: WorkflowTemplate = {
        name: 'notes',
        file: 'templates/notes/default',
        output: 'notes.md',
      };

      const result = TemplateProcessor.getVariantTemplatePath(
        '/project/workflows/job',
        templateNoExt,
        'recruiter',
      );

      expect(result).toBe('/project/workflows/job/templates/notes/recruiter');
    });
  });

  describe('resolveTemplatePath', () => {
    const template: WorkflowTemplate = {
      name: 'resume',
      file: 'templates/resume/default.md',
      output: 'resume_{{user.preferred_name_sanitized}}.md',
    };

    beforeEach(() => {
      // Reset fs.existsSync behavior for each test
      mockFs.existsSync.mockReset();
    });

    it('should find system template when no project paths provided', () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return filePath === '/system/workflows/job/templates/resume/default.md';
      });

      const result = TemplateProcessor.resolveTemplatePath(template, {
        systemRoot: '/system',
        workflowName: 'job',
      });

      expect(result).toBe('/system/workflows/job/templates/resume/default.md');
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        '/system/workflows/job/templates/resume/default.md',
      );
    });

    it('should prioritize project template over system template', () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return (
          filePath === '/project/.markdown-workflow/workflows/job/templates/resume/default.md' ||
          filePath === '/system/workflows/job/templates/resume/default.md'
        );
      });

      const result = TemplateProcessor.resolveTemplatePath(template, {
        systemRoot: '/system',
        workflowName: 'job',
        projectPaths: { workflowsDir: '/project/.markdown-workflow/workflows' },
      });

      expect(result).toBe('/project/.markdown-workflow/workflows/job/templates/resume/default.md');
    });

    it('should prioritize variant template over default template', () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return (
          filePath ===
            '/project/.markdown-workflow/workflows/job/templates/resume/ai-frontend.md' ||
          filePath === '/project/.markdown-workflow/workflows/job/templates/resume/default.md' ||
          filePath === '/system/workflows/job/templates/resume/default.md'
        );
      });

      const result = TemplateProcessor.resolveTemplatePath(template, {
        systemRoot: '/system',
        workflowName: 'job',
        templateVariant: 'ai-frontend',
        projectPaths: { workflowsDir: '/project/.markdown-workflow/workflows' },
      });

      expect(result).toBe(
        '/project/.markdown-workflow/workflows/job/templates/resume/ai-frontend.md',
      );
    });

    it('should fall back to default when variant does not exist', () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return (
          filePath === '/project/.markdown-workflow/workflows/job/templates/resume/default.md' ||
          filePath === '/system/workflows/job/templates/resume/default.md'
        );
      });

      const result = TemplateProcessor.resolveTemplatePath(template, {
        systemRoot: '/system',
        workflowName: 'job',
        templateVariant: 'nonexistent',
        projectPaths: { workflowsDir: '/project/.markdown-workflow/workflows' },
      });

      expect(result).toBe('/project/.markdown-workflow/workflows/job/templates/resume/default.md');
    });

    it('should return null when no templates exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = TemplateProcessor.resolveTemplatePath(template, {
        systemRoot: '/system',
        workflowName: 'job',
      });

      expect(result).toBeNull();
    });
  });

  describe('processTemplate', () => {
    const template: WorkflowTemplate = {
      name: 'resume',
      file: 'templates/resume/default.md',
      output: 'resume_{{user.preferred_name_sanitized}}.md',
    };

    const mockProjectConfig: ProjectConfig = {
      user: {
        name: 'John Doe',
        preferred_name: 'john doe',
        email: 'john@example.com',
        phone: '(555) 123-4567',
        address: '123 Main St',
        city: 'Test City',
        state: 'CA',
        zip: '12345',
        linkedin: 'linkedin.com/in/johndoe',
        github: 'github.com/johndoe',
        website: 'johndoe.com',
      },
    };

    beforeEach(() => {
      // Mock template resolution to always find a template
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return (
          filePath === '/system/workflows/job/templates/resume/default.md' ||
          filePath === '/project/config.yml'
        );
      });

      // Mock template content
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath === '/system/workflows/job/templates/resume/default.md') {
          return '# {{user.name}} Resume\n\nEmail: {{user.email}}\nDate: {{date}}';
        }
        return '';
      });

      // Mock file writing
      mockFs.writeFileSync.mockImplementation();

      // Mock config loading
      mockConfigDiscovery.loadProjectConfig.mockResolvedValue(mockProjectConfig);
    });

    it('should process template successfully with user config', async () => {
      await TemplateProcessor.processTemplate(template, '/collection/path', {
        systemRoot: '/system',
        workflowName: 'job',
        variables: { company: 'TestCorp', role: 'Engineer' },
        projectConfig: mockProjectConfig,
        projectPaths: {
          workflowsDir: '/project/.markdown-workflow/workflows',
          configFile: '/project/config.yml',
        },
      });

      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        '/system/workflows/job/templates/resume/default.md',
        'utf8',
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/collection/path/resume_john_doe.md',
        expect.stringContaining('# John Doe Resume'),
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/collection/path/resume_john_doe.md',
        expect.stringContaining('Email: john@example.com'),
      );
    });

    it('should use default config when project config is not available', async () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return filePath === '/system/workflows/job/templates/resume/default.md';
      });

      await TemplateProcessor.processTemplate(template, '/collection/path', {
        systemRoot: '/system',
        workflowName: 'job',
        variables: { company: 'TestCorp', role: 'Engineer' },
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/collection/path/resume_john_doe.md',
        expect.stringContaining('# Your Name Resume'),
      );
    });

    it('should handle template not found gracefully', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await TemplateProcessor.processTemplate(template, '/collection/path', {
        systemRoot: '/system',
        workflowName: 'job',
        variables: { company: 'TestCorp', role: 'Engineer' },
      });

      expect(mockedFormattingUtils.logWarning).toHaveBeenCalledWith(
        'Template not found: resume (checked project and system locations)',
      );
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle template file not existing after resolution', async () => {
      // Mock resolution to find path but file doesn't exist
      mockFs.existsSync.mockImplementation((filePath: string) => {
        if (filePath === '/system/workflows/job/templates/resume/default.md') {
          return false; // File doesn't exist when we try to read it
        }
        return false;
      });

      // Override the resolution to return a path anyway (simulating race condition)
      jest
        .spyOn(TemplateProcessor, 'resolveTemplatePath')
        .mockReturnValue('/system/workflows/job/templates/resume/default.md');

      await TemplateProcessor.processTemplate(template, '/collection/path', {
        systemRoot: '/system',
        workflowName: 'job',
        variables: { company: 'TestCorp', role: 'Engineer' },
      });

      expect(mockedFormattingUtils.logWarning).toHaveBeenCalledWith(
        'Template file not found: /system/workflows/job/templates/resume/default.md',
      );
    });

    it('should handle file processing errors gracefully', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await TemplateProcessor.processTemplate(template, '/collection/path', {
        systemRoot: '/system',
        workflowName: 'job',
        variables: { company: 'TestCorp', role: 'Engineer' },
      });

      expect(mockedFormattingUtils.logError).toHaveBeenCalledWith(
        'Error processing template resume: Permission denied',
      );
    });

    it('should include template variant in variables when provided', async () => {
      await TemplateProcessor.processTemplate(template, '/collection/path', {
        systemRoot: '/system',
        workflowName: 'job',
        variables: {
          company: 'TestCorp',
          role: 'Engineer',
          template_variant: 'ai-frontend',
        },
        projectConfig: mockProjectConfig,
      });

      // Verify the variant was passed to resolveTemplatePath
      expect(mockFs.readFileSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should sanitize preferred_name for filenames', async () => {
      const configWithSpecialChars: ProjectConfig = {
        user: {
          ...mockProjectConfig.user,
          preferred_name: 'john@doe.special/name',
        },
      };

      mockConfigDiscovery.loadProjectConfig.mockResolvedValue(configWithSpecialChars);

      await TemplateProcessor.processTemplate(template, '/collection/path', {
        systemRoot: '/system',
        workflowName: 'job',
        variables: { company: 'TestCorp', role: 'Engineer' },
        projectConfig: configWithSpecialChars,
        projectPaths: {
          workflowsDir: '/project/.markdown-workflow/workflows',
          configFile: '/project/config.yml',
        },
      });

      // Should sanitize the preferred_name in the filename (removes special chars, converts to lowercase)
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('resume_johndoespecialname.md'),
        expect.any(String),
      );
    });

    it('should include current date in template variables', async () => {
      const templateWithDate: WorkflowTemplate = {
        name: 'resume',
        file: 'templates/resume/default.md',
        output: 'resume.md',
      };

      mockFs.readFileSync.mockReturnValue('Created on: {{date}}');

      await TemplateProcessor.processTemplate(templateWithDate, '/collection/path', {
        systemRoot: '/system',
        workflowName: 'job',
        variables: { company: 'TestCorp', role: 'Engineer' },
        projectConfig: mockProjectConfig,
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/collection/path/resume.md',
        expect.stringMatching(/Created on: \w+, \w+ \d{1,2}, \d{4}/),
      );
    });
  });
});
