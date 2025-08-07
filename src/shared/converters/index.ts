/**
 * Converter system exports
 * Provides access to all converters and utilities
 */

export { BaseConverter, ConverterRegistry, defaultConverterRegistry } from './base-converter.js';
export type { ConverterConfig, ConversionContext, ConversionResult } from './base-converter.js';

export { PandocConverter } from './pandoc-converter.js';
export { PresentationConverter } from './presentation-converter.js';

import { defaultConverterRegistry } from './base-converter.js';
import { PandocConverter } from './pandoc-converter.js';
import { PresentationConverter } from './presentation-converter.js';
import { defaultProcessorRegistry } from '../processors/base-processor.js';

// Convenience function to register default converters
export function registerDefaultConverters() {
  // Register standard converters
  const pandocConverter = new PandocConverter({}, defaultProcessorRegistry);
  const presentationConverter = new PresentationConverter({}, defaultProcessorRegistry);

  defaultConverterRegistry.register(pandocConverter);
  defaultConverterRegistry.register(presentationConverter);

  return {
    pandoc: pandocConverter,
    presentation: presentationConverter,
  };
}
