import { execSync } from 'child_process';
import * as path from 'path';
import Mustache from 'mustache';
import { WorkflowOrchestrator } from '../../services/workflow-orchestrator';
import { ConfigDiscovery } from '../../engine/config-discovery';
import { logInfo, logSuccess, logError } from '../shared/console-output';
import type { ProjectConfig } from '../../engine/schemas';
import type { Collection } from '../../engine/types';

interface CommitOptions {
  message?: string;
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

interface GitFileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
  markdownFiles: string[];
}


interface CommitTemplateVariables {
  workflow: string;
  collection_id: string;
  company: string;
  role: string;
  status: string;
  previous_status?: string;
  files: GitFileChanges;
  status_changed: boolean;
  metadata_changed: boolean;
  has_markdown_changes: boolean;
}

/**
 * Analyze git status to detect file changes, checking both collection directory and project-wide
 * Enhanced to detect deleted files from status changes (e.g., moved from active/ to submitted/)
 */
function analyzeGitChanges(
  collectionPath: string,
  projectRoot: string,
  workflowName: string,
): GitFileChanges {
  try {
    // Get git status from project root to catch moved files
    const gitStatus = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    const changes: GitFileChanges = {
      added: [],
      modified: [],
      deleted: [],
      markdownFiles: [],
    };

    if (!gitStatus) {
      return changes;
    }

    // Parse git status output and filter for collection-related changes
    const lines = gitStatus.split('\n');
    const collectionId = path.basename(collectionPath);

    // Create regex pattern to match collection files in any status directory
    // Pattern: <workflow_id>/<any_status>/<collection_id>/
    const collectionPattern = new RegExp(`${workflowName}/[^/]+/${collectionId}(/|$)`);

    for (const line of lines) {
      if (line.length < 4) continue;

      // Git porcelain format: XY filename (where XY is 2-char status, followed by space, then filename)
      const match = line.match(/^(..) (.+)$/);
      if (!match) continue;

      const status = match[1];
      const fileName = match[2];

      // Match files related to this collection in any status directory OR by collection ID
      const isCollectionFile = collectionPattern.test(fileName) || fileName.includes(collectionId);

      if (isCollectionFile) {
        // Track file changes by status
        if (status.includes('A') || status.includes('?')) {
          changes.added.push(fileName);
        } else if (status.includes('M')) {
          changes.modified.push(fileName);
        } else if (status.includes('D')) {
          changes.deleted.push(fileName);
        }

        // Track markdown files specifically
        if (fileName.endsWith('.md')) {
          changes.markdownFiles.push(fileName);
        }
      }
    }

    return changes;
  } catch (error) {
    // If git command fails, return empty changes
    logError(
      `Failed to analyze git changes: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      added: [],
      modified: [],
      deleted: [],
      markdownFiles: [],
    };
  }
}

/**
 * Check if we're in a git repository
 */
function isGitRepository(cwd: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the default commit message template
 */
function getDefaultCommitTemplate(): string {
  return '{{#status_changed}}{{#previous_status}}moved {{company}} {{role}} ({{collection_id}}) from {{previous_status}} to {{status}}{{/previous_status}}{{^previous_status}}updated status for {{company}} {{role}} ({{collection_id}}) to {{status}}{{/previous_status}}{{/status_changed}}{{^status_changed}}updated {{company}} {{role}} ({{collection_id}}){{#has_markdown_changes}} - modified {{#files.markdownFiles}}{{.}}{{^last}}, {{/last}}{{/files.markdownFiles}}{{/has_markdown_changes}}{{/status_changed}}';
}

/**
 * Resolve commit message template (workflow-specific → system default)
 */
function resolveCommitTemplate(workflowName: string, projectConfig: ProjectConfig | null): string {
  // Try workflow-specific template first
  const workflowConfig = projectConfig?.workflows?.[workflowName];
  if (
    workflowConfig &&
    'commit_message_template' in workflowConfig &&
    typeof workflowConfig.commit_message_template === 'string'
  ) {
    return workflowConfig.commit_message_template;
  }

  // Try system-level template
  if (projectConfig?.system?.git?.commit_message_template) {
    return projectConfig.system.git.commit_message_template;
  }

  // Fall back to default
  return getDefaultCommitTemplate();
}

/**
 * Detect if status has changed by analyzing current path vs expected path
 */
function detectStatusChange(
  collection: Collection,
  workflowName: string,
  projectRoot: string,
): {
  status_changed: boolean;
  previous_status?: string;
} {
  const currentStatus = collection.metadata.status;
  const collectionId = collection.metadata.collection_id;

  // Get expected path for current status
  const expectedPath = path.join(projectRoot, workflowName, currentStatus, collectionId);

  // If current path matches expected path, no status change
  if (collection.path === expectedPath) {
    return { status_changed: false };
  }

  // Try to infer previous status from current path
  const pathParts = collection.path.split(path.sep);
  const workflowIndex = pathParts.lastIndexOf(workflowName);

  if (workflowIndex >= 0 && workflowIndex < pathParts.length - 2) {
    const previousStatus = pathParts[workflowIndex + 1];
    return {
      status_changed: true,
      previous_status: previousStatus,
    };
  }

  // Check status history for previous status
  const statusHistory = collection.metadata.status_history;
  if (statusHistory && statusHistory.length >= 2) {
    const previousStatus = statusHistory[statusHistory.length - 2].status;
    return {
      status_changed: true,
      previous_status: previousStatus,
    };
  }

  return { status_changed: true };
}

/**
 * Build template variables from collection and git analysis
 */
function buildTemplateVariables(
  collection: Collection,
  gitChanges: GitFileChanges,
  workflowName: string,
  projectRoot: string,
): CommitTemplateVariables {
  const metadata = collection.metadata;
  const statusChange = detectStatusChange(collection, workflowName, projectRoot);

  return {
    workflow: workflowName,
    collection_id: metadata.collection_id,
    company: String(metadata.company || 'Unknown'),
    role: String(metadata.role || 'Unknown'),
    status: metadata.status,
    previous_status: statusChange.previous_status,
    files: gitChanges,
    status_changed: statusChange.status_changed,
    metadata_changed: gitChanges.modified.includes('collection.yml'),
    has_markdown_changes: gitChanges.markdownFiles.length > 0,
  };
}

/**
 * Properly escape a file path for shell commands
 */
function shellEscape(filePath: string): string {
  // Use JSON.stringify to properly escape the string for shell
  return JSON.stringify(filePath);
}

/**
 * Execute git commit with the generated message, adding specific collection-related changes
 */
function executeGitCommit(
  message: string,
  gitChanges: GitFileChanges,
  projectRoot: string,
  collectionId: string,
): void {
  try {
    // Add all collection-related changes (including deletions from moves)
    const allChanges = [...gitChanges.added, ...gitChanges.modified, ...gitChanges.deleted];

    if (allChanges.length === 0) {
      logInfo('No changes to commit');
      return;
    }

    // Get current git status and filter for collection-related files
    const gitStatusOutput = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    if (gitStatusOutput) {
      // Extract collection-related file paths
      const collectionFiles = gitStatusOutput
        .split('\n')
        .filter((line) => line.includes(collectionId))
        .map((line) => {
          let filePath = line.substring(3); // Remove the 2-char status + space prefix
          // Git wraps file paths with spaces in quotes - remove them
          if (filePath.startsWith('"') && filePath.endsWith('"')) {
            filePath = filePath.slice(1, -1);
          }
          return filePath;
        })
        .filter((file) => file.trim().length > 0);

      if (collectionFiles.length > 0) {
        // Use git add -A to handle all changes (additions, modifications, deletions) for the collection
        // This is more reliable than trying to handle each file type individually
        try {
          execSync(`git add -A`, {
            cwd: projectRoot,
            stdio: 'pipe'
          });

          // Verify the changes were staged by checking what git would commit
          const stagedChanges = execSync('git diff --cached --name-only', {
            cwd: projectRoot,
            encoding: 'utf8'
          }).trim();

          if (!stagedChanges.includes(collectionId)) {
            throw new Error('Collection changes were not properly staged');
          }

          logInfo(`Staged ${collectionFiles.length} collection-related changes`);
        } catch (addError) {
          logError(`Failed to stage collection changes: ${addError instanceof Error ? addError.message : String(addError)}`);
          throw new Error(`Git add failed for collection: ${collectionId}`);
        }
      }
    }

    // Commit with the generated message (properly escape the message)
    const escapedMessage = shellEscape(message);
    execSync(`git commit -m ${escapedMessage}`, {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    logSuccess(`Committed changes: ${message}`);
  } catch (error) {
    throw new Error(`Git commit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Commit changes for a workflow collection with smart message generation
 */
export async function commitCommand(
  workflowName: string,
  collectionId: string,
  options: CommitOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Ensure we're in a project
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);

  // Check if we're in a git repository
  if (!isGitRepository(projectRoot)) {
    throw new Error('Not in a git repository. Initialize git with: git init');
  }

  // Initialize workflow orchestrator
  const orchestrator = new WorkflowOrchestrator({ projectRoot, configDiscovery });

  // Validate workflow exists
  const availableWorkflows = orchestrator.getAvailableWorkflows();
  if (!availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${availableWorkflows.join(', ')}`,
    );
  }

  // Get collection
  const collection = await orchestrator.getCollection(workflowName, collectionId);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  logInfo(`Found collection: ${collection.metadata.company} ${collection.metadata.role}`);
  logInfo(`Collection path: ${collection.path}`);

  // Analyze git changes from project root to catch moved collections
  const gitChanges = analyzeGitChanges(collection.path, projectRoot, workflowName);
  logInfo(
    `Git changes detected: ${gitChanges.added.length} added, ${gitChanges.modified.length} modified, ${gitChanges.deleted.length} deleted`,
  );

  // Use custom message if provided
  if (options.message) {
    executeGitCommit(options.message, gitChanges, projectRoot, collectionId);
    return;
  }

  // Check if there are any changes to commit
  const hasChanges =
    gitChanges.added.length > 0 || gitChanges.modified.length > 0 || gitChanges.deleted.length > 0;
  if (!hasChanges) {
    logInfo('No changes to commit');
    return;
  }

  // Load project config for template resolution
  const projectConfig = await orchestrator.getProjectConfig();

  // Build template variables
  const templateVars = buildTemplateVariables(collection, gitChanges, workflowName, projectRoot);

  // Resolve and render commit message template
  const template = resolveCommitTemplate(workflowName, projectConfig);
  const commitMessage = Mustache.render(template, templateVars);

  logInfo(`Generated commit message: ${commitMessage}`);

  // Execute git commit
  executeGitCommit(commitMessage, gitChanges, projectRoot, collectionId);
}

export default commitCommand;
