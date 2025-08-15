# ADR-003: Processor Modularization Architecture

## Status

Accepted

## Context

The markdown-workflow system needs to support different types of content processing for different workflows:

- **Job applications** need clean, minimal formatting without special processing
- **Presentations** need rich diagram processing with Mermaid, PlantUML, and other visual elements
- **Blog posts** might need emoji processing, image optimization, and other content enhancements
- **Future workflows** might need custom processors for specific content types

The original system applied all processing to all content types, which was inefficient and could introduce unwanted artifacts in simple documents. A modular processor system is needed to:

1. Allow workflows to specify which processors they need
2. Keep job applications clean and professional
3. Enable rich processing for presentations and visual content
4. Provide an extensible architecture for future processors
5. Maintain clear separation of concerns between converters and processors

## Decision

We will implement a **modular processor architecture** with the following components:

### 1. Base Processor System

- `BaseProcessor` abstract class defining the processor interface
- `ProcessorRegistry` for registering and managing processors
- `ProcessingContext` for passing context between processors
- Support for ordered processor execution

### 2. Workflow-Specific Configuration

- Each workflow can specify which processors to enable in their YAML definition
- Processors can be configured with workflow-specific parameters
- Default processor selection based on converter type (e.g., presentations default to Mermaid)

### 3. Available Processors

- **MermaidProcessor**: Generate PNG/SVG diagrams from `mermaid:name` code blocks
- **EmojiProcessor**: Convert emoji shortcodes to Unicode characters
- **PlantUMLProcessor**: Create UML diagrams and flowcharts
- **Custom processors**: Extensible architecture for future needs

### 4. Smart Converter Integration

- `PandocConverter`: Uses specified processors for basic document conversion
- `PresentationConverter`: Optimized for presentation workflows with rich diagram processing
- Converters handle processor orchestration and asset management

### 5. Workflow Configuration Example

```yaml
# Job workflow - clean documents, no processors
actions:
  - name: "format"
    converter: "pandoc"
    formats: ["docx"]
    # No processors specified = clean documents

# Presentation workflow - rich diagrams
actions:
  - name: "format"
    converter: "presentation"
    formats: ["pptx"]
    processors:
      - name: "mermaid"
        enabled: true
        config:
          output_format: "png"
          theme: "default"
```

## Consequences

### Positive

- **Workflow-appropriate processing**: Job applications remain clean, presentations get rich diagrams
- **Performance**: Only necessary processors run for each workflow type
- **Extensibility**: Easy to add new processors for future needs
- **Clear separation**: Processors focus on content transformation, converters handle orchestration
- **Configuration flexibility**: Each workflow can customize processor behavior

### Negative

- **Increased complexity**: More moving parts in the system architecture
- **Configuration overhead**: Each workflow must specify its processor needs
- **Testing complexity**: Need to test processor combinations and configurations

### Mitigated Risks

- **Default behavior**: Workflows get sensible defaults (e.g., presentations auto-enable Mermaid)
- **Graceful fallback**: System works even if processors fail or are unavailable
- **Clear documentation**: Processor system is well-documented with examples

This architecture enables the system to scale from simple document workflows to complex content processing while maintaining clean separation of concerns and workflow-appropriate behavior.
