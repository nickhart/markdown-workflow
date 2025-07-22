import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import Mustache from 'mustache';
import { ConfigDiscovery } from '../../core/ConfigDiscovery.js';
import { CollectionMetadata, WorkflowTemplate } from '../../core/types.js';
import { WorkflowFileSchema, type WorkflowFile, type ProjectConfig } from '../../core/schemas.js';
import {
  generateCollectionId,
  getCurrentISODate,
  formatDate,
  getCurrentDate,
} from '../../shared/dateUtils.js';

interface CreateOptions {
  url?: string;
  template_variant?: string;
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Create a new collection from a workflow template
 */
export async function createCommand(
  workflowName: string,
  company: string,
  role: string,
  options: CreateOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();

  // Use provided ConfigDiscovery instance or create new one
  const configDiscovery = options.configDiscovery || new ConfigDiscovery();

  // Ensure we're in a project
  const projectRoot = configDiscovery.requireProjectRoot(cwd);
  const projectPaths = configDiscovery.getProjectPaths(projectRoot);

  // Get system configuration
  const systemConfig = await configDiscovery.resolveConfiguration(cwd);

  // Validate workflow exists
  if (!systemConfig.availableWorkflows.includes(workflowName)) {
    throw new Error(
      `Unknown workflow: ${workflowName}. Available: ${systemConfig.availableWorkflows.join(', ')}`,
    );
  }

  // Load workflow definition
  const workflowDefinition = await loadWorkflowDefinition(
    systemConfig.paths.systemRoot,
    workflowName,
  );

  // Generate collection ID
  const collectionId = generateCollectionId(company, role, systemConfig.projectConfig);

  // Create collection directory
  const collectionPath = path.join(projectPaths.collectionsDir, collectionId);
  if (fs.existsSync(collectionPath)) {
    throw new Error(`Collection already exists: ${collectionId}`);
  }

  fs.mkdirSync(collectionPath, { recursive: true });

  console.log(`Creating collection: ${collectionId}`);
  console.log(`Location: ${collectionPath}`);

  // Create collection metadata
  const metadata: CollectionMetadata = {
    collection_id: collectionId,
    workflow: workflowName,
    status: workflowDefinition.workflow.stages[0].name, // First stage
    date_created: getCurrentISODate(systemConfig.projectConfig),
    date_modified: getCurrentISODate(systemConfig.projectConfig),
    status_history: [
      {
        status: workflowDefinition.workflow.stages[0].name,
        date: getCurrentISODate(systemConfig.projectConfig),
      },
    ],
    company,
    role,
    ...(options.url && { url: options.url }),
  };

  // Write metadata file
  const metadataPath = path.join(collectionPath, 'collection.yml');
  const metadataContent = generateMetadataYaml(metadata);
  fs.writeFileSync(metadataPath, metadataContent);

  // Process templates for the create action
  const createAction = workflowDefinition.workflow.actions.find(
    (action) => action.name === 'create',
  );

  if (createAction && createAction.templates) {
    for (const templateName of createAction.templates) {
      const template = workflowDefinition.workflow.templates.find((t) => t.name === templateName);

      if (template) {
        // Filter options to only include string values for template processing
        const templateVariables: Record<string, string> = {
          company,
          role,
          ...(options.url && { url: options.url }),
          ...(options.template_variant && { template_variant: options.template_variant }),
        };

        await processTemplate(
          template,
          collectionPath,
          systemConfig.paths.systemRoot,
          workflowName,
          templateVariables,
          systemConfig.projectConfig,
        );
      }
    }
  }

  console.log('✅ Collection created successfully!');
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Edit files in ${collectionPath}`);
  console.log(`  2. Run wf format ${workflowName} ${collectionId} to convert to DOCX`);
  console.log(`  3. Run wf status ${workflowName} ${collectionId} <status> to update status`);
}

/**
 * Load workflow definition from YAML file
 */
async function loadWorkflowDefinition(
  systemRoot: string,
  workflowName: string,
): Promise<WorkflowFile> {
  const workflowPath = path.join(systemRoot, 'workflows', workflowName, 'workflow.yml');

  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow definition not found: ${workflowPath}`);
  }

  try {
    const workflowContent = fs.readFileSync(workflowPath, 'utf8');
    const parsedYaml = YAML.parse(workflowContent);

    // Validate using Zod schema
    const validationResult = WorkflowFileSchema.safeParse(parsedYaml);

    if (!validationResult.success) {
      throw new Error(`Invalid workflow format: ${validationResult.error.message}`);
    }

    return validationResult.data;
  } catch (error) {
    throw new Error(`Failed to load workflow definition: ${error}`);
  }
}

/**
 * Process a template file with variable substitution
 */
async function processTemplate(
  template: WorkflowTemplate,
  collectionPath: string,
  systemRoot: string,
  workflowName: string,
  variables: Record<string, string>,
  projectConfig?: ProjectConfig | null,
): Promise<void> {
  const templatePath = path.join(systemRoot, 'workflows', workflowName, template.file);

  if (!fs.existsSync(templatePath)) {
    console.warn(`Template not found: ${templatePath}`);
    return;
  }

  try {
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    // Load user configuration for template variables
    const configDiscovery = new ConfigDiscovery();
    const projectRoot = configDiscovery.findProjectRoot();
    let userConfig = null;

    if (projectRoot) {
      const projectPaths = configDiscovery.getProjectPaths(projectRoot);
      if (fs.existsSync(projectPaths.configFile)) {
        const config = await configDiscovery.loadProjectConfig(projectPaths.configFile);
        userConfig = config?.user;
      }
    }

    // Prepare template variables for Mustache
    const userConfigForTemplate = userConfig || getDefaultUserConfig();
    const templateVariables = {
      ...variables,
      date: formatDate(
        getCurrentDate(projectConfig || undefined),
        'YYYY-MM-DD',
        projectConfig || undefined,
      ),
      user: {
        ...userConfigForTemplate,
        // Add sanitized version of preferred_name for filenames
        preferred_name: sanitizeForFilename(userConfigForTemplate.preferred_name),
      },
    };

    // Process template with Mustache
    const processedContent = Mustache.render(templateContent, templateVariables);

    // Generate output filename with Mustache
    const outputFile = Mustache.render(template.output, templateVariables);

    const outputPath = path.join(collectionPath, outputFile);
    fs.writeFileSync(outputPath, processedContent);

    console.log(`Created: ${outputFile}`);
  } catch (error) {
    console.error(`Error processing template ${template.name}:`, error);
  }
}

/**
 * Sanitize string for use in filenames
 */
function sanitizeForFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Remove duplicate underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

/**
 * Get default user configuration for fallback
 */
function getDefaultUserConfig() {
  return {
    name: 'Your Name',
    preferred_name: 'john_doe',
    email: 'your.email@example.com',
    phone: '(555) 123-4567',
    address: '123 Main St',
    city: 'Your City',
    state: 'ST',
    zip: '12345',
    linkedin: 'linkedin.com/in/yourname',
    github: 'github.com/yourusername',
    website: 'yourwebsite.com',
  };
}

/**
 * Generate YAML content for collection metadata
 */
function generateMetadataYaml(metadata: CollectionMetadata): string {
  return `# Collection Metadata
collection_id: "${metadata.collection_id}"
workflow: "${metadata.workflow}"
status: "${metadata.status}"
date_created: "${metadata.date_created}"
date_modified: "${metadata.date_modified}"

# Application Details
company: "${metadata.company}"
role: "${metadata.role}"
${metadata.url ? `url: "${metadata.url}"` : ''}

# Status History
status_history:
  - status: "${metadata.status_history[0].status}"
    date: "${metadata.status_history[0].date}"

# Additional Fields
# Add custom fields here as needed
`;
}

export default createCommand;
