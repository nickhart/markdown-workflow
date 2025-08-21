/**
 * Base processor interface for extensible content processing
 * Defines the contract for all content processors in the system
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ProcessorConfig {
  [key: string]: unknown;
}

export interface ProcessingContext {
  collectionPath: string;
  assetsDir: string;
  intermediateDir: string;
  outputFormat?: string;
}

export interface ProcessorBlock {
  name: string;
  content: string;
  startIndex: number;
  endIndex: number;
  metadata?: Record<string, unknown>;
}

export interface ProcessingResult {
  success: boolean;
  processedContent?: string;
  artifacts?: Array<{
    name: string;
    path: string;
    relativePath: string;
    type: 'asset' | 'intermediate' | 'output';
  }>;
  error?: string;
  blocksProcessed?: number;
}

/**
 * Abstract base class for all content processors
 * Provides standardized interface for processing different content types
 */
export abstract class BaseProcessor {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;

  // File extension definitions
  abstract readonly intermediateExtension: string; // e.g., '.mmd', '.puml', '.emoji.md'
  abstract readonly supportedInputExtensions: string[]; // e.g., ['.md', '.markdown']
  abstract readonly outputExtensions: string[]; // e.g., ['.png', '.svg']

  // Processing capabilities
  abstract readonly supportedOutputFormats: string[]; // e.g., ['png', 'svg', 'pdf']

  protected config: ProcessorConfig;

  constructor(config: ProcessorConfig = {}) {
    this.config = config;
  }

  /**
   * Check if this processor can process the given content
   * @param content The content to analyze
   * @returns true if processor can handle this content
   */
  abstract canProcess(content: string): boolean;

  /**
   * Detect and extract blocks that this processor can handle
   * @param content The content to analyze
   * @returns Array of processor blocks found
   */
  abstract detectBlocks(content: string): ProcessorBlock[];

  /**
   * Process content and generate artifacts
   * @param content The content to process
   * @param context Processing context with paths and settings
   * @returns Processing result with artifacts and processed content
   */
  abstract process(content: string, context: ProcessingContext): Promise<ProcessingResult>;

  /**
   * Clean up intermediate files for this processor
   * @param context Processing context
   * @returns Promise that resolves when cleanup is complete
   */
  async cleanup(context: ProcessingContext): Promise<void> {
    // Default implementation - can be overridden by processors
    const fs = await import('fs');
    const path = await import('path');

    const processorDir = path.join(context.intermediateDir, this.name);
    if (fs.existsSync(processorDir)) {
      fs.rmSync(processorDir, { recursive: true, force: true });
      console.info(`🧹 Cleaned intermediate files for ${this.name} processor`);
    }
  }

  /**
   * Get the intermediate file path for a given block
   * @param blockName Name of the block
   * @param context Processing context
   * @returns Full path to intermediate file
   */
  protected getIntermediateFilePath(blockName: string, context: ProcessingContext): string {
    const processorDir = path.join(context.intermediateDir, this.name);
    return path.join(processorDir, `${blockName}${this.intermediateExtension}`);
  }

  /**
   * Get the output asset path for a given block
   * @param blockName Name of the block
   * @param context Processing context
   * @param extension Output extension (defaults to first supported)
   * @returns Full path to output asset
   */
  protected getAssetFilePath(
    blockName: string,
    context: ProcessingContext,
    extension?: string,
  ): string {
    const outputExt = extension || this.outputExtensions[0];
    return path.join(context.assetsDir, `${blockName}${outputExt}`);
  }

  /**
   * Ensure processor directories exist
   * @param context Processing context
   */
  protected ensureDirectories(context: ProcessingContext): void {
    const processorDir = path.join(context.intermediateDir, this.name);
    if (!fs.existsSync(processorDir)) {
      fs.mkdirSync(processorDir, { recursive: true });
    }

    if (!fs.existsSync(context.assetsDir)) {
      fs.mkdirSync(context.assetsDir, { recursive: true });
    }
  }

  /**
   * Check if intermediate content has changed
   * @param filePath Path to intermediate file
   * @param newContent New content to compare
   * @returns true if content has changed
   */
  protected hasContentChanged(filePath: string, newContent: string): boolean {
    if (!fs.existsSync(filePath)) {
      return true; // File doesn't exist, so content has "changed"
    }

    const existingContent = fs.readFileSync(filePath, 'utf8');
    return existingContent !== newContent;
  }

  /**
   * Check if output file needs regeneration based on timestamps
   * @param outputPath Path to output file
   * @param inputPath Path to input/intermediate file
   * @returns true if regeneration is needed
   */
  protected needsRegeneration(outputPath: string, inputPath: string): boolean {
    if (!fs.existsSync(outputPath)) {
      return true; // Output doesn't exist, need to generate
    }

    if (!fs.existsSync(inputPath)) {
      return true; // Input doesn't exist, need to generate
    }

    try {
      const outputStats = fs.statSync(outputPath);
      const inputStats = fs.statSync(inputPath);

      // Handle mocked fs in tests where mtime might be undefined
      if (!outputStats.mtime || !inputStats.mtime) {
        return true; // Default to regenerating if we can't get timestamps
      }

      // Regenerate if input file is newer than output
      return inputStats.mtime > outputStats.mtime;
    } catch {
      // If we can't get stats, default to regenerating
      return true;
    }
  }

  /**
   * Calculate relative path from intermediate directory to asset
   * @param assetPath Absolute path to asset
   * @param context Processing context
   * @returns Relative path for use in processed content
   */
  protected getRelativePath(assetPath: string, context: ProcessingContext): string {
    return path.relative(context.intermediateDir, assetPath).replace(/\\/g, '/');
  }
}

/**
 * Registry for managing available processors
 */
export class ProcessorRegistry {
  private processors = new Map<string, BaseProcessor>();
  private processorOrder: string[] = [];

  /**
   * Register a processor with the registry
   * @param processor Processor instance to register
   */
  register(processor: BaseProcessor): void {
    this.processors.set(processor.name, processor);
    if (!this.processorOrder.includes(processor.name)) {
      this.processorOrder.push(processor.name);
    }
    console.debug(`📝 Registered processor: ${processor.name} (${processor.description})`);
  }

  /**
   * Get a processor by name
   * @param name Name of the processor
   * @returns Processor instance or undefined
   */
  get(name: string): BaseProcessor | undefined {
    return this.processors.get(name);
  }

  /**
   * Get all registered processors
   * @returns Array of all processors
   */
  getAll(): BaseProcessor[] {
    return Array.from(this.processors.values());
  }

  /**
   * Get processors that can handle the given content
   * @param content Content to analyze
   * @returns Array of processors that can handle the content
   */
  getProcessorsForContent(content: string): BaseProcessor[] {
    return this.getAll().filter((processor) => processor.canProcess(content));
  }

  /**
   * Get processors by output format
   * @param format Output format to find processors for
   * @returns Array of processors that support the format
   */
  getProcessorsByFormat(format: string): BaseProcessor[] {
    return this.getAll().filter((processor) => processor.supportedOutputFormats.includes(format));
  }

  /**
   * Set the processing order for processors
   * @param order Array of processor names in desired order
   */
  setProcessorOrder(order: string[]): void {
    // Validate that all processors in order are registered
    const unregistered = order.filter((name) => !this.processors.has(name));
    if (unregistered.length > 0) {
      throw new Error(`Cannot set order: unregistered processors: ${unregistered.join(', ')}`);
    }

    this.processorOrder = [...order];
    console.debug(`🔄 Updated processor order: ${order.join(' → ')}`);
  }

  /**
   * Get processors in the configured order
   * @param names Optional list of specific processor names to get in order
   * @returns Array of processors in the configured order
   */
  getProcessorsInOrder(names?: string[]): BaseProcessor[] {
    const targetNames = names || this.processorOrder;
    return targetNames
      .filter((name) => this.processors.has(name))
      .map((name) => {
        const processor = this.processors.get(name);
        if (!processor) {
          throw new Error(`Processor '${name}' not found in registry`);
        }
        return processor;
      });
  }

  /**
   * Process content through multiple processors in sequence
   * @param content Initial content
   * @param context Processing context
   * @param enabledProcessors List of processor names to use
   * @returns Final processing result
   */
  async processContent(
    content: string,
    context: ProcessingContext,
    enabledProcessors: string[],
  ): Promise<ProcessingResult> {
    const processors = this.getProcessorsInOrder(enabledProcessors);
    let currentContent = content;
    const allArtifacts: ProcessingResult['artifacts'] = [];
    let totalBlocksProcessed = 0;

    for (const processor of processors) {
      if (processor.canProcess(currentContent)) {
        console.info(`🔄 Processing with ${processor.name}...`);

        const result = await processor.process(currentContent, context);

        if (result.success && result.processedContent) {
          currentContent = result.processedContent;
          if (result.artifacts) {
            allArtifacts.push(...result.artifacts);
          }
          totalBlocksProcessed += result.blocksProcessed || 0;
          console.info(`✅ ${processor.name} processed ${result.blocksProcessed || 0} blocks`);
        } else {
          console.warn(`⚠️  ${processor.name} processing failed: ${result.error}`);
        }
      } else {
        console.debug(`⏭️  Skipping ${processor.name} (no matching content)`);
      }
    }

    return {
      success: true,
      processedContent: currentContent,
      artifacts: allArtifacts,
      blocksProcessed: totalBlocksProcessed,
    };
  }

  /**
   * Clean up intermediate files for specified processors
   * @param context Processing context
   * @param processorNames Optional list of specific processors to clean
   */
  async cleanup(context: ProcessingContext, processorNames?: string[]): Promise<void> {
    const processors = processorNames
      ? (processorNames.map((name) => this.get(name)).filter(Boolean) as BaseProcessor[])
      : this.getAll();

    for (const processor of processors) {
      await processor.cleanup(context);
    }
  }
}

// Default global registry instance
export const defaultProcessorRegistry = new ProcessorRegistry();
