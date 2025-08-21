/**
 * CLI-specific metadata utilities
 *
 * Provides CLI-specific metadata operations using the shared MetadataService.
 * Handles CLI-specific concerns like file path resolution and console output.
 * Business logic has been moved to MetadataService for sharing with the REST API.
 */

import { MetadataService } from '../../services/metadata-service';
import { NodeSystemInterface } from '../../engine/system-interface';
import type { CollectionMetadata } from '../../engine/types';

// Create system interface for file operations
const systemInterface = new NodeSystemInterface();

// Create metadata service instance
const metadataService = new MetadataService({ systemInterface });

/**
 * CLI wrapper: Generate YAML content for collection metadata
 * CLI prefers YAML format for readability
 */
export function generateMetadataYaml(metadata: CollectionMetadata): string {
  return metadataService.generateMetadataContent(metadata, 'yaml');
}

/**
 * CLI wrapper: Load collection metadata from collection.yml file
 * CLI uses YAML format by default
 */
export function loadCollectionMetadata(collectionPath: string): CollectionMetadata {
  return metadataService.loadCollectionMetadata(collectionPath, 'yaml');
}

/**
 * CLI wrapper: Save collection metadata to collection.yml file
 * CLI uses YAML format by default
 */
export function saveCollectionMetadata(collectionPath: string, metadata: CollectionMetadata): void {
  metadataService.saveCollectionMetadata(collectionPath, metadata, 'yaml');
}

/**
 * CLI wrapper: Update collection metadata with new values and save
 * CLI uses YAML format by default
 */
export function updateCollectionMetadata(
  collectionPath: string,
  updates: Partial<CollectionMetadata>,
): CollectionMetadata {
  return metadataService.updateCollectionMetadata(collectionPath, updates, 'yaml');
}

/**
 * CLI-specific: Create new metadata with CLI-friendly defaults
 */
export function createCollectionMetadata(
  collectionId: string,
  workflow: string,
  status: string,
  customFields: Record<string, unknown> = {},
): CollectionMetadata {
  return metadataService.createMetadata(collectionId, workflow, status, customFields);
}

/**
 * CLI-specific: Validate metadata and provide CLI-friendly error messages
 */
export function validateCollectionMetadata(
  metadata: Partial<CollectionMetadata>,
): asserts metadata is CollectionMetadata {
  try {
    metadataService.validateMetadata(metadata);
    // If validation passes, TypeScript assertion is satisfied
  } catch (error) {
    throw new Error(
      `Metadata validation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
