# Markdown-Workflow Current Architecture

**Status:** Post Phase 1 & 2 Refactoring (August 2025)  
**Version:** 0.1.0

## Overview

This document provides an accurate view of the current architecture after significant refactoring work. The system has been transformed from a monolithic structure into a clean, domain-driven service layer architecture.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI Interface                            │
│                 (src/cli/commands)                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              WorkflowOrchestrator                           │
│         (Main Service Coordinator)                          │
└─┬─────────┬─────────┬─────────────┬─────────────────────────┘
  │         │         │             │
  ▼         ▼         ▼             ▼
┌───────┐ ┌─────────┐ ┌───────────┐ ┌─────────────────┐
│Workflow│ │Collection│ │ Template  │ │ Action Service  │
│Service │ │ Service  │ │ Service   │ │ (format/add)    │
└───────┘ └─────────┘ └───────────┘ └─────────────────┘
     │         │           │              │
     └─────────┼───────────┼──────────────┘
               │           │
          ┌────▼───────────▼────┐
          │   Engine & Utils    │
          │ (Config, Types)     │
          └─────────────────────┘
```

## Directory Structure (Current)

```
src/
├── cli/                        # CLI interface layer
│   ├── commands/               # Individual CLI commands
│   │   ├── add.ts             # Add items to collections
│   │   ├── clean.ts           # Clean intermediate files
│   │   ├── commit.ts          # Git workflow integration
│   │   ├── create.ts          # Create new collections
│   │   ├── format.ts          # Document conversion
│   │   ├── list.ts            # List collections
│   │   └── status.ts          # Status management
│   ├── shared/                # CLI utilities
│   │   ├── cli-base.ts        # Common CLI setup
│   │   ├── error-handler.ts   # Error handling
│   │   ├── formatting-utils.ts # Output formatting
│   │   ├── metadata-utils.ts  # Metadata operations
│   │   ├── template-processor.ts # Template processing
│   │   └── workflow-operations.ts # Shared workflow ops
│   └── index.ts               # CLI entry point
├── services/                  # Domain service layer (NEW)
│   ├── workflow-orchestrator.ts # Main coordinator
│   ├── workflow-service.ts     # Workflow operations
│   ├── collection-service.ts   # Collection management
│   ├── template-service.ts     # Template processing
│   ├── action-service.ts       # Action execution
│   ├── converters/            # Document converters
│   │   ├── base-converter.ts  # Converter framework
│   │   ├── pandoc-converter.ts # Pandoc integration
│   │   └── presentation-converter.ts # Presentation handling
│   ├── processors/            # Content processors
│   │   ├── base-processor.ts  # Processor framework
│   │   ├── emoji-processor.ts # Emoji conversion
│   │   ├── mermaid-processor.ts # Diagram generation
│   │   ├── plantuml-processor.ts # UML diagrams
│   │   └── graphviz-processor.ts # Graph visualization
│   ├── document-converter.ts  # Legacy converter (maintained)
│   ├── mermaid-processor.ts   # Legacy processor (maintained)
│   ├── web-scraper.ts         # URL content scraping
│   └── presentation-api.ts    # Presentation API
├── engine/                    # Core engine (consolidated)
│   ├── config-discovery.ts    # Configuration discovery
│   ├── job-application-migrator.ts # Legacy migration
│   ├── schemas.ts             # Zod validation schemas
│   ├── system-interface.ts    # System abstraction layer
│   ├── types.ts               # Core type definitions
│   └── workflow-engine.ts     # Legacy engine (maintained)
├── utils/                     # Pure utilities
│   ├── config-validation-utils.ts # Config validation
│   ├── date-utils.ts          # Date operations
│   ├── enhanced-error-reporting.ts # Error reporting
│   ├── file-utils.ts          # File operations
│   ├── snapshot-diff-utils.ts # Testing utilities
│   └── testing-utils.ts       # Test helpers
└── app/                       # Next.js web interface
    ├── api/                   # REST API routes
    └── [components...]        # React components
```

## Service Layer Architecture (Phase 2)

### WorkflowOrchestrator

**File:** `src/services/workflow-orchestrator.ts`

The main coordinator that orchestrates all domain services. Replaces the monolithic `WorkflowEngine`.

**Responsibilities:**

- Initialize and coordinate domain services
- Provide high-level workflow operations
- Manage configuration and system setup
- Expose unified interface for CLI commands

**Key Methods:**

- `loadWorkflow()` - Load workflow definitions
- `getCollections()` - Retrieve collections
- `updateCollectionStatus()` - Update collection status with validation
- `executeAction()` - Execute workflow actions

### Domain Services

#### WorkflowService

**File:** `src/services/workflow-service.ts`

Manages workflow definitions and validation.

**Responsibilities:**

- Load and validate workflow YAML files
- Validate status transitions
- Find reference documents
- Detect template types from filenames

#### CollectionService

**File:** `src/services/collection-service.ts`

Handles collection CRUD operations and lifecycle management.

**Responsibilities:**

- Get collections by workflow
- Retrieve specific collections by ID
- Update collection status with directory moves
- Manage collection artifacts and metadata

#### TemplateService

**File:** `src/services/template-service.ts`

Manages template processing and variable substitution.

**Responsibilities:**

- Load template content from filesystem
- Process templates with Mustache variables
- Generate output filenames from template patterns
- Map template names to artifact files
- Build template variables with user config

#### ActionService

**File:** `src/services/action-service.ts`

Executes workflow actions like formatting and adding items.

**Responsibilities:**

- Execute format actions (document conversion)
- Execute add actions (create items from templates)
- Coordinate with converters and processors
- Handle action-specific business logic

## Core Concepts & Terminology

### Workflow

A template/definition for a process (e.g., "job-applications", "blog-posts"). Defined in YAML files with co-located templates.

**Structure:**

```yaml
workflow:
  name: 'job-applications'
  description: 'Track job applications through hiring process'
  stages: [...] # Status progression
  templates: [...] # Template definitions
  statics: [...] # Static file references
  actions: [...] # Available actions
```

### Collection

A user's specific instance of a workflow with unique ID (e.g., `doordash_engineering_manager_20250716`).

**Directory Structure:**

```
job/submitted/doordash_engineering_manager_20250716/
├── collection.yml              # Metadata
├── resume_john_doe.md         # Generated artifacts (protected)
├── cover_letter_john_doe.md   # Generated artifacts (protected)
├── assets/                    # Static assets
├── intermediate/              # Processor temporary files
└── formatted/                 # Output files (not committed)
```

### Items (Within Collections)

- **Templates**: Source files with variable substitution that generate artifacts
- **Statics**: Static supporting files with no processing
- **Artifacts**: User-editable generated files (protected from overwrite)

### Processors & Converters

- **Processors**: Transform content during formatting (e.g., Mermaid diagrams → images)
- **Converters**: Convert final documents to output formats (e.g., Markdown → DOCX)

## Configuration System

### Config Discovery

**File:** `src/engine/config-discovery.ts`

Handles configuration resolution with inheritance:

1. **System Config**: Global defaults from markdown-workflow installation
2. **Project Config**: Local `.markdown-workflow/config.yml` overrides
3. **Template Resolution**:
   - User repo `workflows/{workflow}/templates/` (custom overrides)
   - System `workflows/{workflow}/templates/` (defaults)

### Configuration Files

#### Project Config (`config.yml`)

```yaml
user:
  name: 'Your Name'
  preferred_name: 'john_doe'
  email: 'your.email@example.com'
  # ... other user fields

system:
  scraper: 'wget'
  web_download:
    timeout: 30
    add_utf8_bom: true
  output_formats: ['docx', 'html', 'pdf']
```

#### Collection Metadata (`collection.yml`)

```yaml
collection_id: 'doordash_engineering_manager_20250716'
workflow: 'job'
status: 'submitted'
date_created: '2025-07-16T10:00:00Z'
date_modified: '2025-07-16T15:30:00Z'
company: 'DoorDash'
role: 'Engineering Manager'
status_history:
  - status: 'active'
    date: '2025-07-16T10:00:00Z'
  - status: 'submitted'
    date: '2025-07-16T15:30:00Z'
```

## CLI Interface

### Command Structure

```bash
wf <command> <workflow> <collection_id> [options]
```

### Key Commands

- `wf create job "Company" "Role"` - Create new collection
- `wf list job` - List all job collections
- `wf status job collection_id submitted` - Update status
- `wf format job collection_id` - Convert documents
- `wf add job collection_id notes recruiter` - Add items

### CLI Command → Service Flow

```
CLI Command → WorkflowOrchestrator → Domain Services → Engine/Utils
```

## Repository Independence

The system supports running workflows from any directory:

1. **Global Installation**: `npm install -g markdown-workflow`
2. **Local Configuration**: Each project has its own `config.yml`
3. **Template Inheritance**: User templates override system defaults
4. **Isolated Execution**: Collections created in current directory

## Testing Architecture

### Test Structure

```
tests/
├── unit/
│   ├── cli/commands/          # CLI command tests
│   ├── services/              # Service layer tests (NEW)
│   ├── engine/                # Engine tests
│   ├── utils/                 # Utility tests
│   └── mocks/                 # Test mocks
├── integration/               # Integration tests
└── fixtures/                  # Test fixtures
```

### Testing Strategy

- **Unit Tests**: Individual service and utility testing
- **Integration Tests**: End-to-end workflow testing
- **Snapshot Tests**: CLI output validation with deterministic content
- **Mock System Interface**: Filesystem abstraction for testing

## Key Architectural Improvements

### Phase 1 (Directory Consolidation)

- Eliminated confusing `core/`, `shared/`, `lib/` structure
- Consolidated into `engine/`, `services/`, `utils/`
- Updated all import paths and tests

### Phase 2 (Service Layer)

- Broke 1000+ line `WorkflowEngine` into focused domain services
- Implemented Single Responsibility Principle
- Created clean dependency injection interfaces
- Maintained backward compatibility

## Legacy Components (Maintained)

### Backward Compatibility

- `WorkflowEngine` - Original monolithic engine (still functional)
- Legacy converters and processors (wrapped by new system)
- Existing CLI interfaces (unchanged externally)

### Migration Strategy

- New code uses service layer
- Legacy code remains functional
- Gradual migration of remaining components

## Future Architecture Considerations

### Completed (✅)

- ✅ Unified directory structure (`core/shared/lib` → `engine/services/utils`)
- ✅ Clean CLI/logic separation (service layer)
- ✅ Centralized config discovery (existing `ConfigDiscovery`)
- ✅ Service-oriented architecture
- ✅ Model objects for Collection, Workflow, etc.

### Opportunities

- **Plugin System**: Dynamic processor/converter discovery
- **Workflow Publishing**: Share custom workflows
- **Enhanced Web Interface**: Full-featured web UI
- **API Authentication**: Security for REST endpoints
- **Performance Optimization**: Caching and parallel processing

## Development Guidelines

### Code Organization

- CLI commands only contain command-specific logic
- Business logic lives in domain services
- Pure functions in utilities
- Configuration discovery in engine layer

### Adding New Features

1. Determine appropriate service (or create new one)
2. Implement business logic in service
3. Add CLI command if needed
4. Update tests and documentation

### Service Dependencies

- Services depend on engine/utils, not each other
- Orchestrator coordinates service interactions
- Clean interfaces enable easy testing/mocking

This architecture provides a solid foundation for maintainable, testable, and extensible code while preserving all existing functionality.
