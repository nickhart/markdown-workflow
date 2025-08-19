import {
  MemoryEnvironment,
  MemoryEnvironmentData,
} from '../../../../src/engine/environment/memory-environment.js';
import {
  ProjectConfig,
  WorkflowFile,
  ExternalProcessorDefinition,
  ExternalConverterDefinition,
} from '../../../../src/engine/schemas.js';
import { ResourceNotFoundError } from '../../../../src/engine/environment/environment.js';

describe('MemoryEnvironment', () => {
  let environment: MemoryEnvironment;

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
      linkedin: 'linkedin.com/in/test',
      github: 'github.com/test',
      website: 'test.com',
    },
    system: {
      scraper: 'wget',
      output_formats: ['docx', 'html'],
      web_download: {
        timeout: 30,
        add_utf8_bom: true,
        html_cleanup: 'scripts',
      },
      git: {
        auto_commit: false,
        commit_message_template: '{{message}}',
      },
      collection_id: {
        date_format: 'YYYYMMDD',
        sanitize_spaces: '_',
        max_length: 50,
      },
    },
    workflows: {},
  };

  const mockWorkflow: WorkflowFile = {
    workflow: {
      name: 'test-workflow',
      description: 'Test workflow',
      version: '1.0.0',
      stages: [{ name: 'active', description: 'Active stage', color: 'blue' }],
      templates: [
        { name: 'test-template', file: 'test.md', output: 'test_{{user.preferred_name}}.md' },
      ],
      statics: [{ name: 'style', file: 'style.css' }],
      actions: [
        {
          name: 'create',
          description: 'Create collection',
          templates: ['test-template'],
        },
      ],
      metadata: {
        required_fields: ['company'],
        optional_fields: ['role'],
        auto_generated: ['date'],
      },
      collection_id: {
        pattern: 'test_{{date}}',
        max_length: 50,
      },
    },
  };

  const mockProcessor: ExternalProcessorDefinition = {
    name: 'test-processor',
    description: 'Test processor',
    version: '1.0.0',
    detection: {
      command: 'test-cli --version',
      pattern: '.*\\.md$',
    },
    execution: {
      command_template: 'test-cli {{input_file}} {{output_file}}',
      mode: 'output-file',
      backup: false,
      timeout: 30,
    },
  };

  const mockConverter: ExternalConverterDefinition = {
    name: 'test-converter',
    description: 'Test converter',
    version: '1.0.0',
    supported_formats: ['docx', 'html'],
    detection: {
      command: 'pandoc --version',
    },
    execution: {
      command_template: 'pandoc {{input_file}} -o {{output_file}}',
      mode: 'output-file',
      backup: false,
      timeout: 30,
    },
  };

  beforeEach(() => {
    environment = new MemoryEnvironment();
  });

  describe('configuration management', () => {
    it('should return null when no config is set', async () => {
      const config = await environment.getConfig();
      expect(config).toBeNull();
    });

    it('should store and retrieve config', async () => {
      environment.setConfig(mockConfig);
      const config = await environment.getConfig();
      expect(config).toEqual(mockConfig);
    });

    it('should clear config when set to null', async () => {
      environment.setConfig(mockConfig);
      environment.setConfig(null);
      const config = await environment.getConfig();
      expect(config).toBeNull();
    });
  });

  describe('workflow management', () => {
    it('should throw ResourceNotFoundError for non-existent workflow', async () => {
      await expect(environment.getWorkflow('nonexistent')).rejects.toThrow(ResourceNotFoundError);
    });

    it('should store and retrieve workflows', async () => {
      environment.setWorkflow('test', mockWorkflow);
      const workflow = await environment.getWorkflow('test');
      expect(workflow).toEqual(mockWorkflow);
    });

    it('should list workflows', async () => {
      environment.setWorkflow('workflow1', mockWorkflow);
      environment.setWorkflow('workflow2', mockWorkflow);

      const workflows = await environment.listWorkflows();
      expect(workflows).toContain('workflow1');
      expect(workflows).toContain('workflow2');
      expect(workflows).toHaveLength(2);
    });

    it('should check workflow existence', async () => {
      expect(await environment.hasWorkflow('test')).toBe(false);
      environment.setWorkflow('test', mockWorkflow);
      expect(await environment.hasWorkflow('test')).toBe(true);
    });

    it('should remove workflows', async () => {
      environment.setWorkflow('test', mockWorkflow);
      expect(await environment.hasWorkflow('test')).toBe(true);

      environment.removeWorkflow('test');
      expect(await environment.hasWorkflow('test')).toBe(false);
    });
  });

  describe('processor management', () => {
    it('should return empty array when no processors exist', async () => {
      const processors = await environment.getProcessorDefinitions();
      expect(processors).toEqual([]);
    });

    it('should store and retrieve processors', async () => {
      environment.setProcessor(mockProcessor);
      const processors = await environment.getProcessorDefinitions();
      expect(processors).toEqual([mockProcessor]);
    });

    it('should handle multiple processors', async () => {
      const processor2: ExternalProcessorDefinition = { ...mockProcessor, name: 'processor2' };

      environment.setProcessor(mockProcessor);
      environment.setProcessor(processor2);

      const processors = await environment.getProcessorDefinitions();
      expect(processors).toHaveLength(2);
      expect(processors).toContainEqual(mockProcessor);
      expect(processors).toContainEqual(processor2);
    });

    it('should overwrite processor with same name', async () => {
      const updatedProcessor: ExternalProcessorDefinition = {
        ...mockProcessor,
        command: 'updated-command',
      };

      environment.setProcessor(mockProcessor);
      environment.setProcessor(updatedProcessor);

      const processors = await environment.getProcessorDefinitions();
      expect(processors).toHaveLength(1);
      expect(processors[0].command).toBe('updated-command');
    });
  });

  describe('converter management', () => {
    it('should return empty array when no converters exist', async () => {
      const converters = await environment.getConverterDefinitions();
      expect(converters).toEqual([]);
    });

    it('should store and retrieve converters', async () => {
      environment.setConverter(mockConverter);
      const converters = await environment.getConverterDefinitions();
      expect(converters).toEqual([mockConverter]);
    });

    it('should handle multiple converters', async () => {
      const converter2: ExternalConverterDefinition = { ...mockConverter, name: 'converter2' };

      environment.setConverter(mockConverter);
      environment.setConverter(converter2);

      const converters = await environment.getConverterDefinitions();
      expect(converters).toHaveLength(2);
      expect(converters).toContainEqual(mockConverter);
      expect(converters).toContainEqual(converter2);
    });
  });

  describe('template management', () => {
    it('should throw ResourceNotFoundError for non-existent template', async () => {
      const request = { workflow: 'test', template: 'nonexistent' };
      await expect(environment.getTemplate(request)).rejects.toThrow(ResourceNotFoundError);
    });

    it('should store and retrieve templates', async () => {
      const request = { workflow: 'test', template: 'example' };
      const content = '# {{title}}\n\nHello {{user.name}}!';

      environment.setTemplate(request, content);
      const retrieved = await environment.getTemplate(request);
      expect(retrieved).toBe(content);
    });

    it('should handle template variants', async () => {
      const request = { workflow: 'test', template: 'example', variant: 'mobile' };
      const content = '# Mobile Template\n\nOptimized for mobile';

      environment.setTemplate(request, content);
      const retrieved = await environment.getTemplate(request);
      expect(retrieved).toBe(content);
    });

    it('should check template existence', async () => {
      const request = { workflow: 'test', template: 'example' };
      expect(await environment.hasTemplate(request)).toBe(false);

      environment.setTemplate(request, 'content');
      expect(await environment.hasTemplate(request)).toBe(true);
    });

    it('should handle different workflows separately', async () => {
      const request1 = { workflow: 'workflow1', template: 'test' };
      const request2 = { workflow: 'workflow2', template: 'test' };

      environment.setTemplate(request1, 'content1');
      environment.setTemplate(request2, 'content2');

      expect(await environment.getTemplate(request1)).toBe('content1');
      expect(await environment.getTemplate(request2)).toBe('content2');
    });
  });

  describe('static file management', () => {
    it('should throw ResourceNotFoundError for non-existent static', async () => {
      const request = { workflow: 'test', static: 'nonexistent.css' };
      await expect(environment.getStatic(request)).rejects.toThrow(ResourceNotFoundError);
    });

    it('should store and retrieve static files', async () => {
      const request = { workflow: 'test', static: 'style.css' };
      const content = Buffer.from('body { color: red; }');

      environment.setStatic(request, content);
      const retrieved = await environment.getStatic(request);
      expect(retrieved).toEqual(content);
    });

    it('should check static existence', async () => {
      const request = { workflow: 'test', static: 'style.css' };
      expect(await environment.hasStatic(request)).toBe(false);

      environment.setStatic(request, Buffer.from('css'));
      expect(await environment.hasStatic(request)).toBe(true);
    });
  });

  describe('manifest generation', () => {
    it('should generate manifest from stored resources', async () => {
      // Set up test data
      environment.setConfig(mockConfig);
      environment.setWorkflow('workflow1', mockWorkflow);
      environment.setProcessor(mockProcessor);
      environment.setConverter(mockConverter);
      environment.setTemplate({ workflow: 'workflow1', template: 'template1' }, 'content');
      environment.setStatic({ workflow: 'workflow1', static: 'style.css' }, Buffer.from('css'));

      const manifest = await environment.getManifest();

      expect(manifest.hasConfig).toBe(true);
      expect(manifest.workflows).toContain('workflow1');
      expect(manifest.processors).toContain('test-processor');
      expect(manifest.converters).toContain('test-converter');
      expect(manifest.templates['workflow1']).toContain('template1');
      expect(manifest.statics['workflow1']).toContain('style.css');
    });

    it('should handle empty environment', async () => {
      const manifest = await environment.getManifest();

      expect(manifest.hasConfig).toBe(false);
      expect(manifest.workflows).toEqual([]);
      expect(manifest.processors).toEqual([]);
      expect(manifest.converters).toEqual([]);
      expect(manifest.templates).toEqual({});
      expect(manifest.statics).toEqual({});
    });
  });

  describe('merging from other environments', () => {
    let sourceEnvironment: MemoryEnvironment;

    beforeEach(() => {
      sourceEnvironment = new MemoryEnvironment();
    });

    it('should merge configuration', async () => {
      sourceEnvironment.setConfig(mockConfig);
      await environment.mergeFrom(sourceEnvironment);

      const config = await environment.getConfig();
      expect(config).toEqual(mockConfig);
    });

    it('should merge workflows', async () => {
      sourceEnvironment.setWorkflow('test', mockWorkflow);
      await environment.mergeFrom(sourceEnvironment);

      const workflow = await environment.getWorkflow('test');
      expect(workflow).toEqual(mockWorkflow);
    });

    it('should merge processors and converters', async () => {
      sourceEnvironment.setProcessor(mockProcessor);
      sourceEnvironment.setConverter(mockConverter);
      await environment.mergeFrom(sourceEnvironment);

      const processors = await environment.getProcessorDefinitions();
      const converters = await environment.getConverterDefinitions();

      expect(processors).toContainEqual(mockProcessor);
      expect(converters).toContainEqual(mockConverter);
    });

    it('should merge templates and statics', async () => {
      const templateRequest = { workflow: 'test', template: 'example' };
      const staticRequest = { workflow: 'test', static: 'style.css' };

      sourceEnvironment.setTemplate(templateRequest, 'content');
      sourceEnvironment.setStatic(staticRequest, Buffer.from('css'));

      // Verify source has the template before merging
      expect(await sourceEnvironment.getTemplate(templateRequest)).toBe('content');
      expect(await sourceEnvironment.getStatic(staticRequest)).toEqual(Buffer.from('css'));

      await environment.mergeFrom(sourceEnvironment);

      expect(await environment.getTemplate(templateRequest)).toBe('content');
      expect(await environment.getStatic(staticRequest)).toEqual(Buffer.from('css'));
    });
  });

  describe('initialization with data', () => {
    it('should initialize with provided data', () => {
      const initialData: Partial<MemoryEnvironmentData> = {
        config: mockConfig,
        workflows: new Map([['test', mockWorkflow]]),
        processors: [mockProcessor],
        converters: [mockConverter],
      };

      const env = new MemoryEnvironment(initialData);

      expect(env.getConfig()).resolves.toEqual(mockConfig);
      expect(env.getWorkflow('test')).resolves.toEqual(mockWorkflow);
      expect(env.getProcessorDefinitions()).resolves.toEqual([mockProcessor]);
      expect(env.getConverterDefinitions()).resolves.toEqual([mockConverter]);
    });

    it('should handle partial initialization', () => {
      const initialData: Partial<MemoryEnvironmentData> = {
        config: mockConfig,
      };

      const env = new MemoryEnvironment(initialData);

      expect(env.getConfig()).resolves.toEqual(mockConfig);
      expect(env.listWorkflows()).resolves.toEqual([]);
    });
  });

  describe('resource removal', () => {
    it('should remove templates', async () => {
      const request = { workflow: 'test', template: 'example' };

      environment.setTemplate(request, 'content');
      expect(await environment.hasTemplate(request)).toBe(true);

      environment.removeTemplate(request);
      expect(await environment.hasTemplate(request)).toBe(false);
    });

    it('should remove static files', async () => {
      const request = { workflow: 'test', static: 'style.css' };

      environment.setStatic(request, Buffer.from('css'));
      expect(await environment.hasStatic(request)).toBe(true);

      environment.removeStatic(request);
      expect(await environment.hasStatic(request)).toBe(false);
    });

    it('should clear all data', () => {
      environment.setConfig(mockConfig);
      environment.setWorkflow('test', mockWorkflow);
      environment.setProcessor(mockProcessor);
      environment.setConverter(mockConverter);

      environment.clear();

      expect(environment.getConfig()).resolves.toBeNull();
      expect(environment.listWorkflows()).resolves.toEqual([]);
      expect(environment.getProcessorDefinitions()).resolves.toEqual([]);
      expect(environment.getConverterDefinitions()).resolves.toEqual([]);
    });
  });
});
