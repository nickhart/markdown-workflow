import { WorkflowEngine } from '../../engine/workflow-engine.js';
import { ConfigDiscovery } from '../../engine/config-discovery.js';
import { loadWorkflowDefinition } from '../shared/workflow-operations.js';

interface FormatOptions {
  format?: 'docx' | 'html' | 'pdf' | 'pptx';
  artifacts?: string[];
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Format documents in a collection
 */
export async function formatCommand(
  workflowName: string,
  collectionId: string,
  options: FormatOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Ensure we're in a project
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);

  // Initialize workflow engine
  const engine = new WorkflowEngine(projectRoot);

  // Validate workflow exists
  const availableWorkflows = engine.getAvailableWorkflows();
  if (!availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${availableWorkflows.join(', ')}`,
    );
  }

  // Check if collection exists
  const collection = await engine.getCollection(workflowName, collectionId);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Get workflow-aware default format
  const configDiscoveryInstance = options.configDiscovery || new ConfigDiscovery();
  const systemConfig = configDiscoveryInstance.discoverSystemConfiguration();
  const workflowDef = await loadWorkflowDefinition(systemConfig.systemRoot, workflowName);
  const formatAction = workflowDef.workflow.actions.find((a) => a.name === 'format');
  const defaultFormat = formatAction?.formats?.[0] || 'docx';
  const format = options.format || defaultFormat;

  console.log(`Formatting collection: ${collectionId}`);
  if (options.artifacts && options.artifacts.length > 0) {
    console.log(`Artifacts: ${options.artifacts.join(', ')}`);
  } else {
    console.log(`Artifacts: all available`);
  }
  console.log(`Location: ${collection.path}`);
  console.log(`Format: ${format}`);

  try {
    // Execute format action with optional artifact filtering
    await engine.executeAction(workflowName, collectionId, 'format', {
      format,
      artifacts: options.artifacts,
    });
    console.log(`✅ Formatting completed successfully!`);
    console.log(`Check the 'formatted' directory in the collection for output files.`);
  } catch (error) {
    console.error(
      `❌ Formatting failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Format all collections in a workflow
 */
export async function formatAllCommand(
  workflowName: string,
  options: FormatOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Ensure we're in a project
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);

  // Initialize workflow engine
  const engine = new WorkflowEngine(projectRoot);

  // Validate workflow exists
  const availableWorkflows = engine.getAvailableWorkflows();
  if (!availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${availableWorkflows.join(', ')}`,
    );
  }

  // Get all collections
  const collections = await engine.getCollections(workflowName);

  if (collections.length === 0) {
    console.log(`No collections found for workflow '${workflowName}'`);
    return;
  }

  const format = options.format || 'docx';

  console.log(`Formatting ${collections.length} collections in workflow '${workflowName}'`);
  console.log(`Format: ${format}`);

  let successCount = 0;
  let errorCount = 0;

  for (const collection of collections) {
    try {
      console.log(`\nFormatting: ${collection.metadata.collection_id}`);
      await engine.executeAction(workflowName, collection.metadata.collection_id, 'format', {
        format,
      });
      successCount++;
    } catch (error) {
      console.error(
        `❌ Failed to format ${collection.metadata.collection_id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      errorCount++;
    }
  }

  console.log(`\n✅ Formatting completed!`);
  console.log(`Success: ${successCount}, Errors: ${errorCount}`);
}

export default formatCommand;
