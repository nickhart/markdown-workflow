/**
 * Base converter interface for document conversion systems
 * Defines the contract for all document converters in the system
 */

import { ProcessorRegistry } from '../processors/base-processor.js';

export interface ConverterConfig {
  [key: string]: unknown;
}

export interface ConversionContext {
  collectionPath: string;
  inputFile: string;
  outputFile: string;
  format: string;
  referenceDoc?: string;
  assetsDir: string;
  intermediateDir: string;
  enabledProcessors?: string[];
}

export interface ConversionResult {
  success: boolean;
  outputFile: string;
  artifacts?: Array<{
    name: string;
    path: string;
    relativePath: string;
    type: 'asset' | 'intermediate' | 'output';
  }>;
  error?: string;
}

/**
 * Abstract base class for all document converters
 * Provides standardized interface for converting documents with processor integration
 */
export abstract class BaseConverter {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly version: string;
  abstract readonly supportedFormats: string[];

  protected config: ConverterConfig;
  protected processorRegistry: ProcessorRegistry;

  constructor(config: ConverterConfig = {}, processorRegistry: ProcessorRegistry) {
    this.config = config;
    this.processorRegistry = processorRegistry;
  }

  /**
   * Check if this converter supports the given format
   * @param format Output format to check
   * @returns true if format is supported
   */
  supportsFormat(format: string): boolean {
    return this.supportedFormats.includes(format);
  }

  /**
   * Convert document with processor integration
   * @param context Conversion context with input/output paths and settings
   * @returns Conversion result with output file and artifacts
   */
  async convert(context: ConversionContext): Promise<ConversionResult> {
    if (!this.supportsFormat(context.format)) {
      return {
        success: false,
        outputFile: context.outputFile,
        error: `Format ${context.format} not supported by ${this.name} converter`,
      };
    }

    try {
      // Step 1: Pre-process content with enabled processors
      const processedResult = await this.preProcessContent(context);

      if (!processedResult.success) {
        return {
          success: false,
          outputFile: context.outputFile,
          error: processedResult.error,
        };
      }

      // Step 2: Convert the processed document
      const conversionResult = await this.performConversion({
        ...context,
        inputFile: processedResult.processedFile || context.inputFile,
      });

      if (!conversionResult.success) {
        return conversionResult;
      }

      // Step 3: Combine artifacts from processing and conversion
      const allArtifacts = [
        ...(processedResult.artifacts || []),
        ...(conversionResult.artifacts || []),
      ];

      return {
        success: true,
        outputFile: conversionResult.outputFile,
        artifacts: allArtifacts,
      };
    } catch (error) {
      return {
        success: false,
        outputFile: context.outputFile,
        error: error instanceof Error ? error.message : 'Unknown conversion error',
      };
    }
  }

  /**
   * Pre-process content using enabled processors
   * @param context Conversion context
   * @returns Result with processed content and artifacts
   */
  protected async preProcessContent(context: ConversionContext): Promise<{
    success: boolean;
    processedFile?: string;
    artifacts?: ConversionResult['artifacts'];
    error?: string;
  }> {
    const enabledProcessors = context.enabledProcessors || [];

    if (enabledProcessors.length === 0) {
      return { success: true }; // No processing needed
    }

    const fs = await import('fs');
    const path = await import('path');

    try {
      // Read input content
      const content = fs.readFileSync(context.inputFile, 'utf8');

      // Process content through enabled processors
      const processingContext = {
        collectionPath: context.collectionPath,
        assetsDir: context.assetsDir,
        intermediateDir: context.intermediateDir,
        outputFormat: context.format,
      };

      const result = await this.processorRegistry.processContent(
        content,
        processingContext,
        enabledProcessors,
      );

      if (!result.success || !result.processedContent) {
        return {
          success: false,
          error: result.error || 'Content processing failed',
        };
      }

      // If no blocks were actually processed, don't create intermediate files
      if (result.blocksProcessed === 0) {
        return {
          success: true,
          // No processedFile - use original input file
          artifacts: result.artifacts,
        };
      }

      // Ensure intermediate directory exists before writing
      if (!fs.existsSync(context.intermediateDir)) {
        fs.mkdirSync(context.intermediateDir, { recursive: true });
      }

      // Write processed content to temporary file
      const processedFileName =
        path.basename(context.inputFile, path.extname(context.inputFile)) + '_processed.md';
      const processedFilePath = path.join(context.intermediateDir, processedFileName);

      fs.writeFileSync(processedFilePath, result.processedContent, 'utf8');

      return {
        success: true,
        processedFile: processedFilePath,
        artifacts: result.artifacts,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error',
      };
    }
  }

  /**
   * Perform the actual document conversion
   * Must be implemented by concrete converters
   * @param context Conversion context (may have updated inputFile from processing)
   * @returns Conversion result
   */
  protected abstract performConversion(context: ConversionContext): Promise<ConversionResult>;

  /**
   * Clean up intermediate files created during conversion
   * @param context Conversion context
   */
  async cleanup(context: ConversionContext): Promise<void> {
    // Clean up processor intermediate files
    if (context.enabledProcessors) {
      const processingContext = {
        collectionPath: context.collectionPath,
        assetsDir: context.assetsDir,
        intermediateDir: context.intermediateDir,
      };

      await this.processorRegistry.cleanup(processingContext, context.enabledProcessors);
    }

    // Clean up converter-specific intermediate files
    await this.cleanupConverterFiles(context);
  }

  /**
   * Clean up converter-specific intermediate files
   * Can be overridden by concrete converters
   * @param context Conversion context
   */
  protected async cleanupConverterFiles(context: ConversionContext): Promise<void> {
    // Default implementation - clean up processed markdown files
    const fs = await import('fs');
    const path = await import('path');

    try {
      const processedFileName =
        path.basename(context.inputFile, path.extname(context.inputFile)) + '_processed.md';
      const processedFilePath = path.join(context.intermediateDir, processedFileName);

      if (fs.existsSync(processedFilePath)) {
        fs.unlinkSync(processedFilePath);
        console.info(`🧹 Cleaned processed file: ${processedFileName}`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to clean up converter files: ${error}`);
    }
  }
}

/**
 * Registry for managing available converters
 */
export class ConverterRegistry {
  private converters = new Map<string, BaseConverter>();

  /**
   * Register a converter with the registry
   * @param converter Converter instance to register
   */
  register(converter: BaseConverter): void {
    this.converters.set(converter.name, converter);
    console.debug(`🔧 Registered converter: ${converter.name} (${converter.description})`);
  }

  /**
   * Get a converter by name
   * @param name Name of the converter
   * @returns Converter instance or undefined
   */
  get(name: string): BaseConverter | undefined {
    return this.converters.get(name);
  }

  /**
   * Get all registered converters
   * @returns Array of all converters
   */
  getAll(): BaseConverter[] {
    return Array.from(this.converters.values());
  }

  /**
   * Get converters that support the given format
   * @param format Output format to find converters for
   * @returns Array of converters that support the format
   */
  getConvertersByFormat(format: string): BaseConverter[] {
    return this.getAll().filter((converter) => converter.supportsFormat(format));
  }

  /**
   * Convert document using the specified converter
   * @param converterName Name of converter to use
   * @param context Conversion context
   * @returns Conversion result
   */
  async convert(converterName: string, context: ConversionContext): Promise<ConversionResult> {
    const converter = this.get(converterName);

    if (!converter) {
      return {
        success: false,
        outputFile: context.outputFile,
        error: `Converter '${converterName}' not found`,
      };
    }

    return await converter.convert(context);
  }
}

// Default global registry instance
export const defaultConverterRegistry = new ConverterRegistry();
