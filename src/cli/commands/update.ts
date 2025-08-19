/**
 * Update command for modifying existing collection metadata and triggering URL scraping
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigDiscovery } from '../../engine/config-discovery';
import { CollectionMetadata } from '../../engine/types';
import { getCurrentISODate } from '../../utils/date-utils';
import { initializeProject } from '../shared/cli-base';
import { loadWorkflowDefinition, scrapeUrlForCollection } from '../shared/workflow-operations';
import { loadCollectionMetadata, generateMetadataYaml } from '../shared/metadata-utils';
import { logCollectionUpdate, logSuccess, logNextSteps } from '../shared/console-output';

interface UpdateOptions {
  url?: string;
  company?: string;
  role?: string;
  notes?: string;
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Update an existing collection's metadata and optionally scrape new URL
 */
export async function updateCommand(
  workflowName: string,
  collectionId: string,
  options: UpdateOptions = {},
): Promise<void> {
  // Initialize project context
  const { systemConfig, projectPaths } = await initializeProject(options);

  // Validate workflow exists
  if (!systemConfig.availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${systemConfig.availableWorkflows.join(', ')}`,
    );
  }

  // Load workflow definition
  const workflowDefinition = await loadWorkflowDefinition(
    systemConfig.paths.systemRoot,
    workflowName,
  );

  // Find collection directory
  const collectionPath = await findCollectionPath(
    projectPaths.collectionsDir,
    workflowName,
    collectionId,
    workflowDefinition,
  );

  if (!collectionPath) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  logCollectionUpdate(collectionId, collectionPath);

  // Load existing metadata
  const existingMetadata = loadCollectionMetadata(collectionPath);

  // Update metadata with provided options
  const updatedMetadata: CollectionMetadata = {
    ...existingMetadata,
    date_modified: getCurrentISODate(systemConfig.projectConfig || undefined),
  };

  // Update specific fields if provided
  if (options.company) updatedMetadata.company = options.company;
  if (options.role) updatedMetadata.role = options.role;
  if (options.url) updatedMetadata.url = options.url;
  if (options.notes) updatedMetadata.notes = options.notes;

  // Write updated metadata
  const metadataPath = path.join(collectionPath, 'collection.yml');
  const updatedContent = generateMetadataYaml(updatedMetadata);
  fs.writeFileSync(metadataPath, updatedContent);

  logSuccess('Collection metadata updated successfully!');

  // Scrape URL if provided
  if (options.url) {
    await scrapeUrlForCollection(collectionPath, options.url, workflowDefinition);
  }

  logNextSteps(workflowName, collectionId, collectionPath);
}

/**
 * Find collection directory by searching through workflow stages
 */
async function findCollectionPath(
  collectionsDir: string,
  workflowName: string,
  collectionId: string,
  workflowDefinition: { workflow: { stages: Array<{ name: string }> } },
): Promise<string | null> {
  const workflowDir = path.join(collectionsDir, workflowName);

  if (!fs.existsSync(workflowDir)) {
    return null;
  }

  // Search through all stages
  for (const stage of workflowDefinition.workflow.stages) {
    const stageDir = path.join(workflowDir, stage.name);
    const collectionPath = path.join(stageDir, collectionId);

    if (fs.existsSync(collectionPath)) {
      return collectionPath;
    }
  }

  return null;
}

export default updateCommand;
