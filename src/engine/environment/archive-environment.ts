/**
 * ArchiveEnvironment - Loads workflow resources from ZIP archives
 *
 * Provides Environment access to resources stored in ZIP files:
 * - Extracts and validates files from ZIP archives
 * - Applies security validation to all extracted content
 * - Supports both filesystem and in-memory ZIP sources
 * - Maintains resource structure and metadata
 */

import * as path from 'path';
import * as fs from 'fs';
import * as yauzl from 'yauzl';
import { Environment, EnvironmentManifest, TemplateRequest, StaticRequest } from './environment.js';
import {
  SecurityValidator,
  SecurityConfig,
  DEFAULT_SECURITY_CONFIG,
  FileInfo,
} from './security-validator.js';
import {
  ProjectConfig,
  WorkflowFile,
  ExternalProcessorDefinition,
  ExternalConverterDefinition,
  ProjectConfigSchema,
  WorkflowFileSchema,
  ExternalProcessorFileSchema,
  ExternalConverterFileSchema,
} from '../schemas.js';
import { ResourceNotFoundError, ValidationError, SecurityError } from './environment.js';
import * as YAML from 'yaml';

export interface ArchiveSource {
  /** Path to ZIP file on filesystem */
  filePath?: string;
  /** ZIP file content as Buffer */
  buffer?: Buffer;
  /** Base name for the archive (used for error messages) */
  name: string;
}

interface ExtractedFile {
  path: string;
  content: Buffer;
  size: number;
}

export class ArchiveEnvironment extends Environment {
  private source: ArchiveSource;
  private securityValidator: SecurityValidator;
  private extractedFiles: Map<string, ExtractedFile> = new Map();
  private manifestCache?: EnvironmentManifest;
  private initialized = false;

  constructor(source: ArchiveSource, securityConfig: SecurityConfig = DEFAULT_SECURITY_CONFIG) {
    super();
    this.source = source;
    this.securityValidator = new SecurityValidator(securityConfig);
  }

  /**
   * Initialize the archive environment by extracting and validating all files
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.extractArchive();
      await this.validateExtractedFiles();
      this.initialized = true;
    } catch (error) {
      throw new ValidationError(
        `Failed to initialize archive environment from ${this.source.name}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get project configuration
   */
  async getConfig(): Promise<ProjectConfig | null> {
    await this.initialize();

    const configFile =
      this.extractedFiles.get('config.yml') || this.extractedFiles.get('config.yaml');
    if (!configFile) {
      return null;
    }

    try {
      const content = configFile.content.toString('utf-8');
      const parsed = YAML.parse(content);

      const result = ProjectConfigSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError(`Invalid project config: ${result.error.message}`);
      }

      return result.data;
    } catch (error) {
      throw new ValidationError(
        `Failed to parse config from archive: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get workflow definition by name
   */
  async getWorkflow(name: string): Promise<WorkflowFile> {
    await this.initialize();

    const workflowPath = `workflows/${name}/workflow.yml`;
    const workflowFile = this.extractedFiles.get(workflowPath);

    if (!workflowFile) {
      throw new ResourceNotFoundError('Workflow', name);
    }

    try {
      const content = workflowFile.content.toString('utf-8');
      const parsed = YAML.parse(content);

      const result = WorkflowFileSchema.safeParse(parsed);
      if (!result.success) {
        throw new ValidationError(
          `Invalid workflow definition for ${name}: ${result.error.message}`,
        );
      }

      return result.data;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ResourceNotFoundError('Workflow', name, error instanceof Error ? error : undefined);
    }
  }

  /**
   * List available workflows
   */
  async listWorkflows(): Promise<string[]> {
    await this.initialize();

    const workflows = new Set<string>();

    for (const filePath of this.extractedFiles.keys()) {
      if (filePath.startsWith('workflows/') && filePath.endsWith('/workflow.yml')) {
        const pathParts = filePath.split('/');
        if (pathParts.length === 3) {
          workflows.add(pathParts[1]);
        }
      }
    }

    return Array.from(workflows).sort();
  }

  /**
   * Get external processor definitions
   */
  async getProcessorDefinitions(): Promise<ExternalProcessorDefinition[]> {
    await this.initialize();

    const processors: ExternalProcessorDefinition[] = [];

    for (const [filePath, file] of this.extractedFiles.entries()) {
      if (filePath.startsWith('processors/') && filePath.endsWith('.yml')) {
        try {
          const content = file.content.toString('utf-8');
          const parsed = YAML.parse(content);

          const result = ExternalProcessorFileSchema.safeParse(parsed);
          if (result.success) {
            processors.push(result.data.processor);
          } else {
            console.warn(`Invalid processor file ${filePath}:`, result.error.message);
          }
        } catch (error) {
          console.warn(`Failed to parse processor file ${filePath}:`, error);
        }
      }
    }

    return processors;
  }

  /**
   * Get external converter definitions
   */
  async getConverterDefinitions(): Promise<ExternalConverterDefinition[]> {
    await this.initialize();

    const converters: ExternalConverterDefinition[] = [];

    for (const [filePath, file] of this.extractedFiles.entries()) {
      if (filePath.startsWith('converters/') && filePath.endsWith('.yml')) {
        try {
          const content = file.content.toString('utf-8');
          const parsed = YAML.parse(content);

          const result = ExternalConverterFileSchema.safeParse(parsed);
          if (result.success) {
            converters.push(result.data.converter);
          } else {
            console.warn(`Invalid converter file ${filePath}:`, result.error.message);
          }
        } catch (error) {
          console.warn(`Failed to parse converter file ${filePath}:`, error);
        }
      }
    }

    return converters;
  }

  /**
   * Get template content
   */
  async getTemplate(request: TemplateRequest): Promise<string> {
    await this.initialize();

    const templatePath = this.resolveTemplatePath(request);
    const templateFile = this.extractedFiles.get(templatePath);

    if (!templateFile) {
      throw new ResourceNotFoundError('Template', this.buildTemplateKey(request));
    }

    return templateFile.content.toString('utf-8');
  }

  /**
   * Get static file content
   */
  async getStatic(request: StaticRequest): Promise<Buffer> {
    await this.initialize();

    const staticPath = this.resolveStaticPath(request);
    const staticFile = this.extractedFiles.get(staticPath);

    if (!staticFile) {
      throw new ResourceNotFoundError('Static', `${request.workflow}/${request.static}`);
    }

    return staticFile.content;
  }

  /**
   * Check if template exists
   */
  async hasTemplate(request: TemplateRequest): Promise<boolean> {
    await this.initialize();

    const templatePath = this.resolveTemplatePath(request);
    return this.extractedFiles.has(templatePath);
  }

  /**
   * Check if static file exists
   */
  async hasStatic(request: StaticRequest): Promise<boolean> {
    await this.initialize();

    const staticPath = this.resolveStaticPath(request);
    return this.extractedFiles.has(staticPath);
  }

  /**
   * Get environment manifest
   */
  async getManifest(): Promise<EnvironmentManifest> {
    if (this.manifestCache) {
      return this.manifestCache;
    }

    await this.initialize();

    const workflows = await this.listWorkflows();
    const processors = await this.getProcessorDefinitions();
    const converters = await this.getConverterDefinitions();

    const manifest: EnvironmentManifest = {
      workflows,
      processors: processors.map((p) => p.name),
      converters: converters.map((c) => c.name),
      templates: {},
      statics: {},
      hasConfig: (await this.getConfig()) !== null,
    };

    // Build templates and statics maps
    for (const workflow of workflows) {
      manifest.templates[workflow] = this.getTemplateNamesForWorkflow(workflow);
      manifest.statics[workflow] = this.getStaticNamesForWorkflow(workflow);
    }

    this.manifestCache = manifest;
    return manifest;
  }

  /**
   * Extract ZIP archive to memory
   */
  private async extractArchive(): Promise<void> {
    const buffer = await this.getArchiveBuffer();

    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(new Error(`Failed to open ZIP archive: ${err.message}`));
          return;
        }

        if (!zipfile) {
          reject(new Error('Failed to open ZIP archive: No zipfile returned'));
          return;
        }

        const extractedFiles = new Map<string, ExtractedFile>();
        let pendingEntries = 0;

        zipfile.on('entry', (entry) => {
          // Skip directories
          if (entry.fileName.endsWith('/')) {
            zipfile.readEntry();
            return;
          }

          // Normalize file path (remove leading slash, use forward slashes)
          const normalizedPath = entry.fileName.replace(/^\/+/, '').replace(/\\/g, '/');

          // Validate file path for security
          try {
            this.securityValidator.validatePath(normalizedPath);
            this.securityValidator.validateFilename(path.basename(normalizedPath));
          } catch (error) {
            console.warn(`Skipping invalid file path ${normalizedPath}: ${error}`);
            zipfile.readEntry();
            return;
          }

          pendingEntries++;

          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              console.warn(`Failed to read ${normalizedPath}: ${err.message}`);
              pendingEntries--;
              checkComplete();
              zipfile.readEntry();
              return;
            }

            if (!readStream) {
              console.warn(`No read stream for ${normalizedPath}`);
              pendingEntries--;
              checkComplete();
              zipfile.readEntry();
              return;
            }

            const chunks: Buffer[] = [];

            readStream.on('data', (chunk) => {
              chunks.push(chunk);
            });

            readStream.on('end', () => {
              const content = Buffer.concat(chunks);

              // Validate file size
              const extension = path.extname(normalizedPath).toLowerCase();
              try {
                this.securityValidator.validateFileSize(extension, content.length);
              } catch (error) {
                console.warn(`Skipping oversized file ${normalizedPath}: ${error}`);
                pendingEntries--;
                checkComplete();
                zipfile.readEntry();
                return;
              }

              extractedFiles.set(normalizedPath, {
                path: normalizedPath,
                content,
                size: content.length,
              });

              pendingEntries--;
              checkComplete();
              zipfile.readEntry();
            });

            readStream.on('error', (error) => {
              console.warn(`Error reading ${normalizedPath}: ${error.message}`);
              pendingEntries--;
              checkComplete();
              zipfile.readEntry();
            });
          });
        });

        zipfile.on('end', () => {
          checkComplete();
        });

        zipfile.on('error', (error) => {
          reject(new Error(`ZIP extraction error: ${error.message}`));
        });

        const checkComplete = () => {
          if (pendingEntries === 0 && zipfile.entriesRead === zipfile.entryCount) {
            this.extractedFiles = extractedFiles;
            resolve();
          }
        };

        // Start reading entries
        zipfile.readEntry();
      });
    });
  }

  /**
   * Get archive buffer from source
   */
  private async getArchiveBuffer(): Promise<Buffer> {
    if (this.source.buffer) {
      return this.source.buffer;
    }

    if (this.source.filePath) {
      try {
        return await fs.promises.readFile(this.source.filePath);
      } catch (error) {
        throw new Error(
          `Failed to read ZIP file ${this.source.filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    throw new Error('Archive source must provide either filePath or buffer');
  }

  /**
   * Validate all extracted files using security validator
   */
  private async validateExtractedFiles(): Promise<void> {
    const fileInfos: FileInfo[] = [];

    for (const [filePath, file] of this.extractedFiles.entries()) {
      const extension = path.extname(filePath).toLowerCase();

      fileInfos.push({
        name: path.basename(filePath),
        path: filePath,
        extension,
        size: file.size,
        content: file.content,
      });
    }

    // Validate all files as a collection
    this.securityValidator.validateFiles(fileInfos);

    // Validate individual file content
    for (const fileInfo of fileInfos) {
      if (['.yml', '.yaml', '.json'].includes(fileInfo.extension)) {
        const content = fileInfo.content.toString('utf-8');
        this.securityValidator.validateContent(fileInfo.path, content);
      }
    }
  }

  /**
   * Resolve template file path within the archive
   */
  private resolveTemplatePath(request: TemplateRequest): string {
    const basePath = `workflows/${request.workflow}/templates/${request.template}`;

    if (request.variant) {
      // Try variant-specific path first
      const variantPath = `${basePath}/${request.variant}.md`;
      if (this.extractedFiles.has(variantPath)) {
        return variantPath;
      }
    }

    // Fall back to default template
    return `${basePath}/default.md`;
  }

  /**
   * Resolve static file path within the archive
   */
  private resolveStaticPath(request: StaticRequest): string {
    // Try in static directory first
    const staticPath = `workflows/${request.workflow}/templates/static/${request.static}`;
    if (this.extractedFiles.has(staticPath)) {
      return staticPath;
    }

    // Fall back to root of templates directory
    return `workflows/${request.workflow}/templates/${request.static}`;
  }

  /**
   * Get template names for a specific workflow
   */
  private getTemplateNamesForWorkflow(workflow: string): string[] {
    const templateNames = new Set<string>();
    const prefix = `workflows/${workflow}/templates/`;

    for (const filePath of this.extractedFiles.keys()) {
      if (filePath.startsWith(prefix) && filePath.endsWith('.md')) {
        const relativePath = filePath.slice(prefix.length);

        // Skip static files
        if (relativePath.startsWith('static/')) {
          continue;
        }

        // Extract template name (first directory component)
        const parts = relativePath.split('/');
        if (parts.length >= 1) {
          templateNames.add(parts[0]);
        }
      }
    }

    return Array.from(templateNames).sort();
  }

  /**
   * Get static file names for a specific workflow
   */
  private getStaticNamesForWorkflow(workflow: string): string[] {
    const staticNames: string[] = [];
    const prefix = `workflows/${workflow}/templates/static/`;

    for (const filePath of this.extractedFiles.keys()) {
      if (filePath.startsWith(prefix)) {
        staticNames.push(filePath.slice(prefix.length));
      }
    }

    return staticNames.sort();
  }

  /**
   * Build template key for identification
   */
  private buildTemplateKey(request: TemplateRequest): string {
    if (request.variant) {
      return `${request.workflow}/${request.template}/${request.variant}`;
    }
    return `${request.workflow}/${request.template}`;
  }
}
