import { WorkflowEngine } from '../../engine/workflow-engine.js';
import { ConfigDiscovery } from '../../engine/config-discovery.js';
import { logInfo, logSuccess, logError } from '../shared/formatting-utils.js';

interface StatusOptions {
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
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

  // Load workflow definition to show available statuses
  const workflow = await engine.loadWorkflow(workflowName);
  const collection = await engine.getCollection(workflowName, collectionId);

  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  // Show current status
  logInfo(`Current status: ${collection.metadata.status}`);
  logInfo(`Requested status: ${newStatus}`);

  // Validate new status exists
  const validStatuses = workflow.workflow.stages.map((stage) => stage.name);
  if (!validStatuses.includes(newStatus)) {
    logError(`Invalid status: ${newStatus}`);
    logError(`Valid statuses: ${validStatuses.join(', ')}`);
    throw new Error('Invalid status');
  }

  // Show transition rules
  const currentStage = workflow.workflow.stages.find((s) => s.name === collection.metadata.status);
  if (currentStage && currentStage.next) {
    logInfo(
      `Valid transitions from '${collection.metadata.status}': ${currentStage.next.join(', ')}`,
    );
  }

  try {
    // Update status
    await engine.updateCollectionStatus(workflowName, collectionId, newStatus);
    logSuccess(`Status updated: ${collection.metadata.status} → ${newStatus}`);
  } catch (error) {
    logError(`Status update failed: ${error instanceof Error ? error.message : String(error)}`);
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

  // Load workflow definition
  const workflow = await engine.loadWorkflow(workflowName);

  logInfo(`\nSTATUS STAGES FOR '${workflowName.toUpperCase()}' WORKFLOW\n`);

  workflow.workflow.stages.forEach((stage, index) => {
    const isTerminal = stage.terminal ? ' (terminal)' : '';
    const nextStages = stage.next ? ` → ${stage.next.join(', ')}` : '';

    logInfo(`${index + 1}. ${stage.name}${isTerminal}`);
    logInfo(`   ${stage.description}${nextStages}`);
    logInfo('');
  });
}

export default statusCommand;
