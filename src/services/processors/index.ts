/**
 * Processor system exports
 * Provides access to all processors and utilities
 */

export { BaseProcessor, ProcessorRegistry, defaultProcessorRegistry } from './base-processor';
export type {
  ProcessorConfig,
  ProcessingContext,
  ProcessorBlock,
  ProcessingResult,
} from './base-processor';

// Import specific processors
export { MermaidProcessor } from '../mermaid-processor';
export { EmojiProcessor } from './emoji-processor';
export { PlantUMLProcessor } from './plantuml-processor';
export { GraphvizProcessor } from './graphviz-processor';

import { defaultProcessorRegistry } from './base-processor';
import { MermaidProcessor } from '../mermaid-processor';
import { EmojiProcessor } from './emoji-processor';
import { PlantUMLProcessor } from './plantuml-processor';
import { GraphvizProcessor } from './graphviz-processor';

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
