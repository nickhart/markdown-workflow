import { JobApplicationMigrator } from '../../engine/job-application-migrator';
import { ConfigDiscovery } from '../../engine/config-discovery';
import { logWarning, logError, logInfo } from '../shared/console-output';

/**
 * ⚠️  EXPERIMENTAL MIGRATION TOOL ⚠️
 *
 * This migration command is experimental and not officially supported.
 * It is intended for advanced users migrating from legacy markdown-workflow systems.
 * Use at your own risk and always backup your data first.
 *
 * For most users, it's recommended to start fresh with `wf init` instead.
 */
interface MigrateOptions {
  dryRun?: boolean;
  force?: boolean;
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Migrate legacy workflow system to new format
 *
 * Usage: wf migrate job <source_path> [--dry-run] [--force]
 *
 * Examples:
 * - wf migrate job ./migrate-reference/writing --dry-run
 * - wf migrate job ./migrate-reference/writing --force
 * - wf migrate job ~/old-writing-system
 */
export async function migrateCommand(
  workflow: string,
  sourcePath: string,
  options: MigrateOptions = {},
): Promise<void> {
  const { dryRun = true, force = false, cwd = process.cwd() } = options; // Default to dry-run for safety

  // 🚨 EXPERIMENTAL FEATURE WARNING 🚨
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  EXPERIMENTAL MIGRATION TOOL - USE AT YOUR OWN RISK ⚠️');
  console.log('='.repeat(60));
  logWarning('This migration tool is EXPERIMENTAL and NOT OFFICIALLY SUPPORTED');
  logWarning('It may not work correctly and could potentially cause data loss');
  logWarning('ALWAYS backup your data before running this command');
  logInfo('For most users, we recommend starting fresh with "wf init" instead');
  console.log('='.repeat(60) + '\n');

  // Safety check: Force dry-run unless explicitly disabled
  if (!dryRun && !process.env.WF_MIGRATE_ALLOW_DESTRUCTIVE) {
    logWarning('Migration defaults to dry-run for safety');
    logInfo('To enable destructive operations, set WF_MIGRATE_ALLOW_DESTRUCTIVE=1');
    logInfo('Example: WF_MIGRATE_ALLOW_DESTRUCTIVE=1 wf migrate job <source> --no-dry-run');
    console.log('');
  }

  // Validate workflow type
  if (workflow !== 'job') {
    throw new Error(
      `Unsupported workflow for migration: ${workflow}. Currently only 'job' workflow migration is supported.`,
    );
  }

  // Ensure we're in a markdown-workflow project
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);

  // Additional safety check: Warn about destructive operations
  if (!dryRun && force) {
    logError('⚠️  DESTRUCTIVE MODE ENABLED ⚠️');
    logWarning('This will OVERWRITE existing collections without confirmation');
    logWarning('Make sure you have backed up your data');
    console.log('');
  }

  console.log(`🚀 Starting ${workflow} workflow migration`);
  console.log(`📂 Source: ${sourcePath}`);
  console.log(`🎯 Target: ${projectRoot}`);

  if (dryRun) {
    logInfo('🔍 DRY RUN: No changes will be made');
  } else {
    logWarning('💥 LIVE MODE: Changes will be written to disk');
  }

  if (force) {
    logWarning('⚡ FORCE MODE: Existing collections will be overwritten');
  }

  try {
    const migrator = new JobApplicationMigrator(projectRoot);
    const summary = await migrator.migrateJobApplications(sourcePath, {
      dryRun,
      force,
    });

    if (summary.failed > 0) {
      console.error(`\n❌ Migration completed with ${summary.failed} failures`);
      process.exit(1);
    } else if (summary.successful > 0) {
      console.log(`\n✅ Successfully migrated ${summary.successful} applications`);

      if (!dryRun) {
        console.log('\n🎉 Next steps:');
        console.log('  1. Review migrated collections: wf list job');
        console.log('  2. Test formatting: wf format job <collection_id>');
        console.log('  3. Update statuses: wf status job <collection_id> <new_status>');
      }
    } else {
      console.log('\n📭 No applications found to migrate');
    }
  } catch (error) {
    console.error(`❌ Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Show available workflows for migration with experimental warnings
 */
export async function listMigrationWorkflows(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  EXPERIMENTAL MIGRATION WORKFLOWS ⚠️');
  console.log('='.repeat(60));
  logWarning('These migration tools are EXPERIMENTAL and NOT OFFICIALLY SUPPORTED');
  logWarning('Use at your own risk - always backup your data first');
  logInfo('For most users, we recommend starting fresh with "wf init"');
  console.log('='.repeat(60) + '\n');

  console.log('AVAILABLE WORKFLOWS FOR MIGRATION\n');
  console.log('1. job (EXPERIMENTAL)');
  console.log('   Migrate job applications from legacy shell-based system');
  console.log('   Usage: wf migrate job <source_path> [--dry-run] [--force]');
  console.log('');
  console.log('📝 Notes:');
  console.log('  • Migration defaults to dry-run for safety');
  console.log('  • --dry-run: Preview changes without modifying files (DEFAULT)');
  console.log('  • --force: Overwrite existing collections with same ID');
  console.log('  • Source path should contain an "applications" directory');
  console.log('  • Legacy applications should use application.yml format');
  console.log('  • Set WF_MIGRATE_ALLOW_DESTRUCTIVE=1 to enable live mode');
  console.log('');
  console.log('⚠️  Safety Examples:');
  console.log('  wf migrate job ./old-system                           # Safe: dry-run only');
  console.log('  wf migrate job ./old-system --dry-run                 # Safe: dry-run only');
  console.log(
    '  WF_MIGRATE_ALLOW_DESTRUCTIVE=1 wf migrate job ./old-system --no-dry-run  # Destructive',
  );
  console.log('');
  logWarning('REMEMBER: This is experimental software. Always backup your data!');
}

export default migrateCommand;
