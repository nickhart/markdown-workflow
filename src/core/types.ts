// Core types for the markdown-workflow system

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
  default?: any;
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

export interface SystemConfig {
  scraper: 'wget' | 'curl' | 'chrome';
  web_download: {
    timeout: number;
    add_utf8_bom: boolean;
    html_cleanup: 'none' | 'scripts' | 'markdown';
  };
  output_formats: string[];
  git: {
    auto_commit: boolean;
    commit_message_template: string;
  };
  collection_id: {
    date_format: string;
    sanitize_spaces: string;
    max_length: number;
  };
}

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
  [key: string]: any;
}

export interface ProjectConfig {
  user: UserConfig;
  system: SystemConfig;
  workflows: {
    [workflowName: string]: WorkflowOverride;
  };
}

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
  [key: string]: any;
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