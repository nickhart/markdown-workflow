#!/usr/bin/env node

import { Command } from 'commander';
import initCommand from './commands/init.js';

const program = new Command();

program
  .name('wf')
  .description('Markdown Workflow CLI')
  .version('1.0.0');

// wf-init command
program
  .command('init')
  .description('Initialize a new markdown-workflow project')
  .option('-w, --workflows <workflows>', 'Comma-separated list of workflows to initialize')
  .option('-f, --force', 'Force initialization even if project already exists')
  .action(async (options) => {
    try {
      const workflows = options.workflows ? options.workflows.split(',').map((w: string) => w.trim()) : undefined;
      await initCommand({ 
        workflows, 
        force: options.force 
      });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}