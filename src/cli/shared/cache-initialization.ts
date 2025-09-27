/**
 * Cache initialization utilities for CLI commands
 *
 * Provides shared logic for initializing and managing collection cache
 */

import { ConfigDiscovery } from '../../engine/config-discovery';
import { CollectionCacheService } from '../../services/collection-cache-service';
import { SystemInterface, NodeSystemInterface } from '../../engine/system-interface';

export interface CacheInitializationOptions {
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
  systemInterface?: SystemInterface;
}

/**
 * Initialize collection cache if it doesn't exist
 * Returns the cache service instance for use in commands
 */
export async function initializeCollectionCache(
  availableWorkflows: string[],
  options: CacheInitializationOptions = {},
): Promise<CollectionCacheService> {
  const cwd = options.cwd || process.cwd();
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const systemInterface = options.systemInterface || new NodeSystemInterface();

  // Get project root
  const projectRoot = configDiscovery.requireProjectRoot(cwd);

  // Create cache service
  const cacheService = new CollectionCacheService({
    projectRoot,
    systemInterface,
    configDiscovery,
  });

  // Check if cache exists, if not, generate it
  if (!cacheService.cacheExists()) {
    await cacheService.regenerateCache(availableWorkflows, true);
  }

  return cacheService;
}

/**
 * Resolve collection ID to workflow name using cache
 * Throws helpful error if collection not found
 */
export function resolveCollectionWorkflow(
  cacheService: CollectionCacheService,
  collectionId: string,
): string {
  const workflow = cacheService.findWorkflowByCollectionId(collectionId);

  if (!workflow) {
    throw new Error(
      `Collection '${collectionId}' not found. Run 'wf regenerate' to rebuild the collections cache.`,
    );
  }

  return workflow;
}