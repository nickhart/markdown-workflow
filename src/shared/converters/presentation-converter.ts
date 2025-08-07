/**
 * Presentation document converter
 * Specialized converter for presentation workflows with enhanced diagram processing
 */

import * as path from 'path';
import * as fs from 'fs';
import { PandocConverter } from './pandoc-converter.js';
import { ConversionContext, ConversionResult, ConverterConfig } from './base-converter.js';
import type { ProcessorRegistry } from '../processors/base-processor.js';

/**
 * Presentation converter implementation
 * Extends PandocConverter with presentation-specific optimizations and processor configurations
 */
export class PresentationConverter extends PandocConverter {
  constructor(config: ConverterConfig = {}, processorRegistry: ProcessorRegistry) {
    super(
      config,
      processorRegistry,
      'presentation',
      'Convert presentations with advanced diagram processing and presentation-optimized output',
      ['pptx', 'html', 'pdf'],
    );
  }

  /**
   * Pre-process content with presentation-specific processor configuration
   * Ensures Mermaid processor is enabled for presentations by default
   */
  protected async preProcessContent(context: ConversionContext): Promise<{
    success: boolean;
    processedFile?: string;
    artifacts?: ConversionResult['artifacts'];
    error?: string;
  }> {
    // Default enabled processors for presentations
    const defaultProcessors = ['mermaid'];

    // Merge with any explicitly enabled processors
    const enabledProcessors = context.enabledProcessors || defaultProcessors;

    // Ensure mermaid is included unless explicitly disabled
    if (!enabledProcessors.includes('mermaid') && !context.enabledProcessors?.length) {
      enabledProcessors.push('mermaid');
    }

    console.info(`🎯 Presentation processing with processors: ${enabledProcessors.join(', ')}`);

    return super.preProcessContent({
      ...context,
      enabledProcessors,
    });
  }

  /**
   * Perform presentation-specific conversion with optimized settings
   */
  protected async performConversion(context: ConversionContext): Promise<ConversionResult> {
    // Apply presentation-specific optimizations
    const optimizedContext = this.optimizeForPresentation(context);

    console.info(`🎨 Converting presentation to ${context.format.toUpperCase()} format`);

    return super.performConversion(optimizedContext);
  }

  /**
   * Apply presentation-specific optimizations to context
   */
  private optimizeForPresentation(context: ConversionContext): ConversionContext {
    const optimizedContext = { ...context };

    // Apply format-specific optimizations
    switch (context.format) {
      case 'pptx':
        // Ensure we use presentation reference document for PPTX
        if (!optimizedContext.referenceDoc) {
          // Look for presentation reference document in workflow templates
          const potentialRef = path.join(
            path.dirname(context.collectionPath),
            '..',
            '..',
            'workflows',
            'presentation',
            'templates',
            'static',
            'reference.pptx',
          );
          if (fs.existsSync(potentialRef)) {
            optimizedContext.referenceDoc = potentialRef;
            console.debug(`📄 Using presentation reference: ${path.basename(potentialRef)}`);
          }
        }
        break;

      case 'html':
        // For HTML, we could add presentation-specific CSS styling
        console.debug('🎨 Applying presentation HTML optimizations');
        break;

      case 'pdf':
        // For PDF, ensure appropriate page layout
        console.debug('📄 Applying presentation PDF optimizations');
        break;
    }

    return optimizedContext;
  }

  /**
   * Enhanced cleanup for presentation files
   * Preserves intermediate diagram files for debugging
   */
  protected async cleanupConverterFiles(context: ConversionContext): Promise<void> {
    console.info('🎯 Preserving presentation intermediate files for debugging');

    // For presentations, we're more conservative about cleanup
    // Only clean up the processed markdown file, preserve diagram intermediates
    const fs = await import('fs');
    const path = await import('path');

    try {
      const processedFileName =
        path.basename(context.inputFile, path.extname(context.inputFile)) + '_processed.md';
      const processedFilePath = path.join(context.intermediateDir, processedFileName);

      if (fs.existsSync(processedFilePath)) {
        // For presentations, we might want to keep this for debugging
        console.debug(`💾 Keeping processed file for debugging: ${processedFileName}`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to manage presentation converter files: ${error}`);
    }
  }
}
