/**
 * Template Service - Domain service for template operations
 *
 * Extracted from WorkflowEngine and CLI shared modules to provide clean template management.
 * Handles template loading, processing, variable substitution, and artifact mapping.
 */

import * as path from 'path';
import Mustache from 'mustache';
import { type WorkflowFile, type WorkflowTemplate } from '../engine/schemas.js';
import { type Collection, type ProjectConfig } from '../engine/types.js';
import { SystemInterface } from '../engine/system-interface.js';
import { formatDate, getCurrentDate } from '../utils/date-utils.js';
import { sanitizeForFilename, normalizeTemplateName } from '../utils/file-utils.js';

export interface TemplateServiceOptions {
  systemRoot: string;
  systemInterface: SystemInterface;
}

export interface TemplateProcessingContext {
  collection?: Collection;
  projectConfig?: ProjectConfig;
  customVariables?: Record<string, unknown>;
}

export class TemplateService {
  private systemRoot: string;
  private systemInterface: SystemInterface;

  constructor(options: TemplateServiceOptions) {
    this.systemRoot = options.systemRoot;
    this.systemInterface = options.systemInterface;
  }

  /**
   * Load template content from file system
   */
  async loadTemplate(workflow: WorkflowFile, templateName: string): Promise<string> {
    const template = workflow.workflow.templates.find((t) => t.name === templateName);
    if (!template) {
      const availableTemplates = workflow.workflow.templates.map((t) => t.name);
      throw new Error(
        `Template '${templateName}' not found. Available templates: ${availableTemplates.join(', ')}`,
      );
    }

    const templatePath = path.join(
      this.systemRoot,
      'workflows',
      workflow.workflow.name,
      template.file,
    );

    if (!this.systemInterface.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    return this.systemInterface.readFileSync(templatePath);
  }

  /**
   * Process template with variable substitution
   */
  processTemplate(templateContent: string, context: TemplateProcessingContext): string {
    const templateVariables = this.buildTemplateVariables(context);
    return Mustache.render(templateContent, templateVariables);
  }

  /**
   * Generate output filename from template pattern
   */
  generateOutputFilename(
    template: WorkflowTemplate,
    context: TemplateProcessingContext,
    prefix?: string,
  ): string {
    if (prefix && prefix.trim() !== '') {
      // If prefix is provided, use it: prefix_templatename.md
      const sanitizedPrefix = sanitizeForFilename(prefix);
      const baseOutputName = normalizeTemplateName(
        template.output
          .replace(/\{\{[^}]+\}\}/g, '') // Remove template variables
          .replace(/\.md$/, ''), // Remove .md extension
      );
      return `${sanitizedPrefix}_${baseOutputName || normalizeTemplateName(template.name)}.md`;
    } else {
      // Use template's output pattern with variable substitution
      const templateVariables = this.buildTemplateVariables(context);
      return Mustache.render(template.output, templateVariables);
    }
  }

  /**
   * Map template names to their output artifact files in a collection
   */
  async getTemplateArtifactMap(
    workflow: WorkflowFile,
    collection: Collection,
  ): Promise<Map<string, string[]>> {
    const templateMap = new Map<string, string[]>();

    // For each template in the workflow, resolve its output filename
    for (const template of workflow.workflow.templates) {
      try {
        // Find all collection artifacts that match this template pattern
        const matchingFiles = collection.artifacts.filter((artifact) => {
          // Pattern 1: Template name prefix (e.g., "resume_*.md")
          if (artifact.startsWith(`${template.name}_`) && artifact.endsWith('.md')) {
            return true;
          }

          // Pattern 2: Prefix templates (e.g., "{{prefix}}_notes.md")
          if (template.output.includes('{{prefix}}')) {
            const basePattern = template.output.replace('{{prefix}}', '(.+)');
            try {
              const regex = new RegExp(
                '^' +
                  basePattern
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    .replace('\\(\\.\\+\\)', '(.+)') +
                  '$',
              );
              if (regex.test(artifact)) {
                return true;
              }
            } catch {
              return false;
            }
          }

          // Pattern 3: Template output pattern with variable substitution
          if (template.output && !template.output.includes('{{prefix}}')) {
            let pattern = template.output;
            // Replace common user variables with wildcards for matching
            pattern = pattern.replace(/\{\{user\.[^}]+\}\}/g, '(.+)');
            pattern = pattern.replace(/\{\{[^}]+\}\}/g, '(.+)');

            try {
              const regex = new RegExp(
                '^' +
                  pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\(\\.\\+\\)', '(.+)') +
                  '$',
              );
              if (regex.test(artifact)) {
                return true;
              }
            } catch {
              return false;
            }
          }

          // Pattern 4: Exact template name match (fallback)
          if (artifact === `${template.name}.md`) {
            return true;
          }

          return false;
        });

        if (matchingFiles.length > 0) {
          templateMap.set(template.name, matchingFiles);
        }
      } catch (error) {
        console.warn(`Warning: Could not resolve output for template ${template.name}:`, error);
      }
    }

    return templateMap;
  }

  /**
   * Build template variables for variable substitution
   */
  buildTemplateVariables(context: TemplateProcessingContext): Record<string, unknown> {
    const { collection, projectConfig, customVariables = {} } = context;

    // Get user config
    const userConfig = projectConfig?.user || this.getDefaultUserConfig();

    // Extract title from collection metadata or collection ID
    let title = '';
    if (collection) {
      if (collection.metadata.title && typeof collection.metadata.title === 'string') {
        title = collection.metadata.title;
      } else {
        // Derive title from collection ID
        const collectionId = collection.metadata.collection_id;
        const idParts = collectionId.split('_');
        const datePart = idParts[idParts.length - 1];
        if (/^\d{8}$/.test(datePart)) {
          // Remove date part if it's 8 digits (YYYYMMDD format)
          title = idParts.slice(0, -1).join(' ');
        } else {
          title = collectionId;
        }
      }
    }

    return {
      // Custom variables take precedence
      ...customVariables,
      // Standard variables
      date: formatDate(getCurrentDate(projectConfig), 'LONG_DATE', projectConfig),
      user: {
        ...userConfig,
        // Add sanitized versions for filenames
        name_sanitized: sanitizeForFilename(userConfig.name),
        preferred_name_sanitized: sanitizeForFilename(userConfig.preferred_name),
      },
      // Collection-specific variables
      title: title,
      title_sanitized: sanitizeForFilename(title),
      collection_id: collection?.metadata.collection_id || '',
      company: typeof collection?.metadata.company === 'string' ? collection.metadata.company : '',
      role: typeof collection?.metadata.role === 'string' ? collection.metadata.role : '',
    };
  }

  /**
   * Get default user configuration
   */
  private getDefaultUserConfig() {
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
