# ADR-001: Workflow Engine Architecture

## Status

Accepted

## Context

The markdown-workflow system needs a flexible architecture that can support multiple interfaces (CLI and REST API) while maintaining consistent business logic. Key requirements include:

- Support for template-driven document generation
- Multi-stage workflow management (active, submitted, completed, etc.)
- Repository independence (users can run workflows from their own directories)
- Extensible design for future workflow types
- Clear separation between templates, static files, and user-generated artifacts

The system must handle both simple document generation and complex multi-step workflows while providing a consistent developer experience.

## Decision

We will implement a layered architecture with the following components:

### Core Layer (`src/core/`)
- **WorkflowEngine**: Central orchestrator for workflow operations
- **CollectionManager**: Handles collection lifecycle and status transitions
- **TemplateProcessor**: Processes markdown templates with variable substitution
- **DocumentConverter**: Handles format conversion (markdown to DOCX, HTML, PDF)
- **ConfigManager**: Manages user configuration and workflow definitions

### Interface Layer
- **CLI (`src/cli/`)**: Command-line interface using Commander.js
- **API (`src/api/`)**: REST API server using Express.js

### Shared Layer (`src/shared/`)
- **Types**: TypeScript interfaces and types
- **Utils**: Common utilities and helpers
- **Validation**: Schema validation for configurations

### Data Model
- **Workflows**: YAML-defined templates with co-located template files
- **Collections**: User instances of workflows with unique identifiers
- **Items**: Files within collections categorized as:
  - Templates: Source files with variable substitution
  - Statics: Supporting files with no processing
  - Artifacts: User-generated files (protected from overwrite)

### Key Design Principles
1. **Repository Independence**: Core system is globally installed, user content stays in user repositories
2. **Template Inheritance**: User templates can override system defaults
3. **Artifact Protection**: User-generated files are protected from accidental overwrite
4. **Type Safety**: Full TypeScript coverage with strict type checking
5. **Extensibility**: Plugin architecture for custom actions and converters

## Consequences

### Positive
- **Consistent Business Logic**: Core layer ensures both CLI and API behave identically
- **Separation of Concerns**: Clear boundaries between workflow logic and interface code
- **Testability**: Each layer can be tested independently
- **Extensibility**: New interfaces can be added without changing core logic
- **Type Safety**: TypeScript provides compile-time error detection
- **Repository Independence**: Users maintain full control over their content

### Negative
- **Complexity**: Layered architecture adds initial development overhead
- **Abstraction**: May be over-engineered for simple use cases
- **Learning Curve**: Developers need to understand the layer boundaries

### Mitigations
- Comprehensive documentation and examples
- Clear interfaces between layers
- Gradual migration path from simpler implementations
- Integration tests that validate cross-layer functionality

### Future Considerations
- Plugin system for custom workflow actions
- Distributed workflow execution
- Real-time collaboration features
- Advanced template inheritance patterns