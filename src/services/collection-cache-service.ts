/**
 * Collection Cache Service - Manages collection ID to workflow mapping cache
 *
 * Provides fast lookup of workflow names by collection ID to enable simplified CLI syntax.
 * Maintains a cache file at .markdown-workflow/collections.yml for performance.
 */

import * as path from 'path';
import * as YAML from 'yaml';
import { SystemInterface, NodeSystemInterface } from '../engine/system-interface';
import { ConfigDiscovery } from '../engine/config-discovery';
import { logInfo, logSuccess } from '../cli/shared/console-output';

export interface CollectionCacheEntry {
  workflow: string;
}

export interface CollectionCache {
  collections: Record<string, string>; // collection_id -> workflow_name
}

export interface CollectionCacheServiceOptions {
  projectRoot: string;
  systemInterface?: SystemInterface;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Service for managing collection ID to workflow mapping cache
 */
export class CollectionCacheService {
  private projectRoot: string;
  private systemInterface: SystemInterface;
  private configDiscovery: ConfigDiscovery;
  private cacheFilePath: string;
  private cache: CollectionCache | null = null;

  constructor(options: CollectionCacheServiceOptions) {
    this.projectRoot = options.projectRoot;
    this.systemInterface = options.systemInterface || new NodeSystemInterface();
    this.configDiscovery = options.configDiscovery || new ConfigDiscovery();

    const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
    this.cacheFilePath = path.join(projectPaths.projectDir, 'collections.yml');
  }

  /**
   * Load cache from file, return empty cache if file doesn't exist
   */
  private loadCache(): CollectionCache {
    if (this.cache) {
      return this.cache;
    }

    if (!this.systemInterface.existsSync(this.cacheFilePath)) {
      this.cache = { collections: {} };
      return this.cache;
    }

    try {
      const cacheContent = this.systemInterface.readFileSync(this.cacheFilePath);
      const parsed = YAML.parse(cacheContent);

      // Handle both new format and legacy format
      if (parsed && typeof parsed === 'object') {
        if (parsed.collections && typeof parsed.collections === 'object') {
          // New format: { collections: { collection_id: workflow } }
          this.cache = parsed as CollectionCache;
        } else {
          // Legacy format: { collection_id: workflow }
          this.cache = { collections: parsed };
        }
      } else {
        this.cache = { collections: {} };
      }
    } catch (error) {
      console.warn(`Failed to load collections cache: ${error instanceof Error ? error.message : String(error)}`);
      this.cache = { collections: {} };
    }

    return this.cache;
  }

  /**
   * Save cache to file
   */
  private saveCache(): void {
    if (!this.cache) {
      return;
    }

    try {
      const cacheContent = YAML.stringify(this.cache, { indent: 2 });

      // Ensure cache directory exists
      const cacheDir = path.dirname(this.cacheFilePath);
      if (!this.systemInterface.existsSync(cacheDir)) {
        this.systemInterface.mkdirSync(cacheDir, { recursive: true });
      }

      this.systemInterface.writeFileSync(this.cacheFilePath, cacheContent);
    } catch (error) {
      console.warn(`Failed to save collections cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Find workflow name for a collection ID
   */
  findWorkflowByCollectionId(collectionId: string): string | null {
    const cache = this.loadCache();
    return cache.collections[collectionId] || null;
  }

  /**
   * Add a collection to the cache
   */
  addCollection(collectionId: string, workflowName: string): void {
    const cache = this.loadCache();
    cache.collections[collectionId] = workflowName;
    this.cache = cache;
    this.saveCache();
  }

  /**
   * Remove a collection from the cache
   */
  removeCollection(collectionId: string): void {
    const cache = this.loadCache();
    delete cache.collections[collectionId];
    this.cache = cache;
    this.saveCache();
  }

  /**
   * Check if cache file exists
   */
  cacheExists(): boolean {
    return this.systemInterface.existsSync(this.cacheFilePath);
  }

  /**
   * Regenerate cache by scanning all workflow directories
   */
  async regenerateCache(availableWorkflows: string[], showProgress = true): Promise<void> {
    if (showProgress) {
      logInfo('Regenerating collections cache...');
    }

    const newCache: CollectionCache = { collections: {} };
    const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);

    let totalCollections = 0;

    for (const workflowName of availableWorkflows) {
      if (showProgress) {
        logInfo(`  Scanning workflow: ${workflowName}`);
      }

      const workflowCollectionsDir = path.join(projectPaths.collectionsDir, workflowName);

      if (!this.systemInterface.existsSync(workflowCollectionsDir)) {
        continue;
      }

      // Scan through status directories
      const statusDirs = this.systemInterface
        .readdirSync(workflowCollectionsDir)
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      for (const statusDir of statusDirs) {
        const statusPath = path.join(workflowCollectionsDir, statusDir);

        // Get collections within this status directory
        const collectionDirs = this.systemInterface
          .readdirSync(statusPath)
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        for (const collectionId of collectionDirs) {
          const collectionPath = path.join(statusPath, collectionId);
          const metadataPath = path.join(collectionPath, 'collection.yml');

          // Only include collections that have a collection.yml file
          if (this.systemInterface.existsSync(metadataPath)) {
            newCache.collections[collectionId] = workflowName;
            totalCollections++;
          }
        }
      }
    }

    this.cache = newCache;
    this.saveCache();

    if (showProgress) {
      logSuccess(`Cache regenerated: found ${totalCollections} collections across ${availableWorkflows.length} workflows`);
    }
  }

  /**
   * Get all collection IDs in cache
   */
  getAllCollectionIds(): string[] {
    const cache = this.loadCache();
    return Object.keys(cache.collections);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { totalCollections: number; workflowCounts: Record<string, number> } {
    const cache = this.loadCache();
    const workflowCounts: Record<string, number> = {};

    for (const workflow of Object.values(cache.collections)) {
      workflowCounts[workflow] = (workflowCounts[workflow] || 0) + 1;
    }

    return {
      totalCollections: Object.keys(cache.collections).length,
      workflowCounts,
    };
  }
}