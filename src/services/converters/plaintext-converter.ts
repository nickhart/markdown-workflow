/**
 * Plaintext Converter - Reference implementation using pandoc
 *
 * This converter demonstrates how to integrate external CLI tools using the
 * ExternalCLIConverter base class. It converts markdown to plain text using pandoc.
 */

import { ExternalCLIConverter } from './external-cli-converter.js';
import { ProcessorRegistry } from '../processors/base-processor.js';
import { type ExternalConverterDefinition } from '../../engine/schemas.js';

export class PlaintextConverter extends ExternalCLIConverter {
  readonly name = 'plaintext';
  readonly description = 'Convert markdown to plain text using pandoc';
  readonly version = '1.0.0';
  readonly supportedFormats = ['txt', 'text'];

  constructor(config: Record<string, unknown> = {}, processorRegistry: ProcessorRegistry) {
    super(config, processorRegistry);
  }

  protected getDefinition(): ExternalConverterDefinition {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      supported_formats: this.supportedFormats,
      detection: {
        command: 'pandoc --version',
      },
      execution: {
        command_template: 'pandoc {input_file} -t plain -o {output_file}',
        mode: 'output-file',
        backup: false,
        timeout: 60,
      },
    };
  }
}
