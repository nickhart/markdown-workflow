# Markdown-Workflow Architecture

**author: Nick Hart**
**date: 8/18/25**

## Overview

This document aims to give a high-level overview of how the Markdown-Workflow project is organized, from the repository file structure, to the code organization.

## Repository Organization

**Directory structure:**

TODO: clean up and document this.

```text
docs
example
src
src/core
src/app
src/app/presentations
src/app/presentations/demo
src/app/api
src/app/api/workflows
src/app/api/workflows/[workflow]
src/app/api/workflows/[workflow]/collections
src/app/api/workflows/[workflow]/collections/[collection_id]
src/app/api/workflows/[workflow]/collections/[collection_id]/status
src/app/api/workflows/[workflow]/collections/[collection_id]/items
src/app/api/workflows/[workflow]/collections/[collection_id]/items/[item_name]
src/app/api/presentations
src/app/api/presentations/download
src/app/api/presentations/download/[id]
src/app/api/presentations/format
src/app/api/presentations/templates
src/app/api/presentations/create
src/shared
src/shared/converters
src/shared/processors
src/cli
src/cli/shared
src/cli/commands
src/lib
scripts
tests
tests/unit
tests/unit/mocks
tests/unit/core
tests/unit/shared
tests/unit/shared/converters
tests/unit/shared/processors
tests/unit/cli
tests/unit/cli/shared
tests/unit/cli/commands
tests/unit/helpers
tests/integration
tests/fixtures
tests/fixtures/example-workflow
tests/fixtures/example-workflow/workflows
tests/fixtures/example-workflow/workflows/job
tests/fixtures/example-workflow/workflows/job/templates
tests/fixtures/example-workflow/workflows/job/templates/resume
```

## Code Organization

The main way to interact with this app is via CLI. The bulk of the CLI interface is in `src/cli`. We use the `commander` Node package for a consistent CLI experience.
The primary command is "wf" (short for "workflow", although maybe we should consider changing it to "mw" for "markdown workflow").
Support for this command is in `src/cli/index.ts`.

This CLI app supports a number of sub-commands, each implemented in their own sub-file located in `src/cli/commands`. eg:

- `add`
- `aliases`
- `available`
- `clean`
- `commit`
- `create-with-help`
- `create`
- `format`
- `init`
- `list`
- `migrate`
- `status`
- `update`

And shared utilities for the CLI are in `src/cli/shared`:

- `cli-base.ts`
- `error-handler.ts`
- `formatting-utils.ts`
- `metadata-utils.ts`
- `template-processor.ts`
- `workflow-operations.ts`

However, the main set of models and logic live in `src/core`, `src/shared`, and `src/lib`. **TODO: unify and reorganize this shared code to be more consistent? I don't know what we need `core`, `shared`, and `lib`!**

Finally, there is a `src\app` directory which contains a NextJS web app which is meant to demonstrate how the CLI works.
This is very much a work in progress and needs a great deal of work before I will feel comfortable deploying it anywhere.
I will come back to this someday, as I think it could be pretty cool (especially for an iPad text editor that uses the web version to integrate automated workflows).

## Tests

Tests are located under `tests` and the structure of this folder should match the structure of `src`.

There should be robust unit tests for shared logic and the CLI.

There should also be e2e tests including snapshot tests for the CLI. The snapshot tests are based on the concept of Jest snapshot tests, but uses a custom implementation.
It can dependency-inject some configuration info (including times and dates) so that generated content which may depend on variables will be reproduced consistently.

## Terminology

A **workflow** is an automated process that operates on a **collection**.

A **collection** is a folder which contains several files which track the state of the workflow instance.
A collection has a **collection_id** which uniquely identifies the instance of the workflow and is used in conjunction with CLI (or REST) commands.
A collection contains a `collection.yml` file which is a YAML file containing metadata about the workflow instance, eg:

```yaml
# Collection Metadata
collection_id: 'instacart_senior_software_20250724'
workflow: 'job'
status: 'active'
date_created: '2025-07-24T16:30:13.271Z'
date_modified: '2025-07-25T04:23:02.343Z'

# Application Details
company: 'Instacart'
role: 'Senior Software Engineering Manager'
url: 'https://instacart.careers/job/?gh_jid=7093547&gh_src=26e143c51'

# Status History
status_history:
  - status: 'active'
    date: '2025-07-24T16:30:13.271Z'
# Additional Fields
# Add custom fields here as needed
```

A collection also contains **artifacts**. An **artifact** is a markdown file which is generally automatically generated from a template when the collection is created.
This artifact is what the author will edit and ultimately want to format into a DOCX, PPTX, HTML, or PDF document.
A collection may contain multiple artifacts. For instance, a "job" workflow consists of a resume and cover_letter.
However a blog post or presentation only contains one artifact (the post content, or presentation content).

A collection may also contain **static** files. These are ones that are not generated and may be automatically "scraped" for the author.
For instance, when creating a "job" collection, a URL for the job posting may be downloaded and saved (possibly post-processed before save).
Static content could also be created/modified by the author.
Static content might be referenced/used in the formatting of artifacts, but the workflow will never modify a static file once it has been created.
(Possible exception: allow a `--force` flag?)

Within the **collection** may be several other folders:

- `intermediate` this is a temporary folder which contains intermediate files generated/used by the various workflow processors.
- `formatted` this is the folder which contains the formatted output from the `wf format` command.
- `assets` this is an optional sub-folder which contains static content that may be utilized for formatting the content. For instance if a presentation references static images, they would go in this folder.

When a `wf clean` command is run on a collection, it should remove the `intermediate` folder.
Note: generated images (eg: for mermaid, plantuml, or graphviz processors) will be stored in the `assets` directory and this folder should be committed to the repository.
Note: the `formatted` folder should not be committed to the repository.

Also a **collection** has a **status** which is defined by the workflow. For instance a job has many possible statuses: active, submitted, interview, rejected, withdrawn, accepted... and the collections are structured like so:

`./<workflow>/<status>/<collection_id>`

eg:

`./job/active/instacart_senior_software_20250724`

The status is also contained in the collection's `collection.yml` so it is necessary to both move the collection from one folder to another, as well as update the `collection.yml`.

A **markdown workflow repository** is a git repository which has been configured via `wf init`, so that it has a "sentinel" directory at its root named `.markdown-workflow`, which can contain configuration info for workflows used in the repository.
It contains a `config.yml` YAML file which contains user-specific info (name, address, phone, etc...) which may be used to format templates.
It also may contain configuration information to override default behavior for published workflows.
It also contains a subdirectory "workflows" which can contain subdirectories for each workflow--which in turn can contain templates for that workflow which override or extend the default templates for that workflow.

We use a common pattern with project configs and workflow configs where we look in the system installation for markdown-workflow to find default configuration info, and then allow the user's local repository to override and extend those configs.

We need a **processor** object which represents a process which might transform an artifact during the format process. A Processor can use the `intermediate` folder for its intermediate content.
For instance the mermaid processor extracts UML diagrams embedded in the `content.md` markdown, stores it in files in `intermediate` and then generates images from that content using mermaid, storing the output in `assets`.
The processor also spits out an intermediate version of the presentation where the embedded UML is replaced with markdown syntax to embed the corresponding generated image.

### CLI usage

The CLI interface generally looks like:

`wf create <workflow> <param1> <param2> --arg1 <arg1> --arg2 <arg2>`

or:

`wf <subcommand> <workflow> <collection_id> <param>`

eg:

`wf format job instacart_senior_software_20250724`

## Architecture Review

**TODO** I want to review the entire repository directory/file structure for consistency:

- do the `tests` subdirs correspond to the `src` subdirs? (not every `src` subdir needs a corresponding `tests` subdir, but each `tests` subdir should correspond to a `src` subdir!)
- are we consistent with file name patterns?
- do we need `lib`, `core`, and `shared` in `src` or can we unify these? (and if we do, let's make sure we update the corresponding tests!)

**TODO** I want to make sure the core model and logic lives in `src/(core|lib|shared)` and `src/cli` **only** contains CLI code.

**TODO** Next I want to make sure we have a clean organization of code that represents a workflow, a config, a collection, a collection*id, an artifact, a static file.
I want to ensure that we have centralized the code for formatting markdown via templates (and "snippets" of templates).
I want to ensure we have centralized code for generating filenames from templates.
For instance, I want to be able to define an artifact so that its output name might be templatized, eg: `resume*{{user.name_sanitized}}.md`.

**TODO** we should make sure we have centralized tools for finding the system config files/directories. we should make sure we have centralized tools for combining a user's config with a system config, enabling them to override and extend the system config.
These config tools should be agnostic about the content of the configs.
I should be able to use these tools to find the global `.markdown-workflow/config.yml`, the local `.markdown-workflow/config.yml`, and generate an in-memory version of the config that combines them (ensuring the global doesn't overwrite any local values).
Same goes for using these tools to find the global config for a specific workflow and the local config for that same workflow!
We should be able to have solid unit tests around this functionality. And since this code doesn't care about the structure of the configs we should be able to test it with different kinds of YAML, as long as the "global" and "local" versions of the test YAML files are consistent with their structure and naming.

**TODO** let's make sure we have a project config model object

**TODO** let's make sure we have a workflow config model object.

**TODO** let's make sure we have a type (if not an object) for a collection_id

**TODO** let's make sure we have a model object for a Collection, Artifact, and a Static file.

**TODO** make sure we have a processor model object. we need to support configuration for the processor which can be customized in the user's local markdown workflow repository.

**TODO** we need a discoverable way of finding new processors, finding their global config info, their local config info... and a way for workflows to reference these pluggable processors.

**TODO** ultimately we need to be able to define new workflows and processors in one's own personal markdown workflow repository and reference these locally! If I want to define a new processor and integrate it into my workflow I should be able to do so.
Once I have it tested and working great maybe there's a way to publish it for others to use!
Or submit it to the official markdown-workflow repo as a PR.

**TODO** for a workflow let's make sure we explicitly define which processors are enabled for each workflow, and set some default values for its configuration. Two different workflows might have different defaults for the same processor!

**TODO** review the code for generating output files for artifacts. We seem to handle this a few different ways: a job will output the template "resume.md" -> to the artifact "resume_nicholas_hart.md" -> to the formatted file "resume_nicholas_hard.docx".
Whereas a presentation will format the template "content.md" -> to the artifact "content.md" -> to the formatted file "nicholas_hart_presentation_title.md".
I think maybe we could consistently name the artifacts after their templates (eg: resume.md) and then make sure the formatted output has the templatized name (resume_nicholas_hart.md). The only possible catch here is that some existing content might still be named "resume_name.md" or "cover_letter_name.md" so we might need a catchall that looks for those prefixes.

**TODO** overall I want to review the entire codebase for duplicated code, code that could be consolidated, code that could/should be shared or otherwise lives in the wrong location. I want to find ways to simplify code. I want to do some tree shaking and remove dead code.
