/**
 * Configuration Service - Domain service for configuration management
 *
 * Provides shared configuration validation, merging, and project context resolution
 * for both CLI and API interfaces. Encapsulates business logic from config-discovery.
 */

import { ConfigDiscovery } from '../engine/config-discovery';
import { WorkflowEngine } from '../engine/workflow-engine';
import type { ResolvedConfig, Collection } from '../engine/types';

export interface ProjectContext {
  configDiscovery: ConfigDiscovery;
  projectRoot: string;
  projectPaths: ReturnType<ConfigDiscovery['getProjectPaths']>;
  systemConfig: ResolvedConfig;
}

export interface WorkflowContext extends ProjectContext {
  workflowEngine: WorkflowEngine;
  workflowName: string;
}

export interface ConfigServiceOptions {
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Configuration service for managing project and workflow configuration
 */
export class ConfigService {
  private configDiscovery: ConfigDiscovery;

  constructor(options: ConfigServiceOptions = {}) {
    this.configDiscovery = options.configDiscovery || new ConfigDiscovery();
  }

  /**
   * Initialize project context with configuration discovery and validation
   * Shared business logic for both CLI and API
   */
  async initializeProject(cwd?: string): Promise<ProjectContext> {
    const workingDir = cwd || process.cwd();

    // Ensure we're in a project
    const projectRoot = this.configDiscovery.requireProjectRoot(workingDir);
    const projectPaths = this.configDiscovery.getProjectPaths(projectRoot);

    // Get system configuration
    const systemConfig = await this.configDiscovery.resolveConfiguration(workingDir);

    return {
      configDiscovery: this.configDiscovery,
      projectRoot,
      projectPaths,
      systemConfig,
    };
  }

  /**
   * Initialize workflow context with workflow validation
   * Shared business logic for both CLI and API
   */
  async initializeWorkflowEngine(workflowName: string, cwd?: string): Promise<WorkflowContext> {
    const projectContext = await this.initializeProject(cwd);

    // Validate workflow exists
    this.validateWorkflow(workflowName, projectContext.systemConfig.availableWorkflows);

    // Initialize WorkflowEngine
    const workflowEngine = new WorkflowEngine(
      projectContext.projectRoot,
      projectContext.configDiscovery,
    );

    return {
      ...projectContext,
      workflowEngine,
      workflowName,
    };
  }

  /**
   * Validate that a workflow exists in the available workflows
   * Shared validation logic for both CLI and API
   */
  validateWorkflow(workflowName: string, availableWorkflows: string[]): void {
    if (!availableWorkflows.includes(workflowName)) {
      throw new Error(
        `Unknown workflow: ${workflowName}. Available: ${availableWorkflows.join(', ')}`,
      );
    }
  }

  /**
   * Validate that a collection exists in the specified workflow
   * Shared validation logic for both CLI and API
   */
  async validateCollection(
    workflowEngine: WorkflowEngine,
    workflowName: string,
    collectionId: string,
  ): Promise<void> {
    const collections = await workflowEngine.getCollections(workflowName);
    const collectionExists = collections.some(
      (collection: Collection) => collection.metadata.collection_id === collectionId,
    );

    if (!collectionExists) {
      throw new Error(`Collection '${collectionId}' not found in workflow '${workflowName}'`);
    }
  }

  /**
   * Find the path to a specific collection
   * Shared collection resolution logic for both CLI and API
   */
  async findCollectionPath(
    workflowEngine: WorkflowEngine,
    workflowName: string,
    collectionId: string,
  ): Promise<string> {
    const collections = await workflowEngine.getCollections(workflowName);
    const collection = collections.find(
      (c: Collection) => c.metadata.collection_id === collectionId,
    );

    if (!collection) {
      throw new Error(`Collection '${collectionId}' not found in workflow '${workflowName}'`);
    }

    return collection.path;
  }

  /**
   * Get configuration discovery instance
   * Allows access to underlying config discovery if needed
   */
  getConfigDiscovery(): ConfigDiscovery {
    return this.configDiscovery;
  }
}
