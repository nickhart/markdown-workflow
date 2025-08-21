/**
 * WorkflowContext - Smart lazy loading and resource management for specific workflows
 *
 * This class provides workflow-specific resource loading and caching:
 * - Lazy loads only resources needed for the current workflow
 * - Tracks processor/converter dependencies
 * - Provides optimized resource access patterns
 * - Manages resource lifecycle and cleanup
 */

import { Environment, TemplateRequest, StaticRequest } from './environment.js';
import {
  ProcessorRegistry,
  defaultProcessorRegistry,
} from '../../services/processors/base-processor.js';
import {
  ConverterRegistry,
  defaultConverterRegistry,
} from '../../services/converters/base-converter.js';
import { ExternalCLIDiscoveryService } from '../../services/external-cli-discovery.js';
import { type ProjectConfig, type WorkflowFile, type WorkflowAction } from '../schemas.js';

export interface WorkflowResources {
  workflow: WorkflowFile;
  config: ProjectConfig | null;
  processors: ProcessorRegistry;
  converters: ConverterRegistry;
  requiredProcessors: string[];
  requiredConverters: string[];
}

export interface ResourceLoadOptions {
  loadProcessors?: boolean;
  loadConverters?: boolean;
  loadTemplates?: boolean;
  loadStatics?: boolean;
}

export class WorkflowContext {
  private workflowName: string;
  private environment: Environment;
  private resources?: WorkflowResources;
  private discoveryService: ExternalCLIDiscoveryService;
  private loadedExternalResources = false;

  constructor(environment: Environment, workflowName: string) {
    this.environment = environment;
    this.workflowName = workflowName;
    this.discoveryService = new ExternalCLIDiscoveryService();
  }

  /**
   * Get the workflow name
   */
  getWorkflowName(): string {
    return this.workflowName;
  }

  /**
   * Load all workflow resources (lazy loading)
   */
  async loadResources(options: ResourceLoadOptions = {}): Promise<WorkflowResources> {
    if (this.resources) {
      return this.resources;
    }

    console.log(`🔍 Loading resources for workflow: ${this.workflowName}`);

    // Load core resources
    const [workflow, config] = await Promise.all([
      this.environment.getWorkflow(this.workflowName),
      this.environment.getConfig(),
    ]);

    // Determine required processors and converters from workflow
    const requiredProcessors = this.extractRequiredProcessors(workflow);
    const requiredConverters = this.extractRequiredConverters(workflow);

    console.log(`📦 Required processors: ${requiredProcessors.join(', ') || 'none'}`);
    console.log(`🔧 Required converters: ${requiredConverters.join(', ') || 'none'}`);

    // Create dedicated registries for this workflow context
    const processors = new ProcessorRegistry();
    const converters = new ConverterRegistry();

    // Load external definitions and register them
    if (options.loadProcessors !== false) {
      await this.loadExternalProcessors(processors, requiredProcessors);
    }

    if (options.loadConverters !== false) {
      await this.loadExternalConverters(converters, requiredConverters);
    }

    this.resources = {
      workflow,
      config,
      processors,
      converters,
      requiredProcessors,
      requiredConverters,
    };

    console.log(`✅ Loaded resources for workflow: ${this.workflowName}`);
    return this.resources;
  }

  /**
   * Get workflow definition
   */
  async getWorkflow(): Promise<WorkflowFile> {
    const resources = await this.loadResources();
    return resources.workflow;
  }

  /**
   * Get project configuration
   */
  async getConfig(): Promise<ProjectConfig | null> {
    const resources = await this.loadResources();
    return resources.config;
  }

  /**
   * Get processor registry for this workflow
   */
  async getProcessors(): Promise<ProcessorRegistry> {
    const resources = await this.loadResources();
    return resources.processors;
  }

  /**
   * Get converter registry for this workflow
   */
  async getConverters(): Promise<ConverterRegistry> {
    const resources = await this.loadResources();
    return resources.converters;
  }

  /**
   * Get template content
   */
  async getTemplate(templateName: string, variant?: string): Promise<string> {
    const request: TemplateRequest = {
      workflow: this.workflowName,
      template: templateName,
      variant,
    };
    return await this.environment.getTemplate(request);
  }

  /**
   * Get static file content
   */
  async getStatic(staticName: string): Promise<Buffer> {
    const request: StaticRequest = {
      workflow: this.workflowName,
      static: staticName,
    };
    return await this.environment.getStatic(request);
  }

  /**
   * Check if template exists
   */
  async hasTemplate(templateName: string, variant?: string): Promise<boolean> {
    const request: TemplateRequest = {
      workflow: this.workflowName,
      template: templateName,
      variant,
    };
    return await this.environment.hasTemplate(request);
  }

  /**
   * Check if static file exists
   */
  async hasStatic(staticName: string): Promise<boolean> {
    const request: StaticRequest = {
      workflow: this.workflowName,
      static: staticName,
    };
    return await this.environment.hasStatic(request);
  }

  /**
   * Get workflow action by name
   */
  async getAction(actionName: string): Promise<WorkflowAction> {
    const workflow = await this.getWorkflow();
    const action = workflow.workflow.actions.find((a) => a.name === actionName);

    if (!action) {
      const availableActions = workflow.workflow.actions.map((a) => a.name);
      throw new Error(
        `Action '${actionName}' not found in workflow '${this.workflowName}'. Available actions: ${availableActions.join(', ')}`,
      );
    }

    return action;
  }

  /**
   * Reload resources (clears cache and reloads)
   */
  async reloadResources(): Promise<WorkflowResources> {
    this.resources = undefined;
    this.loadedExternalResources = false;
    return await this.loadResources();
  }

  /**
   * Extract required processor names from workflow definition
   */
  private extractRequiredProcessors(workflow: WorkflowFile): string[] {
    const processors = new Set<string>();

    for (const action of workflow.workflow.actions) {
      if (action.processors) {
        for (const processor of action.processors) {
          if (processor.enabled !== false) {
            processors.add(processor.name);
          }
        }
      }
    }

    return Array.from(processors);
  }

  /**
   * Extract required converter names from workflow definition
   */
  private extractRequiredConverters(workflow: WorkflowFile): string[] {
    const converters = new Set<string>();

    for (const action of workflow.workflow.actions) {
      if (action.converter) {
        converters.add(action.converter);
      }
    }

    return Array.from(converters);
  }

  /**
   * Load and register external processors
   */
  private async loadExternalProcessors(
    registry: ProcessorRegistry,
    requiredProcessors: string[],
  ): Promise<void> {
    // First, copy default processors from global registry
    for (const processor of defaultProcessorRegistry.getAll()) {
      registry.register(processor);
    }

    // Then load external processor definitions
    const externalDefinitions = await this.environment.getProcessorDefinitions();

    if (externalDefinitions.length === 0) {
      return;
    }

    console.log(`📝 Found ${externalDefinitions.length} external processor definitions`);

    // TODO: Create YAML-defined processors and register them
    // This would require the ExternalCLIDiscoveryService to create processor instances
    // For now, just log what we would load
    for (const def of externalDefinitions) {
      if (requiredProcessors.includes(def.name)) {
        console.log(`📝 Would load external processor: ${def.name}`);
      }
    }
  }

  /**
   * Load and register external converters
   */
  private async loadExternalConverters(
    registry: ConverterRegistry,
    requiredConverters: string[],
  ): Promise<void> {
    // First, copy default converters from global registry
    for (const converter of defaultConverterRegistry.getAll()) {
      registry.register(converter);
    }

    // Then load external converter definitions
    const externalDefinitions = await this.environment.getConverterDefinitions();

    if (externalDefinitions.length === 0) {
      return;
    }

    console.log(`🔧 Found ${externalDefinitions.length} external converter definitions`);

    // TODO: Create YAML-defined converters and register them
    // This would require the ExternalCLIDiscoveryService to create converter instances
    // For now, just log what we would load
    for (const def of externalDefinitions) {
      if (requiredConverters.includes(def.name)) {
        console.log(`🔧 Would load external converter: ${def.name}`);
      }
    }
  }
}

/**
 * Factory function to create WorkflowContext
 */
export function createWorkflowContext(
  environment: Environment,
  workflowName: string,
): WorkflowContext {
  return new WorkflowContext(environment, workflowName);
}
