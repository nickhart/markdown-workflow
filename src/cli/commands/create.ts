import * as fs from 'fs';
import * as path from 'path';
import { ConfigDiscovery } from '../../engine/config-discovery';
import { CollectionMetadata } from '../../engine/types';
import { generateCollectionId, getCurrentISODate } from '../../utils/date-utils';
import { initializeProject } from '../shared/cli-base';
import { loadWorkflowDefinition, scrapeUrlForCollection } from '../shared/workflow-operations';
import { generateMetadataYaml } from '../shared/metadata-utils';
import {
  logCollectionCreation,
  logSuccess,
  logNextSteps,
  logForceRecreation,
} from '../shared/console-output';
import { TemplateProcessor } from '../shared/template-processor';

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
export async function createCommand(workflowName: string, ...args: unknown[]): Promise<void> {
  const options: CreateOptions =
    args[args.length - 1] &&
    typeof args[args.length - 1] === 'object' &&
    !Array.isArray(args[args.length - 1])
      ? (args.pop() as CreateOptions)
      : {};

  // Parse arguments based on workflow CLI configuration
  const parsedArgs = args;
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

  // Extract argument values based on workflow CLI configuration
  const argumentValues: Record<string, unknown> = {};
  if (workflowDefinition.workflow.cli?.arguments) {
    workflowDefinition.workflow.cli.arguments.forEach((argDef, index) => {
      if (index < parsedArgs.length) {
        argumentValues[argDef.name] = parsedArgs[index];
      } else if (argDef.required) {
        throw new Error(`Missing required argument: ${argDef.name}`);
      }
    });
  }

  // Generate collection ID based on workflow-specific pattern
  let collectionId: string;
  if (workflowName === 'job') {
    // Legacy support for job workflow
    const company = (argumentValues.company as string) || (parsedArgs[0] as string);
    const role = (argumentValues.role as string) || (parsedArgs[1] as string);
    collectionId = generateCollectionId(company, role, systemConfig.projectConfig);
  } else {
    // For other workflows, use title or first argument for ID generation
    const primaryValue =
      (argumentValues.title as string) || (parsedArgs[0] as string) || 'untitled';
    collectionId = generateCollectionId(primaryValue, '', systemConfig.projectConfig);
  }

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

  // Create collection metadata based on workflow arguments
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
    ...argumentValues, // Include all workflow-specific arguments
    ...(options.url && { url: options.url }),
  };

  // Write metadata file
  const metadataPath = path.join(collectionPath, 'collection.yml');
  const metadataContent = generateMetadataYaml(metadata);
  fs.writeFileSync(metadataPath, metadataContent);

  // Create directories specified in workflow action
  const createAction = workflowDefinition.workflow.actions.find(
    (action) => action.name === 'create',
  );

  if (createAction?.create_directories) {
    for (const dirName of createAction.create_directories) {
      const dirPath = path.join(collectionPath, dirName);

      try {
        fs.mkdirSync(dirPath, { recursive: true });
      } catch (error) {
        // Log warning but don't fail the entire operation
        console.warn(`Warning: Could not create directory "${dirName}":`, error);
      }
    }
  }

  // Process templates for the create action
  if (createAction && createAction.templates) {
    for (const templateName of createAction.templates) {
      const template = workflowDefinition.workflow.templates.find((t) => t.name === templateName);

      if (template) {
        // Build template variables from workflow arguments and variable mapping
        const templateVariables: Record<string, string> = {
          ...argumentValues,
          ...(options.url && { url: options.url }),
          ...(options.template_variant && { template_variant: options.template_variant }),
        };

        // Apply variable mapping if defined in the create action
        if (createAction.variable_mapping) {
          for (const [sourceKey, targetKey] of Object.entries(createAction.variable_mapping)) {
            if (argumentValues[sourceKey]) {
              templateVariables[targetKey] = argumentValues[sourceKey] as string;
            }
          }
        }

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

  // Get workflow default format for next steps message
  const formatAction = workflowDefinition.workflow.actions.find((a) => a.name === 'format');
  const defaultFormat = formatAction?.formats?.[0];

  logSuccess('Collection created successfully!');
  logNextSteps(workflowName, collectionId, collectionPath, defaultFormat);
}

export default createCommand;
