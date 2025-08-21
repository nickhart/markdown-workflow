import { MergedEnvironment } from '../../../../src/engine/environment/merged-environment.js';
import { MemoryEnvironment } from '../../../../src/engine/environment/memory-environment.js';
import {
  ProjectConfig,
  WorkflowFile,
  ExternalProcessorDefinition,
  ExternalConverterDefinition,
} from '../../../../src/engine/schemas.js';
import { ResourceNotFoundError } from '../../../../src/engine/environment/environment.js';

describe('MergedEnvironment', () => {
  let localEnv: MemoryEnvironment;
  let globalEnv: MemoryEnvironment;
  let mergedEnv: MergedEnvironment;

  const localConfig: ProjectConfig = {
    user: {
      name: 'Local User',
      preferred_name: 'Local',
      email: 'local@example.com',
      phone: '555-0001',
      address: '123 Local St',
      city: 'Local City',
      state: 'LC',
      zip: '12345',
    },
    system: {
      output_formats: ['docx'],
      web_download: {
        timeout: 20,
        add_utf8_bom: false,
        html_cleanup: 'none',
      },
    },
  };

  const globalConfig: ProjectConfig = {
    user: {
      name: 'Global User',
      preferred_name: 'Global',
      email: 'global@example.com',
      phone: '555-0002',
      address: '456 Global Ave',
      city: 'Global City',
      state: 'GC',
      zip: '67890',
      github: 'global-user',
      website: 'global.com',
    },
    system: {
      output_formats: ['docx', 'html', 'pdf'],
      web_download: {
        timeout: 30,
        add_utf8_bom: true,
        html_cleanup: 'scripts',
      },
      scraper: 'wget',
    },
  };

  const localWorkflow: WorkflowFile = {
    workflow: {
      name: 'local-workflow',
      description: 'Local workflow',
      version: '1.0.0',
      stages: [{ name: 'active', description: 'Active stage', color: 'blue' }],
      templates: [
        { name: 'local-template', file: 'local.md', output: 'local_{{user.preferred_name}}.md' },
      ],
      statics: [],
      actions: [
        {
          name: 'create',
          description: 'Create collection',
          templates: ['local-template'],
        },
      ],
      metadata: {
        required_fields: ['company'],
        optional_fields: ['role'],
        auto_generated: ['date'],
      },
      collection_id: {
        pattern: 'local_{{date}}',
        max_length: 50,
      },
    },
  };

  const globalWorkflow: WorkflowFile = {
    workflow: {
      name: 'global-workflow',
      description: 'Global workflow',
      version: '1.0.0',
      stages: [{ name: 'pending', description: 'Pending stage', color: 'gray' }],
      templates: [
        { name: 'global-template', file: 'global.md', output: 'global_{{user.preferred_name}}.md' },
      ],
      statics: [],
      actions: [
        {
          name: 'create',
          description: 'Create collection',
          templates: ['global-template'],
        },
      ],
      metadata: {
        required_fields: ['title'],
        optional_fields: [],
        auto_generated: ['date'],
      },
      collection_id: {
        pattern: 'global_{{date}}',
        max_length: 30,
      },
    },
  };

  const localProcessor: ExternalProcessorDefinition = {
    name: 'local-processor',
    type: 'cli',
    command: 'local-cli',
    input_format: 'markdown',
    output_format: 'markdown',
  };

  const globalProcessor: ExternalProcessorDefinition = {
    name: 'global-processor',
    type: 'cli',
    command: 'global-cli',
    input_format: 'markdown',
    output_format: 'markdown',
  };

  const sharedProcessor: ExternalProcessorDefinition = {
    name: 'shared-processor',
    type: 'cli',
    command: 'local-version', // Local version should override
    input_format: 'markdown',
    output_format: 'markdown',
  };

  const sharedProcessorGlobal: ExternalProcessorDefinition = {
    name: 'shared-processor',
    type: 'cli',
    command: 'global-version',
    input_format: 'markdown',
    output_format: 'markdown',
  };

  beforeEach(() => {
    localEnv = new MemoryEnvironment();
    globalEnv = new MemoryEnvironment();
    mergedEnv = new MergedEnvironment(localEnv, globalEnv);
  });

  describe('configuration merging', () => {
    it('should return null when neither environment has config', async () => {
      const config = await mergedEnv.getConfig();
      expect(config).toBeNull();
    });

    it('should return local config when only local exists', async () => {
      localEnv.setConfig(localConfig);

      const config = await mergedEnv.getConfig();
      expect(config).toEqual(localConfig);
    });

    it('should return global config when only global exists', async () => {
      globalEnv.setConfig(globalConfig);

      const config = await mergedEnv.getConfig();
      expect(config).toEqual(globalConfig);
    });

    it('should merge configs with local taking priority', async () => {
      localEnv.setConfig(localConfig);
      globalEnv.setConfig(globalConfig);

      const config = await mergedEnv.getConfig();

      // Local values should override global
      expect(config!.user.name).toBe('Local User');
      expect(config!.user.email).toBe('local@example.com');
      expect(config!.system.web_download.timeout).toBe(20);
      expect(config!.system.web_download.add_utf8_bom).toBe(false);

      // Global values should fill in missing local values
      expect(config!.user.github).toBe('global-user');
      expect(config!.user.website).toBe('global.com');
      expect(config!.system.scraper).toBe('wget');
    });
  });

  describe('workflow resolution', () => {
    it('should throw ResourceNotFoundError when workflow not found in either environment', async () => {
      await expect(mergedEnv.getWorkflow('nonexistent')).rejects.toThrow(ResourceNotFoundError);
    });

    it('should return local workflow when it exists locally', async () => {
      localEnv.setWorkflow('test', localWorkflow);
      globalEnv.setWorkflow('test', globalWorkflow);

      const workflow = await mergedEnv.getWorkflow('test');
      expect(workflow.workflow.name).toBe('local-workflow');
    });

    it('should fallback to global workflow when not found locally', async () => {
      globalEnv.setWorkflow('test', globalWorkflow);

      const workflow = await mergedEnv.getWorkflow('test');
      expect(workflow.workflow.name).toBe('global-workflow');
    });

    it('should check workflow existence in both environments', async () => {
      expect(await mergedEnv.hasWorkflow('test')).toBe(false);

      localEnv.setWorkflow('local-only', localWorkflow);
      globalEnv.setWorkflow('global-only', globalWorkflow);

      expect(await mergedEnv.hasWorkflow('local-only')).toBe(true);
      expect(await mergedEnv.hasWorkflow('global-only')).toBe(true);
    });

    it('should list workflows from both environments', async () => {
      localEnv.setWorkflow('local-workflow', localWorkflow);
      globalEnv.setWorkflow('global-workflow', globalWorkflow);
      globalEnv.setWorkflow('shared-workflow', globalWorkflow);
      localEnv.setWorkflow('shared-workflow', localWorkflow);

      const workflows = await mergedEnv.listWorkflows();
      expect(workflows).toContain('local-workflow');
      expect(workflows).toContain('global-workflow');
      expect(workflows).toContain('shared-workflow');
      expect(workflows).toHaveLength(3); // Deduplicated
    });
  });

  describe('processor definition merging', () => {
    it('should return empty array when no processors exist', async () => {
      const processors = await mergedEnv.getProcessorDefinitions();
      expect(processors).toEqual([]);
    });

    it('should return combined processors from both environments', async () => {
      localEnv.setProcessor(localProcessor);
      globalEnv.setProcessor(globalProcessor);

      const processors = await mergedEnv.getProcessorDefinitions();
      expect(processors).toHaveLength(2);
      expect(processors).toContainEqual(localProcessor);
      expect(processors).toContainEqual(globalProcessor);
    });

    it('should prioritize local processors over global with same name', async () => {
      localEnv.setProcessor(sharedProcessor);
      globalEnv.setProcessor(sharedProcessorGlobal);

      const processors = await mergedEnv.getProcessorDefinitions();
      expect(processors).toHaveLength(1);
      expect(processors[0].command).toBe('local-version');
    });

    it('should handle errors in processor loading gracefully', async () => {
      // Mock error in local environment
      jest.spyOn(localEnv, 'getProcessorDefinitions').mockRejectedValue(new Error('Local error'));
      globalEnv.setProcessor(globalProcessor);

      const processors = await mergedEnv.getProcessorDefinitions();
      expect(processors).toEqual([globalProcessor]);
    });
  });

  describe('converter definition merging', () => {
    it('should return empty array when no converters exist', async () => {
      const converters = await mergedEnv.getConverterDefinitions();
      expect(converters).toEqual([]);
    });

    it('should merge converters with local priority', async () => {
      const localConverter: ExternalConverterDefinition = {
        name: 'local-converter',
        type: 'cli',
        command: 'local-pandoc',
        input_format: 'markdown',
        output_format: 'docx',
      };

      const globalConverter: ExternalConverterDefinition = {
        name: 'global-converter',
        type: 'cli',
        command: 'global-pandoc',
        input_format: 'markdown',
        output_format: 'html',
      };

      localEnv.setConverter(localConverter);
      globalEnv.setConverter(globalConverter);

      const converters = await mergedEnv.getConverterDefinitions();
      expect(converters).toHaveLength(2);
      expect(converters).toContainEqual(localConverter);
      expect(converters).toContainEqual(globalConverter);
    });
  });

  describe('template resolution', () => {
    it('should throw ResourceNotFoundError when template not found in either environment', async () => {
      const request = { workflow: 'test', template: 'nonexistent' };
      await expect(mergedEnv.getTemplate(request)).rejects.toThrow(ResourceNotFoundError);
    });

    it('should return local template when it exists locally', async () => {
      const request = { workflow: 'test', template: 'shared' };

      localEnv.setTemplate(request, 'local template content');
      globalEnv.setTemplate(request, 'global template content');

      const content = await mergedEnv.getTemplate(request);
      expect(content).toBe('local template content');
    });

    it('should fallback to global template when not found locally', async () => {
      const request = { workflow: 'test', template: 'global-only' };

      globalEnv.setTemplate(request, 'global template content');

      const content = await mergedEnv.getTemplate(request);
      expect(content).toBe('global template content');
    });

    it('should check template existence in both environments', async () => {
      const localRequest = { workflow: 'test', template: 'local-only' };
      const globalRequest = { workflow: 'test', template: 'global-only' };

      localEnv.setTemplate(localRequest, 'content');
      globalEnv.setTemplate(globalRequest, 'content');

      expect(await mergedEnv.hasTemplate(localRequest)).toBe(true);
      expect(await mergedEnv.hasTemplate(globalRequest)).toBe(true);
      expect(await mergedEnv.hasTemplate({ workflow: 'test', template: 'nonexistent' })).toBe(
        false,
      );
    });
  });

  describe('static file resolution', () => {
    it('should throw ResourceNotFoundError when static not found in either environment', async () => {
      const request = { workflow: 'test', static: 'nonexistent.css' };
      await expect(mergedEnv.getStatic(request)).rejects.toThrow(ResourceNotFoundError);
    });

    it('should return local static when it exists locally', async () => {
      const request = { workflow: 'test', static: 'style.css' };

      localEnv.setStatic(request, Buffer.from('local css'));
      globalEnv.setStatic(request, Buffer.from('global css'));

      const content = await mergedEnv.getStatic(request);
      expect(content).toEqual(Buffer.from('local css'));
    });

    it('should fallback to global static when not found locally', async () => {
      const request = { workflow: 'test', static: 'global.css' };

      globalEnv.setStatic(request, Buffer.from('global css'));

      const content = await mergedEnv.getStatic(request);
      expect(content).toEqual(Buffer.from('global css'));
    });

    it('should check static existence in both environments', async () => {
      const localRequest = { workflow: 'test', static: 'local.css' };
      const globalRequest = { workflow: 'test', static: 'global.css' };

      localEnv.setStatic(localRequest, Buffer.from('css'));
      globalEnv.setStatic(globalRequest, Buffer.from('css'));

      expect(await mergedEnv.hasStatic(localRequest)).toBe(true);
      expect(await mergedEnv.hasStatic(globalRequest)).toBe(true);
      expect(await mergedEnv.hasStatic({ workflow: 'test', static: 'nonexistent.css' })).toBe(
        false,
      );
    });
  });

  describe('manifest generation', () => {
    it('should merge manifests from both environments', async () => {
      // Set up local environment
      localEnv.setConfig(localConfig);
      localEnv.setWorkflow('local-workflow', localWorkflow);
      localEnv.setProcessor(localProcessor);
      localEnv.setTemplate({ workflow: 'local-workflow', template: 'template1' }, 'content1');
      localEnv.setStatic({ workflow: 'local-workflow', static: 'style1.css' }, Buffer.from('css1'));

      // Set up global environment
      globalEnv.setWorkflow('global-workflow', globalWorkflow);
      globalEnv.setProcessor(globalProcessor);
      globalEnv.setTemplate({ workflow: 'global-workflow', template: 'template2' }, 'content2');
      globalEnv.setStatic(
        { workflow: 'global-workflow', static: 'style2.css' },
        Buffer.from('css2'),
      );

      const manifest = await mergedEnv.getManifest();

      expect(manifest.hasConfig).toBe(true);
      expect(manifest.workflows).toContain('local-workflow');
      expect(manifest.workflows).toContain('global-workflow');
      expect(manifest.processors).toContain('local-processor');
      expect(manifest.processors).toContain('global-processor');
      expect(manifest.templates['local-workflow']).toContain('template1');
      expect(manifest.templates['global-workflow']).toContain('template2');
      expect(manifest.statics['local-workflow']).toContain('style1.css');
      expect(manifest.statics['global-workflow']).toContain('style2.css');
    });

    it('should deduplicate resources in manifest', async () => {
      const sharedWorkflow = { ...localWorkflow };
      sharedWorkflow.workflow.name = 'shared-workflow';

      localEnv.setWorkflow('shared', sharedWorkflow);
      globalEnv.setWorkflow('shared', sharedWorkflow);
      localEnv.setTemplate({ workflow: 'shared', template: 'template' }, 'local');
      globalEnv.setTemplate({ workflow: 'shared', template: 'template' }, 'global');

      const manifest = await mergedEnv.getManifest();

      expect(manifest.workflows.filter((w) => w === 'shared')).toHaveLength(1);
      expect(manifest.templates['shared'].filter((t) => t === 'template')).toHaveLength(1);
    });

    it('should handle empty environments gracefully', async () => {
      const manifest = await mergedEnv.getManifest();

      expect(manifest.hasConfig).toBe(false);
      expect(manifest.workflows).toEqual([]);
      expect(manifest.processors).toEqual([]);
      expect(manifest.converters).toEqual([]);
      expect(manifest.templates).toEqual({});
      expect(manifest.statics).toEqual({});
    });
  });

  describe('environment access', () => {
    it('should provide access to local environment', () => {
      const local = mergedEnv.getLocalEnvironment();
      expect(local).toBe(localEnv);
    });

    it('should provide access to global environment', () => {
      const global = mergedEnv.getGlobalEnvironment();
      expect(global).toBe(globalEnv);
    });

    it('should identify resource sources correctly', async () => {
      localEnv.setWorkflow('local-only', localWorkflow);
      globalEnv.setWorkflow('global-only', globalWorkflow);
      localEnv.setWorkflow('shared', localWorkflow);
      globalEnv.setWorkflow('shared', globalWorkflow);

      expect(await mergedEnv.getResourceSource('workflow', 'local-only')).toBe('local');
      expect(await mergedEnv.getResourceSource('workflow', 'global-only')).toBe('global');
      expect(await mergedEnv.getResourceSource('workflow', 'shared')).toBe('local'); // Local takes priority
      expect(await mergedEnv.getResourceSource('workflow', 'nonexistent')).toBe('none');
    });

    it('should identify template sources correctly', async () => {
      const localRequest = { workflow: 'test', template: 'local-template' };
      const globalRequest = { workflow: 'test', template: 'global-template' };
      const sharedRequest = { workflow: 'test', template: 'shared-template' };

      localEnv.setTemplate(localRequest, 'content');
      localEnv.setTemplate(sharedRequest, 'local content');
      globalEnv.setTemplate(globalRequest, 'content');
      globalEnv.setTemplate(sharedRequest, 'global content');

      expect(await mergedEnv.getResourceSource('template', localRequest)).toBe('local');
      expect(await mergedEnv.getResourceSource('template', globalRequest)).toBe('global');
      expect(await mergedEnv.getResourceSource('template', sharedRequest)).toBe('local');
      expect(
        await mergedEnv.getResourceSource('template', { workflow: 'test', template: 'none' }),
      ).toBe('none');
    });
  });

  describe('error propagation', () => {
    it('should propagate non-ResourceNotFoundError errors from local environment', async () => {
      const customError = new Error('Custom error');
      jest.spyOn(localEnv, 'getWorkflow').mockRejectedValue(customError);

      await expect(mergedEnv.getWorkflow('test')).rejects.toThrow('Custom error');
    });

    it('should propagate non-ResourceNotFoundError errors from global environment', async () => {
      const customError = new Error('Global custom error');
      jest
        .spyOn(localEnv, 'getWorkflow')
        .mockRejectedValue(new ResourceNotFoundError('Workflow', 'test'));
      jest.spyOn(globalEnv, 'getWorkflow').mockRejectedValue(customError);

      await expect(mergedEnv.getWorkflow('test')).rejects.toThrow('Global custom error');
    });
  });
});
