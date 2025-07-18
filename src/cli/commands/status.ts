import { WorkflowEngine } from '../../core/WorkflowEngine.js';
import { ConfigDiscovery } from '../../core/ConfigDiscovery.js';

interface StatusOptions {
  cwd?: string;
}

/**
 * Update collection status with validation
 */
export async function statusCommand(
  workflowName: string,
  collectionId: string,
  newStatus: string,
  options: StatusOptions = {},
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

  // Load workflow definition to show available statuses
  const workflow = await engine.loadWorkflow(workflowName);
  const collection = await engine.getCollection(workflowName, collectionId);

  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Show current status
  console.log(`Current status: ${collection.metadata.status}`);
  console.log(`Requested status: ${newStatus}`);

  // Validate new status exists
  const validStatuses = workflow.workflow.stages.map((stage) => stage.name);
  if (!validStatuses.includes(newStatus)) {
    console.error(`Invalid status: ${newStatus}`);
    console.error(`Valid statuses: ${validStatuses.join(', ')}`);
    throw new Error('Invalid status');
  }

  // Show transition rules
  const currentStage = workflow.workflow.stages.find((s) => s.name === collection.metadata.status);
  if (currentStage && currentStage.next) {
    console.log(
      `Valid transitions from '${collection.metadata.status}': ${currentStage.next.join(', ')}`,
    );
  }

  try {
    // Update status
    await engine.updateCollectionStatus(workflowName, collectionId, newStatus);
    console.log(`✅ Status updated: ${collection.metadata.status} → ${newStatus}`);
  } catch (error) {
    console.error(
      `❌ Status update failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * Show available statuses for a workflow
 */
export async function showStatusesCommand(
  workflowName: string,
  options: StatusOptions = {},
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

  // Load workflow definition
  const workflow = await engine.loadWorkflow(workflowName);

  console.log(`\nSTATUS STAGES FOR '${workflowName.toUpperCase()}' WORKFLOW\n`);

  workflow.workflow.stages.forEach((stage, index) => {
    const isTerminal = stage.terminal ? ' (terminal)' : '';
    const nextStages = stage.next ? ` → ${stage.next.join(', ')}` : '';

    console.log(`${index + 1}. ${stage.name}${isTerminal}`);
    console.log(`   ${stage.description}${nextStages}`);
    console.log();
  });
}

export default statusCommand;
