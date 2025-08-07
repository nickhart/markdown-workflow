/**
 * Clean command implementation
 * Manages cleanup of intermediate files created by processors
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { withErrorHandling } from '../shared/error-handler.js';
import { logSuccess, logInfo } from '../shared/formatting-utils.js';
import WorkflowEngine from '../../core/workflow-engine.js';

/**
 * Clean intermediate files for a specific collection
 */
export async function cleanCollection(
  workflowName: string,
  collectionId: string,
  options: {
    processors?: string[];
    dryRun?: boolean;
    verbose?: boolean;
  } = {},
): Promise<void> {
  const engine = new WorkflowEngine();

  try {
    // Load workflow and validate it exists
    const workflow = await engine.loadWorkflow(workflowName);
    if (!workflow) {
      throw new Error(`Workflow '${workflowName}' not found`);
    }

    // Load collection and validate it exists
    const collection = await engine.getCollection(workflowName, collectionId);
    if (!collection) {
      throw new Error(`Collection '${collectionId}' not found in workflow '${workflowName}'`);
    }

    const intermediateDir = path.join(collection.path, 'intermediate');

    if (!fs.existsSync(intermediateDir)) {
      logInfo(`No intermediate directory found at: ${intermediateDir}`);
      return;
    }

    // Get list of processors to clean
    const processorsToClean = options.processors || [];

    if (processorsToClean.length === 0) {
      // Clean all intermediate files
      await cleanAllIntermediateFiles(intermediateDir, options);
    } else {
      // Clean specific processor directories
      await cleanProcessorFiles(intermediateDir, processorsToClean, options);
    }

    logSuccess(`🧹 Cleaned intermediate files for ${workflowName}:${collectionId}`);
  } catch (error) {
    throw new Error(
      `Failed to clean collection: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Clean all intermediate files in the directory
 */
async function cleanAllIntermediateFiles(
  intermediateDir: string,
  options: { dryRun?: boolean; verbose?: boolean },
): Promise<void> {
  const files = fs.readdirSync(intermediateDir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(intermediateDir, file.name);

    if (file.isDirectory()) {
      if (options.verbose) {
        logInfo(`${options.dryRun ? '[DRY RUN] ' : ''}Removing processor directory: ${file.name}/`);
      }

      if (!options.dryRun) {
        fs.rmSync(filePath, { recursive: true, force: true });
      }
    } else {
      if (options.verbose) {
        logInfo(`${options.dryRun ? '[DRY RUN] ' : ''}Removing file: ${file.name}`);
      }

      if (!options.dryRun) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

/**
 * Clean files for specific processors
 */
async function cleanProcessorFiles(
  intermediateDir: string,
  processors: string[],
  options: { dryRun?: boolean; verbose?: boolean },
): Promise<void> {
  for (const processorName of processors) {
    const processorDir = path.join(intermediateDir, processorName);

    if (fs.existsSync(processorDir)) {
      if (options.verbose) {
        logInfo(
          `${options.dryRun ? '[DRY RUN] ' : ''}Removing processor directory: ${processorName}/`,
        );
      }

      if (!options.dryRun) {
        fs.rmSync(processorDir, { recursive: true, force: true });
      }
    } else {
      if (options.verbose) {
        logInfo(`Processor directory not found: ${processorName}/`);
      }
    }
  }
}

/**
 * List intermediate files without cleaning them
 */
export async function listIntermediateFiles(
  workflowName: string,
  collectionId: string,
): Promise<void> {
  const engine = new WorkflowEngine();

  try {
    // Load collection and validate it exists
    const collection = await engine.getCollection(workflowName, collectionId);
    if (!collection) {
      throw new Error(`Collection '${collectionId}' not found in workflow '${workflowName}'`);
    }

    const intermediateDir = path.join(collection.path, 'intermediate');

    if (!fs.existsSync(intermediateDir)) {
      logInfo(`No intermediate directory found for ${workflowName}:${collectionId}`);
      return;
    }

    console.log(`\n📂 Intermediate files for ${workflowName}:${collectionId}\n`);
    console.log(`Directory: ${intermediateDir}\n`);

    const files = fs.readdirSync(intermediateDir, { withFileTypes: true });

    if (files.length === 0) {
      logInfo('No intermediate files found.');
      return;
    }

    // Group files by processor
    const processorFiles = new Map<string, string[]>();
    const rootFiles: string[] = [];

    for (const file of files) {
      if (file.isDirectory()) {
        const processorDir = path.join(intermediateDir, file.name);
        const processorFiles_ = fs.readdirSync(processorDir);
        processorFiles.set(file.name, processorFiles_);
      } else {
        rootFiles.push(file.name);
      }
    }

    // Display processor directories
    for (const [processorName, files] of processorFiles.entries()) {
      console.log(`🔧 ${processorName}/`);
      for (const file of files) {
        const filePath = path.join(intermediateDir, processorName, file);
        const stats = fs.statSync(filePath);
        const size = formatFileSize(stats.size);
        const mtime = stats.mtime.toISOString().split('T')[0];
        console.log(`  📄 ${file} (${size}, modified: ${mtime})`);
      }
      console.log('');
    }

    // Display root files
    if (rootFiles.length > 0) {
      console.log('📄 Root files:');
      for (const file of rootFiles) {
        const filePath = path.join(intermediateDir, file);
        const stats = fs.statSync(filePath);
        const size = formatFileSize(stats.size);
        const mtime = stats.mtime.toISOString().split('T')[0];
        console.log(`  📄 ${file} (${size}, modified: ${mtime})`);
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to list intermediate files: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Create the clean command
 */
export default function createCleanCommand(): Command {
  const cleanCmd = new Command('clean')
    .description('Clean intermediate files created by processors')
    .argument('<workflow>', 'Workflow name')
    .argument('<collection_id>', 'Collection ID to clean')
    .option('-p, --processors <processors...>', 'Specific processors to clean (default: all)')
    .option('-n, --dry-run', 'Show what would be cleaned without actually cleaning')
    .option('-v, --verbose', 'Show detailed information about files being cleaned')
    .option('-l, --list', 'List intermediate files without cleaning')
    .action(
      withErrorHandling(async (workflowName: string, collectionId: string, options) => {
        if (options.list) {
          await listIntermediateFiles(workflowName, collectionId);
        } else {
          await cleanCollection(workflowName, collectionId, {
            processors: options.processors,
            dryRun: options.dryRun,
            verbose: options.verbose,
          });
        }
      }),
    );

  return cleanCmd;
}
