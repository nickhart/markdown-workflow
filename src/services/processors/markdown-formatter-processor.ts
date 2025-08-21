/**
 * Markdown Formatter Processor - Reference implementation using prettier
 *
 * This processor demonstrates how to integrate external CLI tools using the
 * ExternalCLIProcessor base class. It formats markdown files using prettier.
 */

import { ExternalCLIProcessor } from './external-cli-processor.js';
import { type ExternalProcessorDefinition } from '../../engine/schemas.js';

export class MarkdownFormatterProcessor extends ExternalCLIProcessor {
  readonly name = 'markdown-formatter';
  readonly description = 'Format markdown files using prettier';
  readonly version = '1.0.0';

  protected getDefinition(): ExternalProcessorDefinition {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      detection: {
        command: 'prettier --version',
        pattern: '.*\\.md$', // Process all markdown files
      },
      execution: {
        command_template: 'prettier --write --parser markdown {file}',
        mode: 'in-place',
        backup: true,
        timeout: 30,
      },
    };
  }
}
