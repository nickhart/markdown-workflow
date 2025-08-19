/**
 * Converter system exports
 * Provides access to all converters and utilities
 */

export { BaseConverter, ConverterRegistry, defaultConverterRegistry } from './base-converter';
export type { ConverterConfig, ConversionContext, ConversionResult } from './base-converter';

export { PandocConverter } from './pandoc-converter';
export { PresentationConverter } from './presentation-converter';

import { defaultConverterRegistry } from './base-converter';
import { PandocConverter } from './pandoc-converter';
import { PresentationConverter } from './presentation-converter';
import { defaultProcessorRegistry } from '../processors/base-processor';

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
