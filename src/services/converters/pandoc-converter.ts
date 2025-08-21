/**
 * Pandoc document converter
 * Converts markdown to various formats using pandoc with processor integration
 */

import { spawn, type SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  BaseConverter,
  ConversionContext,
  ConversionResult,
  ConverterConfig,
} from './base-converter';
import type { ProcessorRegistry } from '../processors/base-processor';

/**
 * Pandoc converter implementation
 * Supports DOCX, HTML, PDF, and PPTX formats using pandoc
 */
export class PandocConverter extends BaseConverter {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly supportedFormats: string[];

  constructor(
    config: ConverterConfig = {},
    processorRegistry: ProcessorRegistry,
    name: string = 'pandoc',
    description: string = 'Convert documents using pandoc with processor integration',
    supportedFormats: string[] = ['docx', 'html', 'pdf', 'pptx'],
  ) {
    super(config, processorRegistry);
    this.name = name;
    this.description = description;
    this.version = '1.0.0';
    this.supportedFormats = supportedFormats;
  }

  /**
   * Perform pandoc conversion
   */
  protected async performConversion(context: ConversionContext): Promise<ConversionResult> {
    // Check if input file exists
    if (!fs.existsSync(context.inputFile)) {
      return {
        success: false,
        outputFile: context.outputFile,
        error: `Input file not found: ${context.inputFile}`,
      };
    }

    // Ensure output directory exists
    const outputDir = path.dirname(context.outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Check if mocking is enabled
    if (process.env.MOCK_PANDOC === 'true') {
      return await this.mockPandocConversion(context);
    }

    // Build pandoc command arguments
    const args = this.buildPandocArgs(context);

    try {
      // Set working directory to intermediate dir if using processed file
      const workingDir = path.dirname(context.inputFile);
      const result = await this.runPandoc(args, workingDir);

      if (result.success && fs.existsSync(context.outputFile)) {
        return {
          success: true,
          outputFile: context.outputFile,
          artifacts: [
            {
              name: path.basename(context.outputFile),
              path: context.outputFile,
              relativePath: path
                .relative(context.collectionPath, context.outputFile)
                .replace(/\\/g, '/'),
              type: 'output',
            },
          ],
        };
      } else {
        return {
          success: false,
          outputFile: context.outputFile,
          error: result.error || 'Conversion failed - output file not created',
        };
      }
    } catch (error) {
      return {
        success: false,
        outputFile: context.outputFile,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build pandoc command arguments based on format and context
   */
  private buildPandocArgs(context: ConversionContext): string[] {
    const args: string[] = [];

    // Add format-specific options first
    switch (context.format) {
      case 'docx':
        if (context.referenceDoc && fs.existsSync(context.referenceDoc)) {
          args.push('--reference-doc', context.referenceDoc);
        }
        break;
      case 'pptx':
        if (context.referenceDoc && fs.existsSync(context.referenceDoc)) {
          args.push('--reference-doc', context.referenceDoc);
        }
        break;
      case 'html':
        args.push('--standalone');
        break;
      case 'pdf':
        args.push('--pdf-engine=pdflatex');
        break;
    }

    // Add output file and input file
    args.push('-o', context.outputFile, context.inputFile);

    return args;
  }

  /**
   * Run pandoc command with given arguments
   */
  private async runPandoc(
    args: string[],
    cwd?: string,
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    return new Promise((resolve) => {
      const spawnOptions: SpawnOptions = { stdio: ['ignore', 'pipe', 'pipe'] };
      if (cwd) {
        spawnOptions.cwd = cwd;
      }
      const child = spawn('pandoc', args, spawnOptions);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          resolve({
            success: false,
            error: stderr || `pandoc exited with code ${code}`,
          });
        }
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          error: `pandoc not available: ${error.message}`,
        });
      });
    });
  }

  /**
   * Mock pandoc conversion for deterministic testing
   */
  private async mockPandocConversion(context: ConversionContext): Promise<ConversionResult> {
    const { inputFile, outputFile, format } = context;

    // Read input file to create deterministic content based on input
    const inputContent = fs.readFileSync(inputFile, 'utf8');

    // Create deterministic mock content based on input content hash and format
    const inputHash = this.createSimpleHash(inputContent);
    let mockContent: Buffer;

    switch (format) {
      case 'docx':
        mockContent = this.createMockDocx(inputHash);
        break;
      case 'html':
        mockContent = Buffer.from(
          `<!DOCTYPE html>
<html>
<head><title>Mock HTML</title></head>
<body>
<h1>Mock HTML Document</h1>
<p>Generated from input hash: ${inputHash}</p>
<p>Original content length: ${inputContent.length} characters</p>
</body>
</html>`,
          'utf8',
        );
        break;
      case 'pdf':
        mockContent = Buffer.from(
          `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
>>
endobj

xref
0 4
0000000000 65535 f
0000000010 00000 n
0000000079 00000 n
0000000136 00000 n
trailer
<<
/Size 4
/Root 1 0 R
>>
startxref
196
%%EOF
Mock PDF - Hash: ${inputHash}`,
          'utf8',
        );
        break;
      case 'pptx':
        mockContent = Buffer.from(
          `PK\\x03\\x04Mock PPTX File
Content Hash: ${inputHash}
This is a mock PPTX file created for testing purposes.
The content is deterministic based on the input markdown file.
This ensures consistent snapshot testing without pandoc dependency.
PK\\x05\\x06Mock PPTX End`,
          'utf8',
        );
        break;
      default:
        return {
          success: false,
          outputFile: outputFile,
          error: `Unsupported format for mocking: ${format}`,
        };
    }

    // Write mock content to output file
    fs.writeFileSync(outputFile, mockContent);

    return {
      success: true,
      outputFile: outputFile,
      artifacts: [
        {
          name: path.basename(outputFile),
          path: outputFile,
          relativePath: path.relative(context.collectionPath, outputFile).replace(/\\/g, '/'),
          type: 'output',
        },
      ],
    };
  }

  /**
   * Create a simple deterministic hash from string content
   */
  private createSimpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Create mock DOCX binary content with deterministic structure
   */
  private createMockDocx(inputHash: string): Buffer {
    const mockDocxContent = `PK\x03\x04Mock DOCX File
Content Hash: ${inputHash}
This is a mock DOCX file created for testing purposes.
The content is deterministic based on the input markdown file.
This ensures consistent snapshot testing without pandoc dependency.
PK\x05\x06Mock DOCX End`;

    return Buffer.from(mockDocxContent, 'utf8');
  }
}
