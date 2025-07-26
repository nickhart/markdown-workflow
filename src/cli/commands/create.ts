import * as fs from 'fs';
import * as path from 'path';
import Mustache from 'mustache';
import { ConfigDiscovery } from '../../core/config-discovery.js';
import { CollectionMetadata, WorkflowTemplate } from '../../core/types.js';
import { type ProjectConfig } from '../../core/schemas.js';
import {
  generateCollectionId,
  getCurrentISODate,
  formatDate,
  getCurrentDate,
} from '../../shared/date-utils.js';
import { sanitizeForFilename } from '../../shared/file-utils.js';
import { initializeProject } from '../shared/cli-base.js';
import { loadWorkflowDefinition, scrapeUrlForCollection } from '../shared/workflow-operations.js';
import { generateMetadataYaml } from '../shared/metadata-utils.js';
import {
  logCollectionCreation,
  logSuccess,
  logNextSteps,
  logTemplateUsage,
  logFileCreation,
  logForceRecreation,
  logWarning,
  logError,
} from '../shared/formatting-utils.js';

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
  // Initialize project context
  const { systemConfig, projectPaths } = await initializeProject(options);

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
      logForceRecreation(collectionId, collectionPath);

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
      logSuccess('Collection recreated successfully!');
    } else {
      logCollectionCreation(collectionId, collectionPath);
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
    await scrapeUrlForCollection(collectionPath, options.url, workflowDefinition);
  }

  logSuccess('Collection created successfully!');
  logNextSteps(workflowName, collectionId, collectionPath);
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
    logWarning(`Template not found: ${template.name} (checked project and system locations)`);
    return;
  }

  logTemplateUsage(resolvedTemplatePath);

  if (!fs.existsSync(resolvedTemplatePath)) {
    logWarning(`Template file not found: ${resolvedTemplatePath}`);
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

    logFileCreation(outputFile);
  } catch (error) {
    logError(
      `Error processing template ${template.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
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

export default createCommand;
