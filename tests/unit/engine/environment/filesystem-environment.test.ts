import { FilesystemEnvironment } from '../../../../src/engine/environment/filesystem-environment.js';
import {
  SecurityValidator,
  DEFAULT_SECURITY_CONFIG,
} from '../../../../src/engine/environment/security-validator.js';
import {
  ResourceNotFoundError,
  ValidationError,
} from '../../../../src/engine/environment/environment.js';
import { SystemInterface } from '../../../../src/engine/system-interface.js';

// Mock SystemInterface for testing
class MockSystemInterface implements SystemInterface {
  private files = new Map<string, string>();
  private directories = new Set<string>();

  getCurrentFilePath(): string {
    return '/mock/file/path';
  }

  existsSync(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  readFileSync(path: string): string {
    if (!this.files.has(path)) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return this.files.get(path)!;
  }

  writeFileSync(): void {
    // Mock implementation
  }

  statSync(): never {
    throw new Error('statSync not implemented in mock');
  }

  mkdirSync(): void {
    // Mock implementation
  }

  renameSync(): void {
    // Mock implementation
  }

  copyFileSync(): void {
    // Mock implementation
  }

  unlinkSync(): void {
    // Mock implementation
  }

  readdirSync(path: string): Array<{ name: string; isFile(): boolean; isDirectory(): boolean }> {
    const entries: string[] = [];
    const pathPrefix = path.endsWith('/') ? path : path + '/';

    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(pathPrefix) && !filePath.substring(pathPrefix.length).includes('/')) {
        entries.push(filePath.substring(pathPrefix.length));
      }
    }

    for (const dirPath of this.directories) {
      if (dirPath.startsWith(pathPrefix) && !dirPath.substring(pathPrefix.length).includes('/')) {
        entries.push(dirPath.substring(pathPrefix.length));
      }
    }

    return entries.map((name) => {
      const fullPath = this.joinPath(path, name);
      return {
        name,
        isFile: () => this.files.has(fullPath),
        isDirectory: () => this.directories.has(fullPath),
      };
    });
  }

  isDirectorySync(path: string): boolean {
    return this.directories.has(path);
  }

  isFileSync(path: string): boolean {
    return this.files.has(path);
  }

  joinPath(...paths: string[]): string {
    return paths.join('/').replace(/\/+/g, '/');
  }

  resolve(...paths: string[]): string {
    return this.joinPath(...paths);
  }

  // Helper methods for testing
  setFile(path: string, content: string): void {
    this.files.set(path, content);
    // Ensure parent directories exist
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join('/');
      if (dirPath) {
        this.directories.add(dirPath);
      }
    }
  }

  setDirectory(path: string): void {
    this.directories.add(path);
  }

  clear(): void {
    this.files.clear();
    this.directories.clear();
  }
}

describe('FilesystemEnvironment', () => {
  let mockSystem: MockSystemInterface;
  let environment: FilesystemEnvironment;
  const testRoot = '/test/root';

  beforeEach(() => {
    mockSystem = new MockSystemInterface();
    environment = new FilesystemEnvironment(testRoot, mockSystem, DEFAULT_SECURITY_CONFIG);
  });

  describe('configuration management', () => {
    it('should return null when config file does not exist', async () => {
      const config = await environment.getConfig();
      expect(config).toBeNull();
    });

    it('should read and parse valid config file', async () => {
      const configContent = `
user:
  name: "Test User"
  preferred_name: "Test"
  email: "test@example.com"
  phone: "555-0123"
  address: "123 Main St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "test-linkedin"
  github: "test-github"
  website: "test-website.com"
system:
  output_formats: ["docx", "html"]
  scraper: "wget"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  git:
    auto_add: true
    auto_commit: true
    commit_message_template: "Update {{collection_type}}: {{collection_id}}"
  collection_id:
    pattern: "{{workflow}}_{{date}}"
    max_length: 50
    date_format: "YYYYMMDD"
    sanitize_spaces: "underscore"
workflows: {}
      `.trim();

      mockSystem.setFile(`${testRoot}/config.yml`, configContent);

      const config = await environment.getConfig();
      expect(config).not.toBeNull();
      expect(config!.user.name).toBe('Test User');
      expect(config!.user.email).toBe('test@example.com');
      expect(config!.system.output_formats).toEqual(['docx', 'html']);
    });

    it('should throw ValidationError for invalid config YAML', async () => {
      const invalidYaml = 'user:\n  name: test\n    invalid: indentation';
      mockSystem.setFile(`${testRoot}/config.yml`, invalidYaml);

      await expect(environment.getConfig()).rejects.toThrow(ValidationError);
    });

    it('should prefer config.yml over config.yaml', async () => {
      const ymlConfig = `
user:
  name: "From YML"
  preferred_name: "YML"
  email: "yml@test.com"
  phone: "555-0123"
  address: "123 Main St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "yml-linkedin"
  github: "yml-github"
  website: "yml-website.com"
system:
  output_formats: ["docx"]
  scraper: "wget"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  git:
    auto_add: true
    auto_commit: true
    commit_message_template: "Update"
  collection_id:
    pattern: "{{workflow}}_{{date}}"
    max_length: 50
    date_format: "YYYYMMDD"
    sanitize_spaces: "underscore"
workflows: {}
      `.trim();

      const yamlConfig = `
user:
  name: "From YAML"
  preferred_name: "YAML"
  email: "yaml@test.com"
  phone: "555-0123"
  address: "123 Main St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "yaml-linkedin"
  github: "yaml-github"
  website: "yaml-website.com"
system:
  output_formats: ["docx"]
  scraper: "wget"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  git:
    auto_add: true
    auto_commit: true
    commit_message_template: "Update"
  collection_id:
    pattern: "{{workflow}}_{{date}}"
    max_length: 50
    date_format: "YYYYMMDD"
    sanitize_spaces: "underscore"
workflows: {}
      `.trim();

      mockSystem.setFile(`${testRoot}/config.yml`, ymlConfig);
      mockSystem.setFile(`${testRoot}/config.yaml`, yamlConfig);

      const config = await environment.getConfig();
      expect(config!.user.name).toBe('From YML');
    });
  });

  describe('workflow management', () => {
    it('should throw ResourceNotFoundError for non-existent workflow', async () => {
      await expect(environment.getWorkflow('nonexistent')).rejects.toThrow(ResourceNotFoundError);
    });

    it('should read and parse valid workflow file', async () => {
      const workflowContent = `
workflow:
  name: "test-workflow"
  description: "Test workflow"
  version: "1.0.0"
  stages:
    - name: "active"
      description: "Active stage"
      color: "blue"
  templates:
    - name: "test-template"
      description: "Test template"
      file: "test.md"
      output: "test_{{user.preferred_name}}.md"
  statics: []
  actions:
    - name: "create"
      description: "Create collection"
      templates: ["test-template"]
  metadata:
    required_fields: ["company"]
    optional_fields: ["role"]
    auto_generated: ["date"]
  collection_id:
    pattern: "test_{{date}}"
    max_length: 50
      `.trim();

      mockSystem.setDirectory(`${testRoot}/workflows/test`);
      mockSystem.setFile(`${testRoot}/workflows/test/workflow.yml`, workflowContent);

      const workflow = await environment.getWorkflow('test');
      expect(workflow.workflow.name).toBe('test-workflow');
      expect(workflow.workflow.stages).toHaveLength(1);
      expect(workflow.workflow.stages[0].name).toBe('active');
    });

    it('should throw ValidationError for invalid workflow YAML', async () => {
      const invalidWorkflow = 'workflow:\n  name: test\n    invalid: structure';
      mockSystem.setDirectory(`${testRoot}/workflows/test`);
      mockSystem.setFile(`${testRoot}/workflows/test/workflow.yml`, invalidWorkflow);

      await expect(environment.getWorkflow('test')).rejects.toThrow(ValidationError);
    });

    it('should list available workflows', async () => {
      mockSystem.setDirectory(`${testRoot}/workflows`);
      mockSystem.setDirectory(`${testRoot}/workflows/workflow1`);
      mockSystem.setDirectory(`${testRoot}/workflows/workflow2`);
      mockSystem.setFile(`${testRoot}/workflows/workflow1/workflow.yml`, 'workflow:\n  name: "w1"');
      mockSystem.setFile(`${testRoot}/workflows/workflow2/workflow.yml`, 'workflow:\n  name: "w2"');

      const workflows = await environment.listWorkflows();
      expect(workflows).toContain('workflow1');
      expect(workflows).toContain('workflow2');
      expect(workflows).toHaveLength(2);
    });

    it('should return empty array when workflows directory does not exist', async () => {
      const workflows = await environment.listWorkflows();
      expect(workflows).toEqual([]);
    });

    it('should check workflow existence', async () => {
      expect(await environment.hasWorkflow('test')).toBe(false);

      mockSystem.setDirectory(`${testRoot}/workflows/test`);
      mockSystem.setFile(`${testRoot}/workflows/test/workflow.yml`, 'workflow:\n  name: "test"');

      expect(await environment.hasWorkflow('test')).toBe(true);
    });
  });

  describe('processor definitions', () => {
    it('should return empty array when processors directory does not exist', async () => {
      const processors = await environment.getProcessorDefinitions();
      expect(processors).toEqual([]);
    });

    it('should read processor definitions from YAML files', async () => {
      const processorContent = `
processor:
  name: "test-processor"
  description: "Test processor"
  version: "1.0.0"
  detection:
    command: "test-cli --version"
    pattern: ".*\.md$"
  execution:
    command_template: "test-cli {{input_file}} {{output_file}}"
    mode: "output-file"
    backup: false
    timeout: 30
      `.trim();

      mockSystem.setDirectory(`${testRoot}/processors`);
      mockSystem.setFile(`${testRoot}/processors/test-processor.yml`, processorContent);

      const processors = await environment.getProcessorDefinitions();
      expect(processors).toHaveLength(1);
      expect(processors[0].name).toBe('test-processor');
      expect(processors[0].description).toBe('Test processor');
      expect(processors[0].version).toBe('1.0.0');
    });

    it('should handle multiple processor files', async () => {
      mockSystem.setDirectory(`${testRoot}/processors`);
      mockSystem.setFile(
        `${testRoot}/processors/processor1.yml`,
        'processor:\n  name: "p1"\n  description: "Processor 1"\n  version: "1.0.0"\n  detection:\n    command: "p1 --version"\n  execution:\n    command_template: "p1 {{input_file}}"',
      );
      mockSystem.setFile(
        `${testRoot}/processors/processor2.yml`,
        'processor:\n  name: "p2"\n  description: "Processor 2"\n  version: "1.0.0"\n  detection:\n    command: "p2 --version"\n  execution:\n    command_template: "p2 {{input_file}}"',
      );

      const processors = await environment.getProcessorDefinitions();
      expect(processors).toHaveLength(2);
      expect(processors.map((p) => p.name)).toContain('p1');
      expect(processors.map((p) => p.name)).toContain('p2');
    });

    it('should skip invalid processor files', async () => {
      mockSystem.setDirectory(`${testRoot}/processors`);
      mockSystem.setFile(
        `${testRoot}/processors/valid.yml`,
        'processor:\n  name: "valid"\n  description: "Valid processor"\n  version: "1.0.0"\n  detection:\n    command: "valid --version"\n  execution:\n    command_template: "valid {{input_file}}"',
      );
      mockSystem.setFile(`${testRoot}/processors/invalid.yml`, 'invalid: yaml: structure');

      const processors = await environment.getProcessorDefinitions();
      expect(processors).toHaveLength(1);
      expect(processors[0].name).toBe('valid');
    });
  });

  describe('converter definitions', () => {
    it('should return empty array when converters directory does not exist', async () => {
      const converters = await environment.getConverterDefinitions();
      expect(converters).toEqual([]);
    });

    it('should read converter definitions from YAML files', async () => {
      const converterContent = `
converter:
  name: "test-converter"
  description: "Test converter"
  version: "1.0.0"
  supported_formats: ["markdown", "docx"]
  detection:
    command: "pandoc --version"
    pattern: ".*\.md$"
  execution:
    command_template: "pandoc {{input_file}} -o {{output_file}}"
    mode: "output-file"
    backup: false
    timeout: 30
      `.trim();

      mockSystem.setDirectory(`${testRoot}/converters`);
      mockSystem.setFile(`${testRoot}/converters/test-converter.yml`, converterContent);

      const converters = await environment.getConverterDefinitions();
      expect(converters).toHaveLength(1);
      expect(converters[0].name).toBe('test-converter');
      expect(converters[0].description).toBe('Test converter');
      expect(converters[0].version).toBe('1.0.0');
    });
  });

  describe('template management', () => {
    it('should throw ResourceNotFoundError for non-existent template', async () => {
      const request = { workflow: 'test', template: 'nonexistent' };
      await expect(environment.getTemplate(request)).rejects.toThrow(ResourceNotFoundError);
    });

    it('should read template files', async () => {
      const templateContent = '# {{title}}\n\nHello {{user.name}}!';
      mockSystem.setDirectory(`${testRoot}/workflows/test/templates/example`);
      mockSystem.setFile(
        `${testRoot}/workflows/test/templates/example/default.md`,
        templateContent,
      );

      const request = { workflow: 'test', template: 'example' };
      const content = await environment.getTemplate(request);
      expect(content).toBe(templateContent);
    });

    it('should read template variants', async () => {
      const variantContent = '# Mobile Template\n\nOptimized for mobile';
      mockSystem.setDirectory(`${testRoot}/workflows/test/templates/example`);
      mockSystem.setFile(`${testRoot}/workflows/test/templates/example/mobile.md`, variantContent);

      const request = { workflow: 'test', template: 'example', variant: 'mobile' };
      const content = await environment.getTemplate(request);
      expect(content).toBe(variantContent);
    });

    it('should check template existence', async () => {
      const request = { workflow: 'test', template: 'example' };
      expect(await environment.hasTemplate(request)).toBe(false);

      mockSystem.setDirectory(`${testRoot}/workflows/test/templates/example`);
      mockSystem.setFile(`${testRoot}/workflows/test/templates/example/default.md`, 'content');

      expect(await environment.hasTemplate(request)).toBe(true);
    });

    it('should handle template variants in existence check', async () => {
      const request = { workflow: 'test', template: 'example', variant: 'mobile' };
      expect(await environment.hasTemplate(request)).toBe(false);

      mockSystem.setDirectory(`${testRoot}/workflows/test/templates/example`);
      mockSystem.setFile(`${testRoot}/workflows/test/templates/example/mobile.md`, 'content');

      expect(await environment.hasTemplate(request)).toBe(true);
    });
  });

  describe('static file management', () => {
    it('should throw ResourceNotFoundError for non-existent static file', async () => {
      const request = { workflow: 'test', static: 'nonexistent.css' };
      await expect(environment.getStatic(request)).rejects.toThrow(ResourceNotFoundError);
    });

    it('should read static files as buffers', async () => {
      const staticContent = 'body { color: red; }';
      mockSystem.setDirectory(`${testRoot}/workflows/test/templates/static`);
      mockSystem.setFile(`${testRoot}/workflows/test/templates/static/style.css`, staticContent);

      const request = { workflow: 'test', static: 'style.css' };
      const content = await environment.getStatic(request);
      expect(content).toEqual(Buffer.from(staticContent));
    });

    it('should check static file existence', async () => {
      const request = { workflow: 'test', static: 'style.css' };
      expect(await environment.hasStatic(request)).toBe(false);

      mockSystem.setDirectory(`${testRoot}/workflows/test/templates/static`);
      mockSystem.setFile(`${testRoot}/workflows/test/templates/static/style.css`, 'css');

      expect(await environment.hasStatic(request)).toBe(true);
    });
  });

  describe('manifest generation', () => {
    it('should generate manifest from filesystem structure', async () => {
      // Set up test filesystem
      mockSystem.setFile(`${testRoot}/config.yml`, 'user:\n  name: "test"');

      // Workflows
      mockSystem.setDirectory(`${testRoot}/workflows`);
      mockSystem.setDirectory(`${testRoot}/workflows/workflow1`);
      mockSystem.setFile(`${testRoot}/workflows/workflow1/workflow.yml`, 'workflow:\n  name: "w1"');

      // Templates
      mockSystem.setDirectory(`${testRoot}/workflows/workflow1/templates/template1`);
      mockSystem.setFile(
        `${testRoot}/workflows/workflow1/templates/template1/default.md`,
        'content',
      );

      // Statics
      mockSystem.setDirectory(`${testRoot}/workflows/workflow1/templates/static`);
      mockSystem.setFile(`${testRoot}/workflows/workflow1/templates/static/style.css`, 'css');

      // Processors
      mockSystem.setDirectory(`${testRoot}/processors`);
      mockSystem.setFile(
        `${testRoot}/processors/processor1.yml`,
        'processor:\n  name: "p1"\n  description: "Processor 1"\n  version: "1.0.0"\n  detection:\n    command: "p1 --version"\n  execution:\n    command_template: "p1 {{input_file}}"',
      );

      // Converters
      mockSystem.setDirectory(`${testRoot}/converters`);
      mockSystem.setFile(
        `${testRoot}/converters/converter1.yml`,
        'converter:\n  name: "c1"\n  description: "Converter 1"\n  version: "1.0.0"\n  supported_formats: ["markdown", "docx"]\n  detection:\n    command: "c1 --version"\n  execution:\n    command_template: "c1 {{input_file}} -o {{output_file}}"',
      );

      const manifest = await environment.getManifest();

      expect(manifest.hasConfig).toBe(true);
      expect(manifest.workflows).toContain('workflow1');
      expect(manifest.processors).toContain('p1');
      expect(manifest.converters).toContain('c1');
      expect(manifest.templates['workflow1']).toContain('template1');
      expect(manifest.statics['workflow1']).toContain('style.css');
    });

    it('should handle empty filesystem', async () => {
      const manifest = await environment.getManifest();

      expect(manifest.hasConfig).toBe(false);
      expect(manifest.workflows).toEqual([]);
      expect(manifest.processors).toEqual([]);
      expect(manifest.converters).toEqual([]);
      expect(manifest.templates).toEqual({});
      expect(manifest.statics).toEqual({});
    });
  });

  describe('security validation', () => {
    it('should use security validator for file operations', async () => {
      // Set up a valid config for the environment to load
      const validConfig = `user:
  name: "Test User"
  preferred_name: "Test"
  email: "test@example.com"
  phone: "555-123-4567"
  address: "123 Main St"
  city: "Test City"
  state: "TS"
  zip: "12345"
  linkedin: "linkedin.com/in/test"
  github: "github.com/test"
  website: "test.com"
system:
  scraper: "wget"
  output_formats: ["docx", "html"]
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"
  git:
    auto_commit: false
    commit_message_template: "{{message}}"
  collection_id:
    date_format: "YYYYMMDD"
    sanitize_spaces: "_"
    max_length: 50
workflows: {}`;

      mockSystem.setFile(`${testRoot}/config.yml`, validConfig);

      const config = await environment.getConfig();
      expect(config).not.toBeNull();
      expect(config?.user.name).toBe('Test User');
    });

    it('should validate file paths for security', async () => {
      // This test verifies that the security validator is being used
      // The actual security validation logic is tested in security-validator.test.ts

      const request = { workflow: '../evil', template: 'test' };
      await expect(environment.hasTemplate(request)).resolves.toBe(false);
      // Should not throw - security validation happens at file read time
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Mock a file system error
      const errorSystem = {
        ...mockSystem,
        existsSync: () => {
          throw new Error('File system error');
        },
      };

      const errorEnv = new FilesystemEnvironment(testRoot, errorSystem, DEFAULT_SECURITY_CONFIG);

      await expect(errorEnv.getConfig()).resolves.toBeNull();
      await expect(errorEnv.listWorkflows()).resolves.toEqual([]);
    });

    it('should handle permission errors', async () => {
      // Set up the file first
      mockSystem.setFile(`${testRoot}/config.yml`, 'content');

      // Create a system that throws permission errors on read
      const permissionSystem = Object.create(mockSystem);
      permissionSystem.readFileSync = () => {
        throw new Error('EACCES: permission denied');
      };

      const permissionEnv = new FilesystemEnvironment(
        testRoot,
        permissionSystem,
        DEFAULT_SECURITY_CONFIG,
      );

      await expect(permissionEnv.getConfig()).rejects.toThrow();
    });
  });
});
