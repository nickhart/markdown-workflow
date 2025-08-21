/**
 * PlantUML processor
 * Processes PlantUML blocks and generates diagram images
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  BaseProcessor,
  ProcessorBlock,
  ProcessingContext,
  ProcessingResult,
} from './base-processor';

export interface PlantUMLConfig {
  output_format: 'png' | 'svg' | 'pdf';
  theme?: string;
  timeout: number;
  server_url?: string; // Optional PlantUML server URL for remote rendering
  [key: string]: unknown; // Make it compatible with ProcessorConfig
}

export interface PlantUMLGenerationResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * PlantUML diagram processor
 * Processes PlantUML blocks and generates diagram images
 */
export class PlantUMLProcessor extends BaseProcessor {
  readonly name = 'plantuml';
  readonly description = 'Process PlantUML diagrams and generate images';
  readonly version = '1.0.0';
  readonly intermediateExtension = '.puml';
  readonly supportedInputExtensions = ['.md', '.markdown'];
  readonly outputExtensions = ['.png', '.svg', '.pdf'];
  readonly supportedOutputFormats = ['png', 'svg', 'pdf'];

  private plantUMLConfig: PlantUMLConfig;

  constructor(config: PlantUMLConfig) {
    super(config);
    this.plantUMLConfig = config;
  }

  /**
   * Check if content contains PlantUML blocks
   */
  canProcess(content: string): boolean {
    const regex = /```plantuml:[\\w-]+\\s*\\n[\\s\\S]*?\\n```/g;
    return regex.test(content);
  }

  /**
   * Detect and extract PlantUML blocks from markdown content
   * Supports syntax: ```plantuml:diagram-name
   */
  detectBlocks(markdown: string): ProcessorBlock[] {
    const blocks: ProcessorBlock[] = [];

    // Match plantuml:name code blocks
    const regex = /```plantuml:([\\w-]+)\\s*\\n([\\s\\S]*?)\\n```/g;
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
   * Check if PlantUML CLI is available
   */
  static async detectPlantUMLCLI(): Promise<boolean> {
    try {
      // Try to run the PlantUML CLI version command
      execSync('java -jar plantuml.jar -version', {
        stdio: 'pipe',
        timeout: 10000,
        encoding: 'utf8',
      });
      return true;
    } catch {
      // Try alternative: plantuml command (if installed via package manager)
      try {
        execSync('plantuml -version', {
          stdio: 'pipe',
          timeout: 10000,
          encoding: 'utf8',
        });
        return true;
      } catch {
        console.warn(`⚠️  PlantUML CLI not found. Install PlantUML jar or via package manager.`);
        return false;
      }
    }
  }

  /**
   * Generate a diagram from PlantUML code
   */
  async generateDiagram(
    plantUMLCode: string,
    outputPath: string,
  ): Promise<PlantUMLGenerationResult> {
    const isAvailable = await PlantUMLProcessor.detectPlantUMLCLI();

    if (!isAvailable) {
      return {
        success: false,
        error: 'PlantUML CLI not available. Please install PlantUML.',
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
      const tempInputFile = path.join(tempDir, `plantuml-input-${Date.now()}.puml`);

      // PlantUML requires @startuml/@enduml wrapper
      const wrappedCode = `@startuml\\n${plantUMLCode}\\n@enduml`;
      fs.writeFileSync(tempInputFile, wrappedCode);

      try {
        // Build PlantUML CLI command
        const timeout = this.plantUMLConfig.timeout * 1000;
        const format = this.plantUMLConfig.output_format;

        // Determine format flag
        let formatFlag = '';
        switch (format) {
          case 'svg':
            formatFlag = '-tsvg';
            break;
          case 'pdf':
            formatFlag = '-tpdf';
            break;
          case 'png':
          default:
            formatFlag = '-tpng';
            break;
        }

        // Try java -jar plantuml.jar first, then fallback to plantuml command
        let command: string;
        try {
          execSync('java -jar plantuml.jar -version', { stdio: 'pipe', timeout: 5000 });
          command = `java -jar plantuml.jar ${formatFlag} -o "${path.dirname(outputPath)}" "${tempInputFile}"`;
        } catch {
          command = `plantuml ${formatFlag} -o "${path.dirname(outputPath)}" "${tempInputFile}"`;
        }

        execSync(command, {
          timeout,
          stdio: 'pipe',
        });

        // PlantUML generates files with specific naming, we need to rename to our desired output
        const baseName = path.basename(tempInputFile, '.puml');
        const generatedFile = path.join(path.dirname(outputPath), `${baseName}.${format}`);

        if (fs.existsSync(generatedFile)) {
          // Move to desired location
          fs.renameSync(generatedFile, outputPath);
        }

        // Verify output file was created
        if (!fs.existsSync(outputPath)) {
          return {
            success: false,
            error: `PlantUML execution completed but output file not found: ${outputPath}`,
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
        error: `PlantUML generation failed: ${error instanceof Error ? error.message : String(error)}`,
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
        `.${this.plantUMLConfig.output_format}`,
      );
      const relativePath = this.getRelativePath(assetFile, context);

      // Check if content has changed and update intermediate file
      const contentChanged = this.hasContentChanged(intermediateFile, block.content);

      if (contentChanged) {
        fs.writeFileSync(intermediateFile, block.content);
        console.info(`📝 Updated intermediate file: ${block.name}.puml`);
      } else {
        console.info(`⏭️  Skipped intermediate file (unchanged): ${block.name}.puml`);
      }

      // Check if image needs regeneration
      const shouldGenerate = this.needsRegeneration(assetFile, intermediateFile);

      let result;
      if (shouldGenerate) {
        result = await this.generateDiagram(block.content, assetFile);
        if (result.success) {
          console.info(`🎨 Generated PlantUML diagram: ${path.basename(assetFile)}`);
        }
      } else {
        result = { success: true, outputPath: assetFile };
        console.info(`⚡ Skipped PlantUML generation (up to date): ${path.basename(assetFile)}`);
      }

      if (result.success) {
        artifacts.push({
          name: block.name,
          path: assetFile,
          relativePath,
          type: 'asset',
        });

        artifacts.push({
          name: `${block.name}.puml`,
          path: intermediateFile,
          relativePath: this.getRelativePath(intermediateFile, context),
          type: 'intermediate',
        });

        // Replace PlantUML block with image reference
        const imageMarkdown = `![${block.name}](${relativePath})`;
        processedContent =
          processedContent.slice(0, block.startIndex) +
          imageMarkdown +
          processedContent.slice(block.endIndex);
      } else {
        // Leave the block in place but add an error comment
        const errorComment = `<!-- PlantUML Error: ${result.error} -->`;
        processedContent =
          processedContent.slice(0, block.startIndex) +
          errorComment +
          '\\n' +
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
   * Create processor from configuration
   */
  static create(config: Partial<PlantUMLConfig> = {}): PlantUMLProcessor {
    const defaultConfig: PlantUMLConfig = {
      output_format: 'png',
      timeout: 30,
    };

    const plantUMLConfig = { ...defaultConfig, ...config };
    return new PlantUMLProcessor(plantUMLConfig);
  }
}
