/**
 * Collection Service - Domain service for collection operations
 *
 * Extracted from WorkflowEngine to provide clean collection management operations.
 * Handles collection CRUD operations, status updates, and artifact management.
 */

import * as path from 'path';
import * as YAML from 'yaml';
import { Collection, type CollectionMetadata, type ProjectConfig } from '../engine/types.js';
import { type WorkflowFile } from '../engine/schemas.js';
import { SystemInterface } from '../engine/system-interface.js';
import { getCurrentISODate } from '../utils/date-utils.js';
import { ConfigDiscovery } from '../engine/config-discovery.js';

export interface CollectionServiceOptions {
  projectRoot: string;
  systemInterface: SystemInterface;
  configDiscovery: ConfigDiscovery;
}

export class CollectionService {
  private projectRoot: string;
  private systemInterface: SystemInterface;
  private configDiscovery: ConfigDiscovery;

  constructor(options: CollectionServiceOptions) {
    this.projectRoot = options.projectRoot;
    this.systemInterface = options.systemInterface;
    this.configDiscovery = options.configDiscovery;
  }

  /**
   * Get all collections for a specific workflow
   */
  async getCollections(workflowName: string): Promise<Collection[]> {
    const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
    const workflowCollectionsDir = path.join(projectPaths.collectionsDir, workflowName);

    if (!this.systemInterface.existsSync(workflowCollectionsDir)) {
      return [];
    }

    const collections: Collection[] = [];

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

        if (this.systemInterface.existsSync(metadataPath)) {
          try {
            const metadataContent = this.systemInterface.readFileSync(metadataPath);
            const parsedMetadata = YAML.parse(metadataContent);
            const metadata = parsedMetadata as CollectionMetadata;

            const artifacts = this.getCollectionArtifacts(collectionPath);

            collections.push({
              metadata,
              artifacts,
              path: collectionPath,
            });
          } catch (error) {
            console.warn(`Failed to load collection metadata for ${collectionId}:`, error);
          }
        }
      }
    }

    return collections;
  }

  /**
   * Get a specific collection by ID
   */
  async getCollection(workflowName: string, collectionId: string): Promise<Collection | null> {
    const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
    const workflowCollectionsDir = path.join(projectPaths.collectionsDir, workflowName);

    if (!this.systemInterface.existsSync(workflowCollectionsDir)) {
      return null;
    }

    // Search through all status directories to find the collection
    const statusDirs = this.systemInterface
      .readdirSync(workflowCollectionsDir)
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    for (const statusDir of statusDirs) {
      const collectionPath = path.join(workflowCollectionsDir, statusDir, collectionId);
      const metadataPath = path.join(collectionPath, 'collection.yml');

      if (this.systemInterface.existsSync(metadataPath)) {
        try {
          const metadataContent = this.systemInterface.readFileSync(metadataPath);
          const parsedMetadata = YAML.parse(metadataContent);
          const metadata = parsedMetadata as CollectionMetadata;
          const artifacts = this.getCollectionArtifacts(collectionPath);

          return {
            metadata,
            artifacts,
            path: collectionPath,
          };
        } catch (error) {
          throw new Error(`Failed to load collection ${collectionId}: ${error}`);
        }
      }
    }

    return null;
  }

  /**
   * Update collection status with directory move
   */
  async updateCollectionStatus(
    collection: Collection,
    workflowName: string,
    newStatus: string,
    projectConfig?: ProjectConfig,
  ): Promise<void> {
    const oldStatus = collection.metadata.status;

    // Update metadata
    collection.metadata.status = newStatus;
    collection.metadata.date_modified = getCurrentISODate(projectConfig);
    collection.metadata.status_history.push({
      status: newStatus,
      date: getCurrentISODate(projectConfig),
    });

    // If status actually changed, move the collection directory
    if (oldStatus !== newStatus) {
      const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
      const oldPath = collection.path;
      const newPath = path.join(
        projectPaths.collectionsDir,
        workflowName,
        newStatus,
        collection.metadata.collection_id,
      );

      // Create new status directory if it doesn't exist
      const newStatusDir = path.dirname(newPath);
      if (!this.systemInterface.existsSync(newStatusDir)) {
        this.systemInterface.mkdirSync(newStatusDir, { recursive: true });
      }

      // Move the collection directory
      this.systemInterface.renameSync(oldPath, newPath);

      // Update collection path reference
      collection.path = newPath;
    }

    // Write updated metadata to the (possibly new) location
    const metadataPath = path.join(collection.path, 'collection.yml');
    const metadataContent = YAML.stringify(collection.metadata);
    this.systemInterface.writeFileSync(metadataPath, metadataContent);
  }

  /**
   * Get artifacts (files) in a collection directory
   */
  private getCollectionArtifacts(collectionPath: string): string[] {
    try {
      return this.systemInterface
        .readdirSync(collectionPath)
        .filter((dirent) => dirent.isFile() && !dirent.name.startsWith('.'))
        .map((dirent) => dirent.name);
    } catch {
      return [];
    }
  }

  /**
   * Find collection path by ID within a workflow
   */
  async findCollectionPath(
    workflowName: string,
    collectionId: string,
    workflow: WorkflowFile,
  ): Promise<string> {
    const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);

    // Check each stage directory for the collection
    for (const stage of workflow.workflow.stages) {
      const stagePath = path.join(
        projectPaths.collectionsDir,
        workflowName,
        stage.name,
        collectionId,
      );
      if (this.systemInterface.existsSync(stagePath)) {
        return stagePath;
      }
    }

    throw new Error(
      `Collection '${collectionId}' not found in any stage of workflow '${workflowName}'`,
    );
  }
}
