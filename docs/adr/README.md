# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records for the markdown-workflow project.

## What is an ADR?

An Architectural Decision Record (ADR) is a document that captures an important architectural decision made along with its context and consequences.

## ADR Format

Each ADR should follow this structure:

```markdown
# ADR-XXX: [Short noun phrase describing the decision]

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context

[What is the issue that we're seeing that is motivating this decision or change?]

## Decision

[What is the change that we're proposing and/or doing?]

## Consequences

[What becomes easier or more difficult to do because of this change?]
```

## Naming Convention

- Use three-digit numbers: `001-workflow-engine-design.md`
- Use kebab-case for descriptive titles
- Start numbering from 001

## ADR Lifecycle

1. **Proposed**: Decision is suggested and under discussion
2. **Accepted**: Decision is approved and will be implemented
3. **Deprecated**: Decision is no longer relevant
4. **Superseded**: Decision is replaced by a newer ADR

## Index of ADRs

| Number | Title                                                               | Status   |
| ------ | ------------------------------------------------------------------- | -------- |
| 001    | [Workflow Engine Architecture](001-workflow-engine-architecture.md) | Accepted |
| 002    | [Simplicity Over Completeness](002-simplicity-over-completeness.md) | Accepted |
| 003    | [Processor Modularization](003-processor-modularization.md)         | Accepted |

## Creating New ADRs

1. Create a new file with the next sequential number
2. Use the template format above
3. Discuss with the team before marking as "Accepted"
4. Update this README with the new ADR in the index
