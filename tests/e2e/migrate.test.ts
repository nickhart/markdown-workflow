import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as YAML from 'yaml';
import { migrateCommand } from '../../src/cli/commands/migrate.js';
import { ConfigDiscovery } from '../../src/core/config-discovery.js';

/**
 * E2E tests for migration command using real filesystem operations
 * These tests create temporary directories with legacy data and verify full migration flow
 */
describe.skip('migrate command E2E', () => {
  let tempDir: string;
  let legacyDir: string;
  let projectDir: string;
  let configDiscovery: ConfigDiscovery;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
    legacyDir = path.join(tempDir, 'legacy');
    projectDir = path.join(tempDir, 'project');

    // Setup legacy directory structure
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.mkdirSync(path.join(legacyDir, 'applications'), { recursive: true });
    fs.mkdirSync(path.join(legacyDir, 'applications', 'active'), { recursive: true });
    fs.mkdirSync(path.join(legacyDir, 'applications', 'submitted'), { recursive: true });
    fs.mkdirSync(path.join(legacyDir, 'applications', 'interview'), { recursive: true });
    fs.mkdirSync(path.join(legacyDir, 'applications', 'rejected'), { recursive: true });

    // Setup new project directory structure
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'collections'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'collections', 'job'), { recursive: true });

    // Create config.yml for new project
    const config = {
      user: {
        name: 'Test User',
        preferred_name: 'test_user',
        email: 'test@example.com',
      },
      system: {
        scraper: 'wget',
      },
    };
    fs.writeFileSync(path.join(projectDir, 'config.yml'), YAML.stringify(config));

    // Mock ConfigDiscovery to use our test project
    configDiscovery = new ConfigDiscovery();
    configDiscovery.requireProjectRoot = () => projectDir;
    configDiscovery.getProjectPaths = (root: string) => ({
      collectionsDir: path.join(root, 'collections'),
      configFile: path.join(root, 'config.yml'),
    });
  });

  afterEach(() => {
    // Cleanup temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it('should migrate a single active job application', async () => {
    // Create legacy application
    const applicationDir = path.join(
      legacyDir,
      'applications',
      'active',
      'acme_corp_software_engineer_20250723',
    );
    fs.mkdirSync(applicationDir, { recursive: true });

    const legacyMetadata = {
      company: 'Acme Corp',
      role: 'Software Engineer',
      resume_template: 'default',
      url: 'https://acme.com/jobs/123',
      date_created: '2025-07-23T10:30:00-07:00',
      status: 'active',
      date_updated: '2025-07-23T11:45:00-07:00',
    };

    fs.writeFileSync(path.join(applicationDir, 'application.yml'), YAML.stringify(legacyMetadata));

    fs.writeFileSync(
      path.join(applicationDir, 'resume_test_user.md'),
      '# Test User Resume\n\nSoftware Engineer with 5 years experience...',
    );

    fs.writeFileSync(
      path.join(applicationDir, 'cover_letter_test_user.md'),
      '# Cover Letter\n\nDear Hiring Manager...',
    );

    fs.writeFileSync(
      path.join(applicationDir, 'job_description.html'),
      '<html><body><h1>Software Engineer Job</h1></body></html>',
    );

    // Create formatted directory with some outputs
    fs.mkdirSync(path.join(applicationDir, 'formatted'), { recursive: true });
    fs.writeFileSync(
      path.join(applicationDir, 'formatted', 'resume_test_user.docx'),
      'mock docx content',
    );

    // Execute migration
    await migrateCommand('job', legacyDir, {
      configDiscovery,
      dryRun: false,
      force: false,
    });

    // Verify migration results
    const targetDir = path.join(
      projectDir,
      'collections',
      'job',
      'active',
      'acme_corp_software_engineer_20250723',
    );
    expect(fs.existsSync(targetDir)).toBe(true);

    // Check collection.yml was created correctly
    const collectionPath = path.join(targetDir, 'collection.yml');
    expect(fs.existsSync(collectionPath)).toBe(true);

    const collectionContent = fs.readFileSync(collectionPath, 'utf8');
    const collection = YAML.parse(collectionContent);

    expect(collection.collection_id).toBe('acme_corp_software_engineer_20250723');
    expect(collection.workflow).toBe('job');
    expect(collection.status).toBe('active');
    expect(collection.company).toBe('Acme Corp');
    expect(collection.role).toBe('Software Engineer');
    expect(collection.url).toBe('https://acme.com/jobs/123');
    expect(collection.resume_template).toBe('default');
    expect(collection.status_history).toHaveLength(1);
    expect(collection.status_history[0].status).toBe('active');

    // Verify timestamps were converted to UTC ISO format
    expect(collection.date_created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(collection.date_modified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Check all files were copied
    expect(fs.existsSync(path.join(targetDir, 'resume_test_user.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'cover_letter_test_user.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'job_description.html'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'formatted', 'resume_test_user.docx'))).toBe(true);

    // Verify file contents were preserved
    const resumeContent = fs.readFileSync(path.join(targetDir, 'resume_test_user.md'), 'utf8');
    expect(resumeContent).toContain('Software Engineer with 5 years experience');

    // Verify old application.yml was removed
    expect(fs.existsSync(path.join(targetDir, 'application.yml'))).toBe(false);
  });

  it('should migrate multiple applications across different statuses', async () => {
    // Create multiple legacy applications
    const applications = [
      {
        status: 'active',
        data: {
          company: 'StartupXYZ',
          role: 'Frontend Developer',
          date_created: '2025-07-22T14:00:00-07:00',
          status: 'active',
        },
      },
      {
        status: 'submitted',
        data: {
          company: 'Big Tech Corp',
          role: 'Backend Engineer',
          date_created: '2025-07-21T09:15:00-07:00',
          status: 'submitted',
        },
      },
      {
        status: 'interview',
        data: {
          company: 'Mid Size Co',
          role: 'Full Stack Developer',
          date_created: '2025-07-20T16:30:00-07:00',
          status: 'interview',
        },
      },
    ];

    for (const app of applications) {
      const appName = `${app.data.company.toLowerCase().replace(' ', '_')}_${app.data.role.toLowerCase().replace(' ', '_')}_20250722`;
      const appDir = path.join(legacyDir, 'applications', app.status, appName);
      fs.mkdirSync(appDir, { recursive: true });

      fs.writeFileSync(path.join(appDir, 'application.yml'), YAML.stringify(app.data));

      fs.writeFileSync(path.join(appDir, 'resume.md'), `# Resume for ${app.data.company}`);

      // Add interview notes for interview status app
      if (app.status === 'interview') {
        fs.writeFileSync(
          path.join(appDir, 'recruiter_notes.md'),
          '# Recruiter Interview Notes\n\nPositive conversation...',
        );
      }
    }

    // Execute migration
    await migrateCommand('job', legacyDir, {
      configDiscovery,
      dryRun: false,
      force: false,
    });

    // Verify all applications were migrated to correct locations
    const activeDir = path.join(projectDir, 'collections', 'job', 'active');
    const submittedDir = path.join(projectDir, 'collections', 'job', 'submitted');
    const interviewDir = path.join(projectDir, 'collections', 'job', 'interview');

    expect(fs.readdirSync(activeDir)).toHaveLength(1);
    expect(fs.readdirSync(submittedDir)).toHaveLength(1);
    expect(fs.readdirSync(interviewDir)).toHaveLength(1);

    // Check interview notes were preserved
    const interviewAppDir = fs.readdirSync(interviewDir)[0];
    const notesPath = path.join(interviewDir, interviewAppDir, 'recruiter_notes.md');
    expect(fs.existsSync(notesPath)).toBe(true);
    const notesContent = fs.readFileSync(notesPath, 'utf8');
    expect(notesContent).toContain('Positive conversation');
  });

  it('should handle dry run mode correctly', async () => {
    // Create legacy application
    const applicationDir = path.join(
      legacyDir,
      'applications',
      'active',
      'test_company_engineer_20250723',
    );
    fs.mkdirSync(applicationDir, { recursive: true });

    const legacyMetadata = {
      company: 'Test Company',
      role: 'Engineer',
      date_created: '2025-07-23T10:00:00-07:00',
      status: 'active',
    };

    fs.writeFileSync(path.join(applicationDir, 'application.yml'), YAML.stringify(legacyMetadata));

    // Execute dry run
    await migrateCommand('job', legacyDir, {
      configDiscovery,
      dryRun: true,
      force: false,
    });

    // Verify no files were actually created
    const targetDir = path.join(
      projectDir,
      'collections',
      'job',
      'active',
      'test_company_engineer_20250723',
    );
    expect(fs.existsSync(targetDir)).toBe(false);

    // Verify collections directory structure is untouched
    const jobDir = path.join(projectDir, 'collections', 'job');
    expect(fs.readdirSync(jobDir)).toHaveLength(0);
  });

  it('should handle force overwrite correctly', async () => {
    // Create legacy application
    const applicationDir = path.join(
      legacyDir,
      'applications',
      'active',
      'test_company_engineer_20250723',
    );
    fs.mkdirSync(applicationDir, { recursive: true });

    const legacyMetadata = {
      company: 'Test Company',
      role: 'Engineer',
      date_created: '2025-07-23T10:00:00-07:00',
      status: 'active',
    };

    fs.writeFileSync(path.join(applicationDir, 'application.yml'), YAML.stringify(legacyMetadata));

    fs.writeFileSync(path.join(applicationDir, 'resume.md'), '# New Resume Content');

    // Create existing target with different content
    const targetDir = path.join(
      projectDir,
      'collections',
      'job',
      'active',
      'test_company_engineer_20250723',
    );
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'resume.md'), '# Old Resume Content');
    fs.writeFileSync(path.join(targetDir, 'extra_file.txt'), 'This should be removed');

    // First try without force - should fail
    await expect(
      migrateCommand('job', legacyDir, {
        configDiscovery,
        dryRun: false,
        force: false,
      }),
    ).rejects.toThrow();

    // Verify old content is still there
    const oldContent = fs.readFileSync(path.join(targetDir, 'resume.md'), 'utf8');
    expect(oldContent).toBe('# Old Resume Content');

    // Now try with force - should succeed
    await migrateCommand('job', legacyDir, {
      configDiscovery,
      dryRun: false,
      force: true,
    });

    // Verify new content replaced old content
    const newContent = fs.readFileSync(path.join(targetDir, 'resume.md'), 'utf8');
    expect(newContent).toBe('# New Resume Content');

    // Verify collection.yml was created
    expect(fs.existsSync(path.join(targetDir, 'collection.yml'))).toBe(true);

    // Verify extra file was removed (directory was completely replaced)
    expect(fs.existsSync(path.join(targetDir, 'extra_file.txt'))).toBe(false);
  });

  it('should preserve complex directory structures', async () => {
    // Create legacy application with nested directories
    const applicationDir = path.join(
      legacyDir,
      'applications',
      'interview',
      'complex_company_senior_engineer_20250723',
    );
    fs.mkdirSync(applicationDir, { recursive: true });

    const legacyMetadata = {
      company: 'Complex Company',
      role: 'Senior Engineer',
      date_created: '2025-07-23T10:00:00-07:00',
      status: 'interview',
    };

    fs.writeFileSync(path.join(applicationDir, 'application.yml'), YAML.stringify(legacyMetadata));

    // Create nested directory structure
    fs.mkdirSync(path.join(applicationDir, 'formatted'), { recursive: true });
    fs.mkdirSync(path.join(applicationDir, 'attachments'), { recursive: true });
    fs.mkdirSync(path.join(applicationDir, 'attachments', 'portfolio'), { recursive: true });

    // Add files in various locations
    fs.writeFileSync(path.join(applicationDir, 'resume.md'), '# Resume');
    fs.writeFileSync(path.join(applicationDir, 'formatted', 'resume.docx'), 'docx content');
    fs.writeFileSync(path.join(applicationDir, 'attachments', 'certificate.pdf'), 'pdf content');
    fs.writeFileSync(
      path.join(applicationDir, 'attachments', 'portfolio', 'project1.md'),
      '# Project 1',
    );
    fs.writeFileSync(
      path.join(applicationDir, 'attachments', 'portfolio', 'project2.md'),
      '# Project 2',
    );

    // Execute migration
    await migrateCommand('job', legacyDir, {
      configDiscovery,
      dryRun: false,
      force: false,
    });

    // Verify all nested structure was preserved
    const targetDir = path.join(
      projectDir,
      'collections',
      'job',
      'interview',
      'complex_company_senior_engineer_20250723',
    );

    expect(fs.existsSync(path.join(targetDir, 'collection.yml'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'resume.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'formatted', 'resume.docx'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'attachments', 'certificate.pdf'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'attachments', 'portfolio', 'project1.md'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(targetDir, 'attachments', 'portfolio', 'project2.md'))).toBe(
      true,
    );

    // Verify file contents were preserved
    const project1Content = fs.readFileSync(
      path.join(targetDir, 'attachments', 'portfolio', 'project1.md'),
      'utf8',
    );
    expect(project1Content).toBe('# Project 1');
  });

  it('should handle applications with minimal metadata', async () => {
    // Create legacy application with only required fields
    const applicationDir = path.join(
      legacyDir,
      'applications',
      'rejected',
      'minimal_company_developer_20250723',
    );
    fs.mkdirSync(applicationDir, { recursive: true });

    const legacyMetadata = {
      company: 'Minimal Company',
      role: 'Developer',
      date_created: '2025-07-23T10:00:00-07:00',
      status: 'rejected',
      // No url, resume_template, or date_updated
    };

    fs.writeFileSync(path.join(applicationDir, 'application.yml'), YAML.stringify(legacyMetadata));

    fs.writeFileSync(path.join(applicationDir, 'resume.md'), '# Minimal Resume');

    // Execute migration
    await migrateCommand('job', legacyDir, {
      configDiscovery,
      dryRun: false,
      force: false,
    });

    // Verify migration succeeded
    const targetDir = path.join(
      projectDir,
      'collections',
      'job',
      'rejected',
      'minimal_company_developer_20250723',
    );
    expect(fs.existsSync(targetDir)).toBe(true);

    const collectionPath = path.join(targetDir, 'collection.yml');
    const collectionContent = fs.readFileSync(collectionPath, 'utf8');
    const collection = YAML.parse(collectionContent);

    expect(collection.collection_id).toBe('minimal_company_developer_20250723');
    expect(collection.company).toBe('Minimal Company');
    expect(collection.role).toBe('Developer');
    expect(collection.status).toBe('rejected');

    // Optional fields should not be present
    expect(collection.url).toBeUndefined();
    expect(collection.resume_template).toBeUndefined();

    // date_modified should default to date_created when date_updated is missing
    expect(collection.date_created).toBe(collection.date_modified);
  });
});
