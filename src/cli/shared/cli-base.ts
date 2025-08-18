/**
 * Core CLI utilities for shared initialization and validation patterns
 */

import { ConfigDiscovery } from '../../engine/config-discovery.js';
import { WorkflowEngine } from '../../engine/workflow-engine.js';
import type { ResolvedConfig, Collection } from '../../engine/types.js';

export interface BaseCliOptions {
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

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

/**
 * Initialize project context with standard ConfigDiscovery setup and validation
 * Used by most CLI commands that need project context
 */
export async function initializeProject(options: BaseCliOptions = {}): Promise<ProjectContext> {
  const cwd = options.cwd || process.cwd();

  // Use provided ConfigDiscovery instance or create new one
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();

  // Ensure we're in a project
  const projectRoot = configDiscovery.requireProjectRoot(cwd);
  const projectPaths = configDiscovery.getProjectPaths(projectRoot);

  // Get system configuration
  const systemConfig = await configDiscovery.resolveConfiguration(cwd);

  return {
    configDiscovery,
    projectRoot,
    projectPaths,
    systemConfig,
  };
}

/**
 * Initialize workflow context with WorkflowEngine setup and workflow validation
 * Used by commands that operate on specific workflows
 */
export async function initializeWorkflowEngine(
  workflowName: string,
  options: BaseCliOptions = {},
): Promise<WorkflowContext> {
  const projectContext = await initializeProject(options);

  // Validate workflow exists
  validateWorkflow(workflowName, projectContext.systemConfig.availableWorkflows);

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
 */
export function validateWorkflow(workflowName: string, availableWorkflows: string[]): void {
  if (!availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${availableWorkflows.join(', ')}`,
    );
  }
}

/**
 * Validate that a collection exists in the specified workflow
 */
export async function validateCollection(
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
 * Throws an error if the collection doesn't exist
 */
export async function findCollectionPath(
  workflowEngine: WorkflowEngine,
  workflowName: string,
  collectionId: string,
): Promise<string> {
  const collections = await workflowEngine.getCollections(workflowName);
  const collection = collections.find((c: Collection) => c.metadata.collection_id === collectionId);

  if (!collection) {
    throw new Error(`Collection '${collectionId}' not found in workflow '${workflowName}'`);
  }

  return collection.path;
}
