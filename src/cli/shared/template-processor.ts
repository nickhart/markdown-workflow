/**
 * CLI-specific template processing utilities
 *
 * Provides CLI-specific template operations using the shared TemplateService.
 * Handles CLI-specific concerns like console logging, file path resolution, and CLI output.
 * Business logic has been moved to TemplateService for sharing with the REST API.
 */

import * as path from 'path';
import { TemplateService, type TemplateResolutionOptions } from '../../services/template-service';
import { NodeSystemInterface } from '../../engine/system-interface';
import { WorkflowTemplate } from '../../engine/types';
import { type ProjectConfig } from '../../engine/schemas';
import { logTemplateUsage, logFileCreation, logWarning, logError } from './console-output';

export interface TemplateProcessingOptions {
  systemRoot: string;
  workflowName: string;
  variables: Record<string, string>;
  projectConfig?: ProjectConfig | null;
  projectPaths?: { workflowsDir: string; configFile: string } | null;
}

// Re-export types for CLI usage
export type { TemplateResolutionOptions };

// Create system interface for file operations
const systemInterface = new NodeSystemInterface();

/**
 * CLI template processor using shared TemplateService
 * Provides CLI-specific logging and file I/O operations
 */
export class TemplateProcessor {
  private static templateService = new TemplateService({
    systemRoot: '', // Will be set per operation
    systemInterface,
  });

  /**
   * CLI wrapper: Process a template file with variable substitution and file output
   * Handles CLI-specific file I/O and logging
   */
  static async processTemplate(
    template: WorkflowTemplate,
    collectionPath: string,
    options: TemplateProcessingOptions,
  ): Promise<void> {
    // Update template service system root for this operation
    this.templateService = new TemplateService({
      systemRoot: options.systemRoot,
      systemInterface,
    });

    try {
      // Resolve template path with inheritance
      const resolvedTemplatePath = this.templateService.resolveTemplatePath(template, {
        systemRoot: options.systemRoot,
        workflowName: options.workflowName,
        templateVariant: options.variables.template_variant,
        projectPaths: options.projectPaths,
      });

      if (!resolvedTemplatePath) {
        logWarning(`Template not found: ${template.name} (checked project and system locations)`);
        return;
      }

      // CLI-specific logging
      logTemplateUsage(resolvedTemplatePath);

      if (!systemInterface.existsSync(resolvedTemplatePath)) {
        logWarning(`Template file not found: ${resolvedTemplatePath}`);
        return;
      }

      // Load template content
      const templateContent = systemInterface.readFileSync(resolvedTemplatePath);

      // Build processing context
      const context = {
        projectConfig: options.projectConfig || undefined,
        customVariables: options.variables,
        workflowName: options.workflowName,
        projectPaths: options.projectPaths,
      };

      // Process template using shared service
      const processedContent = this.templateService.processTemplate(templateContent, context);

      // Generate output filename using shared service
      const outputFile = this.templateService.generateOutputFilename(template, context);

      // CLI-specific file I/O
      const outputPath = path.join(collectionPath, outputFile);
      systemInterface.writeFileSync(outputPath, processedContent);

      // CLI-specific logging
      logFileCreation(outputFile);
    } catch (error) {
      logError(
        `Error processing template ${template.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * CLI wrapper: Resolve template path with inheritance and variant support
   * Uses shared TemplateService business logic with CLI-specific system root handling
   */
  static resolveTemplatePath(
    template: WorkflowTemplate,
    options: TemplateResolutionOptions,
  ): string | null {
    const templateService = new TemplateService({
      systemRoot: options.systemRoot,
      systemInterface,
    });

    return templateService.resolveTemplatePath(template, options);
  }

  /**
   * CLI wrapper: Build variant template path
   * Uses shared TemplateService business logic
   */
  static getVariantTemplatePath(
    workflowDir: string,
    template: WorkflowTemplate,
    variant: string,
  ): string | null {
    const templateService = new TemplateService({
      systemRoot: '', // Not needed for this operation
      systemInterface,
    });

    return templateService.getVariantTemplatePath(workflowDir, template, variant);
  }

  /**
   * CLI wrapper: Load partials with CLI-specific logging
   * Uses shared TemplateService business logic with CLI logging
   */
  static loadPartials(
    systemRoot: string,
    workflowName: string,
    projectPaths?: { workflowsDir: string } | null,
  ): Record<string, string> {
    const templateService = new TemplateService({
      systemRoot,
      systemInterface,
    });

    return templateService.loadPartials(workflowName, projectPaths);
  }

  /**
   * CLI helper: Get default user configuration
   * CLI-specific default configuration
   */
  static getDefaultUserConfig() {
    return {
      name: 'Your Name',
      preferred_name: 'john doe',
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
