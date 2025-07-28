/**
 * Shared template processing utilities for CLI commands
 * Handles template resolution, inheritance, and variable substitution
 */

import * as fs from 'fs';
import * as path from 'path';
import Mustache from 'mustache';
import { ConfigDiscovery } from '../../core/config-discovery.js';
import { WorkflowTemplate } from '../../core/types.js';
import { type ProjectConfig } from '../../core/schemas.js';
import { formatDate, getCurrentDate } from '../../shared/date-utils.js';
import { sanitizeForFilename } from '../../shared/file-utils.js';
import { logTemplateUsage, logFileCreation, logWarning, logError } from './formatting-utils.js';

export interface TemplateProcessingOptions {
  systemRoot: string;
  workflowName: string;
  variables: Record<string, string>;
  projectConfig?: ProjectConfig | null;
  projectPaths?: { workflowsDir: string; configFile: string } | null;
}

export interface TemplateResolutionOptions {
  systemRoot: string;
  workflowName: string;
  templateVariant?: string;
  projectPaths?: { workflowsDir: string } | null;
}

/**
 * Template processor class containing all template-related operations
 */
export class TemplateProcessor {
  /**
   * Process a template file with variable substitution
   * Implements template inheritance: project templates override system templates
   */
  static async processTemplate(
    template: WorkflowTemplate,
    collectionPath: string,
    options: TemplateProcessingOptions,
  ): Promise<void> {
    // Load user configuration if project paths are available
    let userConfig = null;
    if (options.projectPaths?.configFile && fs.existsSync(options.projectPaths.configFile)) {
      const configDiscovery = new ConfigDiscovery();
      const config = await configDiscovery.loadProjectConfig(options.projectPaths.configFile);
      userConfig = config?.user;
    }

    // Resolve template path with inheritance: project templates override system templates
    const resolvedTemplatePath = this.resolveTemplatePath(template, {
      systemRoot: options.systemRoot,
      workflowName: options.workflowName,
      templateVariant: options.variables.template_variant,
      projectPaths: options.projectPaths,
    });

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
      const userConfigForTemplate = userConfig || this.getDefaultUserConfig();
      const templateVariables = {
        ...options.variables,
        date: formatDate(
          getCurrentDate(options.projectConfig || undefined),
          'YYYY-MM-DD',
          options.projectConfig || undefined,
        ),
        user: {
          ...userConfigForTemplate,
          // Add sanitized versions for filenames
          name: sanitizeForFilename(userConfigForTemplate.name),
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
   * Resolve template path with inheritance and variant support
   * Priority: project templates (with variant) > project templates (default) > system templates
   */
  static resolveTemplatePath(
    template: WorkflowTemplate,
    options: TemplateResolutionOptions,
  ): string | null {
    const templatePaths: string[] = [];

    // If project has workflows directory, check project templates first
    if (options.projectPaths?.workflowsDir) {
      const projectWorkflowDir = path.join(options.projectPaths.workflowsDir, options.workflowName);

      if (options.templateVariant) {
        // Try project template with variant (e.g., .markdown-workflow/workflows/job/templates/resume/ai-frontend.md)
        const variantPath = this.getVariantTemplatePath(
          projectWorkflowDir,
          template,
          options.templateVariant,
        );
        if (variantPath) templatePaths.push(variantPath);
      }

      // Try project template default (e.g., .markdown-workflow/workflows/job/templates/resume/default.md)
      const projectTemplatePath = path.join(projectWorkflowDir, template.file);
      templatePaths.push(projectTemplatePath);
    }

    // Always add system template as fallback
    const systemTemplatePath = path.join(
      options.systemRoot,
      'workflows',
      options.workflowName,
      template.file,
    );
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
  static getVariantTemplatePath(
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
   * Get default user configuration for fallback
   */
  static getDefaultUserConfig() {
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
}
