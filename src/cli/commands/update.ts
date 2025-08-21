/**
 * Update command for modifying existing collection metadata and triggering URL scraping
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigDiscovery } from '../../engine/config-discovery';
import { CollectionMetadata } from '../../engine/types';
import { getCurrentISODate } from '../../utils/date-utils';
import { initializeProject } from '../shared/cli-base';
import { WorkflowService } from '../../services/workflow-service';
import { CollectionService } from '../../services/collection-service';
import { NodeSystemInterface } from '../../engine/system-interface';
import { loadCollectionMetadata, generateMetadataYaml } from '../shared/metadata-utils';
import { logCollectionUpdate, logSuccess, logNextSteps, logError } from '../shared/console-output';

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
  const { systemConfig } = await initializeProject(options);

  // Validate workflow exists
  if (!systemConfig.availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${systemConfig.availableWorkflows.join(', ')}`,
    );
  }

  // Create services
  const systemInterface = new NodeSystemInterface();
  const workflowService = new WorkflowService({
    systemRoot: systemConfig.paths.systemRoot,
    systemInterface,
  });
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const collectionService = new CollectionService({
    projectRoot: options.cwd || process.cwd(),
    systemInterface,
    configDiscovery,
  });

  // Load workflow definition
  const workflowDefinition = await workflowService.loadWorkflowDefinition(workflowName);

  // Find collection directory
  const collectionPath = await collectionService.findCollectionPath(
    workflowName,
    collectionId,
    workflowDefinition,
  );

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
    const result = await collectionService.scrapeUrlForCollection(
      collectionPath,
      options.url,
      workflowDefinition,
    );
    if (result.success) {
      logSuccess(`Successfully scraped using ${result.method}: ${result.outputFile}`);
    } else {
      logError(`Failed to scrape URL: ${result.error}`);
    }
  }

  logNextSteps(workflowName, collectionId, collectionPath);
}

export default updateCommand;
