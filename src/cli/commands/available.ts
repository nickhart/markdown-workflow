import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { ConfigDiscovery } from '../../core/ConfigDiscovery.js';
import { WorkflowFileSchema } from '../../core/schemas.js';

interface AvailableOptions {
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * List available workflows
 */
export async function availableCommand(options: AvailableOptions = {}): Promise<void> {
  // Use provided ConfigDiscovery instance or create new one
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();

  try {
    // Get system configuration (works without project context)
    const systemConfig = configDiscovery.discoverSystemConfiguration();
    const { systemRoot, availableWorkflows } = systemConfig;

    if (availableWorkflows.length === 0) {
      console.log('No workflows available.');
      return;
    }

    console.log('Available Workflows:\n');

    // Load and display each workflow with its description
    for (const workflowName of availableWorkflows) {
      const workflowPath = path.join(systemRoot, 'workflows', workflowName, 'workflow.yml');

      try {
        const workflowContent = fs.readFileSync(workflowPath, 'utf8');
        const parsedYaml = YAML.parse(workflowContent);

        const validationResult = WorkflowFileSchema.safeParse(parsedYaml);
        if (validationResult.success) {
          const workflow = validationResult.data.workflow;
          console.log(`${workflowName.padEnd(8)} - ${workflow.description}`);
        } else {
          // Fallback if workflow file is invalid
          console.log(`${workflowName.padEnd(8)} - (invalid workflow definition)`);
        }
      } catch {
        // Fallback if workflow file can't be read
        console.log(`${workflowName.padEnd(8)} - (error reading workflow definition)`);
      }
    }
  } catch (error) {
    console.error('Error listing workflows:', error instanceof Error ? error.message : error);
    throw error;
  }
}

export default availableCommand;
