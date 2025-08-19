/**
 * External CLI Discovery Service
 *
 * This service handles discovery and registration of user-defined external CLI
 * processors and converters from YAML configuration files.
 */

import * as _fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import {
  ExternalProcessorFileSchema,
  ExternalConverterFileSchema,
  type ExternalProcessorFile as _ExternalProcessorFile,
  type ExternalConverterFile as _ExternalConverterFile,
  type ExternalProcessorDefinition,
  type ExternalConverterDefinition,
} from '../engine/schemas.js';
import { ExternalCLIProcessor } from './processors/external-cli-processor.js';
import { ExternalCLIConverter } from './converters/external-cli-converter.js';
import { ProcessorRegistry } from './processors/base-processor.js';
import { ConverterRegistry } from './converters/base-converter.js';
import { SystemInterface, NodeSystemInterface } from '../engine/system-interface.js';

/**
 * Dynamic processor implementation that wraps YAML definitions
 */
class YAMLDefinedProcessor extends ExternalCLIProcessor {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  private definition: ExternalProcessorDefinition;

  constructor(definition: ExternalProcessorDefinition) {
    super();
    this.definition = definition;
    this.name = definition.name;
    this.description = definition.description;
    this.version = definition.version;
  }

  protected getDefinition(): ExternalProcessorDefinition {
    return this.definition;
  }
}

/**
 * Dynamic converter implementation that wraps YAML definitions
 */
class YAMLDefinedConverter extends ExternalCLIConverter {
  private definition: ExternalConverterDefinition;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly supportedFormats: string[];

  constructor(definition: ExternalConverterDefinition, processorRegistry: ProcessorRegistry) {
    super({}, processorRegistry);
    this.definition = definition;
    this.name = definition.name;
    this.description = definition.description;
    this.version = definition.version;
    this.supportedFormats = definition.supported_formats;
  }

  protected getDefinition(): ExternalConverterDefinition {
    return this.definition;
  }
}

export class ExternalCLIDiscoveryService {
  private systemInterface: SystemInterface;

  constructor(systemInterface: SystemInterface = new NodeSystemInterface()) {
    this.systemInterface = systemInterface;
  }

  /**
   * Load and register external processors from a project directory
   */
  async loadProcessors(
    projectRoot: string,
    processorRegistry: ProcessorRegistry,
  ): Promise<{ loaded: string[]; failed: string[] }> {
    const processorsDir = path.join(projectRoot, '.markdown-workflow', 'processors');

    if (!this.systemInterface.existsSync(processorsDir)) {
      console.debug(`📁 No processors directory found at: ${processorsDir}`);
      return { loaded: [], failed: [] };
    }

    const loaded: string[] = [];
    const failed: string[] = [];

    try {
      const files = this.systemInterface
        .readdirSync(processorsDir)
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.yml'))
        .map((dirent) => dirent.name);

      for (const file of files) {
        const filePath = path.join(processorsDir, file);
        try {
          const content = this.systemInterface.readFileSync(filePath);
          const yamlData = YAML.parse(content);

          // Validate against schema
          const parseResult = ExternalProcessorFileSchema.safeParse(yamlData);
          if (!parseResult.success) {
            console.warn(
              `❌ Invalid processor definition in ${file}: ${parseResult.error.message}`,
            );
            failed.push(file);
            continue;
          }

          const processorDef = parseResult.data.processor;
          const processor = new YAMLDefinedProcessor(processorDef);

          // Check if tool is available before registering
          if (await processor.isToolAvailable()) {
            processorRegistry.register(processor);
            loaded.push(processor.name);
            console.log(
              `📝 Loaded external processor: ${processor.name} (${processor.description})`,
            );
          } else {
            console.warn(`⚠️  External tool not available for processor: ${processor.name}`);
            failed.push(file);
          }
        } catch (error) {
          console.error(`❌ Failed to load processor from ${file}:`, error);
          failed.push(file);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to read processors directory: ${processorsDir}`, error);
    }

    return { loaded, failed };
  }

  /**
   * Load and register external converters from a project directory
   */
  async loadConverters(
    projectRoot: string,
    converterRegistry: ConverterRegistry,
    processorRegistry: ProcessorRegistry,
  ): Promise<{ loaded: string[]; failed: string[] }> {
    const convertersDir = path.join(projectRoot, '.markdown-workflow', 'converters');

    if (!this.systemInterface.existsSync(convertersDir)) {
      console.debug(`📁 No converters directory found at: ${convertersDir}`);
      return { loaded: [], failed: [] };
    }

    const loaded: string[] = [];
    const failed: string[] = [];

    try {
      const files = this.systemInterface
        .readdirSync(convertersDir)
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.yml'))
        .map((dirent) => dirent.name);

      for (const file of files) {
        const filePath = path.join(convertersDir, file);
        try {
          const content = this.systemInterface.readFileSync(filePath);
          const yamlData = YAML.parse(content);

          // Validate against schema
          const parseResult = ExternalConverterFileSchema.safeParse(yamlData);
          if (!parseResult.success) {
            console.warn(
              `❌ Invalid converter definition in ${file}: ${parseResult.error.message}`,
            );
            failed.push(file);
            continue;
          }

          const converterDef = parseResult.data.converter;
          const converter = new YAMLDefinedConverter(converterDef, processorRegistry);

          // Check if tool is available before registering
          if (await converter.isToolAvailable()) {
            converterRegistry.register(converter);
            loaded.push(converter.name);
            console.log(
              `🔧 Loaded external converter: ${converter.name} (${converter.description})`,
            );
          } else {
            console.warn(`⚠️  External tool not available for converter: ${converter.name}`);
            failed.push(file);
          }
        } catch (error) {
          console.error(`❌ Failed to load converter from ${file}:`, error);
          failed.push(file);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to read converters directory: ${convertersDir}`, error);
    }

    return { loaded, failed };
  }

  /**
   * Load both processors and converters from a project directory
   */
  async loadExternalCLIDefinitions(
    projectRoot: string,
    processorRegistry: ProcessorRegistry,
    converterRegistry: ConverterRegistry,
  ): Promise<{
    processors: { loaded: string[]; failed: string[] };
    converters: { loaded: string[]; failed: string[] };
  }> {
    console.log(`🔍 Scanning for external CLI definitions in: ${projectRoot}`);

    const [processors, converters] = await Promise.all([
      this.loadProcessors(projectRoot, processorRegistry),
      this.loadConverters(projectRoot, converterRegistry, processorRegistry),
    ]);

    const totalLoaded = processors.loaded.length + converters.loaded.length;
    const totalFailed = processors.failed.length + converters.failed.length;

    if (totalLoaded > 0) {
      console.log(
        `✅ Loaded ${totalLoaded} external CLI definitions (${processors.loaded.length} processors, ${converters.loaded.length} converters)`,
      );
    }

    if (totalFailed > 0) {
      console.warn(`⚠️  Failed to load ${totalFailed} external CLI definitions`);
    }

    return { processors, converters };
  }
}
