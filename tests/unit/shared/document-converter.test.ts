import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';

// Mock child_process spawn
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// Mock fs
jest.mock('fs');

import { spawn } from 'child_process';
import { convertDocument, getExtensionForFormat } from '../../../src/shared/document-converter.js';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('document-converter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
  });

  describe('convertDocument', () => {
    it('should convert markdown to DOCX successfully', async () => {
      // Mock successful pandoc execution
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0); // Success exit code
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);
      mockFs.existsSync.mockReturnValue(true);

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx',
      });

      expect(result.success).toBe(true);
      expect(result.outputFile).toBe('/test/output.docx');
      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['-o', '/test/output.docx', '/test/input.md'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    });

    it('should convert markdown to DOCX with reference document', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);
      mockFs.existsSync.mockReturnValue(true);

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx',
        referenceDoc: '/test/reference.docx',
      });

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['--reference-doc', '/test/reference.docx', '-o', '/test/output.docx', '/test/input.md'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    });

    it('should convert markdown to HTML with standalone option', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);
      mockFs.existsSync.mockReturnValue(true);

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/output.html',
        format: 'html',
      });

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['--standalone', '-o', '/test/output.html', '/test/input.md'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    });

    it('should convert markdown to PDF with PDF engine', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);
      mockFs.existsSync.mockReturnValue(true);

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/output.pdf',
        format: 'pdf',
      });

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['--pdf-engine=pdflatex', '-o', '/test/output.pdf', '/test/input.md'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    });

    it('should skip reference document if it does not exist', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);

      // Input file exists, reference document does not
      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === '/test/input.md' || filePath === '/test/output.docx';
      });

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx',
        referenceDoc: '/test/missing-reference.docx',
      });

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['-o', '/test/output.docx', '/test/input.md'],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
    });

    it('should return error if input file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await convertDocument({
        inputFile: '/test/missing.md',
        outputFile: '/test/output.docx',
        format: 'docx',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Input file not found: /test/missing.md');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should create output directory if it does not exist', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);

      // Input file exists, output directory does not exist initially
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/subdir') return false; // Directory doesn't exist
        if (filePath === '/test/subdir/output.docx') return true; // Output file after creation
        return false;
      });

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/subdir/output.docx',
        format: 'docx',
      });

      expect(result.success).toBe(true);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/subdir', { recursive: true });
    });

    it('should return error if pandoc fails', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(Buffer.from('pandoc: command not found'));
            }
          }),
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(1); // Error exit code
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/output.docx') return false; // Output file not created
        return false;
      });

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('pandoc: command not found');
    });

    it('should return error if pandoc is not available', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('spawn pandoc ENOENT'));
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);
      mockFs.existsSync.mockReturnValue(true);

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('pandoc not available: spawn pandoc ENOENT');
    });

    it('should return error if output file is not created despite success', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0); // Success exit code
          }
        }),
      };
      mockSpawn.mockReturnValue(mockChild);
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/output.docx') return false; // Output file not created
        return false;
      });

      const result = await convertDocument({
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Conversion failed - output file not created');
    });
  });

  describe('getExtensionForFormat', () => {
    it('should return correct extensions for known formats', () => {
      expect(getExtensionForFormat('docx')).toBe('.docx');
      expect(getExtensionForFormat('html')).toBe('.html');
      expect(getExtensionForFormat('pdf')).toBe('.pdf');
    });

    it('should return generic extension for unknown formats', () => {
      expect(getExtensionForFormat('txt')).toBe('.txt');
      expect(getExtensionForFormat('odt')).toBe('.odt');
      expect(getExtensionForFormat('rtf')).toBe('.rtf');
    });
  });
});
