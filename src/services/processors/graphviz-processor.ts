/**
 * Graphviz processor
 * Processes Graphviz DOT blocks and generates diagram images
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  BaseProcessor,
  ProcessorBlock,
  ProcessingContext,
  ProcessingResult,
} from './base-processor';

export interface GraphvizConfig {
  output_format: 'png' | 'svg' | 'pdf' | 'jpeg';
  layout_engine: 'dot' | 'neato' | 'fdp' | 'sfdp' | 'twopi' | 'circo';
  timeout: number;
  dpi?: number; // For high-resolution output
  theme?: 'default' | 'dark' | 'light';
  backgroundColor?: string;
  fontFamily?: string;
  [key: string]: unknown; // Make it compatible with ProcessorConfig
}

export interface GraphvizGenerationResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * Graphviz diagram processor
 * Processes Graphviz DOT blocks and generates diagram images
 */
export class GraphvizProcessor extends BaseProcessor {
  readonly name = 'graphviz';
  readonly description = 'Process Graphviz DOT diagrams and generate images';
  readonly version = '1.0.0';
  readonly intermediateExtension = '.dot';
  readonly supportedInputExtensions = ['.md', '.markdown'];
  readonly outputExtensions = ['.png', '.svg', '.pdf', '.jpeg'];
  readonly supportedOutputFormats = ['png', 'svg', 'pdf', 'jpeg'];

  private graphvizConfig: GraphvizConfig;

  constructor(config: GraphvizConfig) {
    super(config);
    this.graphvizConfig = config;
  }

  /**
   * Create processor from system configuration
   */
  static fromSystemConfig(systemConfig: { graphviz?: Partial<GraphvizConfig> }): GraphvizProcessor {
    // Provide default configuration if graphviz config is missing
    const defaultConfig: GraphvizConfig = {
      output_format: 'png',
      layout_engine: 'dot',
      timeout: 30,
      dpi: 96,
      theme: 'default',
      backgroundColor: 'white',
      fontFamily: 'arial,sans-serif',
    };

    const graphvizConfig = { ...defaultConfig, ...systemConfig.graphviz };
    return new GraphvizProcessor(graphvizConfig);
  }

  /**
   * Check if Graphviz CLI is available
   */
  static async detectGraphvizCLI(): Promise<boolean> {
    try {
      // Try to run the Graphviz CLI version command
      execSync('dot -V', {
        stdio: 'pipe',
        timeout: 10000,
        encoding: 'utf8',
      });
      return true;
    } catch (error) {
      try {
        // Alternative: check if graphviz is in PATH
        execSync('which dot', {
          stdio: 'pipe',
          timeout: 5000,
          encoding: 'utf8',
        });
        return true;
      } catch {
        console.warn(
          `⚠️  Graphviz CLI detection failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      }
    }
  }

  /**
   * Check if content contains Graphviz blocks
   */
  canProcess(content: string): boolean {
    const regex = /```graphviz:[\w-]+.*?\n[\s\S]*?\n```/g;
    return regex.test(content);
  }

  /**
   * Detect and extract Graphviz blocks from markdown content
   * Supports syntax: ```graphviz:name {params...}
   */
  detectBlocks(markdown: string): ProcessorBlock[] {
    const blocks: ProcessorBlock[] = [];

    // Match graphviz:name {params} code blocks
    const regex = /```graphviz:([\w-]+)(?:\s*\{([^}]*)\})?\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      const [, name, params, content] = match;
      blocks.push({
        name,
        content,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        metadata: {
          params: params ? this.parseParams(params) : {},
        },
      });
    }

    return blocks;
  }

  /**
   * Parse parameters from the graphviz block header
   * Format: {layout=neato, theme=dark, dpi=300}
   */
  private parseParams(paramsString: string): Record<string, string> {
    const params: Record<string, string> = {};

    // Remove spaces and split by comma
    const pairs = paramsString.replace(/\s/g, '').split(',');

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[key.trim()] = value.trim();
      }
    }

    return params;
  }

  /**
   * Process content to generate Graphviz diagrams
   */
  async process(content: string, context: ProcessingContext): Promise<ProcessingResult> {
    const blocks = this.detectBlocks(content);

    if (blocks.length === 0) {
      return {
        success: true,
        processedContent: content,
        artifacts: [],
        blocksProcessed: 0,
      };
    }

    // Check if Graphviz CLI is available
    if (!(await GraphvizProcessor.detectGraphvizCLI())) {
      console.warn('⚠️  Graphviz CLI not found. Diagrams will not be rendered.');
      console.warn('   Install Graphviz: https://graphviz.org/download/');

      // Return content with warning comments
      let processedContent = content;
      for (const block of blocks) {
        const warning = `\n<!-- Graphviz diagram "${block.name}" not rendered - CLI not available -->`;
        processedContent = processedContent.replace(
          content.substring(block.startIndex, block.endIndex),
          content.substring(block.startIndex, block.endIndex) + warning,
        );
      }

      return {
        success: true,
        processedContent,
        artifacts: [],
        blocksProcessed: blocks.length,
      };
    }

    this.ensureDirectories(context);

    let processedContent = content;
    const artifacts: Array<{
      name: string;
      path: string;
      relativePath: string;
      type: 'asset' | 'intermediate' | 'output';
    }> = [];

    // Process each block
    for (const block of blocks) {
      try {
        const result = await this.generateDiagram(block, context);

        if (result.success && result.outputPath) {
          // Add image reference to markdown
          const imageRef = `\n![${block.name}](${this.getRelativePath(result.outputPath, context)})`;
          processedContent = processedContent.replace(
            content.substring(block.startIndex, block.endIndex),
            content.substring(block.startIndex, block.endIndex) + imageRef,
          );

          // Add to artifacts
          artifacts.push({
            name: path.basename(result.outputPath),
            path: result.outputPath,
            relativePath: this.getRelativePath(result.outputPath, context),
            type: 'asset',
          });

          console.info(`🎨 Generated Graphviz diagram: ${path.basename(result.outputPath)}`);
        } else {
          console.warn(`⚠️  Failed to generate diagram for ${block.name}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error processing Graphviz block ${block.name}:`, error);
      }
    }

    // Write intermediate file
    const intermediateFile = this.getIntermediateFilePath('processed', context);
    const contentChanged = this.hasContentChanged(intermediateFile, processedContent);

    if (contentChanged) {
      fs.writeFileSync(intermediateFile, processedContent, 'utf8');
      console.info(`📝 Updated Graphviz intermediate file: ${path.basename(intermediateFile)}`);
    }

    artifacts.push({
      name: path.basename(intermediateFile),
      path: intermediateFile,
      relativePath: this.getRelativePath(intermediateFile, context),
      type: 'intermediate',
    });

    return {
      success: true,
      processedContent,
      artifacts,
      blocksProcessed: blocks.length,
    };
  }

  /**
   * Generate diagram image from DOT code
   */
  private async generateDiagram(
    block: ProcessorBlock,
    context: ProcessingContext,
  ): Promise<GraphvizGenerationResult> {
    try {
      // Merge block-specific params with processor config
      const config = { ...this.graphvizConfig };
      if (block.metadata?.params) {
        const params = block.metadata.params as Record<string, string>;
        if (
          params.layout &&
          ['dot', 'neato', 'fdp', 'sfdp', 'twopi', 'circo'].includes(params.layout)
        ) {
          config.layout_engine = params.layout as GraphvizConfig['layout_engine'];
        }
        if (params.theme && ['default', 'dark', 'light'].includes(params.theme)) {
          config.theme = params.theme as GraphvizConfig['theme'];
        }
        if (params.dpi) {
          config.dpi = parseInt(params.dpi, 10);
        }
      }

      // Apply theme-specific styling
      const styledContent = this.applyTheme(block.content, config);

      // Write DOT file
      const dotFile = path.join(context.intermediateDir, `${block.name}.dot`);
      fs.writeFileSync(dotFile, styledContent, 'utf8');

      // Generate output file
      const outputFile = path.join(context.assetsDir, `${block.name}.${config.output_format}`);

      // Build Graphviz command
      const args = [`-T${config.output_format}`, `-K${config.layout_engine}`, `-o${outputFile}`];

      // Add DPI for raster formats
      if (['png', 'jpeg'].includes(config.output_format) && config.dpi) {
        args.push(`-Gdpi=${config.dpi}`);
      }

      // Add input file
      args.push(dotFile);

      // Execute Graphviz
      execSync(`dot ${args.join(' ')}`, {
        cwd: context.intermediateDir,
        stdio: 'pipe',
        timeout: config.timeout * 1000,
      });

      if (fs.existsSync(outputFile)) {
        return {
          success: true,
          outputPath: outputFile,
        };
      } else {
        return {
          success: false,
          error: 'Output file not created',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Apply theme and styling to DOT content
   */
  private applyTheme(dotContent: string, config: GraphvizConfig): string {
    let styledContent = dotContent;

    // Add global styling based on theme
    const globalStyles: string[] = [];

    if (config.backgroundColor) {
      globalStyles.push(`bgcolor="${config.backgroundColor}"`);
    }

    if (config.fontFamily) {
      globalStyles.push(`fontname="${config.fontFamily}"`);
    }

    // Apply theme-specific styling
    switch (config.theme) {
      case 'dark':
        globalStyles.push('bgcolor="#2d3748"', 'color="#e2e8f0"', 'fontcolor="#e2e8f0"');
        break;
      case 'light':
        globalStyles.push('bgcolor="#f7fafc"', 'color="#2d3748"', 'fontcolor="#2d3748"');
        break;
      default:
        // Use default colors
        break;
    }

    // Insert global styles at the beginning of the graph
    if (globalStyles.length > 0) {
      const graphMatch = styledContent.match(/^(digraph|graph)\s+(\w+)\s*\{/);
      if (graphMatch) {
        const insertPos = styledContent.indexOf('{') + 1;
        const globalStyleString = globalStyles.map((style) => `  ${style};`).join('\n');
        styledContent =
          styledContent.slice(0, insertPos) +
          '\n' +
          globalStyleString +
          '\n' +
          styledContent.slice(insertPos);
      }
    }

    return styledContent;
  }

  /**
   * Validate DOT syntax
   */
  private validateDOT(dotCode: string): { valid: boolean; error?: string } {
    try {
      // Use Graphviz CLI to validate syntax
      execSync(`echo '${dotCode}' | dot -Tsvg -o /dev/null`, {
        stdio: 'pipe',
        timeout: 10000,
      });
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid DOT syntax: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get supported layout engines
   */
  getSupportedLayoutEngines(): string[] {
    return ['dot', 'neato', 'fdp', 'sfdp', 'twopi', 'circo'];
  }

  /**
   * Get supported output formats
   */
  getSupportedOutputFormats(): string[] {
    return this.supportedOutputFormats;
  }
}
