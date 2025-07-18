import { WorkflowEngine } from '../../core/WorkflowEngine.js';
import { ConfigDiscovery } from '../../core/ConfigDiscovery.js';

interface NotesOptions {
  interviewer?: string;
  cwd?: string;
}

/**
 * Create notes for a collection
 */
export async function notesCommand(
  workflowName: string,
  collectionId: string,
  noteType: string,
  options: NotesOptions = {},
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

  // Load workflow to check if notes action exists
  const workflow = await engine.loadWorkflow(workflowName);
  const notesAction = workflow.workflow.actions.find((action) => action.name === 'notes');

  if (!notesAction) {
    throw new Error(`Notes action not available for workflow '${workflowName}'`);
  }

  console.log(`Creating ${noteType} notes for collection: ${collectionId}`);
  console.log(`Location: ${collection.path}`);

  try {
    // Execute notes action
    const parameters = {
      note_type: noteType,
      ...(options.interviewer && { interviewer: options.interviewer }),
    };

    await engine.executeAction(workflowName, collectionId, 'notes', parameters);
    console.log(`✅ Notes created successfully!`);
  } catch (error) {
    console.error(
      `❌ Notes creation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * List available note types for a workflow
 */
export async function listNoteTypesCommand(
  workflowName: string,
  options: NotesOptions = {},
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
  const notesAction = workflow.workflow.actions.find((action) => action.name === 'notes');

  if (!notesAction) {
    console.log(`No notes action available for workflow '${workflowName}'`);
    return;
  }

  // For now, show common note types
  // TODO: This could be enhanced to read from workflow definition
  console.log(`\nAVAILABLE NOTE TYPES FOR '${workflowName.toUpperCase()}' WORKFLOW\n`);

  const commonNoteTypes = [
    { name: 'recruiter', description: 'Initial recruiter screening call' },
    { name: 'phone', description: 'Phone interview' },
    { name: 'technical', description: 'Technical interview' },
    { name: 'panel', description: 'Panel interview' },
    { name: 'behavioral', description: 'Behavioral interview' },
    { name: 'final', description: 'Final interview' },
    { name: 'onsite', description: 'Onsite interview' },
    { name: 'followup', description: 'Follow-up notes' },
  ];

  commonNoteTypes.forEach((type, index) => {
    console.log(`${index + 1}. ${type.name}`);
    console.log(`   ${type.description}`);
    console.log();
  });

  console.log('Usage: wf-notes <workflow> <collection_id> <note_type> [--interviewer "Name"]');
}

export default notesCommand;
