/**
 * External CLI Processor - Base class for integrating external command-line tools
 *
 * This class provides a framework for wrapping external CLI tools as processors.
 * It handles tool detection, command execution, and error handling in a consistent way.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  BaseProcessor,
  ProcessorBlock,
  ProcessingContext,
  ProcessingResult,
} from './base-processor.js';
import {
  type ExternalProcessorDefinition,
  type ExternalCLIDetection as _ExternalCLIDetection,
  type ExternalCLIExecution as _ExternalCLIExecution,
} from '../../engine/schemas.js';

export abstract class ExternalCLIProcessor extends BaseProcessor {
  protected abstract getDefinition(): ExternalProcessorDefinition;

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
   * Detect if content can be processed by this external tool
   */
  canProcess(content: string): boolean {
    const definition = this.getDefinition();
    if (!definition.detection.pattern) {
      return true; // Process all content if no pattern specified
    }

    try {
      const regex = new RegExp(definition.detection.pattern, 'gm');
      return regex.test(content);
    } catch (_error) {
      console.warn(`Invalid regex pattern for ${this.name}: ${definition.detection.pattern}`);
      return false;
    }
  }

  /**
   * Detect blocks in content (for processors that work on specific blocks)
   * Default implementation treats entire content as one block
   */
  detectBlocks(content: string): ProcessorBlock[] {
    if (!this.canProcess(content)) {
      return [];
    }

    return [
      {
        name: 'content',
        content: content,
        startIndex: 0,
        endIndex: content.length,
      },
    ];
  }

  /**
   * Process content using the external CLI tool
   */
  async process(content: string, context: ProcessingContext): Promise<ProcessingResult> {
    const definition = this.getDefinition();

    // Check if tool is available
    if (!(await this.isToolAvailable())) {
      return {
        success: false,
        error: `External tool not available for processor: ${this.name}`,
      };
    }

    try {
      let processedContent = content;
      const artifacts: Array<{
        name: string;
        path: string;
        relativePath: string;
        type: 'asset' | 'intermediate' | 'output';
      }> = [];

      if (definition.execution.mode === 'in-place') {
        // Process content in-place (modify the content directly)
        processedContent = await this.processInPlace(content, context, definition);
      } else {
        // Process with output file
        const result = await this.processWithOutput(content, context, definition);
        processedContent = result.content;
        artifacts.push(...result.artifacts);
      }

      return {
        success: true,
        processedContent,
        artifacts,
        blocksProcessed: 1,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`⚠️  External CLI processing failed for ${this.name}: ${errorMsg}`);
      return {
        success: false,
        error: `External CLI processing failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Process content in-place (modify content directly)
   */
  private async processInPlace(
    content: string,
    context: ProcessingContext,
    definition: ExternalProcessorDefinition,
  ): Promise<string> {
    // Create temporary file with content
    const tempFile = path.join(context.intermediateDir, `temp-${Date.now()}.md`);

    // Ensure intermediate directory exists
    if (!fs.existsSync(context.intermediateDir)) {
      fs.mkdirSync(context.intermediateDir, { recursive: true });
    }

    // Create backup if requested
    if (definition.execution.backup) {
      const backupFile = `${tempFile}.bak`;
      fs.writeFileSync(backupFile, content);
    }

    try {
      // Write content to temp file
      fs.writeFileSync(tempFile, content);

      // Execute command with variable substitution
      const command = this.substituteVariables(definition.execution.command_template, {
        file: tempFile,
        input_file: tempFile,
        temp_dir: context.intermediateDir,
        assets_dir: context.assetsDir,
        collection_path: context.collectionPath,
      });

      execSync(command, {
        stdio: 'pipe',
        timeout: (definition.execution.timeout || 30) * 1000,
        encoding: 'utf8',
      });

      // Read processed content back
      const processedContent = fs.readFileSync(tempFile, 'utf8');
      return processedContent;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }

  /**
   * Process content with output file
   */
  private async processWithOutput(
    content: string,
    context: ProcessingContext,
    definition: ExternalProcessorDefinition,
  ): Promise<{
    content: string;
    artifacts: Array<{
      name: string;
      path: string;
      relativePath: string;
      type: 'asset' | 'intermediate' | 'output';
    }>;
  }> {
    const tempInputFile = path.join(context.intermediateDir, `input-${Date.now()}.md`);
    const outputFile = path.join(context.assetsDir, `output-${Date.now()}.md`);

    // Ensure directories exist
    if (!fs.existsSync(context.intermediateDir)) {
      fs.mkdirSync(context.intermediateDir, { recursive: true });
    }
    if (!fs.existsSync(context.assetsDir)) {
      fs.mkdirSync(context.assetsDir, { recursive: true });
    }

    try {
      // Write input content
      fs.writeFileSync(tempInputFile, content);

      // Execute command with variable substitution
      const command = this.substituteVariables(definition.execution.command_template, {
        input_file: tempInputFile,
        output_file: outputFile,
        temp_dir: context.intermediateDir,
        assets_dir: context.assetsDir,
        collection_path: context.collectionPath,
      });

      execSync(command, {
        stdio: 'pipe',
        timeout: (definition.execution.timeout || 30) * 1000,
        encoding: 'utf8',
      });

      // Read output if it exists, otherwise return original content
      let processedContent = content;
      const artifacts: Array<{
        name: string;
        path: string;
        relativePath: string;
        type: 'asset' | 'intermediate' | 'output';
      }> = [];

      if (fs.existsSync(outputFile)) {
        processedContent = fs.readFileSync(outputFile, 'utf8');
        artifacts.push({
          name: path.basename(outputFile),
          path: outputFile,
          relativePath: path.relative(context.collectionPath, outputFile),
          type: 'output',
        });
      }

      return { content: processedContent, artifacts };
    } finally {
      // Clean up temp input file
      if (fs.existsSync(tempInputFile)) {
        fs.unlinkSync(tempInputFile);
      }
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

  /**
   * Default cleanup implementation
   */
  async cleanup(_context: ProcessingContext): Promise<void> {
    console.info(`🧹 Cleaned up external CLI processor: ${this.name}`);
  }

  // Abstract properties that must be implemented by subclasses
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;

  // File extension defaults for external CLI processors
  readonly intermediateExtension = '.tmp';
  readonly supportedInputExtensions = ['.md', '.markdown'];
  readonly outputExtensions = ['.md'];
  readonly supportedOutputFormats = ['md'];
}
