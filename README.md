# Markdown Workflow

[![CI](https://github.com/nickhart/markdown-workflow/workflows/CI/badge.svg)](https://github.com/nickhart/markdown-workflow/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/Tests-109%20passing-brightgreen)](https://github.com/nickhart/markdown-workflow/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20+-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10+-blue)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A generalized markdown-based workflow system built with Node.js and TypeScript. It provides a template-driven workflow engine for creating documents, managing content, and tracking collections through different stages.

## Features

- 📝 **Template-driven workflows** - Create documents from customizable templates
- 🔄 **Status management** - Track items through workflow stages
- 🌐 **Dual interface** - CLI for local use, REST API for web integration
- 🎨 **Customizable** - Override templates and workflows per project
- 📦 **Repository-agnostic** - Works from any directory like git

## Quick Start

### 1. Setup

**Option A: Development Setup**

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm run cli:build

# The CLI is now available at dist/cli/index.js
# You can run it with: node dist/cli/index.js <command>
```

**Option B: Global Installation (if setup.sh exists)**

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

# If using development setup:
node /path/to/markdown-workflow/dist/cli/index.js init

# If using global installation:
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
  name: 'Your Name'
  preferred_name: 'Your Name'
  email: 'your.email@example.com'
  phone: '(555) 123-4567'
  address: '123 Main St'
  city: 'Your City'
  state: 'ST'
  zip: '12345'
  linkedin: 'linkedin.com/in/yourname'
  github: 'github.com/yourusername'
  website: 'yourwebsite.com'
```

### 4. Create Collections

```bash
# Job applications (currently implemented)
node dist/cli/index.js create job "Google" "Software Engineer"
node dist/cli/index.js create job "Meta" "Product Manager" --url "https://job-url"

# Blog posts (template exists, but CLI needs workflow-specific parameters)
# Coming soon: wf create blog "TypeScript Tips"

# List collections (coming soon)
# wf list
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

### Currently Implemented

```bash
# Initialize a new markdown-workflow project
wf init                              # Initialize with default workflows (job, blog)
wf init --workflows job              # Initialize with specific workflows
wf init --force                      # Force initialization even if project exists

# Create new collections
wf create job "Company Name" "Role"           # Create job application
wf create job "Google" "Software Engineer"   # Example job application
wf create job "Meta" "Product Manager" --url "https://job-url" --template-variant mobile

# Get help
wf --help                            # Show available commands
wf create --help                     # Show create command options
```

### Workflow Management

```bash
# List collections
wf list job                          # List all job collections
wf list job active                   # List active job collections only
wf list job --format json           # Output as JSON

# Update collection status
wf status job company_role_20240101 submitted    # Update status
wf status job company_role_20240101 interview    # Move to interview stage

# Format documents
wf format job company_role_20240101              # Format to DOCX (default)
wf format job company_role_20240101 --format pdf # Format to PDF

# Create interview notes
wf notes job company_role_20240101 recruiter     # Create recruiter notes
wf notes job company_role_20240101 technical --interviewer "John Doe"
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

## Testing the Current Implementation

To test the current features:

```bash
# 1. Clone and setup
git clone <repository-url>
cd markdown-workflow
pnpm install
pnpm run cli:build

# 2. Create a test project
mkdir ~/test-markdown-workflow
cd ~/test-markdown-workflow

# 3. Initialize the project
node /path/to/markdown-workflow/dist/cli/index.js init

# 4. Edit your config (optional)
# Edit .markdown-workflow/config.yml with your information

# 5. Create a job application
node /path/to/markdown-workflow/dist/cli/index.js create job "Microsoft" "Senior Software Engineer"

# 6. Check the generated files
ls -la .markdown-workflow/collections/
cat .markdown-workflow/collections/microsoft_senior_software_engineer_*/resume_*.md
```

## Template System

Templates use **Mustache syntax** for variable substitution:

```markdown
# {{user.name}}'s Resume

**{{user.email}}** | **{{user.phone}}** | **{{user.city}}, {{user.state}}**

## Professional Summary

Seeking to contribute to {{company}}'s mission as a {{role}}.
```

Templates are resolved in order:

1. User project templates (highest priority)
2. System templates (fallback)

## Documentation

- **[Testing Guide](docs/testing-mock-filesystems.md)** - Comprehensive testing guide with mock filesystem approaches
- **[CLAUDE.md](CLAUDE.md)** - Project instructions for AI assistants

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests (see [Testing Guide](docs/testing-mock-filesystems.md))
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
