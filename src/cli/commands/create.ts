import * as fs from 'fs';
import * as path from 'path';
import { ConfigDiscovery } from '../../core/config-discovery.js';
import { CollectionMetadata } from '../../core/types.js';
import { generateCollectionId, getCurrentISODate } from '../../shared/date-utils.js';
import { initializeProject } from '../shared/cli-base.js';
import { loadWorkflowDefinition, scrapeUrlForCollection } from '../shared/workflow-operations.js';
import { generateMetadataYaml } from '../shared/metadata-utils.js';
import {
  logCollectionCreation,
  logSuccess,
  logNextSteps,
  logForceRecreation,
} from '../shared/formatting-utils.js';
import { TemplateProcessor } from '../shared/template-processor.js';

interface CreateOptions {
  url?: string;
  template_variant?: string;
  force?: boolean;
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Create a new collection from a workflow template
 */
export async function createCommand(
  workflowName: string,
  company: string,
  role: string,
  options: CreateOptions = {},
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

  // Generate collection ID
  const collectionId = generateCollectionId(company, role, systemConfig.projectConfig);

  // Create collection directory organized by workflow and initial status
  const initialStatus = workflowDefinition.workflow.stages[0].name;
  const workflowStatusDir = path.join(projectPaths.collectionsDir, workflowName, initialStatus);
  if (!fs.existsSync(workflowStatusDir)) {
    fs.mkdirSync(workflowStatusDir, { recursive: true });
  }

  const collectionPath = path.join(workflowStatusDir, collectionId);
  const collectionExists = fs.existsSync(collectionPath);

  // Handle existing collections
  if (collectionExists) {
    if (options.force) {
      logForceRecreation(collectionId, collectionPath);

      // Remove existing collection directory
      fs.rmSync(collectionPath, { recursive: true, force: true });
    } else {
      throw new Error(
        `Collection already exists: ${collectionId}. Use 'wf update ${workflowName} ${collectionId}' to modify or --force to recreate.`,
      );
    }
  }

  // Create collection directory (for new collections or after force removal)
  if (!collectionExists || options.force) {
    fs.mkdirSync(collectionPath, { recursive: true });

    if (options.force) {
      logSuccess('Collection recreated successfully!');
    } else {
      logCollectionCreation(collectionId, collectionPath);
    }
  }

  // Create collection metadata
  const metadata: CollectionMetadata = {
    collection_id: collectionId,
    workflow: workflowName,
    status: workflowDefinition.workflow.stages[0].name, // First stage
    date_created: getCurrentISODate(systemConfig.projectConfig),
    date_modified: getCurrentISODate(systemConfig.projectConfig),
    status_history: [
      {
        status: workflowDefinition.workflow.stages[0].name,
        date: getCurrentISODate(systemConfig.projectConfig),
      },
    ],
    company,
    role,
    ...(options.url && { url: options.url }),
  };

  // Write metadata file
  const metadataPath = path.join(collectionPath, 'collection.yml');
  const metadataContent = generateMetadataYaml(metadata);
  fs.writeFileSync(metadataPath, metadataContent);

  // Process templates for the create action
  const createAction = workflowDefinition.workflow.actions.find(
    (action) => action.name === 'create',
  );

  if (createAction && createAction.templates) {
    for (const templateName of createAction.templates) {
      const template = workflowDefinition.workflow.templates.find((t) => t.name === templateName);

      if (template) {
        // Filter options to only include string values for template processing
        const templateVariables: Record<string, string> = {
          company,
          role,
          ...(options.url && { url: options.url }),
          ...(options.template_variant && { template_variant: options.template_variant }),
        };

        await TemplateProcessor.processTemplate(template, collectionPath, {
          systemRoot: systemConfig.paths.systemRoot,
          workflowName,
          variables: templateVariables,
          projectConfig: systemConfig.projectConfig,
          projectPaths,
        });
      }
    }
  }

  // Scrape URL if provided
  if (options.url) {
    await scrapeUrlForCollection(collectionPath, options.url, workflowDefinition);
  }

  logSuccess('Collection created successfully!');
  logNextSteps(workflowName, collectionId, collectionPath);
}

export default createCommand;
