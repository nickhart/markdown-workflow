# Workflow Configuration Guide

This guide explains how to create and configure workflows in the markdown-workflow system.

## Overview

Workflows are defined in YAML files that specify:

- **Stages**: The different states a collection can go through
- **Templates**: Source files with variable substitution
- **Actions**: Operations that can be performed on collections
- **Metadata**: Required and optional fields for collections

## Workflow File Structure

```yaml
workflow:
  name: 'workflow-name'
  description: 'Description of the workflow'
  version: '1.0.0'

  # Optional CLI configuration
  cli:
    aliases: ['shortcut']
    arguments: [...]
    usage: 'wf {alias} <args>'
    description: 'CLI description'

  stages: [...]
  templates: [...]
  statics: [...]
  actions: [...]
  metadata: { ... }
  collection_id: { ... }
```

## Stages Configuration

Stages define the lifecycle of collections in your workflow:

```yaml
stages:
  - name: 'active'
    description: 'Work in progress'
    color: 'blue'
    next: ['submitted', 'rejected']

  - name: 'submitted'
    description: 'Submitted for review'
    color: 'yellow'
    next: ['approved', 'rejected']

  - name: 'approved'
    description: 'Approved and completed'
    color: 'green'
    terminal: true # No further transitions allowed
```

**Stage Properties:**

- `name`: Unique identifier for the stage
- `description`: Human-readable description
- `color`: Display color (blue, yellow, green, red, orange, purple, gray)
- `next`: Array of valid next stages
- `terminal`: Boolean indicating if this is a final stage

## Templates Configuration

Templates are source files that generate artifacts through variable substitution:

```yaml
templates:
  - name: 'resume'
    file: 'templates/resume/default.md'
    output: 'resume_{{user.name_sanitized}}.md'
    description: 'Resume template'

  - name: 'cover_letter'
    file: 'templates/cover_letter/default.md'
    output: 'cover_letter_{{user.name_sanitized}}.md'
    description: 'Cover letter template'
```

**Template Properties:**

- `name`: Unique identifier for the template
- `file`: Path to template file relative to workflow directory
- `output`: Output filename pattern with variable substitution
- `description`: Human-readable description

### Template Variants

All templates support variants automatically. Template variants allow multiple versions of the same template:

**Directory Structure:**

```
workflows/job/templates/resume/
├── default.md      # Default variant
├── frontend.md     # Frontend-focused variant
├── mobile.md       # Mobile development variant
└── ai.md          # AI/ML focused variant
```

**Variant Resolution Logic:**
When a variant is requested (e.g., `--template-variant frontend`):

1. **Try variant first**: Look for the specific variant file
   - Project: `$project/.markdown-workflow/workflows/job/templates/resume/frontend.md`
   - System: `$system/workflows/job/templates/resume/frontend.md`

2. **Fallback to default**: If variant not found, use default template
   - Project: `$project/.markdown-workflow/workflows/job/templates/resume/default.md`
   - System: `$system/workflows/job/templates/resume/default.md`

**Example Scenarios:**

- Available resume variants: `[default, foo, foobar]`
- Available cover_letter variants: `[default, bar, foobar]`

| Variant Requested | Resume Used | Cover Letter Used |
| ----------------- | ----------- | ----------------- |
| `foo`             | `foo`       | `default`         |
| `bar`             | `default`   | `bar`             |
| `foobar`          | `foobar`    | `foobar`          |
| `unknown`         | `default`   | `default`         |

## Actions Configuration

Actions define operations that can be performed on collections:

```yaml
actions:
  - name: 'create'
    description: 'Create new collection'
    usage: 'wf create job <company> <role> [options]'
    templates: ['resume', 'cover_letter']
    metadata_file: 'collection.yml'
    variable_mapping:
      company: 'company'
      role: 'role'
      variant: 'template_variant'
    parameters:
      - name: 'company'
        type: 'string'
        required: true
        description: 'Company name'
      - name: 'template_variant'
        type: 'string'
        default: 'default'
        required: false
        description: 'Template variant to use'

  - name: 'format'
    description: 'Convert documents to various formats'
    converter: 'pandoc'
    formats: ['docx', 'html', 'pdf']
    parameters:
      - name: 'format'
        type: 'enum'
        options: ['docx', 'html', 'pdf', 'all']
        default: 'docx'
        description: 'Output format'
```

**Action Properties:**

- `name`: Unique identifier for the action
- `description`: Human-readable description
- `usage`: CLI usage pattern
- `templates`: Array of templates to process for this action
- `converter`: Document converter to use (optional)
- `formats`: Supported output formats (optional)
- `parameters`: Action-specific parameters
- `metadata_file`: Collection metadata file name
- `variable_mapping`: Map CLI arguments to template variables

### Parameter Types

Parameters support different types with validation:

- **`string`**: Text input (default type)

  ```yaml
  - name: 'title'
    type: 'string'
    required: true
    description: 'Document title'
  ```

- **`enum`**: Predefined options (for format selection, etc.)

  ```yaml
  - name: 'format'
    type: 'enum'
    options: ['docx', 'html', 'pdf']
    default: 'docx'
    description: 'Output format'
  ```

- **`number`**: Numeric input

  ```yaml
  - name: 'duration'
    type: 'number'
    default: 30
    description: 'Duration in minutes'
  ```

- **`boolean`**: True/false flag
  ```yaml
  - name: 'public'
    type: 'boolean'
    default: false
    description: 'Make publicly visible'
  ```

**Important:** For `template_variant` parameters, always use `type: "string"` instead of `enum` to allow flexible variant names.

## Metadata Schema

Define required and optional fields for collections:

```yaml
metadata:
  required_fields:
    - company
    - role
    - date_created
    - status

  optional_fields:
    - url
    - salary_range
    - remote_preference
    - notes

  auto_generated:
    - collection_id
    - date_created
    - date_modified
    - status_history
```

## Collection ID Pattern

Configure how collection IDs are generated:

```yaml
collection_id:
  pattern: "{{company | lower | replace(' ', '_')}}_{{role | lower | replace(' ', '_')}}_{{date | format('YYYYMMDD')}}"
  max_length: 50
```

**Available Filters:**

- `lower`: Convert to lowercase
- `upper`: Convert to uppercase
- `replace('find', 'replace')`: Replace text
- `sanitize`: Remove special characters for filenames

## Template Variables

Templates have access to these variables:

### User Variables

```yaml
user:
  name: 'John Doe'
  preferred_name: 'John'
  email: 'john@example.com'
  # ... other user fields
  name_sanitized: 'john_doe' # Filename-safe version
```

### Collection Variables

```yaml
collection_id: 'google_software_engineer_20250918'
company: 'Google'
role: 'Software Engineer'
title: 'Google Software Engineer' # Derived from collection_id
title_sanitized: 'google_software_engineer'
```

### System Variables

```yaml
date: 'September 18, 2025' # Formatted current date
```

### Custom Variables

Any variables passed from CLI commands or custom context.

## CLI Integration

Configure CLI commands for your workflow:

```yaml
cli:
  aliases: ['job-apply', 'ja']
  arguments:
    - name: 'company'
      type: 'string'
      required: true
      description: 'Company name'
      help_text: "The company you're applying to"
    - name: 'role'
      type: 'string'
      required: true
      description: 'Job role/position'
  usage: 'wf {alias} <company> <role> [variant] [url]'
  description: 'Create a new job application'
  examples:
    - 'wf job-apply "Google" "Software Engineer"'
    - 'wf ja "Meta" "Frontend Developer" frontend'
```

## File Organization

### System Workflows

Located in the markdown-workflow installation:

```
$system/workflows/job/
├── workflow.yml
└── templates/
    ├── resume/
    │   ├── default.md
    │   ├── frontend.md
    │   └── mobile.md
    └── cover_letter/
        ├── default.md
        └── startup.md
```

### Project Overrides

User projects can override system templates:

```
$project/.markdown-workflow/workflows/job/
├── workflow.yml          # Optional: workflow customizations
└── templates/
    └── resume/
        ├── default.md    # Overrides system default
        └── ai.md         # Additional variant
```

### Template Inheritance

Templates are resolved in this order:

1. Project template with variant: `$project/.markdown-workflow/workflows/job/templates/resume/frontend.md`
2. System template with variant: `$system/workflows/job/templates/resume/frontend.md`
3. Project default template: `$project/.markdown-workflow/workflows/job/templates/resume/default.md`
4. System default template: `$system/workflows/job/templates/resume/default.md`

## Best Practices

### 1. Template Variants

- Use descriptive variant names: `frontend`, `mobile`, `ai-ml` instead of `v1`, `v2`
- Always provide a `default.md` variant
- Keep variants focused on specific use cases
- Document available variants in template comments

### 2. Parameter Design

- Use `string` type for `template_variant` parameters
- Provide sensible defaults for optional parameters
- Use `enum` only for truly fixed sets of options (formats, platforms)
- Include helpful descriptions and help text

### 3. Stage Design

- Design stages to reflect your actual workflow
- Use descriptive names: `draft`, `review`, `published` vs `stage1`, `stage2`
- Consider parallel paths (e.g., `approved`/`rejected` from `review`)
- Mark terminal stages appropriately

### 4. Variable Naming

- Use consistent variable names across templates
- Leverage `variable_mapping` to map CLI args to template variables
- Use sanitized versions for filenames: `{{user.name_sanitized}}`

### 5. File Organization

- Group related templates in subdirectories
- Use clear, descriptive filenames
- Keep system and project templates organized
- Document template purposes and variables

## Migration from variant_templates

If you have existing workflows using `variant_templates`, update them:

**Before:**

```yaml
actions:
  - name: 'create'
    templates: ['resume', 'cover_letter']
    variant_templates: ['resume'] # ❌ Remove this
    parameters:
      - name: 'template_variant'
        type: 'enum' # ❌ Change to string
        options: ['default', 'mobile']
```

**After:**

```yaml
actions:
  - name: 'create'
    templates: ['resume', 'cover_letter']
    # variant_templates removed - all templates support variants
    parameters:
      - name: 'template_variant'
        type: 'string' # ✅ Use string type
        default: 'default'
        required: false
```

## Example: Complete Job Application Workflow

```yaml
workflow:
  name: 'job'
  description: 'Track job applications through hiring process'
  version: '1.0.0'

  cli:
    aliases: ['job-apply', 'ja']
    arguments:
      - name: 'company'
        type: 'string'
        required: true
        description: 'Company name'
      - name: 'role'
        type: 'string'
        required: true
        description: 'Job role/position'
    usage: 'wf {alias} <company> <role> [variant]'

  stages:
    - name: 'active'
      description: 'New applications'
      color: 'blue'
      next: ['submitted', 'rejected']
    - name: 'submitted'
      description: 'Applications submitted'
      color: 'yellow'
      next: ['interview', 'rejected']
    - name: 'interview'
      description: 'Interview process'
      color: 'orange'
      next: ['offered', 'rejected']
    - name: 'offered'
      description: 'Job offer received'
      color: 'green'
      next: ['accepted', 'declined']
    - name: 'accepted'
      description: 'Offer accepted'
      color: 'green'
      terminal: true
    - name: 'declined'
      description: 'Offer declined'
      color: 'gray'
      terminal: true
    - name: 'rejected'
      description: 'Application rejected'
      color: 'red'
      terminal: true

  templates:
    - name: 'resume'
      file: 'templates/resume/default.md'
      output: 'resume_{{user.name_sanitized}}.md'
      description: 'Resume tailored for this application'
    - name: 'cover_letter'
      file: 'templates/cover_letter/default.md'
      output: 'cover_letter_{{user.name_sanitized}}.md'
      description: 'Cover letter for this application'

  actions:
    - name: 'create'
      description: 'Create new job application'
      templates: ['resume', 'cover_letter']
      metadata_file: 'collection.yml'
      variable_mapping:
        company: 'company'
        role: 'role'
        variant: 'template_variant'
      parameters:
        - name: 'company'
          type: 'string'
          required: true
          description: 'Company name'
        - name: 'role'
          type: 'string'
          required: true
          description: 'Job role/position'
        - name: 'template_variant'
          type: 'string'
          default: 'default'
          required: false
          description: 'Resume template variant to use'

    - name: 'format'
      description: 'Convert documents to various formats'
      converter: 'pandoc'
      formats: ['docx', 'html', 'pdf']
      parameters:
        - name: 'format'
          type: 'enum'
          options: ['docx', 'html', 'pdf', 'all']
          default: 'docx'
          description: 'Output format'

  metadata:
    required_fields:
      - company
      - role
      - date_created
      - status
    optional_fields:
      - url
      - salary_range
      - notes
    auto_generated:
      - collection_id
      - date_created
      - status_history

  collection_id:
    pattern: "{{company | lower | replace(' ', '_')}}_{{role | lower | replace(' ', '_')}}_{{date | format('YYYYMMDD')}}"
    max_length: 50
```

This configuration creates a complete job application workflow with resume and cover letter templates that support variants, multiple stages, and comprehensive CLI integration.
