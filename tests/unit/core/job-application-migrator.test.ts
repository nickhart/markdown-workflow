import { describe, it, expect, beforeEach } from '@jest/globals';
import { JobApplicationMigrator } from '../../../src/core/job-application-migrator.js';
import { SystemInterface } from '../../../src/core/system-interface.js';
import { ConfigDiscovery } from '../../../src/core/config-discovery.js';
import * as YAML from 'yaml';

// Mock SystemInterface
class MockSystemInterface implements SystemInterface {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  constructor() {
    // Setup default directory structure
    this.directories.add('/project');
    this.directories.add('/project/collections');
    this.directories.add('/project/collections/job');
  }

  getCurrentFilePath(): string {
    return '/mock/path';
  }

  existsSync(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  readFileSync(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  writeFileSync(path: string, data: string): void {
    this.files.set(path, data);
  }

  statSync(path: string): fs.Stats {
    return { isDirectory: () => this.directories.has(path) } as fs.Stats;
  }

  readdirSync(path: string): fs.Dirent[] {
    const results: fs.Dirent[] = [];

    // Find directories
    for (const dir of this.directories) {
      if (dir.startsWith(path + '/') && dir.split('/').length === path.split('/').length + 1) {
        const name = dir.split('/').pop();
        results.push({ name, isDirectory: () => true, isFile: () => false } as fs.Dirent);
      }
    }

    // Find files
    for (const [filePath] of this.files) {
      if (
        filePath.startsWith(path + '/') &&
        filePath.split('/').length === path.split('/').length + 1
      ) {
        const name = filePath.split('/').pop();
        results.push({ name, isDirectory: () => false, isFile: () => true } as fs.Dirent);
      }
    }

    return results;
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    this.directories.add(path);

    if (options?.recursive) {
      const parts = path.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const partialPath = parts.slice(0, i).join('/');
        if (partialPath) {
          this.directories.add(partialPath);
        }
      }
    }
  }

  renameSync(oldPath: string, newPath: string): void {
    // Move files
    const filesToMove: [string, string][] = [];
    for (const [filePath, content] of this.files) {
      if (filePath.startsWith(oldPath)) {
        const newFilePath = filePath.replace(oldPath, newPath);
        filesToMove.push([filePath, newFilePath]);
        this.files.set(newFilePath, content);
      }
    }
    filesToMove.forEach(([oldFile]) => this.files.delete(oldFile));

    // Move directories
    const dirsToMove: string[] = [];
    for (const dir of this.directories) {
      if (dir.startsWith(oldPath)) {
        const newDir = dir.replace(oldPath, newPath);
        dirsToMove.push(dir);
        this.directories.add(newDir);
      }
    }
    dirsToMove.forEach((dir) => this.directories.delete(dir));
  }

  copyFileSync(src: string, dest: string): void {
    const content = this.readFileSync(src);
    this.writeFileSync(dest, content);
  }

  unlinkSync(path: string): void {
    this.files.delete(path);
  }

  rmdirSync(path: string): void {
    this.directories.delete(path);
  }

  // Helper methods for testing
  addFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  addDirectory(path: string): void {
    this.directories.add(path);
  }

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  hasDirectory(path: string): boolean {
    return this.directories.has(path);
  }

  getFileContent(path: string): string | undefined {
    return this.files.get(path);
  }
}

// Mock ConfigDiscovery
class MockConfigDiscovery extends ConfigDiscovery {
  getProjectPaths(projectRoot: string) {
    return {
      collectionsDir: `${projectRoot}/collections`,
      configFile: `${projectRoot}/config.yml`,
    };
  }
}

describe('JobApplicationMigrator', () => {
  let mockSystem: MockSystemInterface;
  let mockConfig: MockConfigDiscovery;
  let migrator: JobApplicationMigrator;

  beforeEach(() => {
    mockSystem = new MockSystemInterface();
    mockConfig = new MockConfigDiscovery();
    migrator = new JobApplicationMigrator('/project', mockSystem, mockConfig);
  });

  describe('migrateJobApplications', () => {
    it('should successfully migrate a simple application', async () => {
      // Setup legacy application
      const legacyApp = {
        company: 'Test Company',
        role: 'Software Engineer',
        resume_template: 'default',
        url: 'https://example.com/job',
        date_created: '2025-07-23T14:31:04-07:00',
        status: 'submitted',
        date_updated: '2025-07-23T16:58:04-07:00',
      };

      mockSystem.addDirectory('/source');
      mockSystem.addDirectory('/source/applications');
      mockSystem.addDirectory('/source/applications/submitted');
      mockSystem.addDirectory(
        '/source/applications/submitted/test_company_software_engineer_20250723',
      );
      mockSystem.addFile(
        '/source/applications/submitted/test_company_software_engineer_20250723/application.yml',
        YAML.stringify(legacyApp),
      );
      mockSystem.addFile(
        '/source/applications/submitted/test_company_software_engineer_20250723/resume.md',
        '# Resume Content',
      );
      mockSystem.addFile(
        '/source/applications/submitted/test_company_software_engineer_20250723/cover_letter.md',
        '# Cover Letter Content',
      );

      // Execute migration
      const result = await migrator.migrateJobApplications('/source');

      // Verify results
      expect(result.total).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);

      // Check that collection.yml was created with correct format
      const expectedPath =
        '/project/collections/job/submitted/test_company_software_engineer_20250723/collection.yml';
      expect(mockSystem.hasFile(expectedPath)).toBe(true);

      const collectionContent = mockSystem.getFileContent(expectedPath);
      expect(collectionContent).toBeDefined();

      const collection = YAML.parse(collectionContent!);
      expect(collection.collection_id).toBe('test_company_software_engineer_20250723');
      expect(collection.workflow).toBe('job');
      expect(collection.status).toBe('submitted');
      expect(collection.company).toBe('Test Company');
      expect(collection.role).toBe('Software Engineer');
      expect(collection.status_history).toHaveLength(1);
      expect(collection.status_history[0].status).toBe('submitted');

      // Check that files were copied
      expect(
        mockSystem.hasFile(
          '/project/collections/job/submitted/test_company_software_engineer_20250723/resume.md',
        ),
      ).toBe(true);
      expect(
        mockSystem.hasFile(
          '/project/collections/job/submitted/test_company_software_engineer_20250723/cover_letter.md',
        ),
      ).toBe(true);

      // Check that old application.yml was removed
      expect(
        mockSystem.hasFile(
          '/project/collections/job/submitted/test_company_software_engineer_20250723/application.yml',
        ),
      ).toBe(false);
    });

    it('should handle multiple applications across different statuses', async () => {
      // Setup multiple applications
      const activeApp = {
        company: 'Active Corp',
        role: 'Engineer',
        date_created: '2025-07-23T10:00:00-07:00',
        status: 'active',
      };

      const submittedApp = {
        company: 'Submitted Inc',
        role: 'Manager',
        date_created: '2025-07-22T15:30:00-07:00',
        status: 'submitted',
      };

      // Setup directory structure
      mockSystem.addDirectory('/source');
      mockSystem.addDirectory('/source/applications');
      mockSystem.addDirectory('/source/applications/active');
      mockSystem.addDirectory('/source/applications/submitted');
      mockSystem.addDirectory('/source/applications/active/active_corp_engineer_20250723');
      mockSystem.addDirectory('/source/applications/submitted/submitted_inc_manager_20250722');

      mockSystem.addFile(
        '/source/applications/active/active_corp_engineer_20250723/application.yml',
        YAML.stringify(activeApp),
      );
      mockSystem.addFile(
        '/source/applications/submitted/submitted_inc_manager_20250722/application.yml',
        YAML.stringify(submittedApp),
      );

      // Add some artifacts
      mockSystem.addFile(
        '/source/applications/active/active_corp_engineer_20250723/resume.md',
        '# Active Resume',
      );
      mockSystem.addFile(
        '/source/applications/submitted/submitted_inc_manager_20250722/resume.md',
        '# Submitted Resume',
      );

      // Execute migration
      const result = await migrator.migrateJobApplications('/source');

      // Verify results
      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);

      // Check both applications were migrated to correct locations
      expect(
        mockSystem.hasFile(
          '/project/collections/job/active/active_corp_engineer_20250723/collection.yml',
        ),
      ).toBe(true);
      expect(
        mockSystem.hasFile(
          '/project/collections/job/submitted/submitted_inc_manager_20250722/collection.yml',
        ),
      ).toBe(true);
    });

    it('should handle dry run mode correctly', async () => {
      // Setup legacy application
      const legacyApp = {
        company: 'Test Company',
        role: 'Engineer',
        date_created: '2025-07-23T14:31:04-07:00',
        status: 'active',
      };

      mockSystem.addDirectory('/source');
      mockSystem.addDirectory('/source/applications');
      mockSystem.addDirectory('/source/applications/active');
      mockSystem.addDirectory('/source/applications/active/test_company_engineer_20250723');
      mockSystem.addFile(
        '/source/applications/active/test_company_engineer_20250723/application.yml',
        YAML.stringify(legacyApp),
      );

      // Execute dry run
      const result = await migrator.migrateJobApplications('/source', { dryRun: true });

      // Verify results show what would happen
      expect(result.total).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);

      // But no files should actually be created
      expect(
        mockSystem.hasFile(
          '/project/collections/job/active/test_company_engineer_20250723/collection.yml',
        ),
      ).toBe(false);
    });

    it('should handle missing application.yml files gracefully', async () => {
      mockSystem.addDirectory('/source');
      mockSystem.addDirectory('/source/applications');
      mockSystem.addDirectory('/source/applications/active');
      mockSystem.addDirectory('/source/applications/active/broken_app');
      // No application.yml file

      const result = await migrator.migrateJobApplications('/source');

      expect(result.total).toBe(1);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.results[0].error).toBe('application.yml not found');
    });

    it('should handle force overwrite correctly', async () => {
      // Setup legacy application
      const legacyApp = {
        company: 'Test Company',
        role: 'Engineer',
        date_created: '2025-07-23T14:31:04-07:00',
        status: 'active',
      };

      mockSystem.addDirectory('/source');
      mockSystem.addDirectory('/source/applications');
      mockSystem.addDirectory('/source/applications/active');
      mockSystem.addDirectory('/source/applications/active/test_company_engineer_20250723');
      mockSystem.addFile(
        '/source/applications/active/test_company_engineer_20250723/application.yml',
        YAML.stringify(legacyApp),
      );

      // Create existing target directory
      mockSystem.addDirectory('/project/collections/job/active');
      mockSystem.addDirectory('/project/collections/job/active/test_company_engineer_20250723');
      mockSystem.addFile(
        '/project/collections/job/active/test_company_engineer_20250723/existing.txt',
        'existing content',
      );

      // First try without force - should fail
      let result = await migrator.migrateJobApplications('/source');
      expect(result.failed).toBe(1);
      expect(result.results[0].error).toContain('Target already exists');

      // Now try with force - should succeed
      result = await migrator.migrateJobApplications('/source', { force: true });
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should convert timestamps correctly', async () => {
      const legacyApp = {
        company: 'Test Company',
        role: 'Engineer',
        date_created: '2025-07-23T14:31:04-07:00', // PDT timezone
        status: 'active',
        date_updated: '2025-07-23T16:58:04-07:00',
      };

      mockSystem.addDirectory('/source');
      mockSystem.addDirectory('/source/applications');
      mockSystem.addDirectory('/source/applications/active');
      mockSystem.addDirectory('/source/applications/active/test_app');
      mockSystem.addFile(
        '/source/applications/active/test_app/application.yml',
        YAML.stringify(legacyApp),
      );

      const result = await migrator.migrateJobApplications('/source');
      expect(result.successful).toBe(1);

      const collectionContent = mockSystem.getFileContent(
        '/project/collections/job/active/test_company_engineer_20250723/collection.yml',
      );
      const collection = YAML.parse(collectionContent!);

      // Should be converted to UTC ISO format
      expect(collection.date_created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(collection.date_modified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent source path', async () => {
      await expect(migrator.migrateJobApplications('/nonexistent')).rejects.toThrow(
        'Source path does not exist',
      );
    });

    it('should throw error for missing applications directory', async () => {
      mockSystem.addDirectory('/source');
      await expect(migrator.migrateJobApplications('/source')).rejects.toThrow(
        'Applications directory not found',
      );
    });
  });
});
