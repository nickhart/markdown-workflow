/**
 * Update command for modifying existing collection metadata and triggering URL scraping
 */

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { ConfigDiscovery } from '../../core/config-discovery.js';
import { CollectionMetadata } from '../../core/types.js';
import { WorkflowFileSchema, type WorkflowFile } from '../../core/schemas.js';
import { getCurrentISODate } from '../../shared/date-utils.js';
import { scrapeUrl, generateFilenameFromUrl } from '../../shared/web-scraper.js';

interface UpdateOptions {
  url?: string;
  company?: string;
  role?: string;
  status?: string;
  notes?: string;
  cwd?: string;
  configDiscovery?: ConfigDiscovery;
}

/**
 * Update an existing collection's metadata and optionally scrape new URL
 */
export async function updateCommand(
  workflowName: string,
  collectionId: string,
  options: UpdateOptions = {},
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

  // Find collection directory
  const collectionPath = await findCollectionPath(
    projectPaths.collectionsDir,
    workflowName,
    collectionId,
    workflowDefinition,
  );

  if (!collectionPath) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  console.log(`Updating collection: ${collectionId}`);
  console.log(`Location: ${collectionPath}`);

  // Load existing metadata
  const metadataPath = path.join(collectionPath, 'collection.yml');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Collection metadata not found: ${metadataPath}`);
  }

  const existingContent = fs.readFileSync(metadataPath, 'utf8');
  const existingMetadata = YAML.parse(existingContent) as CollectionMetadata;

  // Update metadata with provided options
  const updatedMetadata: CollectionMetadata = {
    ...existingMetadata,
    date_modified: getCurrentISODate(systemConfig.projectConfig || undefined),
  };

  // Update specific fields if provided
  if (options.company) updatedMetadata.company = options.company;
  if (options.role) updatedMetadata.role = options.role;
  if (options.url) updatedMetadata.url = options.url;
  if (options.notes) updatedMetadata.notes = options.notes;

  // Handle status change (would need to move collection directory)
  if (options.status) {
    // TODO: Implement status change with directory move
    console.warn('Status changes not yet implemented in update command. Use wf status instead.');
  }

  // Write updated metadata
  const updatedContent = generateMetadataYaml(updatedMetadata);
  fs.writeFileSync(metadataPath, updatedContent);

  console.log('✅ Collection metadata updated successfully!');

  // Scrape URL if provided
  if (options.url) {
    await scrapeUrlForCollection(collectionPath, options.url, workflowDefinition);
  }

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
 * Find collection directory by searching through workflow stages
 */
async function findCollectionPath(
  collectionsDir: string,
  workflowName: string,
  collectionId: string,
  workflowDefinition: WorkflowFile,
): Promise<string | null> {
  const workflowDir = path.join(collectionsDir, workflowName);

  if (!fs.existsSync(workflowDir)) {
    return null;
  }

  // Search through all stages
  for (const stage of workflowDefinition.workflow.stages) {
    const stageDir = path.join(workflowDir, stage.name);
    const collectionPath = path.join(stageDir, collectionId);

    if (fs.existsSync(collectionPath)) {
      return collectionPath;
    }
  }

  return null;
}

/**
 * Scrape URL for collection using workflow configuration
 */
async function scrapeUrlForCollection(
  collectionPath: string,
  url: string,
  workflowDefinition: WorkflowFile,
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

/**
 * Generate YAML content for collection metadata (same as create command)
 */
function generateMetadataYaml(metadata: CollectionMetadata): string {
  const urlLine = metadata.url ? `url: "${metadata.url}"` : '';
  const notesLine = metadata.notes ? `notes: "${metadata.notes}"` : '';

  return `# Collection Metadata
collection_id: "${metadata.collection_id}"
workflow: "${metadata.workflow}"
status: "${metadata.status}"
date_created: "${metadata.date_created}"
date_modified: "${metadata.date_modified}"

# Application Details
company: "${metadata.company}"
role: "${metadata.role}"${urlLine ? `\n${urlLine}` : ''}${notesLine ? `\n${notesLine}` : ''}

# Status History
status_history:
  - status: "${metadata.status_history[0].status}"
    date: "${metadata.status_history[0].date}"

# Additional Fields
# Add custom fields here as needed
`;
}

export default updateCommand;
