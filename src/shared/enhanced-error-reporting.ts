/**
 * Enhanced error reporting utilities for E2E test failures
 * Provides detailed context, suggestions, and debugging information
 */

import * as fs from 'fs';
import * as path from 'path';
// Note: compareSnapshotsEnhanced and validateSnapshotHealth are not used in this file
// They are used in other files that import from this module

export interface E2ETestContext {
  testName: string;
  command: string;
  workingDirectory: string;
  expectedExitCode: number;
  actualExitCode: number;
  output: string;
  error?: Error;
  snapshotName?: string;
  environment: {
    nodeVersion: string;
    platform: string;
    cwd: string;
    mockPandoc: boolean;
    testingMode: string;
  };
}

export interface E2ETestReport {
  success: boolean;
  summary: string;
  detailedReport: string;
  context: E2ETestContext;
  diagnostics: {
    configFiles: Array<{ path: string; exists: boolean; content?: string }>;
    fileSystem: Array<{ path: string; exists: boolean; type?: string; size?: number }>;
    snapshots: Array<{ name: string; exists: boolean; lastModified?: string }>;
    environmentVars: Record<string, string | undefined>;
  };
  suggestions: string[];
  relatedFiles: string[];
  quickFixes: Array<{ description: string; command: string }>;
}

/**
 * Generate comprehensive E2E test failure report
 */
export function generateE2EReport(context: E2ETestContext): E2ETestReport {
  const isSuccess = context.actualExitCode === context.expectedExitCode;

  const report: E2ETestReport = {
    success: isSuccess,
    summary: generateSummary(context),
    detailedReport: generateDetailedReport(context),
    context,
    diagnostics: collectDiagnostics(context),
    suggestions: generateSuggestions(context),
    relatedFiles: findRelatedFiles(context),
    quickFixes: generateQuickFixes(context),
  };

  return report;
}

/**
 * Generate a concise summary of the test failure
 */
function generateSummary(context: E2ETestContext): string {
  if (context.actualExitCode === context.expectedExitCode) {
    return `✅ ${context.testName} - passed`;
  }

  const parts = [];
  parts.push(`❌ ${context.testName} - failed`);

  if (context.actualExitCode !== context.expectedExitCode) {
    parts.push(`(exit code: expected ${context.expectedExitCode}, got ${context.actualExitCode})`);
  }

  if (context.error) {
    parts.push(`(${context.error.message})`);
  }

  return parts.join(' ');
}

/**
 * Generate detailed failure report with context and analysis
 */
function generateDetailedReport(context: E2ETestContext): string {
  const lines = [];

  lines.push('╔══════════════════════════════════════════════════════════════════════╗');
  lines.push('║                        E2E TEST FAILURE REPORT                      ║');
  lines.push('╚══════════════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Test Information
  lines.push('📋 TEST INFORMATION');
  lines.push('─'.repeat(50));
  lines.push(`Name: ${context.testName}`);
  lines.push(`Command: ${context.command}`);
  lines.push(`Working Directory: ${context.workingDirectory}`);
  lines.push(`Expected Exit Code: ${context.expectedExitCode}`);
  lines.push(`Actual Exit Code: ${context.actualExitCode}`);
  if (context.snapshotName) {
    lines.push(`Snapshot: ${context.snapshotName}`);
  }
  lines.push('');

  // Environment Information
  lines.push('🌍 ENVIRONMENT');
  lines.push('─'.repeat(50));
  lines.push(`Node Version: ${context.environment.nodeVersion}`);
  lines.push(`Platform: ${context.environment.platform}`);
  lines.push(`CWD: ${context.environment.cwd}`);
  lines.push(`Mock Pandoc: ${context.environment.mockPandoc ? 'Yes' : 'No'}`);
  lines.push(`Testing Mode: ${context.environment.testingMode}`);
  lines.push('');

  // Output Analysis
  if (context.output) {
    lines.push('📄 COMMAND OUTPUT');
    lines.push('─'.repeat(50));
    const outputLines = context.output.split('\n');
    const maxLines = 20; // Limit output to prevent overwhelming reports

    if (outputLines.length > maxLines) {
      lines.push(...outputLines.slice(0, maxLines));
      lines.push(`... (${outputLines.length - maxLines} more lines truncated)`);
    } else {
      lines.push(...outputLines);
    }
    lines.push('');
  }

  // Error Details
  if (context.error) {
    lines.push('🚨 ERROR DETAILS');
    lines.push('─'.repeat(50));
    lines.push(`Error Type: ${context.error.constructor.name}`);
    lines.push(`Message: ${context.error.message}`);
    if (context.error.stack) {
      lines.push('Stack Trace:');
      const stackLines = context.error.stack.split('\n').slice(0, 10); // Limit stack trace
      lines.push(...stackLines.map((line) => `  ${line}`));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Collect diagnostic information about the test environment
 */
function collectDiagnostics(context: E2ETestContext): E2ETestReport['diagnostics'] {
  const diagnostics: E2ETestReport['diagnostics'] = {
    configFiles: [],
    fileSystem: [],
    snapshots: [],
    environmentVars: {},
  };

  // Check configuration files
  const configPaths = [
    path.join(context.workingDirectory, '.markdown-workflow', 'config.yml'),
    path.join(process.cwd(), 'test-configs', 'testing-config.yml'),
    path.join(context.workingDirectory, 'package.json'),
  ];

  for (const configPath of configPaths) {
    const exists = fs.existsSync(configPath);
    const diagnostic: { path: string; exists: boolean; content?: string } = {
      path: configPath,
      exists,
    };

    if (exists) {
      try {
        diagnostic.content = fs.readFileSync(configPath, 'utf8').substring(0, 1000); // Limit content size
      } catch (error) {
        diagnostic.content = `Error reading file: ${error}`;
      }
    }

    diagnostics.configFiles.push(diagnostic);
  }

  // Check file system structure
  const fsPathsToCheck = [
    context.workingDirectory,
    path.join(context.workingDirectory, '.markdown-workflow'),
    path.join(context.workingDirectory, 'job'),
    path.join(context.workingDirectory, 'blog'),
    path.join(process.cwd(), 'dist', 'cli', 'index.js'),
    path.join(process.cwd(), '__fs_snapshots__'),
  ];

  for (const fsPath of fsPathsToCheck) {
    const exists = fs.existsSync(fsPath);
    const diagnostic: { path: string; exists: boolean; type?: string; size?: number } = {
      path: fsPath,
      exists,
    };

    if (exists) {
      try {
        const stats = fs.statSync(fsPath);
        diagnostic.type = stats.isDirectory() ? 'directory' : 'file';
        diagnostic.size = stats.size;
      } catch {
        // Ignore stat errors
      }
    }

    diagnostics.fileSystem.push(diagnostic);
  }

  // Check snapshots
  const snapshotDir = path.join(process.cwd(), '__fs_snapshots__');
  if (fs.existsSync(snapshotDir)) {
    try {
      const snapshots = fs.readdirSync(snapshotDir).filter((f) => f.endsWith('.json'));

      for (const snapshot of snapshots) {
        const snapshotPath = path.join(snapshotDir, snapshot);
        const stats = fs.statSync(snapshotPath);

        diagnostics.snapshots.push({
          name: path.basename(snapshot, '.json'),
          exists: true,
          lastModified: stats.mtime.toISOString(),
        });
      }
    } catch (error) {
      diagnostics.snapshots.push({
        name: 'ERROR',
        exists: false,
        lastModified: `Error reading snapshots: ${error}`,
      });
    }
  }

  // Collect relevant environment variables
  const relevantEnvVars = [
    'NODE_ENV',
    'TESTING_MODE',
    'MOCK_PANDOC',
    'CI',
    'DEBUG_MOCKS',
    'NODE_VERSION',
    'PWD',
  ];

  for (const envVar of relevantEnvVars) {
    diagnostics.environmentVars[envVar] = process.env[envVar];
  }

  return diagnostics;
}

/**
 * Generate actionable suggestions based on the failure context
 */
function generateSuggestions(context: E2ETestContext): string[] {
  const suggestions = [];

  // Exit code analysis
  if (context.actualExitCode !== context.expectedExitCode) {
    if (context.actualExitCode === 1) {
      suggestions.push('🔧 Exit code 1 usually indicates a command error or validation failure');
      suggestions.push('   • Check if the CLI command exists and is built correctly');
      suggestions.push('   • Verify command arguments and working directory');
      suggestions.push('   • Review the command output for error messages');
    } else if (context.actualExitCode === 127) {
      suggestions.push('🔧 Exit code 127 indicates command not found');
      suggestions.push('   • Ensure the CLI is built: pnpm cli:build');
      suggestions.push('   • Check the command path in dist/cli/index.js');
      suggestions.push('   • Verify Node.js can execute the CLI script');
    }
  }

  // Snapshot-specific suggestions
  if (context.snapshotName) {
    suggestions.push('🔧 Snapshot test suggestions:');
    suggestions.push(
      `   • Compare manually: pnpm snapshot compare ${context.snapshotName} ${context.workingDirectory}`,
    );
    suggestions.push(
      `   • Update snapshot if changes are expected: pnpm snapshot update ${context.snapshotName} ${context.workingDirectory}`,
    );
    suggestions.push('   • Check if testing configuration provides deterministic dates');
  }

  // Configuration suggestions
  if (context.testName.includes('init') || context.testName.includes('create')) {
    suggestions.push('🔧 Project initialization suggestions:');
    suggestions.push('   • Ensure the working directory is clean before testing');
    suggestions.push('   • Check if the --force flag is needed for init commands');
    suggestions.push('   • Verify workflow templates exist in the workflows/ directory');
  }

  // Environment-specific suggestions
  if (!context.environment.mockPandoc) {
    suggestions.push('🔧 Consider enabling pandoc mocking for deterministic tests:');
    suggestions.push('   • Set MOCK_PANDOC=true environment variable');
    suggestions.push('   • This ensures consistent document conversion output');
  }

  // General debugging suggestions
  suggestions.push('');
  suggestions.push('🐛 General debugging tips:');
  suggestions.push('   • Run the failing command manually to reproduce the issue');
  suggestions.push('   • Check file permissions in the working directory');
  suggestions.push('   • Ensure all required dependencies are installed');
  suggestions.push('   • Review recent changes that might affect the test');

  return suggestions;
}

/**
 * Find files related to the test failure for further investigation
 */
function findRelatedFiles(context: E2ETestContext): string[] {
  const relatedFiles = [];

  // Add the CLI executable
  const cliPath = path.join(process.cwd(), 'dist', 'cli', 'index.js');
  if (fs.existsSync(cliPath)) {
    relatedFiles.push(cliPath);
  }

  // Add configuration files
  const configPath = path.join(context.workingDirectory, '.markdown-workflow', 'config.yml');
  if (fs.existsSync(configPath)) {
    relatedFiles.push(configPath);
  }

  // Add test configuration
  const testConfigPath = path.join(process.cwd(), 'test-configs', 'testing-config.yml');
  if (fs.existsSync(testConfigPath)) {
    relatedFiles.push(testConfigPath);
  }

  // Add snapshot file if this is a snapshot test
  if (context.snapshotName) {
    const snapshotPath = path.join(
      process.cwd(),
      '__fs_snapshots__',
      `${context.snapshotName}.json`,
    );
    if (fs.existsSync(snapshotPath)) {
      relatedFiles.push(snapshotPath);
    }
  }

  // Add workflow definition files
  const workflowsDir = path.join(process.cwd(), 'workflows');
  if (fs.existsSync(workflowsDir)) {
    relatedFiles.push(workflowsDir);
  }

  // Add relevant source files based on test type
  if (context.testName.includes('init')) {
    relatedFiles.push(path.join(process.cwd(), 'src', 'cli', 'commands', 'init.ts'));
  } else if (context.testName.includes('create')) {
    relatedFiles.push(path.join(process.cwd(), 'src', 'cli', 'commands', 'create.ts'));
  } else if (context.testName.includes('format')) {
    relatedFiles.push(path.join(process.cwd(), 'src', 'shared', 'document-converter.ts'));
  }

  return relatedFiles.filter((file) => fs.existsSync(file));
}

/**
 * Generate quick fix commands that might resolve the issue
 */
function generateQuickFixes(
  context: E2ETestContext,
): Array<{ description: string; command: string }> {
  const quickFixes = [];

  // CLI build fix
  quickFixes.push({
    description: 'Rebuild the CLI',
    command: 'pnpm cli:build',
  });

  // Snapshot update fix
  if (context.snapshotName) {
    quickFixes.push({
      description: 'Update the snapshot if changes are expected',
      command: `pnpm snapshot update ${context.snapshotName} ${context.workingDirectory}`,
    });

    quickFixes.push({
      description: 'Regenerate all snapshots',
      command: 'pnpm test:e2e:snapshots:update',
    });
  }

  // Clean workspace fix
  quickFixes.push({
    description: 'Clean the test workspace',
    command: `rm -rf ${context.workingDirectory}/.markdown-workflow ${context.workingDirectory}/job ${context.workingDirectory}/blog`,
  });

  // Environment setup fix
  quickFixes.push({
    description: 'Run full preflight check',
    command: 'pnpm preflight:full',
  });

  // Permission fix (if on Unix-like system)
  if (process.platform !== 'win32') {
    quickFixes.push({
      description: 'Fix CLI permissions',
      command: 'chmod +x dist/cli/index.js',
    });
  }

  return quickFixes;
}

/**
 * Format the complete report for console output
 */
export function formatE2EReport(report: E2ETestReport): string {
  const lines = [];

  lines.push(report.detailedReport);

  // Add diagnostics summary
  lines.push('🔍 DIAGNOSTICS SUMMARY');
  lines.push('─'.repeat(50));

  const missingConfigs = report.diagnostics.configFiles.filter((c) => !c.exists);
  if (missingConfigs.length > 0) {
    lines.push('Missing configuration files:');
    missingConfigs.forEach((config) => lines.push(`  ❌ ${config.path}`));
  }

  const missingFiles = report.diagnostics.fileSystem.filter((f) => !f.exists);
  if (missingFiles.length > 0) {
    lines.push('Missing file system items:');
    missingFiles.forEach((file) => lines.push(`  ❌ ${file.path}`));
  }

  lines.push(`Available snapshots: ${report.diagnostics.snapshots.length}`);
  lines.push('');

  // Add suggestions
  if (report.suggestions.length > 0) {
    lines.push('💡 SUGGESTIONS');
    lines.push('─'.repeat(50));
    lines.push(...report.suggestions);
    lines.push('');
  }

  // Add quick fixes
  if (report.quickFixes.length > 0) {
    lines.push('⚡ QUICK FIXES');
    lines.push('─'.repeat(50));
    report.quickFixes.forEach((fix, index) => {
      lines.push(`${index + 1}. ${fix.description}`);
      lines.push(`   ${fix.command}`);
    });
    lines.push('');
  }

  // Add related files
  if (report.relatedFiles.length > 0) {
    lines.push('📂 RELATED FILES');
    lines.push('─'.repeat(50));
    report.relatedFiles.forEach((file) => {
      const exists = fs.existsSync(file) ? '✅' : '❌';
      lines.push(`  ${exists} ${file}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create enhanced test context from basic test information
 */
export function createE2ETestContext(
  testName: string,
  command: string,
  workingDirectory: string,
  expectedExitCode: number,
  actualExitCode: number,
  output: string,
  error?: Error,
  snapshotName?: string,
): E2ETestContext {
  return {
    testName,
    command,
    workingDirectory,
    expectedExitCode,
    actualExitCode,
    output,
    error,
    snapshotName,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      mockPandoc: process.env.MOCK_PANDOC === 'true',
      testingMode: process.env.TESTING_MODE || 'unknown',
    },
  };
}
