/**
 * Environment System - Unified resource management for markdown-workflow
 *
 * The Environment system provides a unified interface for accessing all
 * workflow resources (configs, workflows, processors, converters, templates)
 * with support for multiple sources and intelligent merging.
 */

// Core abstractions
export { Environment } from './environment.js';
export type { EnvironmentManifest, TemplateRequest, StaticRequest } from './environment.js';
export {
  EnvironmentError,
  ResourceNotFoundError,
  ValidationError,
  SecurityError,
} from './environment.js';

// Security and validation
export { SecurityValidator, DEFAULT_SECURITY_CONFIG } from './security-validator.js';
export type { SecurityConfig, FileInfo } from './security-validator.js';

// Environment implementations
export { FilesystemEnvironment } from './filesystem-environment.js';
export { MemoryEnvironment } from './memory-environment.js';
export type { MemoryEnvironmentData } from './memory-environment.js';
export { ArchiveEnvironment } from './archive-environment.js';
export type { ArchiveSource } from './archive-environment.js';
export { MergedEnvironment } from './merged-environment.js';

// Workflow-specific resource management
export { WorkflowContext, createWorkflowContext } from './workflow-context.js';
export type { WorkflowResources, ResourceLoadOptions } from './workflow-context.js';

// Factory and convenience functions
export {
  EnvironmentFactory,
  environmentFactory,
  createFilesystemEnvironment,
  createMemoryEnvironment,
  createMergedEnvironment,
  createCLIEnvironment,
  createTestEnvironment,
  createFromDiscovery,
} from './environment-factory.js';
export type { EnvironmentFactoryOptions } from './environment-factory.js';

// Re-export types for convenience
export type {
  ProjectConfig,
  WorkflowFile,
  ExternalProcessorDefinition,
  ExternalConverterDefinition,
} from '../schemas.js';
