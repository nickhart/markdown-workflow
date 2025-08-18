import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { ConfigDiscovery } from '../../engine/config-discovery.js';
import { WorkflowFileSchema } from '../../engine/schemas.js';
import { logError, logInfo, logSuccess } from '../shared/formatting-utils.js';

interface AliasInfo {
  alias: string;
  workflow: string;
  description: string;
  usage: string;
}

/**
 * List available workflow aliases
 */
export async function listAliasesCommand(workflowFilter?: string): Promise<void> {
  try {
    const configDiscovery = new ConfigDiscovery();
    const systemConfig = configDiscovery.discoverSystemConfiguration();

    const aliases: AliasInfo[] = [];

    // Collect aliases from all workflows
    for (const workflowName of systemConfig.availableWorkflows) {
      // Skip if filtering for specific workflow
      if (workflowFilter && workflowName !== workflowFilter) {
        continue;
      }

      try {
        const workflowPath = path.join(
          systemConfig.systemRoot,
          'workflows',
          workflowName,
          'workflow.yml',
        );

        if (!fs.existsSync(workflowPath)) {
          continue;
        }

        const workflowContent = fs.readFileSync(workflowPath, 'utf8');
        const parsedYaml = YAML.parse(workflowContent);
        const validationResult = WorkflowFileSchema.safeParse(parsedYaml);

        if (!validationResult.success) {
          continue;
        }

        const workflowDef = validationResult.data.workflow;

        // Collect aliases if they exist
        if (workflowDef.cli?.aliases) {
          for (const alias of workflowDef.cli.aliases) {
            aliases.push({
              alias,
              workflow: workflowName,
              description: workflowDef.cli.description || workflowDef.description,
              usage: workflowDef.cli.usage?.replace('{alias}', alias) || `wf ${alias} <args...>`,
            });
          }
        }
      } catch {
        // Skip individual workflow errors
        continue;
      }
    }

    // Display results
    if (aliases.length === 0) {
      if (workflowFilter) {
        logError(`No aliases found for workflow: ${workflowFilter}`);
      } else {
        logInfo('No workflow aliases configured.');
      }
      return;
    }

    // Show header
    if (workflowFilter) {
      logSuccess(`Aliases for workflow '${workflowFilter}':`);
    } else {
      logSuccess('Available workflow aliases:');
    }

    console.log();

    // Group by workflow for better display
    const groupedAliases = aliases.reduce(
      (groups, alias) => {
        if (!groups[alias.workflow]) {
          groups[alias.workflow] = [];
        }
        groups[alias.workflow].push(alias);
        return groups;
      },
      {} as Record<string, AliasInfo[]>,
    );

    for (const [workflow, workflowAliases] of Object.entries(groupedAliases)) {
      console.log(`📁 ${workflow} workflow:`);

      for (const aliasInfo of workflowAliases) {
        console.log(`  ${aliasInfo.alias}`);
        console.log(`    Usage: ${aliasInfo.usage}`);
        console.log(`    Description: ${aliasInfo.description}`);
        console.log();
      }
    }

    // Show usage examples
    if (!workflowFilter) {
      console.log('Examples:');
      console.log('  wf aliases --workflow job    # Show aliases for job workflow only');
      console.log('  wf aliases                   # Show all aliases');

      if (aliases.length > 0) {
        const firstAlias = aliases[0];
        console.log(`  ${firstAlias.usage}         # Use an alias`);
      }
    }
  } catch (error) {
    logError(`Failed to list aliases: ${error}`);
    throw error;
  }
}
