/**
 * Processor system exports
 * Provides access to all processors and utilities
 */

export { BaseProcessor, ProcessorRegistry, defaultProcessorRegistry } from './base-processor.js';
export type {
  ProcessorConfig,
  ProcessingContext,
  ProcessorBlock,
  ProcessingResult,
} from './base-processor.js';

// Import specific processors
export { MermaidProcessor } from '../mermaid-processor.js';
export { EmojiProcessor } from './emoji-processor.js';
export { PlantUMLProcessor } from './plantuml-processor.js';
export { GraphvizProcessor } from './graphviz-processor.js';

import { defaultProcessorRegistry } from './base-processor.js';
import { MermaidProcessor } from '../mermaid-processor.js';
import { EmojiProcessor } from './emoji-processor.js';
import { PlantUMLProcessor } from './plantuml-processor.js';
import { GraphvizProcessor } from './graphviz-processor.js';

// Convenience function to register default processors
export function registerDefaultProcessors() {
  // Create default processors with system config
  const mermaidConfig = {
    output_format: 'png' as const,
    theme: 'default' as const,
    timeout: 30,
    scale: 2,
    backgroundColor: 'white',
    fontFamily: 'arial,sans-serif',
  };

  const plantUMLConfig = {
    output_format: 'png' as const,
    timeout: 30,
  };

  const graphvizConfig = {
    output_format: 'png' as const,
    layout_engine: 'dot' as const,
    timeout: 30,
    dpi: 96,
    theme: 'default' as const,
    backgroundColor: 'white',
    fontFamily: 'arial,sans-serif',
  };

  const mermaidProcessor = new MermaidProcessor(mermaidConfig);
  const emojiProcessor = new EmojiProcessor({});
  const plantUMLProcessor = PlantUMLProcessor.create(plantUMLConfig);
  const graphvizProcessor = new GraphvizProcessor(graphvizConfig);

  // Register processors in order (emoji first, then diagrams)
  defaultProcessorRegistry.register(emojiProcessor);
  defaultProcessorRegistry.register(mermaidProcessor);
  defaultProcessorRegistry.register(plantUMLProcessor);
  defaultProcessorRegistry.register(graphvizProcessor);

  // Set processing order
  defaultProcessorRegistry.setProcessorOrder(['emoji', 'mermaid', 'plantuml', 'graphviz']);

  return {
    emoji: emojiProcessor,
    mermaid: mermaidProcessor,
    plantuml: plantUMLProcessor,
    graphviz: graphvizProcessor,
  };
}
