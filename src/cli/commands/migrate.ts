import { JobApplicationMigrator } from '../../engine/job-application-migrator.js';
import { ConfigDiscovery } from '../../engine/config-discovery.js';

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
  const { dryRun = false, force = false, cwd = process.cwd() } = options;

  // Validate workflow type
  if (workflow !== 'job') {
    throw new Error(
      `Unsupported workflow for migration: ${workflow}. Currently only 'job' workflow migration is supported.`,
    );
  }

  // Ensure we're in a markdown-workflow project
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();
  const projectRoot = configDiscovery.requireProjectRoot(cwd);

  console.log(`🚀 Starting ${workflow} workflow migration`);
  console.log(`📂 Source: ${sourcePath}`);
  console.log(`🎯 Target: ${projectRoot}`);

  if (dryRun) {
    console.log('🔍 DRY RUN: No changes will be made');
  }

  if (force) {
    console.log('⚡ FORCE MODE: Existing collections will be overwritten');
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
 * Show available workflows for migration
 */
export async function listMigrationWorkflows(): Promise<void> {
  console.log('\nAVAILABLE WORKFLOWS FOR MIGRATION\n');
  console.log('1. job');
  console.log('   Migrate job applications from legacy shell-based system');
  console.log('   Usage: wf migrate job <source_path> [--dry-run] [--force]');
  console.log('');
  console.log('📝 Notes:');
  console.log('  • --dry-run: Preview changes without modifying files');
  console.log('  • --force: Overwrite existing collections with same ID');
  console.log('  • Source path should contain an "applications" directory');
  console.log('  • Legacy applications should use application.yml format');
  console.log('');
  console.log('Examples:');
  console.log('  wf migrate job ./old-writing-system --dry-run');
  console.log('  wf migrate job ~/legacy-markdown-workflow --force');
}

export default migrateCommand;
