/**
 * Action Service - Domain service for workflow action execution
 *
 * Extracted from WorkflowEngine to provide clean action execution operations.
 * Handles format actions, add actions, and action orchestration.
 */

import * as path from 'path';
import Mustache from 'mustache';
import { type WorkflowFile, type WorkflowAction } from '../engine/schemas';
import { type Collection, type ProjectConfig } from '../engine/types';
import { SystemInterface } from '../engine/system-interface';
import { convertDocument } from './document-converter';
import { defaultConverterRegistry } from './converters/index';
import { TemplateService } from './template-service';
import { WorkflowService } from './workflow-service';

export interface ActionServiceOptions {
  systemRoot: string;
  systemInterface: SystemInterface;
  templateService: TemplateService;
  workflowService: WorkflowService;
}

export class ActionService {
  private systemRoot: string;
  private systemInterface: SystemInterface;
  private templateService: TemplateService;
  private workflowService: WorkflowService;

  constructor(options: ActionServiceOptions) {
    this.systemRoot = options.systemRoot;
    this.systemInterface = options.systemInterface;
    this.templateService = options.templateService;
    this.workflowService = options.workflowService;
  }

  /**
   * Execute a workflow action on a collection
   */
  async executeAction(
    workflow: WorkflowFile,
    collection: Collection,
    actionName: string,
    parameters: Record<string, unknown> = {},
    projectConfig?: ProjectConfig,
  ): Promise<void> {
    const action = this.workflowService.getWorkflowAction(workflow, actionName);

    switch (actionName) {
      case 'format':
        await this.executeFormatAction(workflow, collection, action, parameters, projectConfig);
        break;
      case 'add':
        await this.executeAddAction(workflow, collection, action, parameters, projectConfig);
        break;
      default:
        throw new Error(`Action not implemented: ${actionName}`);
    }
  }

  /**
   * Execute format action (convert documents)
   */
  private async executeFormatAction(
    workflow: WorkflowFile,
    collection: Collection,
    action: WorkflowAction,
    parameters: Record<string, unknown>,
    projectConfig?: ProjectConfig,
  ): Promise<void> {
    const formatType = parameters.format || 'docx';
    const requestedArtifacts = parameters.artifacts as string[] | undefined;
    const outputDir = path.join(collection.path, 'formatted');

    if (!this.systemInterface.existsSync(outputDir)) {
      this.systemInterface.mkdirSync(outputDir, { recursive: true });
    }

    // Get all markdown files in collection
    const markdownFiles = collection.artifacts.filter((file) => file.endsWith('.md'));

    // Filter files based on requested artifacts
    let filesToConvert = markdownFiles;

    if (requestedArtifacts && requestedArtifacts.length > 0) {
      // Map template names to their expected output files
      const templateToFileMap = await this.templateService.getTemplateArtifactMap(
        workflow,
        collection,
      );

      // Filter to only requested artifacts
      const requestedFiles = new Set<string>();
      for (const artifact of requestedArtifacts) {
        const files = templateToFileMap.get(artifact);
        if (files) {
          files.forEach((file) => requestedFiles.add(file));
        } else {
          console.warn(
            `Warning: Unknown artifact '${artifact}'. Available artifacts: ${Array.from(templateToFileMap.keys()).join(', ')}`,
          );
        }
      }

      filesToConvert = markdownFiles.filter((file) => requestedFiles.has(file));

      if (filesToConvert.length === 0) {
        throw new Error(`No files found for requested artifacts: ${requestedArtifacts.join(', ')}`);
      }
    } else {
      // Default behavior: convert all workflow templates except notes/personal templates
      const templateToFileMap = await this.templateService.getTemplateArtifactMap(
        workflow,
        collection,
      );
      const excludedTemplates = ['notes'];
      const mainDocumentTemplates = workflow.workflow.templates
        .map((template) => template.name)
        .filter((name) => !excludedTemplates.includes(name));

      const defaultFiles = new Set<string>();
      for (const templateName of mainDocumentTemplates) {
        const files = templateToFileMap.get(templateName);
        if (files) {
          files.forEach((file) => defaultFiles.add(file));
        }
      }

      filesToConvert = markdownFiles.filter((file) => defaultFiles.has(file));

      if (filesToConvert.length === 0) {
        console.log(
          `ℹ️  No main document artifacts found to convert (${mainDocumentTemplates.join(', ')})`,
        );
        return;
      }

      console.log(`📄 Converting main documents: ${filesToConvert.join(', ')}`);
    }

    // Convert the filtered files
    for (const file of filesToConvert) {
      await this.convertSingleFile(
        workflow,
        collection,
        file,
        formatType as string,
        outputDir,
        action,
        projectConfig,
      );
    }
  }

  /**
   * Execute add action (add new item from template)
   */
  private async executeAddAction(
    workflow: WorkflowFile,
    collection: Collection,
    action: WorkflowAction,
    parameters: Record<string, unknown>,
    projectConfig?: ProjectConfig,
  ): Promise<void> {
    const templateName = parameters.template;
    if (!templateName || typeof templateName !== 'string') {
      throw new Error('template parameter is required for add action');
    }

    // Load template content
    const templateContent = await this.templateService.loadTemplate(workflow, templateName);

    // Find the template definition
    const template = workflow.workflow.templates.find((t) => t.name === templateName)!;

    // Build template context
    const context = {
      collection,
      projectConfig,
      customVariables: {
        ...parameters,
        // Make sure prefix is available as template variable (capitalized for title)
        prefix: parameters.prefix
          ? String(parameters.prefix).charAt(0).toUpperCase() + String(parameters.prefix).slice(1)
          : '',
        interviewer: parameters.interviewer || '',
      },
    };

    // Process template content
    const processedContent = this.templateService.processTemplate(templateContent, context);

    // Generate output filename
    const outputFile = this.templateService.generateOutputFilename(
      template,
      context,
      parameters.prefix as string,
    );

    const outputPath = path.join(collection.path, outputFile);

    // Check if file already exists
    if (this.systemInterface.existsSync(outputPath)) {
      throw new Error(
        `File already exists: ${outputFile}. Use a different prefix or remove the existing file.`,
      );
    }

    // Write the file
    this.systemInterface.writeFileSync(outputPath, processedContent);
    console.log(`Created: ${outputFile}`);
  }

  /**
   * Convert a single file using the appropriate converter
   */
  private async convertSingleFile(
    workflow: WorkflowFile,
    collection: Collection,
    file: string,
    formatType: string,
    outputDir: string,
    action: WorkflowAction,
    projectConfig?: ProjectConfig,
  ): Promise<void> {
    const inputPath = path.join(collection.path, file);
    const baseName = path.basename(file, '.md');

    // Generate output filename using template output pattern with variable substitution
    let outputFileName = `${baseName}.${formatType}`; // fallback to simple naming

    // Try to generate smart output filename using template patterns
    try {
      // Find matching template by examining the artifact filename
      let matchingTemplate = null;

      // Simple matching: find template whose name appears in the filename
      for (const template of workflow.workflow.templates) {
        if (file.includes(template.name)) {
          matchingTemplate = template;
          break;
        }
      }

      if (matchingTemplate && matchingTemplate.output) {
        // Build template variables
        const context = { collection, projectConfig };
        const templateVariables = this.templateService.buildTemplateVariables(context);

        // Apply variable substitution to template output pattern
        const processedFileName = Mustache.render(matchingTemplate.output, templateVariables);

        // Replace .md extension with target format
        outputFileName = processedFileName.replace(/\.md$/, `.${formatType}`);
      }
    } catch (error) {
      console.warn(
        `Warning: Could not determine template for ${file}, using fallback naming:`,
        error,
      );
    }

    const outputPath = path.join(outputDir, outputFileName);

    try {
      console.log(`🔄 Converting ${file} to ${formatType.toUpperCase()}...`);

      // Detect template type from filename
      const templateType = this.workflowService.detectTemplateType(baseName, workflow);
      let referenceDoc: string | undefined;

      if (formatType === 'docx' && templateType) {
        // Look for reference document
        referenceDoc = await this.workflowService.findReferenceDocument(workflow, templateType);
        if (referenceDoc) {
          console.log(`📄 Using reference document: ${referenceDoc}`);
        }
      }

      // Use new converter system if available
      const converterName = action.converter || 'pandoc';
      const enabledProcessors = this.getEnabledProcessors(action, workflow);

      const converter = defaultConverterRegistry.get(converterName);
      let result;

      if (converter) {
        console.log(
          `🔧 Using ${converterName} converter with processors: ${enabledProcessors.join(', ') || 'none'}`,
        );

        const conversionContext = {
          collectionPath: collection.path,
          inputFile: inputPath,
          outputFile: outputPath,
          format: formatType,
          referenceDoc,
          assetsDir: path.join(collection.path, 'assets'),
          intermediateDir: path.join(collection.path, 'intermediate'),
          enabledProcessors,
        };

        result = await converter.convert(conversionContext);
      } else {
        console.log(
          `⚠️  Converter '${converterName}' not found, falling back to legacy convertDocument`,
        );

        // Fallback to legacy system
        const mermaidConfig = projectConfig?.system?.mermaid;
        result = await convertDocument({
          inputFile: inputPath,
          outputFile: outputPath,
          format: formatType as 'docx' | 'html' | 'pdf' | 'pptx',
          referenceDoc,
          mermaidConfig,
        });
      }

      if (result.success) {
        const relativePath = path.relative(collection.path, result.outputFile);
        if (referenceDoc) {
          console.log(`✅ Created: ${relativePath} (with reference doc)`);
        } else {
          console.log(`✅ Created: ${relativePath}`);
        }
      } else {
        throw new Error(result.error || 'Conversion failed');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`❌ Failed to convert ${file}: ${errorMsg}`);
      throw new Error(`Document conversion failed for ${file}: ${errorMsg}`);
    }
  }

  /**
   * Get enabled processors for an action based on workflow configuration
   */
  private getEnabledProcessors(action: WorkflowAction, _workflow: WorkflowFile): string[] {
    // Check if action has processors configuration
    if (action.processors) {
      return action.processors.filter((p) => p.enabled !== false).map((p) => p.name);
    }

    // Default processors based on converter type
    if (action.converter === 'presentation') {
      return ['mermaid']; // Presentations default to using Mermaid
    }

    // Default to no processors for other converters
    return [];
  }
}
