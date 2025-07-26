#!/usr/bin/env node

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
import { withErrorHandling } from './shared/error-handler.js';
import { logError } from './shared/formatting-utils.js';

const program = new Command();

program.name('wf').description('Markdown Workflow CLI').version('1.0.0');

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
  .option('-f, --format <format>', 'Output format (docx, html, pdf)', 'docx')
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
  .option('-s, --status <status>', 'Filter by status')
  .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
  .action(
    withErrorHandling(async (workflow, options) => {
      await listCommand(workflow, {
        status: options.status,
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
