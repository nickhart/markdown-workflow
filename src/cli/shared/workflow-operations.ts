/**
 * Shared workflow operations extracted from CLI commands
 */

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { WorkflowFileSchema, type WorkflowFile } from '../../core/schemas.js';
import { scrapeUrl } from '../../shared/web-scraper.js';

/**
 * Load and validate a workflow definition from the system workflows directory
 * Extracted from create.ts and update.ts (exact duplicates)
 */
export async function loadWorkflowDefinition(
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
 * Scrape URL for collection using workflow configuration
 * Extracted from create.ts and update.ts (exact duplicates)
 */
export async function scrapeUrlForCollection(
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
  // TODO: make this configurable in workflow definition
  let outputFile = 'job_description.html'; // default fallback

  if (scrapeAction?.parameters) {
    const outputParam = scrapeAction.parameters.find((p) => p.name === 'output_file');
    if (outputParam?.default && typeof outputParam.default === 'string') {
      outputFile = outputParam.default;
    }
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
    }
  } catch (error) {
    console.error(`❌ Scraping error: ${error}`);
  }
}

/**
 * Find the full path to a collection by ID within a workflow
 * Generalized from update.ts findCollectionPath
 */
export async function findCollectionPath(
  systemRoot: string,
  projectRoot: string,
  workflowName: string,
  collectionId: string,
): Promise<string> {
  const workflowDefinition = await loadWorkflowDefinition(systemRoot, workflowName);

  // Check each stage directory for the collection
  for (const stage of workflowDefinition.workflow.stages) {
    const stagePath = path.join(projectRoot, workflowName, stage.name, collectionId);
    if (fs.existsSync(stagePath)) {
      return stagePath;
    }
  }

  throw new Error(
    `Collection '${collectionId}' not found in any stage of workflow '${workflowName}'`,
  );
}
