import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SystemConfig } from '../core/schemas.js';
import {
  BaseProcessor,
  ProcessorBlock,
  ProcessingContext,
  ProcessingResult,
} from './processors/base-processor.js';

// Legacy interface for backward compatibility
export interface MermaidBlock {
  name: string;
  code: string;
  startIndex: number;
  endIndex: number;
}

export interface MermaidConfig {
  output_format: 'png' | 'svg';
  theme?: 'default' | 'dark' | 'forest' | 'neutral';
  timeout: number;
  scale?: number; // Scale factor for high-DPI images (default: 2 for PNG, 1 for SVG)
  backgroundColor?: string; // Background color (default: 'white')
  fontFamily?: string; // Font family for SVG text (default: 'arial,sans-serif')
  [key: string]: unknown; // Make it compatible with ProcessorConfig
}

export interface DiagramGenerationResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * Mermaid diagram processor
 * Processes Mermaid blocks and generates diagram images
 */
export class MermaidProcessor extends BaseProcessor {
  readonly name = 'mermaid';
  readonly description = 'Process Mermaid diagrams and generate images';
  readonly version = '1.0.0';
  readonly intermediateExtension = '.mmd';
  readonly supportedInputExtensions = ['.md', '.markdown'];
  readonly outputExtensions = ['.png', '.svg'];
  readonly supportedOutputFormats = ['png', 'svg'];

  private mermaidConfig: MermaidConfig;

  constructor(config: MermaidConfig) {
    super(config);
    this.mermaidConfig = config;
  }

  /**
   * Create processor from system configuration
   */
  static fromSystemConfig(systemConfig: SystemConfig): MermaidProcessor {
    // Provide default configuration if mermaid config is missing
    const defaultConfig: MermaidConfig = {
      output_format: 'png',
      theme: 'default',
      timeout: 30,
      scale: 2, // 2x scale for crisp images in presentations
      backgroundColor: 'white',
      fontFamily: 'arial,sans-serif', // Web-safe font for SVG compatibility
    };

    const mermaidConfig = { ...defaultConfig, ...systemConfig.mermaid };
    return new MermaidProcessor(mermaidConfig);
  }

  /**
   * Check if Mermaid CLI is available
   */
  static async detectMermaidCLI(): Promise<boolean> {
    try {
      // Try to run the Mermaid CLI version command
      execSync('npx @mermaid-js/mermaid-cli --version', {
        stdio: 'pipe',
        timeout: 10000,
        encoding: 'utf8',
      });
      return true;
    } catch (error) {
      console.warn(
        `⚠️  Mermaid CLI detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Check if content contains Mermaid blocks
   */
  canProcess(content: string): boolean {
    const regex = /```mermaid:[\w-]+.*?\n[\s\S]*?\n```/g;
    return regex.test(content);
  }

  /**
   * Detect and extract Mermaid blocks from markdown content
   * Supports syntax: ```mermaid:diagram-name
   */
  detectBlocks(markdown: string): ProcessorBlock[] {
    const blocks: ProcessorBlock[] = [];

    // Match mermaid:name code blocks (with optional parameters)
    const regex = /```mermaid:([\w-]+).*?\n([\s\S]*?)\n```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        name: match[1],
        content: match[2],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return blocks;
  }

  /**
   * Extract Mermaid blocks from markdown content (legacy method)
   * @deprecated Use detectBlocks instead
   */
  extractMermaidBlocks(markdown: string): MermaidBlock[] {
    const blocks: MermaidBlock[] = [];

    // Match mermaid:name code blocks (with optional parameters)
    const regex = /```mermaid:([\w-]+).*?\n([\s\S]*?)\n```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        name: match[1],
        code: match[2],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return blocks;
  }

  /**
   * Generate a diagram from Mermaid code using Mermaid CLI
   */
  async generateDiagram(mermaidCode: string, outputPath: string): Promise<DiagramGenerationResult> {
    const isAvailable = await MermaidProcessor.detectMermaidCLI();

    if (!isAvailable) {
      return {
        success: false,
        error: 'Mermaid CLI not available. Please install @mermaid-js/mermaid-cli.',
      };
    }

    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Create temporary input file
      const tempDir = os.tmpdir();
      const tempInputFile = path.join(tempDir, `mermaid-input-${Date.now()}.mmd`);
      fs.writeFileSync(tempInputFile, mermaidCode);

      try {
        // Build Mermaid CLI command
        const theme = this.mermaidConfig.theme || 'default';
        const timeout = this.mermaidConfig.timeout * 1000;
        const scale =
          this.mermaidConfig.scale || (this.mermaidConfig.output_format === 'png' ? 2 : 1);
        const backgroundColor = this.mermaidConfig.backgroundColor || 'white';

        // Add quality parameters
        let qualityParams = '';
        qualityParams += ` -s ${scale}`; // Scale factor for high-DPI
        qualityParams += ` -b ${backgroundColor}`; // Background color

        // Add configuration file for SVG fonts if needed
        if (this.mermaidConfig.output_format === 'svg' && this.mermaidConfig.fontFamily) {
          const configContent = {
            fontFamily: this.mermaidConfig.fontFamily,
            theme: {
              primaryColor: '#000000',
              primaryTextColor: '#000000',
              fontFamily: this.mermaidConfig.fontFamily,
            },
          };

          const configFile = path.join(tempDir, `mermaid-config-${Date.now()}.json`);
          fs.writeFileSync(configFile, JSON.stringify(configContent));
          qualityParams += ` -c "${configFile}"`;

          // Clean up config file after execution
          setTimeout(() => {
            if (fs.existsSync(configFile)) {
              fs.unlinkSync(configFile);
            }
          }, 5000);
        }

        const command = `npx @mermaid-js/mermaid-cli -i "${tempInputFile}" -o "${outputPath}" -t ${theme}${qualityParams}`;

        execSync(command, {
          timeout,
          stdio: 'pipe',
        });

        // Verify output file was created
        if (!fs.existsSync(outputPath)) {
          return {
            success: false,
            error: `Mermaid CLI execution completed but output file not found: ${outputPath}`,
          };
        }

        return {
          success: true,
          outputPath,
        };
      } finally {
        // Clean up temporary file
        if (fs.existsSync(tempInputFile)) {
          fs.unlinkSync(tempInputFile);
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Mermaid generation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Process content using the BaseProcessor interface
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

    this.ensureDirectories(context);

    let processedContent = content;
    const artifacts: ProcessingResult['artifacts'] = [];

    // Process blocks in reverse order to maintain correct indices
    for (const block of blocks.reverse()) {
      const intermediateFile = this.getIntermediateFilePath(block.name, context);
      const assetFile = this.getAssetFilePath(
        block.name,
        context,
        `.${this.mermaidConfig.output_format}`,
      );
      const relativePath = this.getRelativePath(assetFile, context);

      // Check if content has changed and update intermediate file
      const contentChanged = this.hasContentChanged(intermediateFile, block.content);

      if (contentChanged) {
        fs.writeFileSync(intermediateFile, block.content);
        console.info(`📝 Updated intermediate file: ${block.name}.mmd`);
      } else {
        console.info(`⏭️  Skipped intermediate file (unchanged): ${block.name}.mmd`);
      }

      // Check if image needs regeneration
      const shouldGenerate = this.needsRegeneration(assetFile, intermediateFile);

      let result;
      if (shouldGenerate) {
        result = await this.generateDiagram(block.content, assetFile);
        if (result.success) {
          console.info(`🎨 Generated diagram: ${path.basename(assetFile)}`);
        }
      } else {
        result = { success: true, outputPath: assetFile };
        console.info(`⚡ Skipped image generation (up to date): ${path.basename(assetFile)}`);
      }

      if (result.success) {
        artifacts.push({
          name: block.name,
          path: assetFile,
          relativePath,
          type: 'asset',
        });

        artifacts.push({
          name: `${block.name}.mmd`,
          path: intermediateFile,
          relativePath: this.getRelativePath(intermediateFile, context),
          type: 'intermediate',
        });

        // Replace Mermaid block with image reference
        const imageMarkdown = `![${block.name}](${relativePath})`;
        processedContent =
          processedContent.slice(0, block.startIndex) +
          imageMarkdown +
          processedContent.slice(block.endIndex);
      } else {
        // Leave the block in place but add an error comment
        const errorComment = `<!-- Mermaid Error: ${result.error} -->`;
        processedContent =
          processedContent.slice(0, block.startIndex) +
          errorComment +
          '\n' +
          processedContent.slice(block.startIndex, block.endIndex) +
          processedContent.slice(block.endIndex);
      }
    }

    return {
      success: true,
      processedContent,
      artifacts,
      blocksProcessed: blocks.length,
    };
  }

  /**
   * Process markdown content by extracting Mermaid blocks, generating diagrams,
   * and replacing blocks with image references.
   * Implements caching based on content changes and file timestamps.
   */
  async processMarkdown(
    markdown: string,
    assetsDir: string,
    intermediateDir?: string,
  ): Promise<{
    processedMarkdown: string;
    diagrams: Array<{ name: string; path: string; relativePath: string }>;
  }> {
    const blocks = this.extractMermaidBlocks(markdown);
    console.info(`Found ${blocks.length} Mermaid block(s) in markdown.`);

    const diagrams: Array<{ name: string; path: string; relativePath: string }> = [];

    if (blocks.length === 0) {
      return {
        processedMarkdown: markdown,
        diagrams: [],
      };
    }

    // Ensure assets directory exists
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Create intermediate directory for debugging if specified
    if (intermediateDir && !fs.existsSync(intermediateDir)) {
      fs.mkdirSync(intermediateDir, { recursive: true });
    }

    let processedMarkdown = markdown;

    // Process blocks in reverse order to maintain correct indices
    for (const block of blocks.reverse()) {
      const outputFileName = `${block.name}.${this.mermaidConfig.output_format}`;
      const outputPath = path.join(assetsDir, outputFileName);

      // Calculate relative path from intermediate directory to assets
      const relativePath = intermediateDir
        ? path.relative(intermediateDir, outputPath).replace(/\\/g, '/')
        : `assets/${outputFileName}`;

      let shouldGenerateImage = true;

      // Save intermediate Mermaid source file with caching logic
      if (intermediateDir) {
        const mermaidSourcePath = path.join(intermediateDir, `${block.name}.mmd`);

        // Check if content has changed
        const contentChanged = this.hasContentChanged(mermaidSourcePath, block.code);

        if (contentChanged) {
          // Content changed, update the intermediate file
          fs.writeFileSync(mermaidSourcePath, block.code);
          console.info(`📝 Updated intermediate file: ${block.name}.mmd`);
        } else {
          console.info(`⏭️  Skipped intermediate file (unchanged): ${block.name}.mmd`);
        }

        // Check if image needs regeneration based on timestamps
        shouldGenerateImage = this.needsRegeneration(outputPath, mermaidSourcePath);

        if (!shouldGenerateImage) {
          console.info(`⚡ Skipped image generation (up to date): ${outputFileName}`);
        }
      } else {
        // No intermediate directory, always generate
        shouldGenerateImage = true;
      }

      let result;
      if (shouldGenerateImage) {
        result = await this.generateDiagram(block.code, outputPath);

        if (result.success) {
          console.info(`🎨 Generated diagram: ${outputFileName}`);
        }
      } else {
        // Skip generation, assume success since file exists
        result = { success: true, outputPath };
      }

      if (result.success) {
        diagrams.push({
          name: block.name,
          path: outputPath,
          relativePath,
        });

        // Replace Mermaid block with image reference
        const imageMarkdown = `![${block.name}](${relativePath})`;
        processedMarkdown =
          processedMarkdown.slice(0, block.startIndex) +
          imageMarkdown +
          processedMarkdown.slice(block.endIndex);
      } else {
        // Leave the block in place but add an error comment
        const errorComment = `<!-- Mermaid Error: ${result.error} -->`;
        processedMarkdown =
          processedMarkdown.slice(0, block.startIndex) +
          errorComment +
          '\n' +
          processedMarkdown.slice(block.startIndex, block.endIndex) +
          processedMarkdown.slice(block.endIndex);
      }
    }

    return {
      processedMarkdown,
      diagrams,
    };
  }
}
