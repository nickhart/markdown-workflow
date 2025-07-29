/**
 * Document conversion utility using pandoc
 * Handles conversion from markdown to various formats (DOCX, HTML, PDF)
 * Requires pandoc to be installed on the system
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface ConversionOptions {
  inputFile: string;
  outputFile: string;
  format: 'docx' | 'html' | 'pdf';
  referenceDoc?: string; // For DOCX styling
}

export interface ConversionResult {
  success: boolean;
  outputFile: string;
  error?: string;
}

/**
 * Convert markdown file to specified format using pandoc
 * Simple implementation based on the original shell function
 * Supports mocking mode for deterministic testing via MOCK_PANDOC environment variable
 */
export async function convertDocument(options: ConversionOptions): Promise<ConversionResult> {
  const { inputFile, outputFile, format, referenceDoc } = options;

  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    return {
      success: false,
      outputFile: options.outputFile,
      error: `Input file not found: ${inputFile}`,
    };
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Check if mocking is enabled
  if (process.env.MOCK_PANDOC === 'true') {
    return await mockPandocConversion(options);
  }

  // Build pandoc command arguments - simple approach like the shell function
  const args = [];

  // Add format-specific options first
  switch (format) {
    case 'docx':
      if (referenceDoc && fs.existsSync(referenceDoc)) {
        args.push('--reference-doc', referenceDoc);
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
  args.push('-o', outputFile, inputFile);

  try {
    const result = await runPandoc(args);

    if (result.success && fs.existsSync(outputFile)) {
      return {
        success: true,
        outputFile: outputFile,
      };
    } else {
      return {
        success: false,
        outputFile: outputFile,
        error: result.error || 'Conversion failed - output file not created',
      };
    }
  } catch (error) {
    return {
      success: false,
      outputFile: outputFile,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Mock pandoc conversion for deterministic testing
 * Creates predictable output files with fixed content hashes
 */
async function mockPandocConversion(options: ConversionOptions): Promise<ConversionResult> {
  const { inputFile, outputFile, format } = options;

  // Read input file to create deterministic content based on input
  const inputContent = fs.readFileSync(inputFile, 'utf8');

  // Create deterministic mock content based on input content hash and format
  const inputHash = createSimpleHash(inputContent);
  let mockContent: Buffer;

  switch (format) {
    case 'docx':
      // Create mock DOCX content - a minimal DOCX file structure
      // This creates a predictable binary file for testing
      mockContent = createMockDocx(inputHash);
      break;
    case 'html':
      // Create mock HTML content
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
      // Create mock PDF content (minimal PDF structure)
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
  };
}

/**
 * Create a simple deterministic hash from string content
 */
function createSimpleHash(content: string): string {
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
 * Based on the input hash for predictable testing
 */
function createMockDocx(inputHash: string): Buffer {
  // Create a minimal mock DOCX structure
  // Real DOCX files are ZIP archives, but for testing we just need deterministic binary content
  const mockDocxContent = `PK\x03\x04Mock DOCX File
Content Hash: ${inputHash}
This is a mock DOCX file created for testing purposes.
The content is deterministic based on the input markdown file.
This ensures consistent snapshot testing without pandoc dependency.
PK\x05\x06Mock DOCX End`;

  return Buffer.from(mockDocxContent, 'utf8');
}

/**
 * Run pandoc command with given arguments
 */
async function runPandoc(
  args: string[],
): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn('pandoc', args, { stdio: ['ignore', 'pipe', 'pipe'] });

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
 * Get appropriate file extension for format
 */
export function getExtensionForFormat(format: string): string {
  switch (format) {
    case 'docx':
      return '.docx';
    case 'html':
      return '.html';
    case 'pdf':
      return '.pdf';
    default:
      return `.${format}`;
  }
}
