// Core types for the markdown-workflow system
// Import the schema-generated types
import type {
  SystemConfig as SchemaSystemConfig,
  ProjectConfig as SchemaProjectConfig,
} from './schemas';

export interface WorkflowStage {
  name: string;
  description: string;
  color: string;
  next?: string[];
  terminal?: boolean;
}

export interface WorkflowTemplate {
  name: string;
  file: string;
  output: string;
  description: string;
}

export interface WorkflowStatic {
  name: string;
  file: string;
  description: string;
}

export interface WorkflowActionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'date';
  required?: boolean;
  default?: string | number | boolean | string[];
  options?: string[];
  description: string;
}

export interface WorkflowAction {
  name: string;
  description: string;
  templates?: string[];
  converter?: string;
  formats?: string[];
  parameters?: WorkflowActionParameter[];
  metadata_file?: string;
}

export interface WorkflowMetadata {
  required_fields: string[];
  optional_fields: string[];
  auto_generated: string[];
}

export interface WorkflowCollectionId {
  pattern: string;
  max_length: number;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  version: string;
  stages: WorkflowStage[];
  templates: WorkflowTemplate[];
  statics: WorkflowStatic[];
  actions: WorkflowAction[];
  metadata: WorkflowMetadata;
  collection_id: WorkflowCollectionId;
}

export interface WorkflowFile {
  workflow: WorkflowDefinition;
}

// Configuration types
export interface UserConfig {
  name: string;
  preferred_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  linkedin: string;
  github: string;
  website: string;
}

// SystemConfig is now imported from schemas.js

export interface WorkflowCustomField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array';
  options?: string[];
  description: string;
}

export interface WorkflowOverride {
  templates?: {
    [templateName: string]: {
      default_template: string;
      available_templates: string[];
    };
  };
  custom_fields?: WorkflowCustomField[];
  [key: string]: unknown;
}

// Re-export schema-generated types
export type ProjectConfig = SchemaProjectConfig;
export type SystemConfig = SchemaSystemConfig;

// Discovery and resolution types
export interface ConfigPaths {
  systemRoot: string;
  projectRoot: string | null;
  projectConfig?: string;
}

export interface ResolvedConfig {
  paths: ConfigPaths;
  projectConfig?: ProjectConfig;
  availableWorkflows: string[];
}

// Collection types
export interface CollectionMetadata {
  collection_id: string;
  workflow: string;
  status: string;
  date_created: string;
  date_modified: string;
  status_history: Array<{
    status: string;
    date: string;
  }>;
  [key: string]: string | number | boolean | string[] | Array<{ status: string; date: string }>;
}

export interface Collection {
  metadata: CollectionMetadata;
  artifacts: string[];
  path: string;
}

// CLI types
export interface CliContext {
  config: ResolvedConfig;
  currentWorkflow?: string;
  currentCollection?: string;
}
