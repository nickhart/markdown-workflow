import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { ConfigDiscovery } from '../../core/ConfigDiscovery.js';
import { WorkflowFileSchema } from '../../core/schemas.js';
import { createCommand } from './create.js';

interface CreateWithHelpOptions {
  url?: string;
  template_variant?: string;
  force?: boolean;
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Enhanced create command that can show workflow-specific usage help
 */
export async function createWithHelpCommand(
  args: string[],
  options: CreateWithHelpOptions = {},
): Promise<void> {
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();

  // If no arguments provided, show general help
  if (args.length === 0) {
    console.error('Usage: wf create <workflow> <args...>');
    console.error('');
    console.error('Available workflows:');

    try {
      const systemConfig = configDiscovery.discoverSystemConfiguration();
      for (const workflowName of systemConfig.availableWorkflows) {
        console.error(`  ${workflowName}`);
      }
    } catch {
      console.error('  (Unable to load workflows)');
    }

    console.error('');
    console.error('Use "wf available" to see workflow descriptions.');
    console.error('Use "wf create <workflow>" for workflow-specific usage.');
    throw new Error('Missing workflow argument');
  }

  const [workflow, ...remainingArgs] = args;

  // Try to load the workflow and show specific usage if arguments are missing
  try {
    const systemConfig = configDiscovery.discoverSystemConfiguration();

    if (!systemConfig.availableWorkflows.includes(workflow)) {
      console.error(`Unknown workflow: ${workflow}`);
      console.error(`Available workflows: ${systemConfig.availableWorkflows.join(', ')}`);
      throw new Error(`Unknown workflow: ${workflow}`);
    }

    // Load workflow definition to get usage information
    const workflowPath = path.join(systemConfig.systemRoot, 'workflows', workflow, 'workflow.yml');
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    const parsedYaml = YAML.parse(workflowContent);

    const validationResult = WorkflowFileSchema.safeParse(parsedYaml);
    if (validationResult.success) {
      const workflowDef = validationResult.data.workflow;
      const createAction = workflowDef.actions.find((action) => action.name === 'create');

      if (createAction && remainingArgs.length < 2) {
        // Show workflow-specific usage
        console.error(`Usage: ${createAction.usage || `wf create ${workflow} <company> <role>`}`);
        console.error('');
        console.error(createAction.description);
        throw new Error('Missing required arguments');
      }
    }

    // If we have enough arguments, proceed with the normal create command
    if (remainingArgs.length >= 2) {
      const [company, role] = remainingArgs;
      await createCommand(workflow, company, role, options);
    } else {
      // Fallback to generic usage
      console.error(`Usage: wf create ${workflow} <company> <role> [options]`);
      throw new Error('Missing required arguments');
    }
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw our own errors
      throw error;
    }
    // Handle file system errors
    console.error(`Error loading workflow ${workflow}:`, error);
    throw new Error(`Failed to load workflow: ${workflow}`);
  }
}

export default createWithHelpCommand;
