# Markdown Workflow

A generalized markdown-based workflow system built with Node.js and TypeScript. It provides a template-driven workflow engine for creating documents, managing content, and tracking collections through different stages.

## Features

- 📝 **Template-driven workflows** - Create documents from customizable templates
- 🔄 **Status management** - Track items through workflow stages
- 🌐 **Dual interface** - CLI for local use, REST API for web integration
- 🎨 **Customizable** - Override templates and workflows per project
- 📦 **Repository-agnostic** - Works from any directory like git

## Quick Start

### 1. Setup

Run the setup script to build and install the CLI:

```bash
./setup.sh
```

This will:
- Install dependencies
- Build the CLI
- Make `wf` command available globally

### 2. Initialize a Project

Navigate to your writing project directory and initialize:

```bash
cd ~/my-writing-project
wf init
```

This creates a `.markdown-workflow/` directory with:
- `config.yml` - Your personal configuration
- `workflows/` - Custom workflow overrides
- `collections/` - Generated collections

### 3. Configure

Edit `.markdown-workflow/config.yml` with your information:

```yaml
user:
  name: "Your Name"
  email: "your.email@example.com"
  # ... other details
```

### 4. Create Collections

```bash
# Job applications
wf create job "Google" "Software Engineer"

# Blog posts  
wf create blog "TypeScript Tips"

# List all collections
wf list
```

## Available Workflows

### Job Applications
- **Stages**: active → submitted → interview → offered → accepted/rejected
- **Templates**: resume, cover letter, interview notes
- **Actions**: create, format, notes, scrape

### Blog Posts
- **Stages**: draft → review → published → archived
- **Templates**: post content, CSS styles  
- **Actions**: create, format, preview, publish

## CLI Commands

```bash
wf init                    # Initialize project
wf init --workflows job    # Initialize specific workflows
wf create <workflow> <args> # Create new collection
wf list [status]           # List collections
wf status <id> <status>    # Update collection status
wf format <id>             # Format documents
wf --help                  # Show help
```

## Development

### Web Interface

```bash
pnpm dev                   # Start Next.js dev server
pnpm build                 # Build for production
```

### CLI Development

```bash
pnpm run cli <command>     # Run CLI in development
pnpm run cli:build         # Build CLI
pnpm test                  # Run tests
```

### API Development

```bash
pnpm run api              # Start API server
```

## Architecture

- **src/core/** - Workflow engine and shared logic
- **src/cli/** - Command-line interface
- **src/api/** - REST API endpoints
- **workflows/** - Default workflow definitions
- **tests/** - Unit and integration tests

## Configuration Discovery

Like git, the system discovers configuration by walking up directories to find `.markdown-workflow/`:

```
~/my-writing-project/
├── .markdown-workflow/
│   ├── config.yml
│   ├── workflows/         # Custom overrides
│   └── collections/       # Generated content
└── [your files...]
```

## Template System

Templates support variable substitution:

```markdown
# {{user.name}}'s Resume

Email: {{user.email}}
Phone: {{user.phone}}
```

Templates are resolved in order:
1. User project templates (highest priority)
2. System templates (fallback)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.