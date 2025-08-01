import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SystemConfig } from '../core/schemas.js';

export interface MermaidBlock {
  name: string;
  code: string;
  attributes: string; // Layout attributes like "{align=center, width=80%}"
  startIndex: number;
  endIndex: number;
}

export interface MermaidConfig {
  output_format: 'png' | 'svg';
  theme?: 'default' | 'dark' | 'forest' | 'neutral';
  timeout: number;
}

export interface DiagramGenerationResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * Mermaid detection and processing utilities
 */
export class MermaidProcessor {
  private config: MermaidConfig;

  constructor(config: MermaidConfig) {
    this.config = config;
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
    };

    const mermaidConfig = systemConfig.mermaid || defaultConfig;
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
   * Parse layout attributes from attribute string
   * Supports: {align=center, width=80%, layout=horizontal}
   */
  private parseLayoutAttributes(attributeString: string): {
    width?: number;
    height?: number;
    layout?: string;
  } {
    const options: { width?: number; height?: number; layout?: string } = {};

    if (!attributeString) return options;

    // Remove braces and split by commas
    const cleaned = attributeString.replace(/[{}]/g, '').trim();
    const attributes = cleaned.split(',').map((attr) => attr.trim());

    for (const attr of attributes) {
      const [key, value] = attr.split('=').map((s) => s.trim());

      if (key === 'layout') {
        options.layout = value;
      } else if (key === 'width' && value.includes('px')) {
        options.width = parseInt(value.replace('px', ''));
      } else if (key === 'height' && value.includes('px')) {
        options.height = parseInt(value.replace('px', ''));
      }
    }

    return options;
  }

  /**
   * Extract Mermaid blocks from markdown content
   * Supports syntax: ```mermaid:diagram-name {align=center, width=80%, layout=horizontal}
   */
  extractMermaidBlocks(markdown: string): MermaidBlock[] {
    const blocks: MermaidBlock[] = [];

    // Match mermaid:name with optional attributes code blocks
    const regex = /```mermaid:([\w-]+)(\s*\{[^}]*\})?\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        name: match[1],
        attributes: match[2]?.trim() || '', // Optional attributes like {align=center, width=80%}
        code: match[3],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return blocks;
  }

  /**
   * Generate a diagram from Mermaid code using Mermaid CLI
   */
  async generateDiagram(
    mermaidCode: string,
    outputPath: string,
    options?: { width?: number; height?: number; layout?: string },
  ): Promise<DiagramGenerationResult> {
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
        const theme = this.config.theme || 'default';
        const timeout = this.config.timeout * 1000;

        // Add size constraints based on layout hints
        let sizeParams = '';
        if (options?.layout === 'horizontal' || options?.width) {
          const width = options?.width || 1200; // Max width for horizontal layouts
          sizeParams += ` -w ${width}`;
        } else if (options?.layout === 'layered' || options?.height) {
          const height = options?.height || 800; // Max height for vertical layouts
          sizeParams += ` -H ${height}`;
        }

        const command = `npx @mermaid-js/mermaid-cli -i "${tempInputFile}" -o "${outputPath}" -t ${theme}${sizeParams}`;

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
   * Process markdown content by extracting Mermaid blocks, generating diagrams,
   * and replacing blocks with image references including layout attributes
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
      const outputFileName = `${block.name}.${this.config.output_format}`;
      const outputPath = path.join(assetsDir, outputFileName);

      // Calculate relative path from intermediate directory to assets
      const relativePath = intermediateDir
        ? path.relative(intermediateDir, outputPath).replace(/\\/g, '/')
        : `assets/${outputFileName}`;

      // Save intermediate Mermaid source file for debugging
      if (intermediateDir) {
        const mermaidSourcePath = path.join(intermediateDir, `${block.name}.mmd`);
        fs.writeFileSync(mermaidSourcePath, block.code);
      }

      // Parse layout attributes from block attributes
      const layoutOptions = this.parseLayoutAttributes(block.attributes);
      const result = await this.generateDiagram(block.code, outputPath, layoutOptions);

      if (result.success) {
        diagrams.push({
          name: block.name,
          path: outputPath,
          relativePath,
        });

        // Replace Mermaid block with image reference including layout attributes
        const imageMarkdown = `![${block.name}](${relativePath})${block.attributes}`;
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
