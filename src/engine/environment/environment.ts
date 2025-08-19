/**
 * Environment - Abstract base class for resource environments
 *
 * An Environment encapsulates all resources needed for markdown-workflow execution:
 * - Configuration files
 * - Workflow definitions
 * - Processor definitions
 * - Converter definitions
 * - Templates and static files
 *
 * Different implementations can load resources from various sources:
 * - Filesystem (FilesystemEnvironment)
 * - Memory (MemoryEnvironment)
 * - Archives (ArchiveEnvironment)
 * - HTTP uploads (RequestEnvironment)
 */

import {
  type ProjectConfig,
  type WorkflowFile,
  type ExternalProcessorDefinition,
  type ExternalConverterDefinition,
} from '../schemas.js';

export interface EnvironmentManifest {
  workflows: string[];
  processors: string[];
  converters: string[];
  templates: Record<string, string[]>; // workflow -> template names
  statics: Record<string, string[]>; // workflow -> static names
  hasConfig: boolean;
}

export interface TemplateRequest {
  workflow: string;
  template: string;
  variant?: string;
}

export interface StaticRequest {
  workflow: string;
  static: string;
}

/**
 * Abstract base class for all Environment implementations
 */
export abstract class Environment {
  /**
   * Get the project configuration
   */
  abstract getConfig(): Promise<ProjectConfig | null>;

  /**
   * Get a workflow definition by name
   */
  abstract getWorkflow(name: string): Promise<WorkflowFile>;

  /**
   * Get external processor definitions
   */
  abstract getProcessorDefinitions(): Promise<ExternalProcessorDefinition[]>;

  /**
   * Get external converter definitions
   */
  abstract getConverterDefinitions(): Promise<ExternalConverterDefinition[]>;

  /**
   * Get a template file content
   */
  abstract getTemplate(request: TemplateRequest): Promise<string>;

  /**
   * Get a static file content (returns raw content, could be binary)
   */
  abstract getStatic(request: StaticRequest): Promise<Buffer>;

  /**
   * List all available workflows
   */
  abstract listWorkflows(): Promise<string[]>;

  /**
   * Get environment manifest (what resources are available)
   */
  abstract getManifest(): Promise<EnvironmentManifest>;

  /**
   * Check if environment has a specific resource
   */
  async hasWorkflow(name: string): Promise<boolean> {
    const workflows = await this.listWorkflows();
    return workflows.includes(name);
  }

  /**
   * Check if environment has a specific template
   */
  async hasTemplate(request: TemplateRequest): Promise<boolean> {
    try {
      await this.getTemplate(request);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if environment has a specific static file
   */
  async hasStatic(request: StaticRequest): Promise<boolean> {
    try {
      await this.getStatic(request);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Environment error types
 */
export class EnvironmentError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

export class ResourceNotFoundError extends EnvironmentError {
  constructor(resourceType: string, resourceId: string, cause?: Error) {
    super(`${resourceType} not found: ${resourceId}`, 'RESOURCE_NOT_FOUND', cause);
    this.name = 'ResourceNotFoundError';
  }
}

export class ValidationError extends EnvironmentError {
  constructor(message: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

export class SecurityError extends EnvironmentError {
  constructor(message: string, cause?: Error) {
    super(message, 'SECURITY_ERROR', cause);
    this.name = 'SecurityError';
  }
}
