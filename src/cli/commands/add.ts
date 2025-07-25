import { WorkflowEngine } from '../../core/workflow-engine.js';
import { ConfigDiscovery } from '../../core/config-discovery.js';

interface AddOptions {
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Add a new item to an existing collection from a template
 *
 * Usage: wf add {workflow} {collection_id} {template} [{prefix}]
 *
 * Examples:
 * - wf add job acme_engineer_20250723 notes recruiter → creates recruiter_notes.md
 * - wf add job acme_engineer_20250723 notes → creates notes.md
 * - wf add blog my_post_20250723 gallery → creates gallery.md
 */
export async function addCommand(
  workflowName: string,
  collectionId: string,
  templateName: string,
  prefix?: string,
  options: AddOptions = {},
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

  // Load workflow definition
  const workflow = await engine.loadWorkflow(workflowName);

  // Validate template exists
  const template = workflow.workflow.templates.find((t) => t.name === templateName);
  if (!template) {
    const availableTemplates = workflow.workflow.templates.map((t) => t.name);
    throw new Error(
      `Template '${templateName}' not found in workflow '${workflowName}'. Available templates: ${availableTemplates.join(', ')}`,
    );
  }

  console.log(`Adding ${templateName} to collection: ${collectionId}`);
  console.log(`Template: ${template.description || templateName}`);
  console.log(`Location: ${collection.path}`);

  try {
    // Execute add action
    const parameters: Record<string, unknown> = {
      template: templateName,
    };

    // Add prefix if provided
    if (prefix) {
      parameters.prefix = prefix;
    }

    await engine.executeAction(workflowName, collectionId, 'add', parameters);
    console.log(`✅ ${templateName} added successfully!`);
  } catch (error) {
    console.error(
      `❌ Failed to add ${templateName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * List available templates for a workflow
 */
export async function listTemplatesCommand(
  workflowName: string,
  options: AddOptions = {},
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

  console.log(`\nAVAILABLE TEMPLATES FOR '${workflowName.toUpperCase()}' WORKFLOW\n`);

  if (workflow.workflow.templates.length === 0) {
    console.log('No templates available for this workflow.');
    return;
  }

  workflow.workflow.templates.forEach((template, index) => {
    console.log(`${index + 1}. ${template.name}`);
    console.log(`   ${template.description || 'No description available'}`);
    console.log(`   Output: ${template.output}`);
    console.log();
  });

  console.log('Usage: wf add <workflow> <collection_id> <template> [prefix]');
  console.log('       wf add job acme_engineer_20250723 notes recruiter');
}

export default addCommand;
