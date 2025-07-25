import * as path from 'path';
import * as YAML from 'yaml';
import { SystemInterface, NodeSystemInterface } from './system-interface.js';
import { ConfigDiscovery } from './config-discovery.js';
import type { CollectionMetadata } from './types.js';
import { sanitizeForFilename } from '../shared/file-utils.js';

interface LegacyApplication {
  company: string;
  role: string;
  resume_template?: string;
  url?: string;
  date_created: string;
  status: string;
  date_updated?: string;
}

interface MigrationResult {
  success: boolean;
  applicationId: string;
  sourcePath: string;
  targetPath?: string;
  error?: string;
}

interface MigrationSummary {
  total: number;
  successful: number;
  failed: number;
  results: MigrationResult[];
}

/**
 * Migrates legacy shell-based job applications to the new workflow system format
 *
 * This class handles the conversion of:
 * - application.yml (legacy) → collection.yml (new)
 * - Directory structure preservation
 * - File artifact copying
 * - Timestamp format conversion
 */
export class JobApplicationMigrator {
  private systemInterface: SystemInterface;
  private configDiscovery: ConfigDiscovery;
  private projectRoot: string;

  constructor(
    projectRoot: string,
    systemInterface?: SystemInterface,
    configDiscovery?: ConfigDiscovery,
  ) {
    this.projectRoot = projectRoot;
    this.systemInterface = systemInterface || new NodeSystemInterface();
    this.configDiscovery = configDiscovery || new ConfigDiscovery();
  }

  /**
   * Migrate all job applications from a legacy writing system
   */
  async migrateJobApplications(
    sourcePath: string,
    options: { dryRun?: boolean; force?: boolean } = {},
  ): Promise<MigrationSummary> {
    const { dryRun = false, force = false } = options;

    if (!this.systemInterface.existsSync(sourcePath)) {
      throw new Error(`Source path does not exist: ${sourcePath}`);
    }

    const applicationsPath = path.join(sourcePath, 'applications');
    if (!this.systemInterface.existsSync(applicationsPath)) {
      throw new Error(`Applications directory not found: ${applicationsPath}`);
    }

    console.log(`🔍 Scanning legacy applications in: ${applicationsPath}`);
    console.log(`📁 Target project: ${this.projectRoot}`);

    if (dryRun) {
      console.log('🔥 DRY RUN MODE - No files will be modified');
    }

    const results: MigrationResult[] = [];
    const statusDirs = ['active', 'submitted', 'interview', 'offered', 'rejected'];

    // Scan each status directory for applications
    for (const statusDir of statusDirs) {
      const statusPath = path.join(applicationsPath, statusDir);

      if (!this.systemInterface.existsSync(statusPath)) {
        console.log(`⚠️  Status directory not found: ${statusDir}`);
        continue;
      }

      const applications = this.systemInterface
        .readdirSync(statusPath)
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);

      console.log(`📋 Found ${applications.length} applications in ${statusDir}`);

      for (const applicationId of applications) {
        const applicationPath = path.join(statusPath, applicationId);
        const result = await this.migrateApplication(applicationPath, statusDir, { dryRun, force });
        results.push(result);
      }
    }

    const summary: MigrationSummary = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };

    this.printMigrationSummary(summary, dryRun);
    return summary;
  }

  /**
   * Migrate a single job application
   */
  private async migrateApplication(
    sourcePath: string,
    status: string,
    options: { dryRun?: boolean; force?: boolean },
  ): Promise<MigrationResult> {
    const applicationId = path.basename(sourcePath);
    const legacyMetadataPath = path.join(sourcePath, 'application.yml');

    try {
      // Read legacy metadata
      if (!this.systemInterface.existsSync(legacyMetadataPath)) {
        return {
          success: false,
          applicationId,
          sourcePath,
          error: 'application.yml not found',
        };
      }

      const legacyContent = this.systemInterface.readFileSync(legacyMetadataPath);
      const legacyData = YAML.parse(legacyContent) as LegacyApplication;

      // Convert to new format
      const newMetadata = this.convertMetadata(legacyData, status, applicationId);

      // Determine target path
      const projectPaths = this.configDiscovery.getProjectPaths(this.projectRoot);
      const targetPath = path.join(
        projectPaths.collectionsDir,
        'job',
        status,
        newMetadata.collection_id,
      );

      console.log(`📦 ${options.dryRun ? '[DRY RUN] ' : ''}Migrating: ${applicationId}`);
      console.log(`   Source: ${sourcePath}`);
      console.log(`   Target: ${targetPath}`);

      if (!options.dryRun) {
        // Check if target already exists
        if (this.systemInterface.existsSync(targetPath) && !options.force) {
          return {
            success: false,
            applicationId,
            sourcePath,
            targetPath,
            error: 'Target already exists (use --force to overwrite)',
          };
        }

        // Create target directory
        const targetDir = path.dirname(targetPath);
        if (!this.systemInterface.existsSync(targetDir)) {
          this.systemInterface.mkdirSync(targetDir, { recursive: true });
        }

        // Copy all files from source to target
        if (this.systemInterface.existsSync(targetPath)) {
          // Remove existing directory if force is enabled
          this.removeDirectory(targetPath);
        }

        this.copyDirectory(sourcePath, targetPath);

        // Write new collection.yml (replace application.yml)
        const newMetadataPath = path.join(targetPath, 'collection.yml');
        const newMetadataContent = YAML.stringify(newMetadata);
        this.systemInterface.writeFileSync(newMetadataPath, newMetadataContent);

        // Remove old application.yml
        const oldMetadataPath = path.join(targetPath, 'application.yml');
        if (this.systemInterface.existsSync(oldMetadataPath)) {
          this.systemInterface.unlinkSync(oldMetadataPath);
        }
      }

      return {
        success: true,
        applicationId,
        sourcePath,
        targetPath,
      };
    } catch (error) {
      return {
        success: false,
        applicationId,
        sourcePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert legacy application.yml to new collection.yml format
   */
  private convertMetadata(
    legacyData: LegacyApplication,
    status: string,
    _originalId: string,
  ): CollectionMetadata {
    // Parse date from legacy format (e.g., "2025-07-23T14:31:04-07:00")
    const dateCreated = this.convertTimestamp(legacyData.date_created);
    const dateModified = legacyData.date_updated
      ? this.convertTimestamp(legacyData.date_updated)
      : dateCreated;

    // Generate collection_id following new system pattern
    const collectionId = this.generateCollectionId(
      legacyData.company,
      legacyData.role,
      legacyData.date_created,
    );

    const metadata: CollectionMetadata = {
      collection_id: collectionId,
      workflow: 'job',
      status,
      date_created: dateCreated,
      date_modified: dateModified,
      company: legacyData.company,
      role: legacyData.role,
      status_history: [
        {
          status,
          date: dateCreated,
        },
      ],
    };

    // Add optional fields if they exist
    if (legacyData.url) {
      (metadata as Record<string, unknown>).url = legacyData.url;
    }
    if (legacyData.resume_template) {
      (metadata as Record<string, unknown>).resume_template = legacyData.resume_template;
    }

    return metadata;
  }

  /**
   * Convert legacy timestamp to ISO format
   * Input: "2025-07-23T14:31:04-07:00" (ISO with timezone)
   * Output: "2025-07-23T21:31:04.000Z" (UTC ISO)
   */
  private convertTimestamp(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      return date.toISOString();
    } catch {
      // Fallback to current time if parsing fails
      return new Date().toISOString();
    }
  }

  /**
   * Generate collection_id from company, role, and date
   * Follows pattern: company_role_YYYYMMDD
   */
  private generateCollectionId(company: string, role: string, dateCreated: string): string {
    const date = new Date(dateCreated);
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const sanitizedCompany = sanitizeForFilename(company);
    const sanitizedRole = sanitizeForFilename(role);

    return `${sanitizedCompany}_${sanitizedRole}_${dateStr}`;
  }

  /**
   * Copy directory recursively
   */
  private copyDirectory(source: string, target: string): void {
    if (!this.systemInterface.existsSync(target)) {
      this.systemInterface.mkdirSync(target, { recursive: true });
    }

    const items = this.systemInterface.readdirSync(source);

    for (const item of items) {
      const sourcePath = path.join(source, item.name);
      const targetPath = path.join(target, item.name);

      if (item.isDirectory()) {
        this.copyDirectory(sourcePath, targetPath);
      } else {
        this.systemInterface.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  /**
   * Remove directory recursively
   */
  private removeDirectory(dirPath: string): void {
    if (!this.systemInterface.existsSync(dirPath)) {
      return;
    }

    const items = this.systemInterface.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        this.removeDirectory(itemPath);
      } else {
        this.systemInterface.unlinkSync(itemPath);
      }
    }

    this.systemInterface.rmdirSync(dirPath);
  }

  /**
   * Print migration summary
   */
  private printMigrationSummary(summary: MigrationSummary, dryRun: boolean): void {
    console.log('\n' + '='.repeat(60));
    console.log(`📊 MIGRATION SUMMARY ${dryRun ? '(DRY RUN)' : ''}`);
    console.log('='.repeat(60));
    console.log(`Total Applications: ${summary.total}`);
    console.log(`✅ Successful: ${summary.successful}`);
    console.log(`❌ Failed: ${summary.failed}`);

    if (summary.failed > 0) {
      console.log('\n❌ FAILED MIGRATIONS:');
      summary.results
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`   ${r.applicationId}: ${r.error}`);
        });
    }

    if (summary.successful > 0 && !dryRun) {
      console.log('\n✅ SUCCESSFUL MIGRATIONS:');
      summary.results
        .filter((r) => r.success)
        .forEach((r) => {
          console.log(`   ${r.applicationId} → ${r.targetPath}`);
        });
    }

    console.log('\n' + '='.repeat(60));

    if (dryRun && summary.total > 0) {
      console.log('🔥 This was a dry run. Use --force to perform the actual migration.');
    } else if (summary.successful > 0) {
      console.log('🚀 Migration complete! You can now use the new wf commands.');
    }
  }
}

export default JobApplicationMigrator;
