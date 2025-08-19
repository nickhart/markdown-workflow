import * as fs from 'fs';
import { spawn } from 'child_process';
import { jest } from '@jest/globals';
import { PresentationConverter } from '../../../../src/services/converters/presentation-converter.js';
import { ProcessorRegistry } from '../../../../src/services/processors/base-processor.js';

// Mock external dependencies
jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('PresentationConverter', () => {
  let converter: PresentationConverter;
  let mockProcessorRegistry: ProcessorRegistry;

  beforeEach(() => {
    mockProcessorRegistry = new ProcessorRegistry();
    converter = new PresentationConverter({}, mockProcessorRegistry);

    // Reset mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockReturnValue('test content');

    // Mock successful pandoc execution
    const mockChild = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event, callback) => {
        if (event === 'close') callback(0); // Success
      }),
    };
    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

    // Mock processor registry methods
    jest.spyOn(mockProcessorRegistry, 'processContent').mockResolvedValue({
      success: true,
      processedContent: 'processed content',
      artifacts: [],
      blocksProcessed: 1, // Process at least one block to trigger file creation
    });
  });

  describe('constructor', () => {
    it('should create converter with presentation-specific defaults', () => {
      expect(converter.name).toBe('presentation');
      expect(converter.description).toBe(
        'Convert presentations with advanced diagram processing and presentation-optimized output',
      );
      expect(converter.supportedFormats).toEqual(['pptx', 'html', 'pdf']);
    });

    it('should enable mermaid processor by default', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      // Mock file system calls
      mockFs.readFileSync.mockReturnValue(
        'content with ```mermaid:test\\nflowchart TD\\n  A --> B\\n```',
      );

      await converter.convert(context);

      // Should process with mermaid enabled by default
      expect(mockProcessorRegistry.processContent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        ['mermaid'],
      );
    });

    it('should respect explicit processor configuration', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        enabledProcessors: ['emoji', 'mermaid'],
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      await converter.convert(context);

      expect(mockProcessorRegistry.processContent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        ['emoji', 'mermaid'],
      );
    });

    it('should use empty processors when explicitly provided', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        enabledProcessors: [],
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      await converter.convert(context);

      // With empty processors explicitly provided, should skip processing entirely
      expect(mockProcessorRegistry.processContent).not.toHaveBeenCalled();
    });
  });

  describe('presentation optimization', () => {
    it('should detect and use presentation reference document for PPTX', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        enabledProcessors: ['mermaid'], // Enable processors to trigger file processing
        collectionPath: '/test/collection',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      // Mock reference document exists at expected location
      const expectedReferencePath = '/test/workflows/presentation/templates/static/reference.pptx';
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === expectedReferencePath) return true;
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/intermediate/input_processed.md') return true; // Processed file
        if (filePath === '/test/output.pptx') return true;
        if (filePath === '/test/collection') return true;
        if (filePath === '/test/intermediate') return true; // Intermediate dir
        if (filePath === '/test/assets') return true; // Assets dir
        return false;
      });

      // Mock the processor registry to return processed content with processed file path
      jest.spyOn(mockProcessorRegistry, 'processContent').mockResolvedValue({
        success: true,
        processedContent: 'processed content',
        artifacts: [],
        blocksProcessed: 1,
      });

      await converter.convert(context);

      // Should call pandoc with reference document and processed file
      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        [
          '--reference-doc',
          expectedReferencePath,
          '-o',
          '/test/output.pptx',
          '/test/intermediate/input_processed.md',
        ],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    it('should work without reference document', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        enabledProcessors: ['mermaid'], // Enable processors to trigger file processing
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      // Mock no reference document exists, but input and output do
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/intermediate/input_processed.md') return true; // Processed file
        if (filePath === '/test/output.pptx') return true;
        if (filePath === '/test') return true;
        if (filePath === '/test/intermediate') return true; // Intermediate dir
        if (filePath === '/test/assets') return true; // Assets dir
        return false;
      });

      await converter.convert(context);

      // Should call pandoc without reference document
      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['-o', '/test/output.pptx', '/test/intermediate/input_processed.md'],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    it('should apply HTML-specific optimizations', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.html',
        format: 'html' as const,
        enabledProcessors: ['mermaid'], // Enable processors to trigger file processing
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/intermediate/input_processed.md') return true; // Processed file
        if (filePath === '/test/output.html') return true;
        if (filePath === '/test') return true;
        if (filePath === '/test/intermediate') return true; // Intermediate dir
        if (filePath === '/test/assets') return true; // Assets dir
        return false;
      });

      await converter.convert(context);

      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['--standalone', '-o', '/test/output.html', '/test/intermediate/input_processed.md'],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });
  });

  describe('advanced integration tests', () => {
    it('should process mermaid diagrams in presentation content', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      const contentWithMermaid = `
# Presentation

\`\`\`mermaid:architecture
flowchart TD
  A[User] --> B[API]
  B --> C[Database]
\`\`\`
`;

      mockFs.readFileSync.mockReturnValue(contentWithMermaid);
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/intermediate/input_processed.md') return true; // Processed file
        if (filePath === '/test/output.pptx') return true;
        if (filePath === '/test') return true;
        if (filePath === '/test/intermediate') return true; // Intermediate dir
        if (filePath === '/test/assets') return true; // Assets dir
        return false;
      });

      await converter.convert(context);

      expect(mockProcessorRegistry.processContent).toHaveBeenCalledWith(
        contentWithMermaid,
        expect.objectContaining({
          collectionPath: '/test',
          assetsDir: '/test/assets',
          intermediateDir: '/test/intermediate',
        }),
        ['mermaid'],
      );
    });

    it('should handle PDF format correctly', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pdf',
        format: 'pdf' as const,
        enabledProcessors: ['mermaid'], // Enable processors to trigger file processing
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/intermediate/input_processed.md') return true; // Processed file
        if (filePath === '/test/output.pdf') return true;
        if (filePath === '/test') return true;
        if (filePath === '/test/intermediate') return true; // Intermediate dir
        if (filePath === '/test/assets') return true; // Assets dir
        return false;
      });

      await converter.convert(context);

      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        [
          '--pdf-engine=pdflatex',
          '-o',
          '/test/output.pdf',
          '/test/intermediate/input_processed.md',
        ],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    it('should handle HTML format with standalone option', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.html',
        format: 'html' as const,
        enabledProcessors: ['mermaid'], // Enable processors to trigger file processing
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/intermediate/input_processed.md') return true; // Processed file
        if (filePath === '/test/output.html') return true;
        if (filePath === '/test') return true;
        if (filePath === '/test/intermediate') return true; // Intermediate dir
        if (filePath === '/test/assets') return true; // Assets dir
        return false;
      });

      await converter.convert(context);

      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['--standalone', '-o', '/test/output.html', '/test/intermediate/input_processed.md'],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle processor errors gracefully', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      // Mock processor failure
      jest.spyOn(mockProcessorRegistry, 'processContent').mockResolvedValue({
        success: false,
        error: 'Processor failed',
        blocksProcessed: 0,
      });

      const result = await converter.convert(context);

      // Should fail when processors fail (this is the expected behavior)
      expect(result.success).toBe(false);
      expect(result.error).toBe('Processor failed');
    });

    it('should inherit pandoc error handling from parent class', async () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      // Mock pandoc failure
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event, callback) => {
            if (event === 'data') callback(Buffer.from('pandoc failed'));
          }),
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(1); // Error exit code
        }),
      };
      mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      // Make output file not exist (failure case), but processed file exists
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/intermediate/input_processed.md') return true; // Processed file
        if (filePath === '/test/output.pptx') return false; // Output doesn't exist (pandoc failed)
        if (filePath === '/test') return true;
        if (filePath === '/test/intermediate') return true; // Intermediate dir
        if (filePath === '/test/assets') return true; // Assets dir
        return false;
      });

      const result = await converter.convert(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('pandoc failed');
    });
  });
});
