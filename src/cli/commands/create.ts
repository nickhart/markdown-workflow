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
import { sanitizeForFilename } from '../../shared/fileUtils.js';
import {
  scrapeUrl,
  getWebScrapingConfig,
  generateFilenameFromUrl,
} from '../../shared/webScraper.js';

interface CreateOptions {
  url?: string;
  template_variant?: string;
  force?: boolean;
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

  // Create collection directory organized by workflow and initial status
  const initialStatus = workflowDefinition.workflow.stages[0].name;
  const workflowStatusDir = path.join(projectPaths.collectionsDir, workflowName, initialStatus);
  if (!fs.existsSync(workflowStatusDir)) {
    fs.mkdirSync(workflowStatusDir, { recursive: true });
  }

  const collectionPath = path.join(workflowStatusDir, collectionId);
  const collectionExists = fs.existsSync(collectionPath);

  // Handle existing collections
  if (collectionExists) {
    if (options.force) {
      console.log(`Force recreating collection: ${collectionId}`);
      console.log(`Location: ${collectionPath}`);

      // Remove existing collection directory
      fs.rmSync(collectionPath, { recursive: true, force: true });
    } else {
      throw new Error(
        `Collection already exists: ${collectionId}. Use 'wf update ${workflowName} ${collectionId}' to modify or --force to recreate.`,
      );
    }
  }

  // Create collection directory (for new collections or after force removal)
  if (!collectionExists || options.force) {
    fs.mkdirSync(collectionPath, { recursive: true });

    if (options.force) {
      console.log(`Collection recreated successfully!`);
    } else {
      console.log(`Creating collection: ${collectionId}`);
      console.log(`Location: ${collectionPath}`);
    }
  }

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
          projectPaths,
        );
      }
    }
  }

  // Scrape URL if provided
  if (options.url) {
    await scrapeUrlForCollection(
      collectionPath,
      options.url,
      workflowDefinition,
      systemConfig.projectConfig || undefined,
    );
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
 * Resolve template path with inheritance and variant support
 * Priority: project templates (with variant) > project templates (default) > system templates
 */
function resolveTemplatePath(
  template: WorkflowTemplate,
  systemRoot: string,
  workflowName: string,
  templateVariant?: string,
  projectPaths?: { workflowsDir: string } | null,
): string | null {
  const templatePaths: string[] = [];

  // If project has workflows directory, check project templates first
  if (projectPaths?.workflowsDir) {
    const projectWorkflowDir = path.join(projectPaths.workflowsDir, workflowName);

    if (templateVariant) {
      // Try project template with variant (e.g., .markdown-workflow/workflows/job/templates/resume/ai-frontend.md)
      const variantPath = getVariantTemplatePath(projectWorkflowDir, template, templateVariant);
      if (variantPath) templatePaths.push(variantPath);
    }

    // Try project template default (e.g., .markdown-workflow/workflows/job/templates/resume/default.md)
    const projectTemplatePath = path.join(projectWorkflowDir, template.file);
    templatePaths.push(projectTemplatePath);
  }

  // Always add system template as fallback
  const systemTemplatePath = path.join(systemRoot, 'workflows', workflowName, template.file);
  templatePaths.push(systemTemplatePath);

  // Return first existing template
  for (const templatePath of templatePaths) {
    if (fs.existsSync(templatePath)) {
      return templatePath;
    }
  }

  return null;
}

/**
 * Build variant template path by replacing filename with variant
 * e.g., templates/resume/default.md + variant "ai-frontend" -> templates/resume/ai-frontend.md
 */
function getVariantTemplatePath(
  workflowDir: string,
  template: WorkflowTemplate,
  variant: string,
): string | null {
  const templateFile = template.file;
  const parsedPath = path.parse(templateFile);

  // Replace filename with variant, keep extension
  const variantFile = path.join(parsedPath.dir, `${variant}${parsedPath.ext}`);
  return path.join(workflowDir, variantFile);
}

/**
 * Process a template file with variable substitution
 * Implements template inheritance: project templates override system templates
 */
async function processTemplate(
  template: WorkflowTemplate,
  collectionPath: string,
  systemRoot: string,
  workflowName: string,
  variables: Record<string, string>,
  projectConfig?: ProjectConfig | null,
  projectPaths?: { workflowsDir: string; configFile: string } | null,
): Promise<void> {
  // Load user configuration if project paths are available
  let userConfig = null;
  if (projectPaths?.configFile && fs.existsSync(projectPaths.configFile)) {
    const configDiscovery = new ConfigDiscovery();
    const config = await configDiscovery.loadProjectConfig(projectPaths.configFile);
    userConfig = config?.user;
  }

  // Resolve template path with inheritance: project templates override system templates
  const resolvedTemplatePath = resolveTemplatePath(
    template,
    systemRoot,
    workflowName,
    variables.template_variant,
    projectPaths,
  );

  if (!resolvedTemplatePath) {
    console.warn(`Template not found: ${template.name} (checked project and system locations)`);
    return;
  }

  console.log(`Using template: ${resolvedTemplatePath}`);

  if (!fs.existsSync(resolvedTemplatePath)) {
    console.warn(`Template file not found: ${resolvedTemplatePath}`);
    return;
  }

  try {
    const templateContent = fs.readFileSync(resolvedTemplatePath, 'utf8');

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
  const urlLine = metadata.url ? `url: "${metadata.url}"` : '';

  return `# Collection Metadata
collection_id: "${metadata.collection_id}"
workflow: "${metadata.workflow}"
status: "${metadata.status}"
date_created: "${metadata.date_created}"
date_modified: "${metadata.date_modified}"

# Application Details
company: "${metadata.company}"
role: "${metadata.role}"${urlLine ? `\n${urlLine}` : ''}

# Status History
status_history:
  - status: "${metadata.status_history[0].status}"
    date: "${metadata.status_history[0].date}"

# Additional Fields
# Add custom fields here as needed
`;
}

/**
 * Scrape URL for collection using workflow configuration
 */
async function scrapeUrlForCollection(
  collectionPath: string,
  url: string,
  workflowDefinition: WorkflowFile,
  projectConfig?: ProjectConfig,
): Promise<void> {
  console.log(`Scraping job description from: ${url}`);

  // Find scrape action in workflow definition
  const scrapeAction = workflowDefinition.workflow.actions.find(
    (action) => action.name === 'scrape',
  );

  // Determine output filename from workflow config or generate from URL
  let outputFile = 'job_description.html'; // default fallback

  if (scrapeAction?.parameters) {
    const outputParam = scrapeAction.parameters.find((p) => p.name === 'output_file');
    if (outputParam?.default && typeof outputParam.default === 'string') {
      outputFile = outputParam.default;
    }
  }

  // If no workflow config, try to generate a reasonable filename
  if (outputFile === 'job_description.html') {
    outputFile = generateFilenameFromUrl(url, outputFile);
  }

  // Get web scraping configuration
  const scrapingConfig = getWebScrapingConfig(projectConfig);

  try {
    // Perform the scraping
    const result = await scrapeUrl(url, {
      outputFile,
      outputDir: collectionPath,
    });

    if (result.success) {
      console.log(`✅ Successfully scraped using ${result.method}: ${result.outputFile}`);
    } else {
      console.error(`❌ Failed to scrape URL: ${result.error}`);

      // Create a fallback placeholder file with the URL
      const fallbackPath = path.join(collectionPath, outputFile);
      const fallbackContent = createFallbackHtml(url, result.error || 'Unknown error');
      fs.writeFileSync(fallbackPath, fallbackContent);
      console.log(`📄 Created placeholder file: ${outputFile}`);
    }
  } catch (error) {
    console.error(`❌ Scraping error: ${error}`);

    // Create fallback placeholder
    const fallbackPath = path.join(collectionPath, outputFile);
    const fallbackContent = createFallbackHtml(url, String(error));
    fs.writeFileSync(fallbackPath, fallbackContent);
    console.log(`📄 Created placeholder file: ${outputFile}`);
  }
}

/**
 * Create fallback HTML content when scraping fails
 */
function createFallbackHtml(url: string, error: string): string {
  return `<!DOCTYPE html>
<html>
<head>
    <title>Job Description - Scraping Failed</title>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 2em; }
        .error { color: #d73a49; background: #ffeef0; padding: 1em; border-radius: 4px; }
        .url { word-break: break-all; }
    </style>
</head>
<body>
    <h1>Job Description</h1>
    <p><strong>Source URL:</strong> <a href="${url}" class="url">${url}</a></p>
    
    <div class="error">
        <h3>⚠️ Scraping Failed</h3>
        <p><strong>Error:</strong> ${error}</p>
        <p>Please visit the URL above to view the job description manually.</p>
    </div>
    
    <h3>Manual Steps:</h3>
    <ol>
        <li>Click the URL above to open the job posting</li>
        <li>Copy the job description content</li>
        <li>Replace this file with the actual content</li>
    </ol>
</body>
</html>`;
}

export default createCommand;
