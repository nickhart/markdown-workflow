import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { ConfigDiscovery } from '../../engine/config-discovery';
import { WorkflowFileSchema } from '../../engine/schemas';
import { createCommand } from './create';

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

      // Check if we have the minimum required arguments based on workflow CLI config
      const cliArgs = workflowDef.cli?.arguments || [];
      const requiredArgsCount = cliArgs.filter((arg) => arg.required).length;

      if (createAction && remainingArgs.length < requiredArgsCount) {
        // Show workflow-specific usage
        console.error(
          `Usage: ${workflowDef.cli?.usage || createAction.usage || `wf create ${workflow} <args...>`}`,
        );
        console.error('');
        if (workflowDef.cli?.description) {
          console.error(workflowDef.cli.description);
        } else {
          console.error(createAction.description);
        }

        // Show argument details if available
        if (cliArgs.length > 0) {
          console.error('');
          console.error('Arguments:');
          cliArgs.forEach((arg) => {
            const required = arg.required ? ' (required)' : ' (optional)';
            console.error(`  ${arg.name}${required}: ${arg.description}`);
          });
        }

        throw new Error('Missing required arguments');
      }

      // If we have enough arguments, proceed with the normal create command
      if (remainingArgs.length >= requiredArgsCount) {
        await createCommand(workflow, ...remainingArgs, options);
        return; // Success, exit early
      }
    }

    // Fallback for workflows without CLI config or not enough arguments
    const workflowDef = validationResult.success ? validationResult.data.workflow : null;
    const usage = workflowDef?.cli?.usage || `wf create ${workflow} <args...>`;
    console.error(`Usage: ${usage}`);
    throw new Error('Missing required arguments');
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
