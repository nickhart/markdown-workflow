import { z } from 'zod';

// Workflow-related schemas
export const WorkflowStageSchema = z.object({
  name: z.string(),
  description: z.string(),
  color: z.string(),
  next: z.array(z.string()).optional(),
  terminal: z.boolean().optional(),
});

export const WorkflowTemplateSchema = z.object({
  name: z.string(),
  file: z.string(),
  output: z.string(),
  description: z.string(),
});

export const WorkflowStaticSchema = z.object({
  name: z.string(),
  file: z.string(),
  description: z.string(),
});

export const WorkflowActionParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'array', 'date']),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
  options: z.array(z.string()).optional(),
  description: z.string(),
});

export const WorkflowActionSchema = z.object({
  name: z.string(),
  description: z.string(),
  usage: z.string().optional(),
  templates: z.array(z.string()).optional(),
  converter: z.string().optional(),
  formats: z.array(z.string()).optional(),
  parameters: z.array(WorkflowActionParameterSchema).optional(),
  metadata_file: z.string().optional(),
  create_directories: z.array(z.string()).optional(),
  variable_mapping: z.record(z.string(), z.string()).optional(),
});

export const WorkflowMetadataSchema = z.object({
  required_fields: z.array(z.string()),
  optional_fields: z.array(z.string()),
  auto_generated: z.array(z.string()),
});

export const WorkflowCollectionIdSchema = z.object({
  pattern: z.string(),
  max_length: z.number(),
});

export const WorkflowCLIArgumentSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array']),
  required: z.boolean().optional().default(false),
  description: z.string(),
  help_text: z.string().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});

export const WorkflowCLISchema = z.object({
  aliases: z.array(z.string()).optional(),
  arguments: z.array(WorkflowCLIArgumentSchema).optional(),
  usage: z.string().optional(),
  description: z.string().optional(),
  help_text: z.string().optional(),
  examples: z.array(z.string()).optional(),
});

export const WorkflowDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  stages: z.array(WorkflowStageSchema),
  templates: z.array(WorkflowTemplateSchema),
  statics: z.array(WorkflowStaticSchema),
  actions: z.array(WorkflowActionSchema),
  metadata: WorkflowMetadataSchema,
  collection_id: WorkflowCollectionIdSchema,
  cli: WorkflowCLISchema.optional(),
});

export const WorkflowFileSchema = z.object({
  workflow: WorkflowDefinitionSchema,
});

// Configuration schemas
export const UserConfigSchema = z.object({
  name: z.string(),
  preferred_name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  linkedin: z.string(),
  github: z.string(),
  website: z.string(),
});

export const SystemConfigSchema = z.object({
  scraper: z.enum(['wget', 'curl', 'native']),
  web_download: z.object({
    timeout: z.number(),
    add_utf8_bom: z.boolean(),
    html_cleanup: z.enum(['none', 'scripts', 'markdown']),
  }),
  output_formats: z.array(z.string()),
  git: z.object({
    auto_commit: z.boolean(),
    commit_message_template: z.string(),
  }),
  collection_id: z.object({
    date_format: z.string(),
    sanitize_spaces: z.string(),
    max_length: z.number(),
  }),
  mermaid: z
    .object({
      output_format: z.enum(['png', 'svg']),
      theme: z.enum(['default', 'dark', 'forest', 'neutral']).optional(),
      timeout: z.number(),
    })
    .optional(),
  testing: z
    .object({
      // Date/Time overrides
      override_current_date: z.string().optional(),
      override_timezone: z.string().optional(),
      freeze_time: z.boolean().optional(), // Freeze time at override_current_date

      // ID generation overrides
      deterministic_ids: z.boolean().optional(),
      id_prefix: z.string().optional(), // Custom prefix for generated IDs
      id_counter_start: z.number().optional(), // Starting counter for sequential IDs

      // User variable overrides
      override_user: z
        .object({
          name: z.string().optional(),
          preferred_name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zip: z.string().optional(),
          linkedin: z.string().optional(),
          github: z.string().optional(),
          website: z.string().optional(),
        })
        .optional(),

      // System variable overrides
      mock_file_timestamps: z.boolean().optional(), // Use fixed timestamps for file operations
      mock_external_apis: z.boolean().optional(), // Mock external API calls
      seed_random: z.string().optional(), // Seed for deterministic random values
    })
    .nullable()
    .optional(),
});

export const WorkflowCustomFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'enum', 'array']),
  options: z.array(z.string()).optional(),
  description: z.string(),
});

export const WorkflowOverrideSchema = z
  .object({
    templates: z
      .record(
        z.string(),
        z.object({
          default_template: z.string(),
          available_templates: z.array(z.string()),
        }),
      )
      .optional(),
    custom_fields: z.array(WorkflowCustomFieldSchema).optional(),
  })
  .passthrough(); // Allow additional properties

export const ProjectConfigSchema = z.object({
  user: UserConfigSchema,
  system: SystemConfigSchema,
  workflows: z.record(z.string(), WorkflowOverrideSchema),
});

// Collection schemas
export const CollectionMetadataSchema = z
  .object({
    collection_id: z.string(),
    workflow: z.string(),
    status: z.string(),
    date_created: z.string(),
    date_modified: z.string(),
    status_history: z.array(
      z.object({
        status: z.string(),
        date: z.string(),
      }),
    ),
  })
  .passthrough(); // Allow additional properties for custom fields

// Type exports derived from schemas
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;
export type WorkflowStatic = z.infer<typeof WorkflowStaticSchema>;
export type WorkflowActionParameter = z.infer<typeof WorkflowActionParameterSchema>;
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;
export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>;
export type WorkflowCollectionId = z.infer<typeof WorkflowCollectionIdSchema>;
export type WorkflowCLIArgument = z.infer<typeof WorkflowCLIArgumentSchema>;
export type WorkflowCLI = z.infer<typeof WorkflowCLISchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowFile = z.infer<typeof WorkflowFileSchema>;
export type UserConfig = z.infer<typeof UserConfigSchema>;
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
export type WorkflowCustomField = z.infer<typeof WorkflowCustomFieldSchema>;
export type WorkflowOverride = z.infer<typeof WorkflowOverrideSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type CollectionMetadata = z.infer<typeof CollectionMetadataSchema>;
