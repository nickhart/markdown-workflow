/**
 * MergedEnvironment - Environment that merges local and global environments
 *
 * This environment provides intelligent fallback resolution:
 * - Local environment takes priority
 * - Falls back to global environment for missing resources
 * - Merges configurations intelligently
 * - Combines processor/converter definitions
 */

import _ from 'lodash';
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

export class MergedEnvironment extends Environment {
  constructor(
    private localEnv: Environment,
    private globalEnv: Environment,
  ) {
    super();
  }

  /**
   * Get merged project configuration
   * Local config takes priority, global fills in missing values
   */
  async getConfig(): Promise<ProjectConfig | null> {
    const [localConfig, globalConfig] = await Promise.all([
      this.localEnv.getConfig().catch(() => null),
      this.globalEnv.getConfig().catch(() => null),
    ]);

    if (!localConfig && !globalConfig) {
      return null;
    }

    if (localConfig && globalConfig) {
      // Merge configurations with local taking priority
      return _.defaultsDeep({}, localConfig, globalConfig) as ProjectConfig;
    }

    return localConfig || globalConfig;
  }

  /**
   * Get workflow definition - local first, fallback to global
   */
  async getWorkflow(name: string): Promise<WorkflowFile> {
    try {
      return await this.localEnv.getWorkflow(name);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        return await this.globalEnv.getWorkflow(name);
      }
      throw error;
    }
  }

  /**
   * Get combined processor definitions (local + global, with local priority)
   */
  async getProcessorDefinitions(): Promise<ExternalProcessorDefinition[]> {
    const [localProcessors, globalProcessors] = await Promise.all([
      this.localEnv.getProcessorDefinitions().catch(() => []),
      this.globalEnv.getProcessorDefinitions().catch(() => []),
    ]);

    // Merge processors with local taking priority
    const merged = new Map<string, ExternalProcessorDefinition>();

    // Add global processors first
    for (const processor of globalProcessors) {
      merged.set(processor.name, processor);
    }

    // Override with local processors
    for (const processor of localProcessors) {
      merged.set(processor.name, processor);
    }

    return Array.from(merged.values());
  }

  /**
   * Get combined converter definitions (local + global, with local priority)
   */
  async getConverterDefinitions(): Promise<ExternalConverterDefinition[]> {
    const [localConverters, globalConverters] = await Promise.all([
      this.localEnv.getConverterDefinitions().catch(() => []),
      this.globalEnv.getConverterDefinitions().catch(() => []),
    ]);

    // Merge converters with local taking priority
    const merged = new Map<string, ExternalConverterDefinition>();

    // Add global converters first
    for (const converter of globalConverters) {
      merged.set(converter.name, converter);
    }

    // Override with local converters
    for (const converter of localConverters) {
      merged.set(converter.name, converter);
    }

    return Array.from(merged.values());
  }

  /**
   * Get template - local first, fallback to global
   */
  async getTemplate(request: TemplateRequest): Promise<string> {
    try {
      return await this.localEnv.getTemplate(request);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        return await this.globalEnv.getTemplate(request);
      }
      throw error;
    }
  }

  /**
   * Get static file - local first, fallback to global
   */
  async getStatic(request: StaticRequest): Promise<Buffer> {
    try {
      return await this.localEnv.getStatic(request);
    } catch (error) {
      if (error instanceof ResourceNotFoundError) {
        return await this.globalEnv.getStatic(request);
      }
      throw error;
    }
  }

  /**
   * List combined workflows from both environments
   */
  async listWorkflows(): Promise<string[]> {
    const [localWorkflows, globalWorkflows] = await Promise.all([
      this.localEnv.listWorkflows().catch(() => []),
      this.globalEnv.listWorkflows().catch(() => []),
    ]);

    // Combine and deduplicate workflow names
    const allWorkflows = new Set([...localWorkflows, ...globalWorkflows]);
    return Array.from(allWorkflows);
  }

  /**
   * Get merged manifest from both environments
   */
  async getManifest(): Promise<EnvironmentManifest> {
    const [localManifest, globalManifest] = await Promise.all([
      this.localEnv.getManifest().catch(() => this.createEmptyManifest()),
      this.globalEnv.getManifest().catch(() => this.createEmptyManifest()),
    ]);

    // Merge manifests
    const merged: EnvironmentManifest = {
      workflows: Array.from(new Set([...localManifest.workflows, ...globalManifest.workflows])),
      processors: Array.from(new Set([...localManifest.processors, ...globalManifest.processors])),
      converters: Array.from(new Set([...localManifest.converters, ...globalManifest.converters])),
      templates: this.mergeResourceMaps(localManifest.templates, globalManifest.templates),
      statics: this.mergeResourceMaps(localManifest.statics, globalManifest.statics),
      hasConfig: localManifest.hasConfig || globalManifest.hasConfig,
    };

    return merged;
  }

  /**
   * Check if template exists in either environment
   */
  async hasTemplate(request: TemplateRequest): Promise<boolean> {
    const localHas = await this.localEnv.hasTemplate(request);
    if (localHas) return true;

    return await this.globalEnv.hasTemplate(request);
  }

  /**
   * Check if static exists in either environment
   */
  async hasStatic(request: StaticRequest): Promise<boolean> {
    const localHas = await this.localEnv.hasStatic(request);
    if (localHas) return true;

    return await this.globalEnv.hasStatic(request);
  }

  /**
   * Check if workflow exists in either environment
   */
  async hasWorkflow(name: string): Promise<boolean> {
    const localHas = await this.localEnv.hasWorkflow(name);
    if (localHas) return true;

    return await this.globalEnv.hasWorkflow(name);
  }

  /**
   * Get the local environment (for direct access)
   */
  getLocalEnvironment(): Environment {
    return this.localEnv;
  }

  /**
   * Get the global environment (for direct access)
   */
  getGlobalEnvironment(): Environment {
    return this.globalEnv;
  }

  /**
   * Get resource source information
   */
  async getResourceSource(
    resourceType: 'workflow' | 'template' | 'static',
    identifier: string | TemplateRequest | StaticRequest,
  ): Promise<'local' | 'global' | 'none'> {
    let localHas = false;
    let globalHas = false;

    try {
      switch (resourceType) {
        case 'workflow':
          if (typeof identifier === 'string') {
            localHas = await this.localEnv.hasWorkflow(identifier);
            globalHas = await this.globalEnv.hasWorkflow(identifier);
          }
          break;
        case 'template':
          if (typeof identifier === 'object' && 'workflow' in identifier) {
            localHas = await this.localEnv.hasTemplate(identifier as TemplateRequest);
            globalHas = await this.globalEnv.hasTemplate(identifier as TemplateRequest);
          }
          break;
        case 'static':
          if (typeof identifier === 'object' && 'workflow' in identifier) {
            localHas = await this.localEnv.hasStatic(identifier as StaticRequest);
            globalHas = await this.globalEnv.hasStatic(identifier as StaticRequest);
          }
          break;
      }
    } catch {
      // Ignore errors - resource doesn't exist
    }

    if (localHas) return 'local';
    if (globalHas) return 'global';
    return 'none';
  }

  /**
   * Create empty manifest for fallback
   */
  private createEmptyManifest(): EnvironmentManifest {
    return {
      workflows: [],
      processors: [],
      converters: [],
      templates: {},
      statics: {},
      hasConfig: false,
    };
  }

  /**
   * Merge resource maps (templates or statics)
   */
  private mergeResourceMaps(
    local: Record<string, string[]>,
    global: Record<string, string[]>,
  ): Record<string, string[]> {
    const merged: Record<string, string[]> = {};

    // Get all workflow names from both maps
    const allWorkflows = new Set([...Object.keys(local), ...Object.keys(global)]);

    for (const workflow of allWorkflows) {
      const localResources = local[workflow] || [];
      const globalResources = global[workflow] || [];

      // Combine and deduplicate resources
      merged[workflow] = Array.from(new Set([...localResources, ...globalResources]));
    }

    return merged;
  }
}
