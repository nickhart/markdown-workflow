import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import {
  generateMetadataYaml,
  loadCollectionMetadata,
  saveCollectionMetadata,
  updateCollectionMetadata,
} from '../../../src/cli/shared/metadata-utils.js';
import type { CollectionMetadata } from '../../../src/core/types.js';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('yaml');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockYAML = YAML as jest.Mocked<typeof YAML>;

describe('Metadata Utils', () => {
  const mockMetadata: CollectionMetadata = {
    collection_id: 'test_company_engineer_20250121',
    workflow: 'job',
    status: 'active',
    date_created: '2025-01-21T10:00:00.000Z',
    date_modified: '2025-01-21T10:00:00.000Z',
    status_history: [
      {
        status: 'active',
        date: '2025-01-21T10:00:00.000Z',
      },
    ],
    company: 'Test Company',
    role: 'Engineer',
    url: 'https://example.com/job',
    notes: 'Initial notes',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup path mocks
    mockPath.join.mockImplementation((...args) => args.join('/'));

    // Setup console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  describe('generateMetadataYaml', () => {
    it('should generate YAML with all fields including URL and notes', () => {
      const result = generateMetadataYaml(mockMetadata);

      expect(result).toContain('collection_id: "test_company_engineer_20250121"');
      expect(result).toContain('workflow: "job"');
      expect(result).toContain('status: "active"');
      expect(result).toContain('company: "Test Company"');
      expect(result).toContain('role: "Engineer"');
      expect(result).toContain('url: "https://example.com/job"');
      expect(result).toContain('notes: "Initial notes"');
      expect(result).toContain('status_history:');
      expect(result).toContain('- status: "active"');
    });

    it('should generate YAML without optional URL field', () => {
      const metadataWithoutUrl = { ...mockMetadata };
      delete metadataWithoutUrl.url;

      const result = generateMetadataYaml(metadataWithoutUrl);

      expect(result).not.toContain('url:');
      expect(result).toContain('company: "Test Company"');
      expect(result).toContain('role: "Engineer"');
    });

    it('should generate YAML without optional notes field', () => {
      const metadataWithoutNotes = { ...mockMetadata };
      delete metadataWithoutNotes.notes;

      const result = generateMetadataYaml(metadataWithoutNotes);

      expect(result).not.toContain('notes:');
      expect(result).toContain('company: "Test Company"');
      expect(result).toContain('role: "Engineer"');
    });

    it('should generate YAML without both optional fields', () => {
      const minimalMetadata = { ...mockMetadata };
      delete minimalMetadata.url;
      delete minimalMetadata.notes;

      const result = generateMetadataYaml(minimalMetadata);

      expect(result).not.toContain('url:');
      expect(result).not.toContain('notes:');
      expect(result).toContain('role: "Engineer"');
    });
  });

  describe('loadCollectionMetadata', () => {
    it('should load and parse metadata successfully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYAML.parse.mockReturnValue(mockMetadata);

      const result = loadCollectionMetadata('/collection/path');

      expect(mockPath.join).toHaveBeenCalledWith('/collection/path', 'collection.yml');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/collection/path/collection.yml');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/collection/path/collection.yml', 'utf8');
      expect(mockYAML.parse).toHaveBeenCalledWith('yaml content');
      expect(result).toBe(mockMetadata);
    });

    it('should throw error if metadata file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => loadCollectionMetadata('/collection/path')).toThrow(
        'Collection metadata not found: /collection/path/collection.yml',
      );
    });

    it('should throw error if metadata is missing required fields', () => {
      const invalidMetadata = { ...mockMetadata };
      delete invalidMetadata.collection_id;

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYAML.parse.mockReturnValue(invalidMetadata);

      expect(() => loadCollectionMetadata('/collection/path')).toThrow(
        'Invalid metadata: missing required fields',
      );
    });

    it('should handle YAML parsing errors', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYAML.parse.mockImplementation(() => {
        throw new Error('YAML parsing failed');
      });

      expect(() => loadCollectionMetadata('/collection/path')).toThrow(
        'Failed to load collection metadata: Error: YAML parsing failed',
      );
    });
  });

  describe('saveCollectionMetadata', () => {
    it('should save metadata to YAML file', () => {
      saveCollectionMetadata('/collection/path', mockMetadata);

      expect(mockPath.join).toHaveBeenCalledWith('/collection/path', 'collection.yml');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/collection/path/collection.yml',
        expect.any(String),
      );
    });

    it('should handle file write errors', () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });

      expect(() => saveCollectionMetadata('/collection/path', mockMetadata)).toThrow(
        'Failed to save collection metadata: Error: Write failed',
      );
    });
  });

  describe('updateCollectionMetadata', () => {
    beforeEach(() => {
      // Mock Date.now() for consistent testing
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-22T10:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should update metadata and save to file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYAML.parse.mockReturnValue(mockMetadata);
      mockFs.writeFileSync.mockImplementation(() => {}); // Don't throw error

      const updates = { company: 'Updated Company', notes: 'Updated notes' };
      const result = updateCollectionMetadata('/collection/path', updates);

      expect(result.company).toBe('Updated Company');
      expect(result.notes).toBe('Updated notes');
      expect(result.date_modified).toBe('2025-01-22T10:00:00.000Z');
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should preserve existing fields when updating', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYAML.parse.mockReturnValue(mockMetadata);
      mockFs.writeFileSync.mockImplementation(() => {}); // Don't throw error

      const updates = { company: 'Updated Company' };
      const result = updateCollectionMetadata('/collection/path', updates);

      expect(result.company).toBe('Updated Company');
      expect(result.role).toBe('Engineer'); // Should preserve existing
      expect(result.collection_id).toBe('test_company_engineer_20250121'); // Should preserve existing
    });
  });
});
