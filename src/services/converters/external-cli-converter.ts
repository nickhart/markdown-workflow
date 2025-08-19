/**
 * External CLI Converter - Base class for integrating external command-line conversion tools
 *
 * This class provides a framework for wrapping external CLI tools as document converters.
 * It handles tool detection, command execution, and error handling in a consistent way.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { BaseConverter, ConversionContext, ConversionResult } from './base-converter.js';
import { ProcessorRegistry } from '../processors/base-processor.js';
import { type ExternalConverterDefinition } from '../../engine/schemas.js';

export abstract class ExternalCLIConverter extends BaseConverter {
  protected abstract getDefinition(): ExternalConverterDefinition;

  readonly supportedFormats: string[];

  constructor(config: Record<string, unknown> = {}, processorRegistry: ProcessorRegistry) {
    super(config, processorRegistry);

    // Set properties from definition
    const definition = this.getDefinition();
    this.supportedFormats = definition.supported_formats;
  }

  /**
   * Check if the external tool is available
   */
  async isToolAvailable(): Promise<boolean> {
    const definition = this.getDefinition();
    try {
      execSync(definition.detection.command, {
        stdio: 'pipe',
        timeout: 10000,
        encoding: 'utf8',
      });
      return true;
    } catch (error) {
      console.warn(
        `⚠️  External tool detection failed for ${this.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Perform the actual document conversion using external CLI tool
   */
  protected async performConversion(context: ConversionContext): Promise<ConversionResult> {
    const definition = this.getDefinition();

    // Check if tool is available
    if (!(await this.isToolAvailable())) {
      return {
        success: false,
        outputFile: context.outputFile,
        error: `External tool not available for converter: ${this.name}`,
      };
    }

    // Check if format is supported
    if (!definition.supported_formats.includes(context.format)) {
      return {
        success: false,
        outputFile: context.outputFile,
        error: `Format '${context.format}' not supported by ${this.name}. Supported formats: ${definition.supported_formats.join(', ')}`,
      };
    }

    try {
      // Ensure output directory exists
      const outputDir = path.dirname(context.outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Execute conversion command with variable substitution
      const command = this.substituteVariables(definition.execution.command_template, {
        input_file: context.inputFile,
        input: context.inputFile,
        output_file: context.outputFile,
        output: context.outputFile,
        format: context.format,
        reference_doc: context.referenceDoc || '',
        assets_dir: context.assetsDir,
        intermediate_dir: context.intermediateDir,
        collection_path: context.collectionPath,
      });

      console.log(`🔄 Running external converter: ${command}`);

      execSync(command, {
        stdio: 'pipe',
        timeout: (definition.execution.timeout || 60) * 1000,
        encoding: 'utf8',
      });

      // Verify output file was created
      if (!fs.existsSync(context.outputFile)) {
        throw new Error(`Output file was not created: ${context.outputFile}`);
      }

      console.log(`✅ External conversion completed: ${path.basename(context.outputFile)}`);

      return {
        success: true,
        outputFile: context.outputFile,
        artifacts: [
          {
            name: path.basename(context.outputFile),
            path: context.outputFile,
            relativePath: path.relative(context.collectionPath, context.outputFile),
            type: 'output',
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ External CLI conversion failed for ${this.name}: ${errorMsg}`);
      return {
        success: false,
        outputFile: context.outputFile,
        error: `External CLI conversion failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Substitute variables in command template
   */
  private substituteVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      result = result.replace(
        new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        value,
      );
    }
    return result;
  }

  // Abstract properties that must be implemented by subclasses
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;
}
