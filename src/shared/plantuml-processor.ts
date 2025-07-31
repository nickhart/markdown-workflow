import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SystemConfig } from '../core/types.js';

export interface PlantUMLBlock {
  name: string;
  code: string;
  startIndex: number;
  endIndex: number;
}

export interface PlantUMLConfig {
  method: 'auto' | 'docker' | 'java' | 'native';
  docker_image: string;
  java_jar_path?: string;
  output_format: 'png' | 'svg';
  timeout: number;
}

export interface DiagramGenerationResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * PlantUML detection and processing utilities
 */
export class PlantUMLProcessor {
  private config: PlantUMLConfig;

  constructor(config: PlantUMLConfig) {
    this.config = config;
  }

  /**
   * Create processor from system configuration
   * @deprecated This is legacy code - PlantUML has been replaced by Mermaid
   */
  // static fromSystemConfig(systemConfig: SystemConfig): PlantUMLProcessor {
  //   return new PlantUMLProcessor(systemConfig.plantuml);
  // }

  /**
   * Detect available PlantUML installation methods
   */
  static async detectAvailableMethods(): Promise<{
    native: boolean;
    java: boolean;
    docker: boolean;
  }> {
    const methods = {
      native: false,
      java: false,
      docker: false,
    };

    // Check for native plantuml command
    try {
      execSync('plantuml -version', { stdio: 'ignore', timeout: 5000 });
      methods.native = true;
    } catch {
      // plantuml not available natively
    }

    // Check for Java and common PlantUML JAR locations
    try {
      execSync('java -version', { stdio: 'ignore', timeout: 5000 });

      const commonJarPaths = [
        '/usr/local/lib/plantuml.jar',
        '/opt/plantuml/plantuml.jar',
        '/usr/share/plantuml/plantuml.jar',
        path.join(os.homedir(), '.local/lib/plantuml.jar'),
      ];

      for (const jarPath of commonJarPaths) {
        if (fs.existsSync(jarPath)) {
          methods.java = true;
          break;
        }
      }
    } catch {
      // Java not available
    }

    // Check for Docker
    try {
      execSync('docker --version', { stdio: 'ignore', timeout: 5000 });
      methods.docker = true;
    } catch {
      // Docker not available
    }

    return methods;
  }

  /**
   * Determine the best PlantUML method to use
   */
  async determineBestMethod(): Promise<'native' | 'java' | 'docker' | null> {
    if (this.config.method !== 'auto') {
      return this.config.method;
    }

    const available = await PlantUMLProcessor.detectAvailableMethods();

    // Prefer native > java > docker for performance
    if (available.native) {
      return 'native';
    }
    if (available.java) {
      return 'java';
    }
    if (available.docker) {
      return 'docker';
    }

    return null;
  }

  /**
   * Extract PlantUML blocks from markdown content
   */
  extractPlantUMLBlocks(markdown: string): PlantUMLBlock[] {
    const blocks: PlantUMLBlock[] = [];

    // Match plantuml:name code blocks (allow alphanumeric, hyphens, underscores)
    const regex = /```plantuml:([\w-]+)\r?\n([\s\S]*?)```/g;
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
   * Generate a diagram from PlantUML code
   */
  async generateDiagram(
    plantumlCode: string,
    outputPath: string,
    method?: 'native' | 'java' | 'docker',
  ): Promise<DiagramGenerationResult> {
    const selectedMethod = method || (await this.determineBestMethod());

    if (!selectedMethod) {
      return {
        success: false,
        error:
          'No PlantUML installation method available. Please install PlantUML, Java with PlantUML JAR, or Docker.',
      };
    }

    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      if (selectedMethod === 'docker') {
        // Docker method handles file creation internally
        await this.executePlantUML(selectedMethod, plantumlCode, outputPath);
      } else {
        // Create temporary input file for native/java methods
        const tempDir = os.tmpdir();
        const tempInputFile = path.join(tempDir, `plantuml-input-${Date.now()}.puml`);
        fs.writeFileSync(tempInputFile, plantumlCode);

        try {
          await this.executePlantUML(selectedMethod, tempInputFile, outputPath);
        } finally {
          // Clean up temporary file
          if (fs.existsSync(tempInputFile)) {
            fs.unlinkSync(tempInputFile);
          }
        }
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
    } catch (error) {
      return {
        success: false,
        error: `PlantUML generation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Execute PlantUML with the specified method
   */
  private async executePlantUML(
    method: 'native' | 'java' | 'docker',
    inputFileOrCode: string,
    outputPath: string,
  ): Promise<void> {
    const format = this.config.output_format;
    const timeout = this.config.timeout * 1000; // Convert to milliseconds

    switch (method) {
      case 'native':
        execSync(`plantuml -t${format} -o "${path.dirname(outputPath)}" "${inputFileOrCode}"`, {
          timeout,
          stdio: 'pipe',
        });
        break;

      case 'java':
        if (!this.config.java_jar_path || !fs.existsSync(this.config.java_jar_path)) {
          throw new Error(`PlantUML JAR not found: ${this.config.java_jar_path}`);
        }
        execSync(
          `java -jar "${this.config.java_jar_path}" -t${format} -o "${path.dirname(outputPath)}" "${inputFileOrCode}"`,
          {
            timeout,
            stdio: 'pipe',
          },
        );
        break;

      case 'docker':
        const outputDir = path.resolve(path.dirname(outputPath)); // Convert to absolute path
        const outputFileName = path.basename(outputPath, path.extname(outputPath));

        // Create a properly named input file in the output directory
        const properInputFile = path.join(outputDir, `${outputFileName}.puml`);
        fs.writeFileSync(properInputFile, inputFileOrCode); // inputFileOrCode is the PlantUML code

        try {
          execSync(
            `docker run --rm -v "${outputDir}:/data" ${this.config.docker_image} -t${format} /data/${outputFileName}.puml`,
            {
              timeout,
              stdio: 'pipe',
            },
          );
        } finally {
          // Clean up the .puml file
          if (fs.existsSync(properInputFile)) {
            fs.unlinkSync(properInputFile);
          }
        }
        break;

      default:
        throw new Error(`Unknown PlantUML method: ${method}`);
    }
  }

  /**
   * Process markdown content by extracting PlantUML blocks, generating diagrams,
   * and replacing blocks with image references
   */
  async processMarkdown(
    markdown: string,
    assetsDir: string,
  ): Promise<{
    processedMarkdown: string;
    diagrams: Array<{ name: string; path: string; relativePath: string }>;
  }> {
    const blocks = this.extractPlantUMLBlocks(markdown);
    console.info(`Found ${blocks.length} PlantUML block(s) in markdown.`);

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

    let processedMarkdown = markdown;

    // Process blocks in reverse order to maintain correct indices
    for (const block of blocks.reverse()) {
      const outputFileName = `${block.name}.${this.config.output_format}`;
      const outputPath = path.join(assetsDir, outputFileName);
      const relativePath = `assets/${outputFileName}`;

      const result = await this.generateDiagram(block.code, outputPath);

      if (result.success) {
        diagrams.push({
          name: block.name,
          path: outputPath,
          relativePath,
        });

        // Replace PlantUML block with image reference
        const imageMarkdown = `![${block.name}](${relativePath})`;
        processedMarkdown =
          processedMarkdown.slice(0, block.startIndex) +
          imageMarkdown +
          processedMarkdown.slice(block.endIndex);
      } else {
        // Leave the block in place but add an error comment
        const errorComment = `<!-- PlantUML Error: ${result.error} -->`;
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
