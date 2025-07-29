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
