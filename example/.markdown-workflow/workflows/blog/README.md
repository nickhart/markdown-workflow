# Blog Workflow Customization

This directory can contain customizations for the blog workflow.

## Structure
- `workflow.yml` - Override workflow definition
- `templates/` - Custom templates (override system templates)

## Template Resolution
Templates are resolved in this order:
1. `templates/` in this directory (highest priority)
2. System templates from markdown-workflow installation

## Getting Started
1. Copy system templates you want to customize
2. Modify them to suit your needs
3. System will automatically use your customizations
