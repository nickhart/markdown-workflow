/**
 * Regenerate command - Rebuild collections cache
 *
 * Manually rebuilds the collections.yml cache by scanning all workflow directories
 * and finding all collections. Useful when collections are manually modified.
 */

import { ConfigDiscovery } from '../../engine/config-discovery';
import { CollectionCacheService } from '../../services/collection-cache-service';
import { WorkflowOrchestrator } from '../../services/workflow-orchestrator';
import { logInfo, logSuccess } from '../shared/console-output';

interface RegenerateOptions {
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Regenerate collections cache
 */
export async function regenerateCommand(options: RegenerateOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Ensure we're in a project
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);

  // Initialize workflow orchestrator to get available workflows
  const orchestrator = new WorkflowOrchestrator({ projectRoot, configDiscovery });
  const availableWorkflows = orchestrator.getAvailableWorkflows();

  // Create cache service
  const cacheService = new CollectionCacheService({
    projectRoot,
    configDiscovery,
  });

  logInfo('Regenerating collections cache...');

  // Regenerate cache
  await cacheService.regenerateCache(availableWorkflows, true);

  // Show statistics
  const stats = cacheService.getCacheStats();
  logSuccess(`Cache regenerated successfully!`);
  logInfo(`Total collections: ${stats.totalCollections}`);

  if (Object.keys(stats.workflowCounts).length > 0) {
    logInfo('Breakdown by workflow:');
    for (const [workflow, count] of Object.entries(stats.workflowCounts)) {
      logInfo(`  ${workflow}: ${count} collections`);
    }
  }
}

export default regenerateCommand;