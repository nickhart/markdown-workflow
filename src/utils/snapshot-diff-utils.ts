/**
 * Enhanced snapshot comparison utilities with improved diff visualization
 * Builds upon the existing snapshot.js tool to provide better debugging for E2E failures
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface SnapshotItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  contentHash?: string;
  content?: string;
  children?: SnapshotItem[];
}

export interface SnapshotStructure {
  options: {
    includeContent: boolean;
    excludePatterns: string[];
  };
  tree: SnapshotItem[];
}

export interface SnapshotDifference {
  added: SnapshotItem[];
  removed: SnapshotItem[];
  modified: Array<{
    path: string;
    changes: {
      size?: { from: number; to: number };
      content?: { from: string; to: string };
    };
  }>;
  typeChanged: Array<{
    path: string;
    from: string;
    to: string;
  }>;
}

export interface EnhancedDiffResult {
  hasDifferences: boolean;
  summary: string;
  differences: SnapshotDifference;
  detailedReport: string;
  suggestions: string[];
  relatedFiles: string[];
}

/**
 * Enhanced snapshot comparison with detailed diff visualization
 */
export function compareSnapshotsEnhanced(
  snapshotName: string,
  actualDirectory: string,
  workflowRoot: string = process.cwd(),
): EnhancedDiffResult {
  const snapshotPath = path.join(workflowRoot, '__fs_snapshots__', `${snapshotName}.json`);

  if (!fs.existsSync(snapshotPath)) {
    return {
      hasDifferences: true,
      summary: `❌ Snapshot '${snapshotName}' not found`,
      differences: { added: [], removed: [], modified: [], typeChanged: [] },
      detailedReport: `Snapshot file not found at: ${snapshotPath}`,
      suggestions: [
        'Create the snapshot with: pnpm snapshot create ' + snapshotName + ' ' + actualDirectory,
        'Check if the snapshot name is spelled correctly',
        'Verify the __fs_snapshots__ directory exists',
      ],
      relatedFiles: [snapshotPath],
    };
  }

  try {
    // Use the existing snapshot.js script to get comparison
    const compareCommand = `node "${path.join(workflowRoot, 'scripts/snapshot.js')}" compare "${snapshotName}" "${actualDirectory}" --content`;

    let compareOutput = '';
    let exitCode = 0;

    try {
      compareOutput = execSync(compareCommand, {
        cwd: workflowRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error: unknown) {
      exitCode = (error as { status?: number }).status || 1;
      compareOutput =
        (error as { stdout?: string; message?: string }).stdout ||
        (error as { message?: string }).message ||
        '';
    }

    const hasDifferences = exitCode !== 0;

    if (!hasDifferences) {
      return {
        hasDifferences: false,
        summary: '✅ No differences found - snapshot matches perfectly!',
        differences: { added: [], removed: [], modified: [], typeChanged: [] },
        detailedReport: 'Directory structure and content match the expected snapshot.',
        suggestions: [],
        relatedFiles: [snapshotPath],
      };
    }

    // Parse the output to extract structured differences
    const differences = parseSnapshotOutput(compareOutput);
    const enhancedReport = generateEnhancedReport(differences, snapshotName, actualDirectory);
    const suggestions = generateSuggestions(differences, snapshotName, actualDirectory);
    const relatedFiles = findRelatedFiles(differences, workflowRoot, actualDirectory);

    return {
      hasDifferences: true,
      summary: generateSummary(differences),
      differences,
      detailedReport: enhancedReport,
      suggestions,
      relatedFiles,
    };
  } catch (error: unknown) {
    const errorMessage = (error as { message?: string }).message || 'Unknown error';
    return {
      hasDifferences: true,
      summary: `❌ Error comparing snapshots: ${errorMessage}`,
      differences: { added: [], removed: [], modified: [], typeChanged: [] },
      detailedReport: `Failed to compare snapshot '${snapshotName}' with directory '${actualDirectory}'.\nError: ${errorMessage}`,
      suggestions: [
        'Check if the snapshot.js script exists and is executable',
        'Verify the directory path is correct',
        'Ensure you have read permissions on the snapshot and directory',
      ],
      relatedFiles: [snapshotPath],
    };
  }
}

/**
 * Parse snapshot comparison output into structured differences
 */
function parseSnapshotOutput(output: string): SnapshotDifference {
  const differences: SnapshotDifference = {
    added: [],
    removed: [],
    modified: [],
    typeChanged: [],
  };

  const lines = output.split('\n');
  let currentSection: 'added' | 'removed' | 'modified' | 'typeChanged' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes('+ Added files:')) {
      currentSection = 'added';
      continue;
    } else if (trimmed.includes('- Removed files:')) {
      currentSection = 'removed';
      continue;
    } else if (trimmed.includes('~ Modified files:')) {
      currentSection = 'modified';
      continue;
    } else if (trimmed.includes('⚠ Type changes:')) {
      currentSection = 'typeChanged';
      continue;
    }

    if (!currentSection || !trimmed) continue;

    // Parse different types of changes
    if (currentSection === 'added' && trimmed.startsWith('+ ')) {
      const match = trimmed.match(/^\+ (.+) \((.+)\)$/);
      if (match) {
        differences.added.push({
          name: path.basename(match[1]),
          path: match[1],
          type: match[2] as 'file' | 'directory',
          size: 0,
          modified: new Date().toISOString(),
        });
      }
    } else if (currentSection === 'removed' && trimmed.startsWith('- ')) {
      const match = trimmed.match(/^- (.+) \((.+)\)$/);
      if (match) {
        differences.removed.push({
          name: path.basename(match[1]),
          path: match[1],
          type: match[2] as 'file' | 'directory',
          size: 0,
          modified: new Date().toISOString(),
        });
      }
    } else if (currentSection === 'modified' && trimmed.startsWith('~ ')) {
      const filePath = trimmed.substring(2);
      const modifiedItem = {
        path: filePath,
        changes: {} as {
          size?: { from: number; to: number };
          content?: { from: string; to: string };
        },
      };
      differences.modified.push(modifiedItem);
    } else if (currentSection === 'typeChanged' && trimmed.startsWith('⚠ ')) {
      const match = trimmed.match(/^⚠ (.+): (.+) → (.+)$/);
      if (match) {
        differences.typeChanged.push({
          path: match[1],
          from: match[2],
          to: match[3],
        });
      }
    }
  }

  return differences;
}

/**
 * Generate a concise summary of differences
 */
function generateSummary(differences: SnapshotDifference): string {
  const totalChanges =
    differences.added.length +
    differences.removed.length +
    differences.modified.length +
    differences.typeChanged.length;

  if (totalChanges === 0) {
    return '✅ No differences found';
  }

  const parts = [];
  if (differences.added.length > 0) parts.push(`${differences.added.length} added`);
  if (differences.removed.length > 0) parts.push(`${differences.removed.length} removed`);
  if (differences.modified.length > 0) parts.push(`${differences.modified.length} modified`);
  if (differences.typeChanged.length > 0)
    parts.push(`${differences.typeChanged.length} type changed`);

  return `❌ Found ${totalChanges} difference(s): ${parts.join(', ')}`;
}

/**
 * Generate enhanced detailed report with context and visual diff
 */
function generateEnhancedReport(
  differences: SnapshotDifference,
  snapshotName: string,
  actualDirectory: string,
): string {
  const lines = [];

  lines.push('╔═══════════════════════════════════════════════════════════════════╗');
  lines.push('║                      SNAPSHOT COMPARISON REPORT                  ║');
  lines.push('╚═══════════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`📸 Snapshot: ${snapshotName}`);
  lines.push(`📁 Directory: ${actualDirectory}`);
  lines.push('');

  if (differences.added.length > 0) {
    lines.push('┌─ ADDED FILES ──────────────────────────────────────────────────┐');
    lines.push('│ These files exist in the actual directory but not the snapshot │');
    lines.push('└─────────────────────────────────────────────────────────────────┘');
    differences.added.forEach((item) => {
      const icon = item.type === 'directory' ? '📁' : '📄';
      lines.push(`  ${icon} + ${item.path}`);
      if (item.type === 'file' && item.size > 0) {
        lines.push(`    └─ Size: ${formatFileSize(item.size)}`);
      }
    });
    lines.push('');
  }

  if (differences.removed.length > 0) {
    lines.push('┌─ REMOVED FILES ────────────────────────────────────────────────┐');
    lines.push('│ These files exist in the snapshot but not the actual directory │');
    lines.push('└─────────────────────────────────────────────────────────────────┘');
    differences.removed.forEach((item) => {
      const icon = item.type === 'directory' ? '📁' : '📄';
      lines.push(`  ${icon} - ${item.path}`);
      if (item.type === 'file' && item.size > 0) {
        lines.push(`    └─ Expected size: ${formatFileSize(item.size)}`);
      }
    });
    lines.push('');
  }

  if (differences.modified.length > 0) {
    lines.push('┌─ MODIFIED FILES ───────────────────────────────────────────────┐');
    lines.push('│ These files have different content or properties               │');
    lines.push('└─────────────────────────────────────────────────────────────────┘');
    differences.modified.forEach((item) => {
      lines.push(`  📝 ~ ${item.path}`);
      if (item.changes.size) {
        const oldSize = formatFileSize(item.changes.size.from);
        const newSize = formatFileSize(item.changes.size.to);
        lines.push(`    ├─ Size: ${oldSize} → ${newSize}`);
      }
      if (item.changes.content) {
        lines.push(
          `    ├─ Content hash: ${item.changes.content.from.substring(0, 8)}... → ${item.changes.content.to.substring(0, 8)}...`,
        );
      }
    });
    lines.push('');
  }

  if (differences.typeChanged.length > 0) {
    lines.push('┌─ TYPE CHANGES ─────────────────────────────────────────────────┐');
    lines.push('│ These items changed from file to directory or vice versa       │');
    lines.push('└─────────────────────────────────────────────────────────────────┘');
    differences.typeChanged.forEach((item) => {
      const fromIcon = item.from === 'directory' ? '📁' : '📄';
      const toIcon = item.to === 'directory' ? '📁' : '📄';
      lines.push(`  ⚠️  ${item.path}: ${fromIcon} ${item.from} → ${toIcon} ${item.to}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate actionable suggestions based on the differences found
 */
function generateSuggestions(
  differences: SnapshotDifference,
  snapshotName: string,
  actualDirectory: string,
): string[] {
  const suggestions = [];

  if (differences.added.length > 0) {
    suggestions.push('🔧 To fix added files:');
    suggestions.push(`   • Remove unexpected files from ${actualDirectory}`);
    suggestions.push('   • Or update snapshot if changes are expected:');
    suggestions.push(`     pnpm snapshot update ${snapshotName} ${actualDirectory}`);
  }

  if (differences.removed.length > 0) {
    suggestions.push('🔧 To fix removed files:');
    suggestions.push('   • Check if files are being generated correctly');
    suggestions.push('   • Verify CLI commands are running as expected');
    suggestions.push('   • Check for missing template files or configuration');
  }

  if (differences.modified.length > 0) {
    suggestions.push('🔧 To fix modified files:');
    suggestions.push('   • Check if template processing is deterministic');
    suggestions.push('   • Verify testing configuration overrides are applied');
    suggestions.push('   • Review date/time mocking and frozen time settings');
    suggestions.push('   • Check if file content matches expected template output');
  }

  if (differences.typeChanged.length > 0) {
    suggestions.push('🔧 To fix type changes:');
    suggestions.push('   • This usually indicates a significant structural change');
    suggestions.push('   • Review the CLI logic that creates files vs directories');
    suggestions.push('   • Consider if this change is intentional and update snapshot');
  }

  // General debugging suggestions
  suggestions.push('');
  suggestions.push('🐛 Debugging tips:');
  suggestions.push('   • Run with MOCK_PANDOC=true for deterministic output');
  suggestions.push('   • Check test-configs/testing-config.yml for date overrides');
  suggestions.push('   • Use --content flag for detailed content comparison');
  suggestions.push('   • Compare snapshot JSON files manually for more detail');

  return suggestions;
}

/**
 * Find related files that might be relevant for debugging
 */
function findRelatedFiles(
  differences: SnapshotDifference,
  workflowRoot: string,
  actualDirectory: string,
): string[] {
  const relatedFiles = [];

  // Add the snapshot file
  const snapshotDir = path.join(workflowRoot, '__fs_snapshots__');
  if (fs.existsSync(snapshotDir)) {
    relatedFiles.push(snapshotDir);
  }

  // Add config files that might affect output
  const configPath = path.join(actualDirectory, '.markdown-workflow', 'config.yml');
  if (fs.existsSync(configPath)) {
    relatedFiles.push(configPath);
  }

  const testingConfigPath = path.join(workflowRoot, 'test-configs', 'testing-config.yml');
  if (fs.existsSync(testingConfigPath)) {
    relatedFiles.push(testingConfigPath);
  }

  // Add workflow definition files
  const workflowsDir = path.join(workflowRoot, 'workflows');
  if (fs.existsSync(workflowsDir)) {
    relatedFiles.push(workflowsDir);
  }

  // Add any files mentioned in the differences
  [...differences.added, ...differences.removed, ...differences.modified].forEach((item) => {
    const fullPath = path.join(actualDirectory, item.path);
    if (fs.existsSync(fullPath)) {
      relatedFiles.push(fullPath);
    }
  });

  return relatedFiles;
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
 * Generate a side-by-side content diff for text files
 */
export function generateContentDiff(
  expectedContent: string,
  actualContent: string,
  filePath: string,
): string {
  const lines = [];

  lines.push(`╔═══ CONTENT DIFF: ${filePath} ═══╗`);

  const expectedLines = expectedContent.split('\n');
  const actualLines = actualContent.split('\n');
  const maxLines = Math.max(expectedLines.length, actualLines.length);

  lines.push('┌─ EXPECTED ─────────────────┬─ ACTUAL ───────────────────┐');

  for (let i = 0; i < maxLines; i++) {
    const expectedLine = expectedLines[i] || '';
    const actualLine = actualLines[i] || '';

    const expectedPadded = expectedLine.padEnd(27).substring(0, 27);
    const actualPadded = actualLine.padEnd(27).substring(0, 27);

    const marker = expectedLine === actualLine ? '│' : '≠';
    lines.push(`│${expectedPadded}${marker}${actualPadded}│`);
  }

  lines.push('└─────────────────────────────┴─────────────────────────────┘');

  return lines.join('\n');
}

/**
 * Validate snapshot integrity and provide health check
 */
export function validateSnapshotHealth(workflowRoot: string): {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues = [];
  const recommendations = [];

  const snapshotDir = path.join(workflowRoot, '__fs_snapshots__');

  if (!fs.existsSync(snapshotDir)) {
    issues.push('Snapshot directory does not exist');
    recommendations.push('Create snapshots directory with: mkdir __fs_snapshots__');
    return { isHealthy: false, issues, recommendations };
  }

  const snapshots = fs.readdirSync(snapshotDir).filter((f) => f.endsWith('.json'));

  if (snapshots.length === 0) {
    issues.push('No snapshots found');
    recommendations.push('Create baseline snapshots with: pnpm test:e2e:snapshots:update');
  }

  // Check for corrupted snapshot files
  for (const snapshot of snapshots) {
    try {
      const content = fs.readFileSync(path.join(snapshotDir, snapshot), 'utf8');
      JSON.parse(content);
    } catch {
      issues.push(`Corrupted snapshot: ${snapshot}`);
      recommendations.push(
        `Delete and recreate corrupted snapshot: pnpm snapshot delete ${path.basename(snapshot, '.json')}`,
      );
    }
  }

  // Check for missing test configuration
  const testConfigPath = path.join(workflowRoot, 'test-configs', 'testing-config.yml');
  if (!fs.existsSync(testConfigPath)) {
    issues.push('Testing configuration not found');
    recommendations.push('Ensure test-configs/testing-config.yml exists for deterministic testing');
  }

  return {
    isHealthy: issues.length === 0,
    issues,
    recommendations,
  };
}
