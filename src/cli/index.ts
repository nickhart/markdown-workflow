#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { Command } from 'commander';
import initCommand from './commands/init.js';
import createWithHelpCommand from './commands/create-with-help.js';
import availableCommand from './commands/available.js';
import formatCommand from './commands/format.js';
import { statusCommand, showStatusesCommand } from './commands/status.js';
import { addCommand, listTemplatesCommand } from './commands/add.js';
import listCommand from './commands/list.js';
import { migrateCommand, listMigrationWorkflows } from './commands/migrate.js';
import updateCommand from './commands/update.js';
import { listAliasesCommand } from './commands/aliases.js';
import commitCommand from './commands/commit.js';
import { withErrorHandling } from './shared/error-handler.js';
import { logError } from './shared/formatting-utils.js';
import { ConfigDiscovery } from '../core/config-discovery.js';
import { WorkflowFileSchema } from '../core/schemas.js';

const program = new Command();

program.name('wf').description('Markdown Workflow CLI').version('1.0.0');

/**
 * Register workflow-specific aliases as commands
 */
async function registerWorkflowAliases() {
  try {
    const configDiscovery = new ConfigDiscovery();
    const systemConfig = configDiscovery.discoverSystemConfiguration();

    for (const workflowName of systemConfig.availableWorkflows) {
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

        // Register CLI aliases if they exist
        if (workflowDef.cli?.aliases) {
          for (const alias of workflowDef.cli.aliases) {
            const createAction = workflowDef.actions.find((action) => action.name === 'create');

            if (createAction) {
              // Create alias command that maps to the create workflow
              const command = program
                .command(alias)
                .description(
                  workflowDef.cli.description || `Create ${workflowName} using ${alias} alias`,
                )
                .usage(workflowDef.cli.usage?.replace('{alias}', alias) || `<args...>`);

              // Add workflow-specific arguments instead of generic [args...]
              if (workflowDef.cli?.arguments) {
                workflowDef.cli.arguments.forEach((arg) => {
                  const argSyntax = arg.required ? `<${arg.name}>` : `[${arg.name}]`;
                  const description = arg.help_text || arg.description;
                  command.argument(argSyntax, description);
                });
              } else {
                // Fallback for workflows without CLI argument definitions
                command.argument('[args...]', 'Arguments based on workflow configuration');
              }

              // Add workflow-appropriate options
              if (
                workflowName === 'job' ||
                workflowDef.cli?.arguments?.some((arg) => arg.name === 'url')
              ) {
                command.option('-u, --url <url>', 'Job posting URL');
              }
              command.option('-t, --template-variant <variant>', 'Template variant to use');
              command.option('--force', 'Force recreate existing collection');

              // Add enhanced help text as additional description
              if (workflowDef.cli?.help_text) {
                command.addHelpText('after', `\n${workflowDef.cli.help_text}`);
              }

              if (workflowDef.cli?.examples && workflowDef.cli.examples.length > 0) {
                const examplesText =
                  '\nExamples:\n' +
                  workflowDef.cli.examples.map((example) => `  $ ${example}`).join('\n');
                command.addHelpText('after', examplesText);
              }

              command.action(
                withErrorHandling(async (...argsWithOptions) => {
                  // Commander.js passes individual arguments, then options as the last parameter
                  const options = argsWithOptions[argsWithOptions.length - 1];
                  const args = argsWithOptions.slice(0, -1);

                  // Map alias call to regular create command
                  await createWithHelpCommand([workflowName, ...args], {
                    url: options.url,
                    template_variant: options.templateVariant,
                    force: options.force,
                  });
                }),
              );
            }
          }
        }
      } catch {
        // Skip individual workflow errors - don't break entire CLI
        continue;
      }
    }
  } catch {
    // Don't break CLI startup if workflow registration fails
    // The base commands will still work
  }
}

// Register workflow aliases before parsing commands
await registerWorkflowAliases();

// wf-init command
program
  .command('init')
  .description('Initialize a new markdown-workflow project')
  .option('-w, --workflows <workflows>', 'Comma-separated list of workflows to initialize')
  .option('-f, --force', 'Force initialization even if project already exists')
  .action(
    withErrorHandling(async (options) => {
      const workflows = options.workflows
        ? options.workflows.split(',').map((w: string) => w.trim())
        : undefined;
      await initCommand({
        workflows,
        force: options.force,
      });
    }),
  );

// wf-create command
program
  .command('create')
  .description('Create a new collection from a workflow template')
  .argument('<workflow>', 'Workflow name (e.g., job, blog)')
  .argument('[args...]', 'Workflow-specific arguments')
  .option('-u, --url <url>', 'Job posting URL')
  .option('-t, --template-variant <variant>', 'Template variant to use')
  .option('--force', 'Force recreate existing collection (destructive: regenerates all files)')
  .action(
    withErrorHandling(async (workflow, args, options) => {
      await createWithHelpCommand([workflow, ...args], {
        url: options.url,
        template_variant: options.templateVariant,
        force: options.force,
      });
    }),
  );

// wf-available command
program
  .command('available')
  .description('List available workflows')
  .action(
    withErrorHandling(async () => {
      await availableCommand();
    }),
  );

// wf-format command
program
  .command('format')
  .description('Format documents in a collection')
  .argument('<workflow>', 'Workflow name (e.g., job, blog)')
  .argument('<collection_id>', 'Collection ID to format')
  .argument('[artifacts...]', 'Optional artifact names to format (e.g., resume, cover_letter)')
  .option('-f, --format <format>', 'Output format (docx, html, pdf)')
  .action(
    withErrorHandling(async (workflow, collectionId, artifacts, options) => {
      await formatCommand(workflow, collectionId, {
        format: options.format,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
      });
    }),
  );

// wf-status command
program
  .command('status')
  .description('Update collection status or show available statuses')
  .argument('<workflow>', 'Workflow name (e.g., job, blog)')
  .argument('[collection_id]', 'Collection ID to update (omit to show available statuses)')
  .argument('[new_status]', 'New status to set')
  .action(
    withErrorHandling(async (workflow, collectionId, newStatus) => {
      if (!collectionId) {
        // Show available statuses for workflow
        await showStatusesCommand(workflow);
      } else if (!newStatus) {
        throw new Error(
          'Please provide a new status or omit collection_id to show available statuses',
        );
      } else {
        // Update collection status
        await statusCommand(workflow, collectionId, newStatus);
      }
    }),
  );

// wf-add command
program
  .command('add')
  .description('Add new item from template to an existing collection')
  .argument('<workflow>', 'Workflow name (e.g., job, blog)')
  .argument('[collection_id]', 'Collection ID to add item to (omit to list available templates)')
  .argument('[template]', 'Template name to use')
  .argument('[prefix]', 'Optional prefix for the output filename')
  .action(
    withErrorHandling(async (workflow, collectionId, template, prefix) => {
      if (!collectionId) {
        // Show available templates for workflow
        await listTemplatesCommand(workflow);
      } else if (!template) {
        throw new Error(
          'Please provide a template name or omit collection_id to see available templates',
        );
      } else {
        // Add item to collection
        await addCommand(workflow, collectionId, template, prefix);
      }
    }),
  );

// wf-list command
program
  .command('list')
  .description('List collections for a workflow')
  .argument('<workflow>', 'Workflow name (e.g., job, blog)')
  .option('-s, --status <status>', 'Filter by status (comma-separated for multiple)')
  .option('--name-filter <pattern>', 'Filter by collection ID pattern (case-insensitive)')
  .option('--company-filter <pattern>', 'Filter by company name pattern (job workflow only)')
  .option('--title-filter <pattern>', 'Filter by title pattern (blog workflow only)')
  .option(
    '--sort <field>',
    'Sort by field (date-created, date-modified, status, company, title, collection-id)',
    'date-created',
  )
  .option('--sort-order <order>', 'Sort order (asc, desc)', 'desc')
  .option('--limit <N>', 'Limit results to N collections', (value) => parseInt(value, 10))
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(
    withErrorHandling(async (workflow, options) => {
      await listCommand(workflow, {
        status: options.status,
        nameFilter: options.nameFilter,
        companyFilter: options.companyFilter,
        titleFilter: options.titleFilter,
        sort: options.sort,
        sortOrder: options.sortOrder,
        limit: options.limit,
        format: options.format,
      });
    }),
  );

// wf-update command
program
  .command('update')
  .description('Update existing collection metadata and optionally scrape new URL')
  .argument('<workflow>', 'Workflow name (e.g., job, blog)')
  .argument('<collection_id>', 'Collection ID to update')
  .option('-u, --url <url>', 'Update job posting URL and scrape content')
  .option('-c, --company <company>', 'Update company name')
  .option('-r, --role <role>', 'Update role/position')
  .option('-n, --notes <notes>', 'Update notes')
  .action(
    withErrorHandling(async (workflow, collectionId, options) => {
      await updateCommand(workflow, collectionId, {
        url: options.url,
        company: options.company,
        role: options.role,
        notes: options.notes,
      });
    }),
  );

// wf-migrate command
program
  .command('migrate')
  .description('Migrate legacy workflow system to new format')
  .argument('[workflow]', 'Workflow type to migrate (omit to show available workflows)')
  .argument('[source_path]', 'Path to legacy workflow system')
  .option('--dry-run', 'Preview changes without modifying files')
  .option('--force', 'Overwrite existing collections with same ID')
  .action(
    withErrorHandling(async (workflow, sourcePath, options) => {
      if (!workflow) {
        // Show available workflows for migration
        await listMigrationWorkflows();
      } else if (!sourcePath) {
        throw new Error(
          'Please provide a source path or omit workflow to see available migration types',
        );
      } else {
        // Perform migration
        await migrateCommand(workflow, sourcePath, {
          dryRun: options.dryRun,
          force: options.force,
        });
      }
    }),
  );

// wf-aliases command
program
  .command('aliases')
  .description('List available workflow aliases')
  .option('-w, --workflow <workflow>', 'Show aliases for specific workflow')
  .action(
    withErrorHandling(async (options) => {
      await listAliasesCommand(options.workflow);
    }),
  );

// wf-commit command
program
  .command('commit')
  .description('Commit collection changes with generated message')
  .argument('<workflow>', 'Workflow name (e.g., job, blog)')
  .argument('<collection_id>', 'Collection ID to commit')
  .option('-m, --message <message>', 'Custom commit message (overrides template)')
  .action(
    withErrorHandling(async (workflow, collectionId, options) => {
      await commitCommand(workflow, collectionId, {
        message: options.message,
      });
    }),
  );

// Handle unknown commands
program.on('command:*', () => {
  logError(
    `Invalid command: ${program.args.join(' ')}\nSee --help for a list of available commands.`,
  );
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
