/**
 * File Resolution Service - Unified file resolution with project → system inheritance
 *
 * Consolidates all file resolution logic that follows the pattern:
 * 1. Check project workflows directory first: $project/.markdown-workflow/workflows/<workflow>/
 * 2. Fall back to system workflows directory: $system/workflows/<workflow>/
 *
 * Used for templates, reference documents, static files, and any other workflow-related files.
 */

import * as path from 'path';
import { SystemInterface } from '../engine/system-interface';

export interface FileResolutionOptions {
  systemRoot: string;
  workflowName: string;
  projectPaths?: { workflowsDir: string } | null;
}

export interface FileResolutionResult {
  /** The resolved absolute path to the file, or null if not found */
  path: string | null;
  /** Whether the file was found in project (true) or system (false) directory */
  fromProject: boolean;
}

export class FileResolutionService {
  private systemInterface: SystemInterface;

  constructor(systemInterface: SystemInterface) {
    this.systemInterface = systemInterface;
  }

  /**
   * Resolve file with project → system inheritance
   * @param relativePath - Path relative to workflow directory (e.g., "templates/resume/default.md", "templates/resume/reference.docx")
   * @param options - Resolution context
   * @param variant - Optional variant name for template files (e.g., "mobile" for "templates/resume/mobile.md")
   * @returns FileResolutionResult with path and source location
   */
  resolveWorkflowFile(
    relativePath: string,
    options: FileResolutionOptions,
    variant?: string,
  ): FileResolutionResult {
    // If variant is specified, modify the relative path to include variant
    let resolvedPath = relativePath;
    if (variant && variant !== 'default') {
      resolvedPath = this.buildVariantPath(relativePath, variant);
    }

    // Try project directory first
    if (options.projectPaths?.workflowsDir) {
      const projectPath = path.join(
        options.projectPaths.workflowsDir,
        options.workflowName,
        resolvedPath,
      );

      if (this.systemInterface.existsSync(projectPath)) {
        return { path: projectPath, fromProject: true };
      }
    }

    // Fall back to system directory
    const systemPath = path.join(
      options.systemRoot,
      'workflows',
      options.workflowName,
      resolvedPath,
    );

    if (this.systemInterface.existsSync(systemPath)) {
      return { path: systemPath, fromProject: false };
    }

    // If variant was requested but not found, try default variant
    if (variant && variant !== 'default') {
      return this.resolveWorkflowFile(relativePath, options, 'default');
    }

    return { path: null, fromProject: false };
  }

  /**
   * Convenience method that returns just the path (for backward compatibility)
   */
  resolveWorkflowFilePath(
    relativePath: string,
    options: FileResolutionOptions,
    variant?: string,
  ): string | null {
    return this.resolveWorkflowFile(relativePath, options, variant).path;
  }

  /**
   * Resolve multiple file candidates, returning the first one found
   * Useful for fallback scenarios or trying multiple extensions
   */
  resolveWorkflowFileFromCandidates(
    candidates: string[],
    options: FileResolutionOptions,
    variant?: string,
  ): FileResolutionResult {
    for (const candidate of candidates) {
      const result = this.resolveWorkflowFile(candidate, options, variant);
      if (result.path) {
        return result;
      }
    }
    return { path: null, fromProject: false };
  }

  /**
   * Get all available variants for a template file
   * Scans both project and system directories for variant files
   */
  getAvailableVariants(relativePath: string, options: FileResolutionOptions): string[] {
    const variants = new Set<string>();
    const parsedPath = path.parse(relativePath);

    // Get template directory path (e.g., "templates/resume")
    const templateDir = parsedPath.dir;

    // Check project workflows directory
    if (options.projectPaths?.workflowsDir) {
      const projectTemplateDir = path.join(
        options.projectPaths.workflowsDir,
        options.workflowName,
        templateDir,
      );

      this.scanDirectoryForVariants(projectTemplateDir, parsedPath, variants);
    }

    // Check system workflows directory
    const systemTemplateDir = path.join(
      options.systemRoot,
      'workflows',
      options.workflowName,
      templateDir,
    );

    this.scanDirectoryForVariants(systemTemplateDir, parsedPath, variants);

    return Array.from(variants).sort();
  }

  /**
   * Build variant path by replacing filename with variant version
   * E.g., "templates/resume/default.md" + "mobile" → "templates/resume/mobile.md"
   */
  private buildVariantPath(relativePath: string, variant: string): string {
    const parsedPath = path.parse(relativePath);
    const variantFileName = `${variant}${parsedPath.ext}`;
    return path.join(parsedPath.dir, variantFileName);
  }

  /**
   * Scan a directory for variant files and add them to the variants set
   */
  private scanDirectoryForVariants(
    directory: string,
    originalParsedPath: path.ParsedPath,
    variants: Set<string>,
  ): void {
    if (!this.systemInterface.existsSync(directory)) {
      return;
    }

    try {
      const files = this.systemInterface.readdirSync(directory);
      for (const file of files) {
        if (
          file.isFile() &&
          file.name.endsWith(originalParsedPath.ext) &&
          file.name !== originalParsedPath.base
        ) {
          const variant = path.parse(file.name).name;
          variants.add(variant);
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  /**
   * Resolve reference document for a template type
   * E.g., resolveReferenceDocument("resume", options) looks for "templates/resume/reference.docx"
   */
  resolveReferenceDocument(
    templateType: string,
    options: FileResolutionOptions,
  ): FileResolutionResult {
    const referencePath = `templates/${templateType}/reference.docx`;
    return this.resolveWorkflowFile(referencePath, options);
  }

  /**
   * Resolve static file (CSS, images, etc.)
   * E.g., resolveStaticFile("assets/style.css", options)
   */
  resolveStaticFile(staticPath: string, options: FileResolutionOptions): FileResolutionResult {
    return this.resolveWorkflowFile(staticPath, options);
  }
}
