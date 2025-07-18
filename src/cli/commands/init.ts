import * as fs from 'fs';
import * as path from 'path';
import { ConfigDiscovery } from '../../core/ConfigDiscovery.js';
import { ProjectConfig } from '../../core/types.js';

interface InitOptions {
  workflows?: string[];
  force?: boolean;
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Initialize a new markdown-workflow project
 */
export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const force = options.force || false;

  // Use provided ConfigDiscovery instance or create new one
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();

  // Check if already in a project
  if (configDiscovery.isInProject(cwd) && !force) {
    throw new Error('Already in a markdown-workflow project. Use --force to reinitialize.');
  }

  // Get system configuration
  const systemConfig = await configDiscovery.resolveConfiguration(cwd);
  const availableWorkflows = systemConfig.availableWorkflows;

  // Determine which workflows to initialize
  const workflowsToInit = options.workflows || availableWorkflows;

  // Validate requested workflows
  const invalidWorkflows = workflowsToInit.filter((w) => !availableWorkflows.includes(w));
  if (invalidWorkflows.length > 0) {
    throw new Error(
      `Unknown workflows: ${invalidWorkflows.join(', ')}. ` +
        `Available: ${availableWorkflows.join(', ')}`,
    );
  }

  console.log('Initializing markdown-workflow project...');
  console.log(`Location: ${cwd}`);
  console.log(`Workflows: ${workflowsToInit.join(', ')}`);

  // Create project structure
  await createProjectStructure(cwd, workflowsToInit);

  console.log('✅ Project initialized successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Edit .markdown-workflow/config.yml with your information');
  console.log('  2. Customize workflows in .markdown-workflow/workflows/ (optional)');
  console.log('  3. Run wf-create to start using the system');
}

/**
 * Create the project directory structure
 */
async function createProjectStructure(projectRoot: string, workflows: string[]): Promise<void> {
  const configDiscovery = new ConfigDiscovery();
  const projectPaths = configDiscovery.getProjectPaths(projectRoot);

  // Create main project directory
  fs.mkdirSync(projectPaths.projectDir, { recursive: true });

  // Create subdirectories
  fs.mkdirSync(projectPaths.workflowsDir, { recursive: true });
  fs.mkdirSync(projectPaths.collectionsDir, { recursive: true });

  // Create default config file
  await createDefaultConfig(projectPaths.configFile);

  // Create workflow directories (for potential customization)
  for (const workflow of workflows) {
    const workflowDir = path.join(projectPaths.workflowsDir, workflow);
    fs.mkdirSync(workflowDir, { recursive: true });

    // Create templates directory structure
    const templatesDir = path.join(workflowDir, 'templates');
    fs.mkdirSync(templatesDir, { recursive: true });

    // Create a placeholder file explaining customization
    const readmePath = path.join(workflowDir, 'README.md');
    const readmeContent = `# ${workflow.charAt(0).toUpperCase() + workflow.slice(1)} Workflow Customization

This directory can contain customizations for the ${workflow} workflow.

## Structure
- \`workflow.yml\` - Override workflow definition
- \`templates/\` - Custom templates (override system templates)

## Template Resolution
Templates are resolved in this order:
1. \`templates/\` in this directory (highest priority)
2. System templates from markdown-workflow installation

## Getting Started
1. Copy system templates you want to customize
2. Modify them to suit your needs
3. System will automatically use your customizations
`;

    fs.writeFileSync(readmePath, readmeContent);
  }

  console.log(`Created project structure in ${projectPaths.projectDir}`);
}

/**
 * Create a default configuration file
 */
async function createDefaultConfig(configPath: string): Promise<void> {
  const defaultConfig: ProjectConfig = {
    user: {
      name: 'Your Name',
      preferred_name: 'Your Name',
      email: 'your.email@example.com',
      phone: '(555) 123-4567',
      address: '123 Main Street',
      city: 'Your City',
      state: 'ST',
      zip: '12345',
      linkedin: 'linkedin.com/in/yourname',
      github: 'github.com/yourusername',
      website: 'yourwebsite.com',
    },
    system: {
      scraper: 'wget',
      web_download: {
        timeout: 30,
        add_utf8_bom: true,
        html_cleanup: 'scripts',
      },
      output_formats: ['docx', 'html', 'pdf'],
      git: {
        auto_commit: true,
        commit_message_template: 'Add {{workflow}} collection: {{collection_id}}',
      },
      collection_id: {
        date_format: 'YYYYMMDD',
        sanitize_spaces: '_',
        max_length: 50,
      },
    },
    workflows: {
      job: {
        templates: {
          resume: {
            default_template: 'default',
            available_templates: ['default', 'mobile', 'frontend'],
          },
        },
        custom_fields: [
          {
            name: 'salary_range',
            type: 'string',
            description: 'Expected salary range',
          },
          {
            name: 'remote_preference',
            type: 'enum',
            options: ['remote', 'hybrid', 'onsite'],
            description: 'Work location preference',
          },
        ],
      },
      blog: {
        custom_fields: [
          {
            name: 'estimated_reading_time',
            type: 'number',
            description: 'Estimated reading time in minutes',
          },
        ],
      },
    },
  };

  // For now, write as JSON. We'll implement YAML serialization later
  const configContent = `# Markdown Workflow Configuration
# This file contains user information and system settings for your markdown-workflow project.

# User Information (used for template substitution)
user:
  name: "${defaultConfig.user.name}"
  preferred_name: "${defaultConfig.user.preferred_name}"
  email: "${defaultConfig.user.email}"
  phone: "${defaultConfig.user.phone}"
  address: "${defaultConfig.user.address}"
  city: "${defaultConfig.user.city}"
  state: "${defaultConfig.user.state}"
  zip: "${defaultConfig.user.zip}"
  linkedin: "${defaultConfig.user.linkedin}"
  github: "${defaultConfig.user.github}"
  website: "${defaultConfig.user.website}"

# System Configuration
system:
  scraper: "wget"  # Options: "wget", "curl", "chrome"
  web_download:
    timeout: 30
    add_utf8_bom: true
    html_cleanup: "scripts"  # Options: "none", "scripts", "markdown"

  output_formats:
    - "docx"
    - "html"
    - "pdf"

  git:
    auto_commit: true
    commit_message_template: "Add {{workflow}} collection: {{collection_id}}"

  collection_id:
    date_format: "YYYYMMDD"
    sanitize_spaces: "_"
    max_length: 50

# Workflow-specific overrides
workflows:
  job:
    templates:
      resume:
        default_template: "default"
        available_templates:
          - "default"
          - "mobile"
          - "frontend"

    custom_fields:
      - name: "salary_range"
        type: "string"
        description: "Expected salary range"
      - name: "remote_preference"
        type: "enum"
        options: ["remote", "hybrid", "onsite"]
        description: "Work location preference"

  blog:
    custom_fields:
      - name: "estimated_reading_time"
        type: "number"
        description: "Estimated reading time in minutes"
`;

  fs.writeFileSync(configPath, configContent);
  console.log(`Created configuration file: ${configPath}`);
}

export default initCommand;
