/**
 * Metadata Service - Domain service for collection metadata management
 *
 * Provides shared metadata operations including generation, validation, loading,
 * and persistence for both CLI and API interfaces. Supports both YAML and JSON formats.
 */

import * as path from 'path';
import * as YAML from 'yaml';
import type { CollectionMetadata } from '../engine/types';
import type { SystemInterface } from '../engine/system-interface';

export interface MetadataServiceOptions {
  systemInterface: SystemInterface;
}

export type MetadataFormat = 'yaml' | 'json';

/**
 * Service for managing collection metadata operations
 */
export class MetadataService {
  private systemInterface: SystemInterface;

  constructor(options: MetadataServiceOptions) {
    this.systemInterface = options.systemInterface;
  }

  /**
   * Generate metadata content in specified format
   * Supports both YAML (CLI) and JSON (API) formats
   */
  generateMetadataContent(metadata: CollectionMetadata, format: MetadataFormat = 'yaml'): string {
    if (format === 'json') {
      return JSON.stringify(metadata, null, 2);
    }

    // Generate YAML format with structured sections
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
   * Load collection metadata from collection file
   * Supports both YAML and JSON formats
   */
  loadCollectionMetadata(
    collectionPath: string,
    format: MetadataFormat = 'yaml',
  ): CollectionMetadata {
    const fileName = format === 'json' ? 'collection.json' : 'collection.yml';
    const metadataPath = path.join(collectionPath, fileName);

    if (!this.systemInterface.existsSync(metadataPath)) {
      throw new Error(`Collection metadata not found: ${metadataPath}`);
    }

    try {
      const metadataContent = this.systemInterface.readFileSync(metadataPath);

      let metadata: CollectionMetadata;
      if (format === 'json') {
        metadata = JSON.parse(metadataContent) as CollectionMetadata;
      } else {
        metadata = YAML.parse(metadataContent) as CollectionMetadata;
      }

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
   * Save collection metadata to collection file
   * Supports both YAML and JSON formats
   */
  saveCollectionMetadata(
    collectionPath: string,
    metadata: CollectionMetadata,
    format: MetadataFormat = 'yaml',
  ): void {
    const fileName = format === 'json' ? 'collection.json' : 'collection.yml';
    const metadataPath = path.join(collectionPath, fileName);
    const content = this.generateMetadataContent(metadata, format);

    try {
      this.systemInterface.writeFileSync(metadataPath, content);
    } catch (error) {
      throw new Error(`Failed to save collection metadata: ${error}`);
    }
  }

  /**
   * Update collection metadata with new values and save
   * Supports both YAML and JSON formats
   */
  updateCollectionMetadata(
    collectionPath: string,
    updates: Partial<CollectionMetadata>,
    format: MetadataFormat = 'yaml',
  ): CollectionMetadata {
    const metadata = this.loadCollectionMetadata(collectionPath, format);

    // Apply updates
    const updatedMetadata: CollectionMetadata = {
      ...metadata,
      ...updates,
      date_modified: new Date().toISOString(),
    };

    this.saveCollectionMetadata(collectionPath, updatedMetadata, format);
    return updatedMetadata;
  }

  /**
   * Validate metadata structure and required fields
   * Shared validation logic for both CLI and API
   */
  validateMetadata(metadata: Partial<CollectionMetadata>): boolean {
    const requiredFields = ['collection_id', 'workflow', 'status'];

    for (const field of requiredFields) {
      if (!metadata[field as keyof CollectionMetadata]) {
        throw new Error(`Invalid metadata: missing required field '${field}'`);
      }
    }

    if (!metadata.status_history || !Array.isArray(metadata.status_history)) {
      throw new Error('Invalid metadata: status_history must be an array');
    }

    if (metadata.status_history.length === 0) {
      throw new Error('Invalid metadata: status_history cannot be empty');
    }

    return true;
  }

  /**
   * Create new metadata structure with defaults
   * Shared metadata creation logic for both CLI and API
   */
  createMetadata(
    collectionId: string,
    workflow: string,
    status: string,
    customFields: Record<string, unknown> = {},
  ): CollectionMetadata {
    const now = new Date().toISOString();

    return {
      collection_id: collectionId,
      workflow,
      status,
      date_created: now,
      date_modified: now,
      status_history: [
        {
          status,
          date: now,
        },
      ],
      ...customFields,
    };
  }
}
