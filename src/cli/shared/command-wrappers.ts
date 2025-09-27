/**
 * Command wrappers that handle collection cache resolution
 *
 * These wrappers enable simplified CLI syntax by resolving collection IDs to workflows
 * using the collection cache, then calling the original command functions.
 */

import { formatCommand } from '../commands/format';
import { statusCommand } from '../commands/status';
import { commitCommand } from '../commands/commit';
import { addCommand } from '../commands/add';
import { updateCommand } from '../commands/update';
import { initializeCollectionCache, resolveCollectionWorkflow } from './cache-initialization';
import { ConfigDiscovery } from '../../engine/config-discovery';
import { WorkflowOrchestrator } from '../../services/workflow-orchestrator';

/**
 * Format command wrapper that supports collection-only syntax
 */
export async function formatCommandWithCache(
  collectionId: string,
  artifacts: string[] = [],
  options: { format?: string; cwd?: string } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Initialize cache and resolve workflow
  const configDiscovery = new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);
  const orchestrator = new WorkflowOrchestrator({ projectRoot, configDiscovery });
  const availableWorkflows = orchestrator.getAvailableWorkflows();

  const cacheService = await initializeCollectionCache(availableWorkflows, { cwd, configDiscovery });
  const workflowName = resolveCollectionWorkflow(cacheService, collectionId);

  // Call original format command
  await formatCommand(workflowName, collectionId, {
    format: options.format as any,
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    cwd,
    configDiscovery,
  });
}

/**
 * Status command wrapper that supports collection-only syntax
 */
export async function statusCommandWithCache(
  collectionId: string,
  newStatus: string,
  options: { cwd?: string } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Initialize cache and resolve workflow
  const configDiscovery = new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);
  const orchestrator = new WorkflowOrchestrator({ projectRoot, configDiscovery });
  const availableWorkflows = orchestrator.getAvailableWorkflows();

  const cacheService = await initializeCollectionCache(availableWorkflows, { cwd, configDiscovery });
  const workflowName = resolveCollectionWorkflow(cacheService, collectionId);

  // Call original status command
  await statusCommand(workflowName, collectionId, newStatus, { cwd, configDiscovery });
}

/**
 * Commit command wrapper that supports collection-only syntax
 */
export async function commitCommandWithCache(
  collectionId: string,
  options: { message?: string; cwd?: string } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Initialize cache and resolve workflow
  const configDiscovery = new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);
  const orchestrator = new WorkflowOrchestrator({ projectRoot, configDiscovery });
  const availableWorkflows = orchestrator.getAvailableWorkflows();

  const cacheService = await initializeCollectionCache(availableWorkflows, { cwd, configDiscovery });
  const workflowName = resolveCollectionWorkflow(cacheService, collectionId);

  // Call original commit command
  await commitCommand(workflowName, collectionId, { message: options.message, cwd, configDiscovery });
}

/**
 * Add command wrapper that supports collection-only syntax
 */
export async function addCommandWithCache(
  collectionId: string,
  template: string,
  prefix?: string,
  options: { cwd?: string } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Initialize cache and resolve workflow
  const configDiscovery = new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);
  const orchestrator = new WorkflowOrchestrator({ projectRoot, configDiscovery });
  const availableWorkflows = orchestrator.getAvailableWorkflows();

  const cacheService = await initializeCollectionCache(availableWorkflows, { cwd, configDiscovery });
  const workflowName = resolveCollectionWorkflow(cacheService, collectionId);

  // Call original add command
  await addCommand(workflowName, collectionId, template, prefix, { cwd, configDiscovery });
}

/**
 * Update command wrapper that supports collection-only syntax
 */
export async function updateCommandWithCache(
  collectionId: string,
  options: { url?: string; company?: string; role?: string; notes?: string; cwd?: string } = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Initialize cache and resolve workflow
  const configDiscovery = new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);
  const orchestrator = new WorkflowOrchestrator({ projectRoot, configDiscovery });
  const availableWorkflows = orchestrator.getAvailableWorkflows();

  const cacheService = await initializeCollectionCache(availableWorkflows, { cwd, configDiscovery });
  const workflowName = resolveCollectionWorkflow(cacheService, collectionId);

  // Call original update command
  await updateCommand(workflowName, collectionId, {
    url: options.url,
    company: options.company,
    role: options.role,
    notes: options.notes,
    cwd,
    configDiscovery,
  });
}