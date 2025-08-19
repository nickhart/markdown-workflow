import {
  WorkflowContext,
  createWorkflowContext,
} from '../../../../src/engine/environment/workflow-context.js';
import { MemoryEnvironment } from '../../../../src/engine/environment/memory-environment.js';
import {
  ProjectConfig,
  WorkflowFile,
  ExternalProcessorDefinition,
  ExternalConverterDefinition,
} from '../../../../src/engine/schemas.js';
import { ProcessorRegistry } from '../../../../src/services/processors/base-processor.js';
import { ConverterRegistry } from '../../../../src/services/converters/base-converter.js';

// Mock external dependencies
jest.mock('../../../../src/services/external-cli-discovery.js', () => ({
  ExternalCLIDiscoveryService: jest.fn().mockImplementation(() => ({
    // Mock implementation if needed
  })),
}));

describe('WorkflowContext', () => {
  let environment: MemoryEnvironment;
  let context: WorkflowContext;

  const mockConfig: ProjectConfig = {
    user: {
      name: 'Test User',
      preferred_name: 'Test',
      email: 'test@example.com',
      phone: '555-0123',
      address: '123 Main St',
      city: 'Test City',
      state: 'TS',
      zip: '12345',
    },
    system: {
      output_formats: ['docx', 'html'],
      web_download: {
        timeout: 30,
        add_utf8_bom: true,
        html_cleanup: 'scripts',
      },
    },
  };

  const mockWorkflow: WorkflowFile = {
    workflow: {
      name: 'test-workflow',
      description: 'Test workflow for testing',
      version: '1.0.0',
      stages: [
        { name: 'active', description: 'Active stage', color: 'blue' },
        { name: 'completed', description: 'Completed stage', color: 'green' },
      ],
      templates: [
        { name: 'resume', file: 'resume.md', output: 'resume_{{user.preferred_name}}.md' },
        {
          name: 'cover-letter',
          file: 'cover_letter.md',
          output: 'cover_letter_{{user.preferred_name}}.md',
        },
      ],
      statics: [
        { name: 'reference', file: 'reference.docx' },
        { name: 'style', file: 'style.css' },
      ],
      actions: [
        {
          name: 'create',
          description: 'Create collection',
          templates: ['resume', 'cover-letter'],
          processors: [
            { name: 'markdown-formatter', enabled: true },
            { name: 'yaml-validator', enabled: false },
          ],
        },
        {
          name: 'format',
          description: 'Format documents',
          converter: 'pandoc-docx',
        },
      ],
      metadata: {
        required_fields: ['company', 'role'],
        optional_fields: ['description'],
        auto_generated: ['date', 'id'],
      },
      collection_id: {
        pattern: 'test_{{company}}_{{role}}_{{date}}',
        max_length: 100,
      },
    },
  };

  const mockProcessor: ExternalProcessorDefinition = {
    name: 'markdown-formatter',
    type: 'cli',
    command: 'markdown-format',
    input_format: 'markdown',
    output_format: 'markdown',
    args: ['--style', 'standard'],
  };

  const mockConverter: ExternalConverterDefinition = {
    name: 'pandoc-docx',
    type: 'cli',
    command: 'pandoc',
    input_format: 'markdown',
    output_format: 'docx',
    args: ['-f', 'markdown', '-t', 'docx'],
  };

  beforeEach(() => {
    environment = new MemoryEnvironment();
    context = new WorkflowContext(environment, 'test-workflow');

    // Set up basic environment
    environment.setConfig(mockConfig);
    environment.setWorkflow('test-workflow', mockWorkflow);
    environment.setProcessor(mockProcessor);
    environment.setConverter(mockConverter);
  });

  describe('basic functionality', () => {
    it('should return workflow name', () => {
      expect(context.getWorkflowName()).toBe('test-workflow');
    });

    it('should create context using factory function', () => {
      const factoryContext = createWorkflowContext(environment, 'test-workflow');
      expect(factoryContext.getWorkflowName()).toBe('test-workflow');
    });
  });

  describe('resource loading', () => {
    it('should load workflow resources', async () => {
      const resources = await context.loadResources();

      expect(resources.workflow).toEqual(mockWorkflow);
      expect(resources.config).toEqual(mockConfig);
      expect(resources.processors).toBeInstanceOf(ProcessorRegistry);
      expect(resources.converters).toBeInstanceOf(ConverterRegistry);
      expect(resources.requiredProcessors).toContain('markdown-formatter');
      expect(resources.requiredProcessors).not.toContain('yaml-validator'); // disabled
      expect(resources.requiredConverters).toContain('pandoc-docx');
    });

    it('should cache loaded resources', async () => {
      const spy = jest.spyOn(environment, 'getWorkflow');

      await context.loadResources();
      await context.loadResources(); // Second call should use cache

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should handle missing config gracefully', async () => {
      environment.setConfig(null);

      const resources = await context.loadResources();
      expect(resources.config).toBeNull();
    });

    it('should skip processor loading when disabled', async () => {
      const resources = await context.loadResources({ loadProcessors: false });

      // Should still have ProcessorRegistry but may not load external ones
      expect(resources.processors).toBeInstanceOf(ProcessorRegistry);
    });

    it('should skip converter loading when disabled', async () => {
      const resources = await context.loadResources({ loadConverters: false });

      // Should still have ConverterRegistry but may not load external ones
      expect(resources.converters).toBeInstanceOf(ConverterRegistry);
    });
  });

  describe('workflow access', () => {
    it('should get workflow definition', async () => {
      const workflow = await context.getWorkflow();
      expect(workflow).toEqual(mockWorkflow);
    });

    it('should get project configuration', async () => {
      const config = await context.getConfig();
      expect(config).toEqual(mockConfig);
    });

    it('should get processor registry', async () => {
      const processors = await context.getProcessors();
      expect(processors).toBeInstanceOf(ProcessorRegistry);
    });

    it('should get converter registry', async () => {
      const converters = await context.getConverters();
      expect(converters).toBeInstanceOf(ConverterRegistry);
    });
  });

  describe('template access', () => {
    beforeEach(() => {
      environment.setTemplate(
        { workflow: 'test-workflow', template: 'resume' },
        '# Resume\n\nName: {{user.name}}\nEmail: {{user.email}}',
      );
      environment.setTemplate(
        { workflow: 'test-workflow', template: 'resume', variant: 'mobile' },
        '# Resume (Mobile)\n\nName: {{user.name}}',
      );
    });

    it('should get template content', async () => {
      const content = await context.getTemplate('resume');
      expect(content).toBe('# Resume\n\nName: {{user.name}}\nEmail: {{user.email}}');
    });

    it('should get template variant', async () => {
      const content = await context.getTemplate('resume', 'mobile');
      expect(content).toBe('# Resume (Mobile)\n\nName: {{user.name}}');
    });

    it('should check template existence', async () => {
      expect(await context.hasTemplate('resume')).toBe(true);
      expect(await context.hasTemplate('resume', 'mobile')).toBe(true);
      expect(await context.hasTemplate('nonexistent')).toBe(false);
      expect(await context.hasTemplate('resume', 'nonexistent')).toBe(false);
    });
  });

  describe('static file access', () => {
    beforeEach(() => {
      environment.setStatic(
        { workflow: 'test-workflow', static: 'style.css' },
        Buffer.from('body { font-family: Arial; }'),
      );
      environment.setStatic(
        { workflow: 'test-workflow', static: 'reference.docx' },
        Buffer.from('fake docx content'),
      );
    });

    it('should get static file content', async () => {
      const content = await context.getStatic('style.css');
      expect(content).toEqual(Buffer.from('body { font-family: Arial; }'));
    });

    it('should check static file existence', async () => {
      expect(await context.hasStatic('style.css')).toBe(true);
      expect(await context.hasStatic('reference.docx')).toBe(true);
      expect(await context.hasStatic('nonexistent.css')).toBe(false);
    });
  });

  describe('workflow action access', () => {
    it('should get workflow action by name', async () => {
      const createAction = await context.getAction('create');
      expect(createAction.name).toBe('create');
      expect(createAction.description).toBe('Create collection');
      expect(createAction.templates).toEqual(['resume', 'cover-letter']);
    });

    it('should get format action', async () => {
      const formatAction = await context.getAction('format');
      expect(formatAction.name).toBe('format');
      expect(formatAction.converter).toBe('pandoc-docx');
    });

    it('should throw error for non-existent action', async () => {
      await expect(context.getAction('nonexistent')).rejects.toThrow(
        "Action 'nonexistent' not found in workflow 'test-workflow'. Available actions: create, format",
      );
    });
  });

  describe('resource reload', () => {
    it('should reload resources and clear cache', async () => {
      // Load resources initially
      await context.loadResources();

      // Update environment
      const updatedWorkflow = {
        ...mockWorkflow,
        workflow: {
          ...mockWorkflow.workflow,
          description: 'Updated description',
        },
      };
      environment.setWorkflow('test-workflow', updatedWorkflow);

      // Reload resources
      const resources = await context.reloadResources();
      expect(resources.workflow.workflow.description).toBe('Updated description');
    });

    it('should reset external resource loading state on reload', async () => {
      await context.loadResources();

      // Mock that external resources were loaded
      (context as WorkflowContext)['loadedExternalResources'] = true;

      await context.reloadResources();

      // Should reset the flag
      expect((context as WorkflowContext)['loadedExternalResources']).toBe(false);
    });
  });

  describe('processor extraction', () => {
    it('should extract enabled processors from workflow actions', async () => {
      const resources = await context.loadResources();
      expect(resources.requiredProcessors).toContain('markdown-formatter');
      expect(resources.requiredProcessors).not.toContain('yaml-validator');
    });

    it('should handle workflows without processors', async () => {
      const simpleWorkflow: WorkflowFile = {
        workflow: {
          ...mockWorkflow.workflow,
          actions: [
            {
              name: 'simple',
              description: 'Simple action',
              templates: ['resume'],
            },
          ],
        },
      };

      environment.setWorkflow('test-workflow', simpleWorkflow);
      context = new WorkflowContext(environment, 'test-workflow');

      const resources = await context.loadResources();
      expect(resources.requiredProcessors).toEqual([]);
    });

    it('should deduplicate processor names', async () => {
      const duplicateProcessorWorkflow: WorkflowFile = {
        workflow: {
          ...mockWorkflow.workflow,
          actions: [
            {
              name: 'action1',
              description: 'Action 1',
              processors: [{ name: 'shared-processor', enabled: true }],
            },
            {
              name: 'action2',
              description: 'Action 2',
              processors: [{ name: 'shared-processor', enabled: true }],
            },
          ],
        },
      };

      environment.setWorkflow('test-workflow', duplicateProcessorWorkflow);
      context = new WorkflowContext(environment, 'test-workflow');

      const resources = await context.loadResources();
      expect(resources.requiredProcessors).toEqual(['shared-processor']);
    });
  });

  describe('converter extraction', () => {
    it('should extract converters from workflow actions', async () => {
      const resources = await context.loadResources();
      expect(resources.requiredConverters).toContain('pandoc-docx');
    });

    it('should handle workflows without converters', async () => {
      const simpleWorkflow: WorkflowFile = {
        workflow: {
          ...mockWorkflow.workflow,
          actions: [
            {
              name: 'simple',
              description: 'Simple action',
              templates: ['resume'],
            },
          ],
        },
      };

      environment.setWorkflow('test-workflow', simpleWorkflow);
      context = new WorkflowContext(environment, 'test-workflow');

      const resources = await context.loadResources();
      expect(resources.requiredConverters).toEqual([]);
    });

    it('should deduplicate converter names', async () => {
      const duplicateConverterWorkflow: WorkflowFile = {
        workflow: {
          ...mockWorkflow.workflow,
          actions: [
            {
              name: 'action1',
              description: 'Action 1',
              converter: 'shared-converter',
            },
            {
              name: 'action2',
              description: 'Action 2',
              converter: 'shared-converter',
            },
          ],
        },
      };

      environment.setWorkflow('test-workflow', duplicateConverterWorkflow);
      context = new WorkflowContext(environment, 'test-workflow');

      const resources = await context.loadResources();
      expect(resources.requiredConverters).toEqual(['shared-converter']);
    });
  });

  describe('error handling', () => {
    it('should throw error when workflow does not exist', async () => {
      const nonExistentContext = new WorkflowContext(environment, 'nonexistent');

      await expect(nonExistentContext.getWorkflow()).rejects.toThrow();
    });

    it('should propagate errors from environment', async () => {
      jest.spyOn(environment, 'getWorkflow').mockRejectedValue(new Error('Environment error'));

      await expect(context.loadResources()).rejects.toThrow('Environment error');
    });

    it('should handle template access errors', async () => {
      await expect(context.getTemplate('nonexistent')).rejects.toThrow();
    });

    it('should handle static access errors', async () => {
      await expect(context.getStatic('nonexistent.css')).rejects.toThrow();
    });
  });

  describe('external resource loading', () => {
    it('should log processor loading information', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await context.loadResources();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Loading resources for workflow: test-workflow'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Required processors: markdown-formatter'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Required converters: pandoc-docx'),
      );

      consoleSpy.mockRestore();
    });

    it('should handle empty processor and converter lists', async () => {
      const emptyWorkflow: WorkflowFile = {
        workflow: {
          ...mockWorkflow.workflow,
          actions: [
            {
              name: 'simple',
              description: 'Simple action without processors/converters',
              templates: ['resume'],
            },
          ],
        },
      };

      environment.setWorkflow('test-workflow', emptyWorkflow);
      context = new WorkflowContext(environment, 'test-workflow');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await context.loadResources();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Required processors: none'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Required converters: none'));

      consoleSpy.mockRestore();
    });
  });
});
