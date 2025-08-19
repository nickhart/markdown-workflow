/**
 * FilesystemEnvironment - Environment implementation that loads resources from filesystem
 *
 * This implementation walks a directory structure and loads resources following
 * the standard markdown-workflow directory layout:
 *
 * /
 * ├── config.yml                    # Project configuration
 * ├── workflows/                    # Workflow definitions
 * │   ├── job/
 * │   │   ├── workflow.yml
 * │   │   └── templates/
 * │   │       ├── resume/
 * │   │       │   └── default.md
 * │   │       └── static/
 * │   │           └── reference.docx
 * │   └── blog/...
 * ├── processors/                   # External processor definitions
 * │   └── formatter.yml
 * └── converters/                   # External converter definitions
 *     └── plaintext.yml
 */

import * as path from 'path';
import * as YAML from 'yaml';
import {
  Environment,
  EnvironmentManifest,
  TemplateRequest,
  StaticRequest,
  ResourceNotFoundError,
  ValidationError,
} from './environment.js';
import {
  SecurityValidator,
  SecurityConfig,
  DEFAULT_SECURITY_CONFIG,
} from './security-validator.js';
import { SystemInterface, NodeSystemInterface } from '../system-interface.js';
import {
  type ProjectConfig,
  type WorkflowFile,
  type ExternalProcessorDefinition,
  type ExternalConverterDefinition,
  ProjectConfigSchema,
  WorkflowFileSchema,
  ExternalProcessorFileSchema,
  ExternalConverterFileSchema,
} from '../schemas.js';

export class FilesystemEnvironment extends Environment {
  private rootPath: string;
  private systemInterface: SystemInterface;
  private securityValidator: SecurityValidator;
  private manifestCache?: EnvironmentManifest;

  constructor(
    rootPath: string,
    systemInterface: SystemInterface = new NodeSystemInterface(),
    securityConfig: SecurityConfig = DEFAULT_SECURITY_CONFIG,
  ) {
    super();
    this.rootPath = path.resolve(rootPath);
    this.systemInterface = systemInterface;
    this.securityValidator = new SecurityValidator(securityConfig);
  }

  /**
   * Get project configuration
   */
  async getConfig(): Promise<ProjectConfig | null> {
    const configPath = path.join(this.rootPath, 'config.yml');

    try {
      if (!this.systemInterface.existsSync(configPath)) {
        return null;
      }
    } catch (error) {
      // Handle file system errors gracefully
      console.debug(`File system error checking config existence: ${error}`);
      return null;
    }

    try {
      const content = this.systemInterface.readFileSync(configPath);
      const parsed = YAML.parse(content);

      // Validate against schema
      const result = ProjectConfigSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError(`Invalid project config: ${result.error.message}`);
      }

      return result.data;
    } catch (error) {
      throw new ValidationError(
        `Failed to load config from ${configPath}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get workflow definition by name
   */
  async getWorkflow(name: string): Promise<WorkflowFile> {
    const workflowPath = path.join(this.rootPath, 'workflows', name, 'workflow.yml');

    if (!this.systemInterface.existsSync(workflowPath)) {
      throw new ResourceNotFoundError('Workflow', name);
    }

    try {
      const content = this.systemInterface.readFileSync(workflowPath);

      // Parse YAML content
      let parsed;
      try {
        parsed = YAML.parse(content);
      } catch (yamlError) {
        throw new ValidationError(
          `Invalid YAML in workflow definition for ${name}: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`,
        );
      }

      // Validate against schema
      const result = WorkflowFileSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError(
          `Invalid workflow definition for ${name}: ${result.error.message}`,
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ResourceNotFoundError('Workflow', name, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Get external processor definitions
   */
  async getProcessorDefinitions(): Promise<ExternalProcessorDefinition[]> {
    const processorsDir = path.join(this.rootPath, 'processors');

    if (!this.systemInterface.existsSync(processorsDir)) {
      return [];
    }

    const definitions: ExternalProcessorDefinition[] = [];

    try {
      const files = this.systemInterface
        .readdirSync(processorsDir)
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.yml'))
        .map((dirent) => dirent.name);

      for (const file of files) {
        const filePath = path.join(processorsDir, file);
        try {
          const content = this.systemInterface.readFileSync(filePath);
          const parsed = YAML.parse(content);

          const result = ExternalProcessorFileSchema.safeParse(parsed);
          if (result.success) {
            definitions.push(result.data.processor);
          } else {
            console.warn(`Invalid processor definition in ${file}: ${result.error.message}`);
          }
        } catch (error) {
          console.warn(`Failed to load processor from ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Failed to read processors directory:`, error);
    }

    return definitions;
  }

  /**
   * Get external converter definitions
   */
  async getConverterDefinitions(): Promise<ExternalConverterDefinition[]> {
    const convertersDir = path.join(this.rootPath, 'converters');

    if (!this.systemInterface.existsSync(convertersDir)) {
      return [];
    }

    const definitions: ExternalConverterDefinition[] = [];

    try {
      const files = this.systemInterface
        .readdirSync(convertersDir)
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.yml'))
        .map((dirent) => dirent.name);

      for (const file of files) {
        const filePath = path.join(convertersDir, file);
        try {
          const content = this.systemInterface.readFileSync(filePath);
          const parsed = YAML.parse(content);

          const result = ExternalConverterFileSchema.safeParse(parsed);
          if (result.success) {
            definitions.push(result.data.converter);
          } else {
            console.warn(`Invalid converter definition in ${file}: ${result.error.message}`);
          }
        } catch (error) {
          console.warn(`Failed to load converter from ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Failed to read converters directory:`, error);
    }

    return definitions;
  }

  /**
   * Get template content
   */
  async getTemplate(request: TemplateRequest): Promise<string> {
    const templatePath = this.resolveTemplatePath(request);

    if (!this.systemInterface.existsSync(templatePath)) {
      throw new ResourceNotFoundError(
        'Template',
        `${request.workflow}/${request.template}${request.variant ? `/${request.variant}` : ''}`,
      );
    }

    try {
      return this.systemInterface.readFileSync(templatePath);
    } catch (error) {
      throw new ResourceNotFoundError(
        'Template',
        `${request.workflow}/${request.template}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get static file content
   */
  async getStatic(request: StaticRequest): Promise<Buffer> {
    const staticPath = this.resolveStaticPath(request);

    if (!this.systemInterface.existsSync(staticPath)) {
      throw new ResourceNotFoundError('Static', `${request.workflow}/${request.static}`);
    }

    try {
      const content = this.systemInterface.readFileSync(staticPath);
      return Buffer.from(content, 'binary');
    } catch (error) {
      throw new ResourceNotFoundError(
        'Static',
        `${request.workflow}/${request.static}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * List available workflows
   */
  async listWorkflows(): Promise<string[]> {
    const workflowsDir = path.join(this.rootPath, 'workflows');

    try {
      if (!this.systemInterface.existsSync(workflowsDir)) {
        return [];
      }
    } catch (error) {
      // Handle file system errors gracefully
      console.debug(`File system error checking workflows directory: ${error}`);
      return [];
    }

    try {
      return this.systemInterface
        .readdirSync(workflowsDir)
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .filter((name) => {
          // Only include directories that have a workflow.yml file
          const workflowFile = path.join(workflowsDir, name, 'workflow.yml');
          return this.systemInterface.existsSync(workflowFile);
        });
    } catch (error) {
      console.warn('Failed to read workflows directory:', error);
      return [];
    }
  }

  /**
   * Get environment manifest
   */
  async getManifest(): Promise<EnvironmentManifest> {
    if (this.manifestCache) {
      return this.manifestCache;
    }

    const manifest: EnvironmentManifest = {
      workflows: await this.listWorkflows(),
      processors: [],
      converters: [],
      templates: {},
      statics: {},
      hasConfig: this.systemInterface.existsSync(path.join(this.rootPath, 'config.yml')),
    };

    // Get processor definitions
    const processors = await this.getProcessorDefinitions();
    manifest.processors = processors.map((p) => p.name);

    // Get converter definitions
    const converters = await this.getConverterDefinitions();
    manifest.converters = converters.map((c) => c.name);

    // Scan templates and statics for each workflow
    for (const workflowName of manifest.workflows) {
      manifest.templates[workflowName] = await this.scanTemplates(workflowName);
      manifest.statics[workflowName] = await this.scanStatics(workflowName);
    }

    this.manifestCache = manifest;
    return manifest;
  }

  /**
   * Resolve template file path with variant support
   */
  private resolveTemplatePath(request: TemplateRequest): string {
    const workflowDir = path.join(this.rootPath, 'workflows', request.workflow, 'templates');

    if (request.variant) {
      // Try variant-specific template first
      const variantPath = path.join(workflowDir, request.template, `${request.variant}.md`);
      if (this.systemInterface.existsSync(variantPath)) {
        return variantPath;
      }
    }

    // Fall back to default template
    return path.join(workflowDir, request.template, 'default.md');
  }

  /**
   * Resolve static file path
   */
  private resolveStaticPath(request: StaticRequest): string {
    // Try in static directory first
    const staticPath = path.join(
      this.rootPath,
      'workflows',
      request.workflow,
      'templates',
      'static',
      request.static,
    );
    if (this.systemInterface.existsSync(staticPath)) {
      return staticPath;
    }

    // Fall back to root of templates directory
    return path.join(this.rootPath, 'workflows', request.workflow, 'templates', request.static);
  }

  /**
   * Scan available templates for a workflow
   */
  private async scanTemplates(workflowName: string): Promise<string[]> {
    const templatesDir = path.join(this.rootPath, 'workflows', workflowName, 'templates');

    if (!this.systemInterface.existsSync(templatesDir)) {
      return [];
    }

    try {
      return this.systemInterface
        .readdirSync(templatesDir)
        .filter((dirent) => dirent.isDirectory() && dirent.name !== 'static')
        .map((dirent) => dirent.name);
    } catch (error) {
      console.warn(`Failed to scan templates for workflow ${workflowName}:`, error);
      return [];
    }
  }

  /**
   * Scan available static files for a workflow
   */
  private async scanStatics(workflowName: string): Promise<string[]> {
    const staticDir = path.join(this.rootPath, 'workflows', workflowName, 'templates', 'static');

    if (!this.systemInterface.existsSync(staticDir)) {
      return [];
    }

    try {
      return this.systemInterface
        .readdirSync(staticDir)
        .filter((dirent) => dirent.isFile())
        .map((dirent) => dirent.name);
    } catch (error) {
      console.warn(`Failed to scan statics for workflow ${workflowName}:`, error);
      return [];
    }
  }
}
