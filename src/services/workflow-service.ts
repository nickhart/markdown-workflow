/**
 * Workflow Service - Domain service for workflow operations
 *
 * Extracted from WorkflowEngine to provide clean workflow management operations.
 * Handles workflow loading, validation, and metadata operations.
 */

import * as path from 'path';
import * as YAML from 'yaml';
import { WorkflowFileSchema, type WorkflowFile } from '../engine/schemas.js';
import { SystemInterface } from '../engine/system-interface.js';

export interface WorkflowServiceOptions {
  systemRoot: string;
  systemInterface: SystemInterface;
}

export class WorkflowService {
  private systemRoot: string;
  private systemInterface: SystemInterface;

  constructor(options: WorkflowServiceOptions) {
    this.systemRoot = options.systemRoot;
    this.systemInterface = options.systemInterface;
  }

  /**
   * Load and validate a workflow definition from YAML file
   */
  async loadWorkflowDefinition(workflowName: string): Promise<WorkflowFile> {
    const workflowPath = path.join(this.systemRoot, 'workflows', workflowName, 'workflow.yml');

    if (!this.systemInterface.existsSync(workflowPath)) {
      throw new Error(`Workflow definition not found: ${workflowName}`);
    }

    try {
      const workflowContent = this.systemInterface.readFileSync(workflowPath);
      const parsedYaml = YAML.parse(workflowContent);

      const validationResult = WorkflowFileSchema.safeParse(parsedYaml);
      if (!validationResult.success) {
        throw new Error(`Invalid workflow format: ${validationResult.error.message}`);
      }

      return validationResult.data;
    } catch (error) {
      throw new Error(`Failed to load workflow ${workflowName}: ${error}`);
    }
  }

  /**
   * Validate status transition for a workflow stage
   */
  validateStatusTransition(workflow: WorkflowFile, currentStatus: string, newStatus: string): void {
    const currentStage = workflow.workflow.stages.find((s) => s.name === currentStatus);
    const targetStage = workflow.workflow.stages.find((s) => s.name === newStatus);

    if (!targetStage) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    if (currentStage && currentStage.next && !currentStage.next.includes(newStatus)) {
      throw new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
    }
  }

  /**
   * Get workflow action by name
   */
  getWorkflowAction(workflow: WorkflowFile, actionName: string) {
    const action = workflow.workflow.actions.find((a) => a.name === actionName);
    if (!action) {
      throw new Error(`Action not found: ${actionName}`);
    }
    return action;
  }

  /**
   * Find reference document for template type with co-located approach
   */
  async findReferenceDocument(
    workflow: WorkflowFile,
    templateType: string,
    projectWorkflowsDir?: string,
  ): Promise<string | undefined> {
    // 1. Try co-located reference.docx in project workflows directory first
    if (projectWorkflowsDir) {
      const projectRefPath = path.join(
        projectWorkflowsDir,
        workflow.workflow.name,
        'templates',
        templateType,
        'reference.docx',
      );

      if (this.systemInterface.existsSync(projectRefPath)) {
        return projectRefPath;
      }
    }

    // 2. Try co-located reference.docx in system workflows directory
    const systemRefPath = path.join(
      this.systemRoot,
      'workflows',
      workflow.workflow.name,
      'templates',
      templateType,
      'reference.docx',
    );

    if (this.systemInterface.existsSync(systemRefPath)) {
      return systemRefPath;
    }

    // 3. Legacy fallback: try workflow statics
    if (workflow.workflow.statics) {
      const referenceStaticName = `${templateType}_reference`;
      const referenceStatic = workflow.workflow.statics.find((s) => s.name === referenceStaticName);

      if (referenceStatic) {
        // Try project static path first
        if (projectWorkflowsDir) {
          const projectStaticPath = path.join(
            projectWorkflowsDir,
            workflow.workflow.name,
            referenceStatic.file,
          );

          if (this.systemInterface.existsSync(projectStaticPath)) {
            return projectStaticPath;
          }
        }

        // Try system static path
        const systemStaticPath = path.join(
          this.systemRoot,
          'workflows',
          workflow.workflow.name,
          referenceStatic.file,
        );

        if (this.systemInterface.existsSync(systemStaticPath)) {
          return systemStaticPath;
        }
      }
    }

    return undefined;
  }

  /**
   * Detect template type from filename
   */
  detectTemplateType(baseName: string, workflow: WorkflowFile): string | null {
    // Extract template types from workflow definition dynamically
    const workflowTemplateTypes = workflow.workflow.templates?.map((t) => t.name) || [];

    // Handle patterns like "resume_nicholas_hart" -> "resume"
    for (const type of workflowTemplateTypes) {
      if (baseName.startsWith(type + '_')) {
        return type;
      }
    }

    // If no underscore pattern, check if the whole name is a workflow template type
    if (workflowTemplateTypes.includes(baseName)) {
      return baseName;
    }

    // Fallback to legacy hardcoded types for backward compatibility
    const legacyTypes = ['resume', 'cover_letter', 'notes'];
    for (const type of legacyTypes) {
      if (baseName.startsWith(type + '_')) {
        return type;
      }
    }

    if (legacyTypes.includes(baseName)) {
      return baseName;
    }

    return null;
  }
}
