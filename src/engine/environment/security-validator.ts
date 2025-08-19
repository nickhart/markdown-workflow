/**
 * Security Validator - File validation and sanitization for Environment system
 *
 * Provides security validation for files being loaded into environments:
 * - File size validation per extension
 * - Filename sanitization
 * - Path traversal protection
 * - Extension allowlist checking
 * - Content validation
 */

import * as path from 'path';
import * as YAML from 'yaml';
import {
  ProjectConfigSchema,
  WorkflowFileSchema,
  ExternalProcessorFileSchema,
  ExternalConverterFileSchema,
} from '../schemas.js';
import { SecurityError, ValidationError } from './environment.js';

export interface SecurityConfig {
  fileSizeLimits: Record<string, number>; // extension -> max size in bytes
  allowedExtensions: string[];
  maxFileCount: number;
  maxTotalSize: number;
  maxArchiveDepth: number;
  enableContentValidation: boolean;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  fileSizeLimits: {
    // Text files - 100KB
    '.yml': 100 * 1024,
    '.yaml': 100 * 1024,
    '.json': 100 * 1024,
    '.md': 100 * 1024,
    '.markdown': 100 * 1024,
    // Images - 500KB
    '.png': 500 * 1024,
    '.jpg': 500 * 1024,
    '.jpeg': 500 * 1024,
    '.svg': 500 * 1024,
    // Documents - 1MB
    '.docx': 1024 * 1024,
    '.pdf': 1024 * 1024,
  },
  allowedExtensions: [
    '.yml',
    '.yaml',
    '.json',
    '.md',
    '.markdown',
    '.png',
    '.jpg',
    '.jpeg',
    '.svg',
    '.docx',
    '.pdf',
  ],
  maxFileCount: 500,
  maxTotalSize: 5 * 1024 * 1024, // 5MB
  maxArchiveDepth: 3,
  enableContentValidation: true,
};

export interface FileInfo {
  name: string;
  path: string;
  extension: string;
  size: number;
  content: Buffer;
}

export class SecurityValidator {
  constructor(private config: SecurityConfig = DEFAULT_SECURITY_CONFIG) {}

  /**
   * Validate a single file
   */
  validateFile(fileInfo: FileInfo): void {
    this.validateFilename(fileInfo.name);
    this.validatePath(fileInfo.path);
    this.validateExtension(fileInfo.extension);
    this.validateFileSize(fileInfo.extension, fileInfo.size);
  }

  /**
   * Validate a collection of files
   */
  validateFiles(files: FileInfo[]): void {
    if (files.length > this.config.maxFileCount) {
      throw new SecurityError(
        `Too many files: ${files.length} exceeds limit of ${this.config.maxFileCount}`,
      );
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > this.config.maxTotalSize) {
      throw new SecurityError(
        `Total file size ${totalSize} bytes exceeds limit of ${this.config.maxTotalSize} bytes`,
      );
    }

    for (const file of files) {
      this.validateFile(file);
    }
  }

  /**
   * Sanitize and validate filename
   */
  validateFilename(filename: string): void {
    if (!filename || filename.trim() === '') {
      throw new SecurityError('Empty filename not allowed');
    }

    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('./') || filename.includes('.\\')) {
      throw new SecurityError(`Path traversal attempt in filename: ${filename}`);
    }

    // Check for absolute paths
    if (path.isAbsolute(filename)) {
      throw new SecurityError(`Absolute path not allowed: ${filename}`);
    }

    // Check for dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(filename)) {
      throw new SecurityError(`Filename contains dangerous characters: ${filename}`);
    }

    // Check filename length
    if (filename.length > 255) {
      throw new SecurityError(`Filename too long: ${filename.length} chars, max 255`);
    }
  }

  /**
   * Validate file path (relative to environment root)
   */
  validatePath(filePath: string): void {
    // Check for path traversal attempts before normalization
    if (filePath.includes('..')) {
      throw new SecurityError(`Invalid file path: ${filePath}`);
    }

    // Check for absolute paths (both Unix and Windows style)
    if (path.isAbsolute(filePath) || /^[A-Za-z]:/.test(filePath)) {
      throw new SecurityError(`Invalid file path: ${filePath}`);
    }

    // Normalize and check again after normalization
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
      throw new SecurityError(`Invalid file path: ${filePath}`);
    }

    // Check for reasonable path depth
    const depth = normalizedPath.split(path.sep).length;
    if (depth > this.config.maxArchiveDepth + 2) {
      // +2 for workflow/templates structure
      throw new SecurityError(
        `File path too deep: ${depth} levels, max ${this.config.maxArchiveDepth + 2}`,
      );
    }
  }

  /**
   * Validate file extension against allowlist
   */
  validateExtension(extension: string): void {
    if (!this.config.allowedExtensions.includes(extension.toLowerCase())) {
      throw new SecurityError(
        `File extension not allowed: ${extension}. Allowed: ${this.config.allowedExtensions.join(', ')}`,
      );
    }
  }

  /**
   * Validate file size based on extension
   */
  validateFileSize(extension: string, size: number): void {
    const limit = this.config.fileSizeLimits[extension.toLowerCase()];
    if (limit && size > limit) {
      throw new SecurityError(
        `File size ${size} bytes exceeds limit for ${extension}: ${limit} bytes`,
      );
    }
  }

  /**
   * Validate and parse YAML/JSON content
   */
  validateContent(filePath: string, content: string): unknown {
    if (!this.config.enableContentValidation) {
      return null;
    }

    const extension = path.extname(filePath).toLowerCase();

    try {
      switch (extension) {
        case '.yml':
        case '.yaml':
          return this.validateYAMLContent(filePath, content);
        case '.json':
          return this.validateJSONContent(filePath, content);
        case '.md':
        case '.markdown':
          return this.validateMarkdownContent(filePath, content);
        default:
          return null; // No content validation for other file types
      }
    } catch (error) {
      throw new ValidationError(
        `Content validation failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Validate YAML content and check against schemas
   */
  private validateYAMLContent(filePath: string, content: string): unknown {
    const parsed = YAML.parse(content);

    // Determine what type of YAML this should be based on file path
    if (filePath.includes('config.yml') || filePath.endsWith('config.yml')) {
      const result = ProjectConfigSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError(`Invalid project config: ${result.error.message}`);
      }
      return result.data;
    }

    if (filePath.includes('workflow.yml') || filePath.endsWith('workflow.yml')) {
      const result = WorkflowFileSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError(`Invalid workflow definition: ${result.error.message}`);
      }
      return result.data;
    }

    if (filePath.includes('processors/')) {
      const result = ExternalProcessorFileSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError(`Invalid processor definition: ${result.error.message}`);
      }
      return result.data;
    }

    if (filePath.includes('converters/')) {
      const result = ExternalConverterFileSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError(`Invalid converter definition: ${result.error.message}`);
      }
      return result.data;
    }

    // Generic YAML - just validate it parses
    return parsed;
  }

  /**
   * Validate JSON content
   */
  private validateJSONContent(filePath: string, content: string): unknown {
    return JSON.parse(content); // Will throw if invalid JSON
  }

  /**
   * Basic markdown validation
   */
  private validateMarkdownContent(filePath: string, content: string): null {
    // Basic checks for markdown content
    if (content.length === 0) {
      throw new ValidationError('Empty markdown file');
    }

    // Check for reasonable markdown structure (optional)
    // For now, just ensure it's valid UTF-8 and not empty
    return null;
  }

  /**
   * Sanitize filename for safe filesystem usage
   */
  sanitizeFilename(filename: string): string {
    // Replace unsafe characters with underscores
    return filename.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim();
  }

  /**
   * Create a security config with custom overrides
   */
  static createConfig(overrides: Partial<SecurityConfig>): SecurityConfig {
    return {
      ...DEFAULT_SECURITY_CONFIG,
      ...overrides,
      fileSizeLimits: {
        ...DEFAULT_SECURITY_CONFIG.fileSizeLimits,
        ...(overrides.fileSizeLimits || {}),
      },
    };
  }
}
