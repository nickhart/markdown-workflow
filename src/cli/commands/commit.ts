import { execSync } from 'child_process';
import * as path from 'path';
import Mustache from 'mustache';
import { WorkflowEngine } from '../../core/workflow-engine.js';
import { ConfigDiscovery } from '../../core/config-discovery.js';
import { logInfo, logSuccess, logError } from '../shared/formatting-utils.js';
import type { ProjectConfig } from '../../core/schemas.js';
import type { Collection } from '../../core/types.js';

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
 */
function analyzeGitChanges(collectionPath: string, projectRoot: string): GitFileChanges {
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
    
    for (const line of lines) {
      if (line.length < 4) continue;

      // Git porcelain format: XY filename (where XY is 2-char status, followed by space, then filename)
      const match = line.match(/^(..) (.+)$/);
      if (!match) continue;
      
      const status = match[1];
      const fileName = match[2];
      
      // Only include changes related to this collection ID anywhere in the repository
      if (fileName.includes(collectionId)) {
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
  return '{{#status_changed}}updated status for {{company}} {{role}} ({{collection_id}}) to {{status}}{{/status_changed}}{{^status_changed}}updated {{company}} {{role}} ({{collection_id}}){{#has_markdown_changes}} - modified {{#files.markdownFiles}}{{.}}{{^last}}, {{/last}}{{/files.markdownFiles}}{{/has_markdown_changes}}{{/status_changed}}';
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
 * Build template variables from collection and git analysis
 */
function buildTemplateVariables(
  collection: Collection,
  gitChanges: GitFileChanges,
  workflowName: string,
): CommitTemplateVariables {
  const metadata = collection.metadata;

  return {
    workflow: workflowName,
    collection_id: metadata.collection_id,
    company: String(metadata.company || 'Unknown'),
    role: String(metadata.role || 'Unknown'),
    status: metadata.status,
    previous_status: undefined, // TODO: detect from status history
    files: gitChanges,
    status_changed: false, // TODO: detect status changes
    metadata_changed: gitChanges.modified.includes('collection.yml'),
    has_markdown_changes: gitChanges.markdownFiles.length > 0,
  };
}

/**
 * Execute git commit with the generated message, adding specific collection-related changes
 */
function executeGitCommit(message: string, gitChanges: GitFileChanges, projectRoot: string): void {
  try {
    // Add all collection-related changes (including deletions from moves)
    const allChanges = [...gitChanges.added, ...gitChanges.modified, ...gitChanges.deleted];
    
    if (allChanges.length === 0) {
      logInfo('No changes to commit');
      return;
    }

    // Add each changed file/directory
    for (const change of allChanges) {
      execSync(`git add "${change}"`, { cwd: projectRoot });
    }

    // Commit with the generated message from project root
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
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

  // Initialize workflow engine
  const engine = new WorkflowEngine(projectRoot);

  // Validate workflow exists
  const availableWorkflows = engine.getAvailableWorkflows();
  if (!availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${availableWorkflows.join(', ')}`,
    );
  }

  // Get collection
  const collection = await engine.getCollection(workflowName, collectionId);
  if (!collection) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  logInfo(`Found collection: ${collection.metadata.company} ${collection.metadata.role}`);
  logInfo(`Collection path: ${collection.path}`);

  // Analyze git changes from project root to catch moved collections
  const gitChanges = analyzeGitChanges(collection.path, projectRoot);
  logInfo(
    `Git changes detected: ${gitChanges.added.length} added, ${gitChanges.modified.length} modified, ${gitChanges.deleted.length} deleted`,
  );

  // Use custom message if provided
  if (options.message) {
    executeGitCommit(options.message, gitChanges, projectRoot);
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
  const projectConfig = await engine.getProjectConfig();

  // Build template variables
  const templateVars = buildTemplateVariables(collection, gitChanges, workflowName);

  // Resolve and render commit message template
  const template = resolveCommitTemplate(workflowName, projectConfig);
  const commitMessage = Mustache.render(template, templateVars);

  logInfo(`Generated commit message: ${commitMessage}`);

  // Execute git commit
  executeGitCommit(commitMessage, gitChanges, projectRoot);
}

export default commitCommand;
