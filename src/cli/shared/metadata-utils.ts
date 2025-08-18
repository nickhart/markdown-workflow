/**
 * Shared metadata handling utilities for CLI commands
 */

import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import type { CollectionMetadata } from '../../engine/types.js';

/**
 * Generate YAML content for collection metadata
 * Dynamic generation based on actual metadata fields
 */
export function generateMetadataYaml(metadata: CollectionMetadata): string {
  // Core required fields that all workflows have
  const coreFields = [
    'collection_id',
    'workflow',
    'status',
    'date_created',
    'date_modified',
    'status_history',
  ];

  // Separate custom fields from core fields
  const customFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!coreFields.includes(key) && value !== undefined) {
      customFields[key] = value;
    }
  }

  // Build the YAML sections
  let yamlContent = `# Collection Metadata
collection_id: "${metadata.collection_id}"
workflow: "${metadata.workflow}"
status: "${metadata.status}"
date_created: "${metadata.date_created}"
date_modified: "${metadata.date_modified}"
`;

  // Add workflow-specific fields if they exist
  if (Object.keys(customFields).length > 0) {
    yamlContent += '\n# Workflow Details\n';
    for (const [key, value] of Object.entries(customFields)) {
      if (typeof value === 'string') {
        yamlContent += `${key}: "${value}"\n`;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        yamlContent += `${key}: ${value}\n`;
      } else if (Array.isArray(value)) {
        yamlContent += `${key}: [${value.map((v) => `"${v}"`).join(', ')}]\n`;
      }
    }
  }

  // Add status history
  yamlContent += `\n# Status History
status_history:
  - status: "${metadata.status_history[0].status}"
    date: "${metadata.status_history[0].date}"

# Additional Fields
# Add custom fields here as needed
`;

  return yamlContent;
}

/**
 * Load collection metadata from collection.yml file
 */
export function loadCollectionMetadata(collectionPath: string): CollectionMetadata {
  const metadataPath = path.join(collectionPath, 'collection.yml');

  if (!fs.existsSync(metadataPath)) {
    throw new Error(`Collection metadata not found: ${metadataPath}`);
  }

  try {
    const metadataContent = fs.readFileSync(metadataPath, 'utf8');
    const metadata = YAML.parse(metadataContent) as CollectionMetadata;

    // Basic validation
    if (!metadata.collection_id || !metadata.workflow || !metadata.status) {
      throw new Error('Invalid metadata: missing required fields');
    }

    return metadata;
  } catch (error) {
    throw new Error(`Failed to load collection metadata: ${error}`);
  }
}

/**
 * Save collection metadata to collection.yml file
 */
export function saveCollectionMetadata(collectionPath: string, metadata: CollectionMetadata): void {
  const metadataPath = path.join(collectionPath, 'collection.yml');
  const content = generateMetadataYaml(metadata);

  try {
    fs.writeFileSync(metadataPath, content);
  } catch (error) {
    throw new Error(`Failed to save collection metadata: ${error}`);
  }
}

/**
 * Update collection metadata with new values and save
 */
export function updateCollectionMetadata(
  collectionPath: string,
  updates: Partial<CollectionMetadata>,
): CollectionMetadata {
  const metadata = loadCollectionMetadata(collectionPath);

  // Apply updates
  const updatedMetadata: CollectionMetadata = {
    ...metadata,
    ...updates,
    date_modified: new Date().toISOString(),
  };

  saveCollectionMetadata(collectionPath, updatedMetadata);
  return updatedMetadata;
}
