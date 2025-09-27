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
import { listAliasesCommand } from './commands/aliases.js';
import commitCommand from './commands/commit.js';
import cleanCommand from './commands/clean.js';
import regenerateCommand from './commands/regenerate.js';
import {
  formatCommandWithCache,
  statusCommandWithCache,
  commitCommandWithCache,
  addCommandWithCache,
  updateCommandWithCache,
} from './shared/command-wrappers.js';
import { withErrorHandling } from './shared/error-handler.js';
import { logError } from './shared/console-output.js';

const program = new Command();

program.name('wf').description('Markdown Workflow CLI').version('1.0.0');

// Removed workflow alias registration to keep CLI simple and avoid workflow-specific logic

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

// wf-format command (new simplified syntax)
program
  .command('format')
  .description('Format documents in a collection')
  .argument('<collection_id>', 'Collection ID to format')
  .argument('[artifacts...]', 'Optional artifact names to format (e.g., resume, cover_letter)')
  .option('-f, --format <format>', 'Output format (docx, html, pdf)')
  .action(
    withErrorHandling(async (collectionId, artifacts, options) => {
      await formatCommandWithCache(collectionId, artifacts, {
        format: options.format,
      });
    }),
  );

// wf-status command (new simplified syntax)
program
  .command('status')
  .description('Update collection status or show available statuses')
  .argument('<collection_id_or_workflow>', 'Collection ID to update, or workflow name to show statuses')
  .argument('[new_status_or_collection_id]', 'New status to set, or collection ID if first arg is workflow')
  .argument('[new_status]', 'New status to set (when using workflow syntax)')
  .action(
    withErrorHandling(async (firstArg, secondArg, thirdArg) => {
      // Determine if we're using old syntax (workflow first) or new syntax (collection_id first)
      if (thirdArg) {
        // Old syntax: status workflow collection_id new_status
        await statusCommand(firstArg, secondArg, thirdArg);
      } else if (secondArg && !thirdArg) {
        // Could be either:
        // - New syntax: status collection_id new_status
        // - Old syntax: status workflow (show statuses)

        try {
          // Try new syntax first - resolve collection_id to workflow
          await statusCommandWithCache(firstArg, secondArg);
        } catch (error) {
          // If cache lookup fails, try old syntax - show statuses for workflow
          if (error instanceof Error && error.message.includes('not found')) {
            await showStatusesCommand(firstArg);
          } else {
            throw error;
          }
        }
      } else {
        // Only one argument - must be workflow to show statuses
        await showStatusesCommand(firstArg);
      }
    }),
  );

// wf-add command (new simplified syntax)
program
  .command('add')
  .description('Add new item from template to an existing collection')
  .argument('<collection_id_or_workflow>', 'Collection ID to add item to, or workflow name to list templates')
  .argument('[template_or_collection_id]', 'Template name to use, or collection ID if first arg is workflow')
  .argument('[prefix_or_template]', 'Optional prefix for filename, or template name if using workflow syntax')
  .argument('[prefix]', 'Optional prefix for filename (when using workflow syntax)')
  .action(
    withErrorHandling(async (firstArg, secondArg, thirdArg, fourthArg) => {
      // Determine if we're using old syntax (workflow first) or new syntax (collection_id first)
      if (fourthArg) {
        // Old syntax: add workflow collection_id template prefix
        await addCommand(firstArg, secondArg, thirdArg, fourthArg);
      } else if (thirdArg) {
        // Could be either:
        // - Old syntax: add workflow collection_id template
        // - New syntax: add collection_id template prefix

        try {
          // Try new syntax first
          await addCommandWithCache(firstArg, secondArg, thirdArg);
        } catch (error) {
          // If cache lookup fails, try old syntax
          if (error instanceof Error && error.message.includes('not found')) {
            await addCommand(firstArg, secondArg, thirdArg);
          } else {
            throw error;
          }
        }
      } else if (secondArg) {
        // Could be either:
        // - New syntax: add collection_id template
        // - Old syntax: add workflow collection_id (but missing template)

        try {
          // Try new syntax first
          await addCommandWithCache(firstArg, secondArg);
        } catch (error) {
          // If cache lookup fails, assume old syntax and show error for missing template
          if (error instanceof Error && error.message.includes('not found')) {
            throw new Error(
              'Please provide a template name or omit collection_id to see available templates',
            );
          } else {
            throw error;
          }
        }
      } else {
        // Only one argument - must be workflow to show templates
        await listTemplatesCommand(firstArg);
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

// wf-update command (new simplified syntax)
program
  .command('update')
  .description('Update existing collection metadata and optionally scrape new URL')
  .argument('<collection_id>', 'Collection ID to update')
  .option('-u, --url <url>', 'Update job posting URL and scrape content')
  .option('-c, --company <company>', 'Update company name')
  .option('-r, --role <role>', 'Update role/position')
  .option('-n, --notes <notes>', 'Update notes')
  .action(
    withErrorHandling(async (collectionId, options) => {
      await updateCommandWithCache(collectionId, {
        url: options.url,
        company: options.company,
        role: options.role,
        notes: options.notes,
      });
    }),
  );

// Legacy markdown-writer migration support - marked as experimental with strong warnings
// wf-migrate command (EXPERIMENTAL)
program
  .command('migrate')
  .description('⚠️  EXPERIMENTAL: Migrate legacy workflow system (USE AT YOUR OWN RISK)')
  .argument('[workflow]', 'Workflow type to migrate (omit to show available workflows)')
  .argument('[source_path]', 'Path to legacy workflow system')
  .option('--dry-run', 'Preview changes without modifying files (DEFAULT for safety)')
  .option('--no-dry-run', 'Enable destructive operations (requires WF_MIGRATE_ALLOW_DESTRUCTIVE=1)')
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
        // Perform migration with safety defaults
        await migrateCommand(workflow, sourcePath, {
          dryRun: options.dryRun, // Commander.js handles --no-dry-run automatically
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

// wf-commit command (new simplified syntax)
program
  .command('commit')
  .description('Commit collection changes with generated message')
  .argument('<collection_id>', 'Collection ID to commit')
  .option('-m, --message <message>', 'Custom commit message (overrides template)')
  .action(
    withErrorHandling(async (collectionId, options) => {
      await commitCommandWithCache(collectionId, {
        message: options.message,
      });
    }),
  );

// wf-regenerate command
program
  .command('regenerate')
  .description('Regenerate collections cache by scanning all workflow directories')
  .action(
    withErrorHandling(async () => {
      await regenerateCommand();
    }),
  );

// Add the clean command
program.addCommand(cleanCommand());

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
