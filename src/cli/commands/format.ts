import { WorkflowEngine } from '../../core/WorkflowEngine.js';
import { ConfigDiscovery } from '../../core/ConfigDiscovery.js';

interface FormatOptions {
  format?: 'docx' | 'html' | 'pdf';
  cwd?: string;
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
  const projectRoot = ConfigDiscovery.requireProjectRoot(cwd);

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

  // Get format from options or default to docx
  const format = options.format || 'docx';

  console.log(`Formatting collection: ${collectionId}`);
  console.log(`Format: ${format}`);
  console.log(`Location: ${collection.path}`);

  try {
    // Execute format action
    await engine.executeAction(workflowName, collectionId, 'format', { format });
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
  const projectRoot = ConfigDiscovery.requireProjectRoot(cwd);

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
