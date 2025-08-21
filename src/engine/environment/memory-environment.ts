/**
 * MemoryEnvironment - Environment implementation using in-memory resources
 *
 * This implementation stores all resources in memory, allowing for:
 * - Programmatic resource definition
 * - Testing with mock data
 * - REST/Web API request handling
 * - Dynamic resource manipulation
 */

import {
  Environment,
  EnvironmentManifest,
  TemplateRequest,
  StaticRequest,
  ResourceNotFoundError,
} from './environment.js';
import {
  type ProjectConfig,
  type WorkflowFile,
  type ExternalProcessorDefinition,
  type ExternalConverterDefinition,
} from '../schemas.js';

export interface MemoryEnvironmentData {
  config?: ProjectConfig;
  workflows: Map<string, WorkflowFile>;
  processors: ExternalProcessorDefinition[];
  converters: ExternalConverterDefinition[];
  templates: Map<string, string>; // "workflow/template[/variant]" -> content
  statics: Map<string, Buffer>; // "workflow/static" -> content
}

export class MemoryEnvironment extends Environment {
  private data: MemoryEnvironmentData;

  constructor(initialData?: Partial<MemoryEnvironmentData>) {
    super();
    this.data = {
      config: initialData?.config,
      workflows: initialData?.workflows || new Map(),
      processors: initialData?.processors || [],
      converters: initialData?.converters || [],
      templates: initialData?.templates || new Map(),
      statics: initialData?.statics || new Map(),
    };
  }

  /**
   * Get project configuration
   */
  async getConfig(): Promise<ProjectConfig | null> {
    return this.data.config || null;
  }

  /**
   * Get workflow definition by name
   */
  async getWorkflow(name: string): Promise<WorkflowFile> {
    const workflow = this.data.workflows.get(name);
    if (!workflow) {
      throw new ResourceNotFoundError('Workflow', name);
    }
    return workflow;
  }

  /**
   * Get external processor definitions
   */
  async getProcessorDefinitions(): Promise<ExternalProcessorDefinition[]> {
    return [...this.data.processors]; // Return copy to prevent mutation
  }

  /**
   * Get external converter definitions
   */
  async getConverterDefinitions(): Promise<ExternalConverterDefinition[]> {
    return [...this.data.converters]; // Return copy to prevent mutation
  }

  /**
   * Get template content
   */
  async getTemplate(request: TemplateRequest): Promise<string> {
    const templateKey = this.buildTemplateKey(request);
    const content = this.data.templates.get(templateKey);

    if (content === undefined) {
      throw new ResourceNotFoundError('Template', templateKey);
    }

    return content;
  }

  /**
   * Get static file content
   */
  async getStatic(request: StaticRequest): Promise<Buffer> {
    const staticKey = this.buildStaticKey(request);
    const content = this.data.statics.get(staticKey);

    if (!content) {
      throw new ResourceNotFoundError('Static', staticKey);
    }

    return content;
  }

  /**
   * List available workflows
   */
  async listWorkflows(): Promise<string[]> {
    return Array.from(this.data.workflows.keys());
  }

  /**
   * Get environment manifest
   */
  async getManifest(): Promise<EnvironmentManifest> {
    const workflows = await this.listWorkflows();

    const manifest: EnvironmentManifest = {
      workflows,
      processors: this.data.processors.map((p) => p.name),
      converters: this.data.converters.map((c) => c.name),
      templates: {},
      statics: {},
      hasConfig: this.data.config !== undefined,
    };

    // Get all workflow names that have templates or statics
    const allWorkflowsWithResources = new Set<string>();

    // Add workflows that have templates
    for (const templateKey of this.data.templates.keys()) {
      const workflowName = templateKey.split('/')[0];
      allWorkflowsWithResources.add(workflowName);
    }

    // Add workflows that have statics
    for (const staticKey of this.data.statics.keys()) {
      const workflowName = staticKey.split('/')[0];
      allWorkflowsWithResources.add(workflowName);
    }

    // Build templates and statics maps for all workflows (registered and unregistered)
    for (const workflowName of allWorkflowsWithResources) {
      manifest.templates[workflowName] = this.getTemplateNamesForWorkflow(workflowName);
      manifest.statics[workflowName] = this.getStaticNamesForWorkflow(workflowName);
    }

    return manifest;
  }

  /**
   * Set project configuration
   */
  setConfig(config: ProjectConfig): void {
    this.data.config = config;
  }

  /**
   * Set workflow definition
   */
  setWorkflow(name: string, workflow: WorkflowFile): void {
    this.data.workflows.set(name, workflow);
  }

  /**
   * Add processor definition
   */
  addProcessor(processor: ExternalProcessorDefinition): void {
    // Remove existing processor with same name
    this.data.processors = this.data.processors.filter((p) => p.name !== processor.name);
    this.data.processors.push(processor);
  }

  /**
   * Set processor definition (alias for addProcessor)
   */
  setProcessor(processor: ExternalProcessorDefinition): void {
    this.addProcessor(processor);
  }

  /**
   * Add converter definition
   */
  addConverter(converter: ExternalConverterDefinition): void {
    // Remove existing converter with same name
    this.data.converters = this.data.converters.filter((c) => c.name !== converter.name);
    this.data.converters.push(converter);
  }

  /**
   * Set converter definition (alias for addConverter)
   */
  setConverter(converter: ExternalConverterDefinition): void {
    this.addConverter(converter);
  }

  /**
   * Set template content
   */
  setTemplate(request: TemplateRequest, content: string): void {
    const templateKey = this.buildTemplateKey(request);
    this.data.templates.set(templateKey, content);
  }

  /**
   * Set static file content
   */
  setStatic(request: StaticRequest, content: Buffer): void {
    const staticKey = this.buildStaticKey(request);
    this.data.statics.set(staticKey, content);
  }

  /**
   * Remove workflow and all its resources
   */
  removeWorkflow(name: string): void {
    this.data.workflows.delete(name);

    // Remove templates for this workflow
    const templateKeysToRemove: string[] = [];
    for (const key of this.data.templates.keys()) {
      if (key.startsWith(`${name}/`)) {
        templateKeysToRemove.push(key);
      }
    }
    templateKeysToRemove.forEach((key) => this.data.templates.delete(key));

    // Remove statics for this workflow
    const staticKeysToRemove: string[] = [];
    for (const key of this.data.statics.keys()) {
      if (key.startsWith(`${name}/`)) {
        staticKeysToRemove.push(key);
      }
    }
    staticKeysToRemove.forEach((key) => this.data.statics.delete(key));
  }

  /**
   * Remove template
   */
  removeTemplate(request: TemplateRequest): void {
    const templateKey = this.buildTemplateKey(request);
    this.data.templates.delete(templateKey);
  }

  /**
   * Remove static file
   */
  removeStatic(request: StaticRequest): void {
    const staticKey = this.buildStaticKey(request);
    this.data.statics.delete(staticKey);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.config = undefined;
    this.data.workflows.clear();
    this.data.processors.length = 0;
    this.data.converters.length = 0;
    this.data.templates.clear();
    this.data.statics.clear();
  }

  /**
   * Get a copy of all data (for testing/debugging)
   */
  getData(): MemoryEnvironmentData {
    return {
      config: this.data.config,
      workflows: new Map(this.data.workflows),
      processors: [...this.data.processors],
      converters: [...this.data.converters],
      templates: new Map(this.data.templates),
      statics: new Map(this.data.statics),
    };
  }

  /**
   * Load data from another environment (merge operation)
   */
  async mergeFrom(other: Environment): Promise<void> {
    // Copy config if we don't have one
    if (!this.data.config) {
      const otherConfig = await other.getConfig();
      if (otherConfig) {
        this.data.config = otherConfig;
      }
    }

    // Copy workflows
    const workflows = await other.listWorkflows();
    for (const workflowName of workflows) {
      if (!this.data.workflows.has(workflowName)) {
        const workflow = await other.getWorkflow(workflowName);
        this.data.workflows.set(workflowName, workflow);
      }
    }

    // Copy processors
    const processors = await other.getProcessorDefinitions();
    for (const processor of processors) {
      if (!this.data.processors.some((p) => p.name === processor.name)) {
        this.data.processors.push(processor);
      }
    }

    // Copy converters
    const converters = await other.getConverterDefinitions();
    for (const converter of converters) {
      if (!this.data.converters.some((c) => c.name === converter.name)) {
        this.data.converters.push(converter);
      }
    }

    // Copy templates and statics
    const manifest = await other.getManifest();

    // Get all workflow names that have templates or statics (not just registered workflows)
    const allWorkflowNames = new Set([
      ...manifest.workflows,
      ...Object.keys(manifest.templates),
      ...Object.keys(manifest.statics),
    ]);

    for (const workflowName of allWorkflowNames) {
      // Copy templates
      for (const templateName of manifest.templates[workflowName] || []) {
        const request: TemplateRequest = { workflow: workflowName, template: templateName };
        const key = this.buildTemplateKey(request);

        if (!this.data.templates.has(key)) {
          try {
            const content = await other.getTemplate(request);
            this.data.templates.set(key, content);
          } catch (error) {
            // Template might not exist, skip it
            console.debug(`Failed to copy template ${key}: ${error}`);
          }
        }
      }

      // Copy statics
      for (const staticName of manifest.statics[workflowName] || []) {
        const request: StaticRequest = { workflow: workflowName, static: staticName };
        const key = this.buildStaticKey(request);

        if (!this.data.statics.has(key)) {
          try {
            const content = await other.getStatic(request);
            this.data.statics.set(key, content);
          } catch (error) {
            // Static might not exist, skip it
            console.debug(`Failed to copy static ${key}: ${error}`);
          }
        }
      }
    }
  }

  /**
   * Build template key for storage
   */
  private buildTemplateKey(request: TemplateRequest): string {
    if (request.variant) {
      return `${request.workflow}/${request.template}/${request.variant}`;
    }
    return `${request.workflow}/${request.template}`;
  }

  /**
   * Build static key for storage
   */
  private buildStaticKey(request: StaticRequest): string {
    return `${request.workflow}/${request.static}`;
  }

  /**
   * Get template names for a workflow
   */
  private getTemplateNamesForWorkflow(workflow: string): string[] {
    const names = new Set<string>();
    const prefix = `${workflow}/`;

    for (const key of this.data.templates.keys()) {
      if (key.startsWith(prefix)) {
        const parts = key.slice(prefix.length).split('/');
        names.add(parts[0]); // Template name (without variant)
      }
    }

    return Array.from(names);
  }

  /**
   * Get static names for a workflow
   */
  private getStaticNamesForWorkflow(workflow: string): string[] {
    const names: string[] = [];
    const prefix = `${workflow}/`;

    for (const key of this.data.statics.keys()) {
      if (key.startsWith(prefix)) {
        names.push(key.slice(prefix.length));
      }
    }

    return names;
  }
}
