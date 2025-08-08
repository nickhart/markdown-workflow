import * as fs from 'fs';
import { spawn } from 'child_process';
import { jest } from '@jest/globals';
import { PandocConverter } from '../../../../src/shared/converters/pandoc-converter.js';
import {
  ProcessorRegistry,
  BaseProcessor,
  ProcessingContext,
  ProcessingResult,
} from '../../../../src/shared/processors/base-processor.js';

// Mock external dependencies
jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock processor for testing
class MockProcessor extends BaseProcessor {
  readonly name = 'mock';
  readonly description = 'Mock processor for testing';
  readonly version = '1.0.0';
  readonly intermediateExtension = '.mock';
  readonly supportedInputExtensions = ['.md'];
  readonly outputExtensions = ['.png'];
  readonly supportedOutputFormats = ['png'];

  canProcess(content: string): boolean {
    return content.includes('mock');
  }

  detectBlocks(): never[] {
    return [];
  }

  async process(content: string, _context: ProcessingContext): Promise<ProcessingResult> {
    return {
      success: true,
      processedContent: content.replace('mock', 'processed'),
      artifacts: [],
      blocksProcessed: 0,
    };
  }
}

describe('PandocConverter', () => {
  let converter: PandocConverter;
  let mockProcessorRegistry: ProcessorRegistry;
  let mockProcessor: MockProcessor;

  beforeEach(() => {
    mockProcessorRegistry = new ProcessorRegistry();
    mockProcessor = new MockProcessor();
    mockProcessorRegistry.register(mockProcessor);

    converter = new PandocConverter({}, mockProcessorRegistry);

    // Reset mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockReturnValue('test content');
    mockFs.writeFileSync.mockImplementation(() => undefined);

    // Mock successful pandoc execution
    const mockChild = {
      stdout: {
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(Buffer.from(''));
        }),
      },
      stderr: {
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(Buffer.from(''));
        }),
      },
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
      blocksProcessed: 0,
    });
  });

  describe('constructor', () => {
    it('should create converter with default values', () => {
      expect(converter.name).toBe('pandoc');
      expect(converter.description).toBe(
        'Convert documents using pandoc with processor integration',
      );
      expect(converter.supportedFormats).toEqual(['docx', 'html', 'pdf', 'pptx']);
    });

    it('should create converter with custom values', () => {
      const customConverter = new PandocConverter(
        {},
        mockProcessorRegistry,
        'custom',
        'Custom description',
        ['docx'],
      );

      expect(customConverter.name).toBe('custom');
      expect(customConverter.description).toBe('Custom description');
      expect(customConverter.supportedFormats).toEqual(['docx']);
    });
  });

  describe('convert method', () => {
    const baseContext = {
      inputFile: '/test/input.md',
      outputFile: '/test/output.docx',
      format: 'docx' as const,
      collectionPath: '/test',
      assetsDir: '/test/assets',
      intermediateDir: '/test/intermediate',
    };

    it('should convert document successfully', async () => {
      const result = await converter.convert({
        ...baseContext,
        processors: ['mock'],
      });

      expect(result.success).toBe(true);
      expect(result.outputFile).toBe('/test/output.docx');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts![0].name).toBe('output.docx');
    });

    it('should process content with processors before conversion', async () => {
      mockFs.readFileSync.mockReturnValue('content with mock');

      await converter.convert({
        ...baseContext,
        enabledProcessors: ['mock'],
      });

      // Should call processContent when processors are specified
      expect(mockProcessorRegistry.processContent).toHaveBeenCalledWith(
        'content with mock',
        expect.objectContaining({
          collectionPath: '/test',
          assetsDir: '/test/assets',
          intermediateDir: '/test/intermediate',
        }),
        ['mock'],
      );
    });

    it('should skip processing when no processors specified', async () => {
      await converter.convert(baseContext);

      expect(mockProcessorRegistry.processContent).not.toHaveBeenCalled();
    });

    it('should return error when input file does not exist', async () => {
      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath !== '/test/input.md';
      });

      const result = await converter.convert(baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Input file not found: /test/input.md');
    });

    it('should create output directory if it does not exist', async () => {
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test') return false; // Output dir doesn't exist
        if (filePath === '/test/output.docx') return true; // Output file created
        return false;
      });

      await converter.convert(baseContext);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test', { recursive: true });
    });
  });

  describe('buildPandocArgs', () => {
    it('should build correct arguments for DOCX format', () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx' as const,
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      const args = converter['buildPandocArgs'](context);
      expect(args).toEqual(['-o', '/test/output.docx', '/test/input.md']);
    });

    it('should build correct arguments for DOCX with reference document', () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx' as const,
        referenceDoc: '/test/reference.docx',
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === '/test/input.md' || filePath === '/test/reference.docx';
      });

      const args = converter['buildPandocArgs'](context);
      expect(args).toEqual([
        '--reference-doc',
        '/test/reference.docx',
        '-o',
        '/test/output.docx',
        '/test/input.md',
      ]);
    });

    it('should build correct arguments for HTML format', () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.html',
        format: 'html' as const,
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      const args = converter['buildPandocArgs'](context);
      expect(args).toEqual(['--standalone', '-o', '/test/output.html', '/test/input.md']);
    });

    it('should build correct arguments for PDF format', () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pdf',
        format: 'pdf' as const,
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      const args = converter['buildPandocArgs'](context);
      expect(args).toEqual(['--pdf-engine=pdflatex', '-o', '/test/output.pdf', '/test/input.md']);
    });

    it('should build correct arguments for PPTX with reference document', () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.pptx',
        format: 'pptx' as const,
        referenceDoc: '/test/reference.pptx',
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === '/test/input.md' || filePath === '/test/reference.pptx';
      });

      const args = converter['buildPandocArgs'](context);
      expect(args).toEqual([
        '--reference-doc',
        '/test/reference.pptx',
        '-o',
        '/test/output.pptx',
        '/test/input.md',
      ]);
    });

    it('should skip reference document if it does not exist', () => {
      const context = {
        inputFile: '/test/input.md',
        outputFile: '/test/output.docx',
        format: 'docx' as const,
        referenceDoc: '/test/missing.docx',
        collectionPath: '/test',
        assetsDir: '/test/assets',
        intermediateDir: '/test/intermediate',
      };

      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === '/test/input.md'; // Only input exists
      });

      const args = converter['buildPandocArgs'](context);
      expect(args).toEqual(['-o', '/test/output.docx', '/test/input.md']);
    });
  });

  describe('pandoc execution', () => {
    const context = {
      inputFile: '/test/input.md',
      outputFile: '/test/output.docx',
      format: 'docx' as const,
      collectionPath: '/test',
      assetsDir: '/test/assets',
      intermediateDir: '/test/intermediate',
    };

    it('should execute pandoc with correct arguments', async () => {
      await converter.convert(context);

      expect(mockSpawn).toHaveBeenCalledWith(
        'pandoc',
        ['-o', '/test/output.docx', '/test/input.md'],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: '/test',
        },
      );
    });

    it('should handle pandoc execution failure', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event, callback) => {
            if (event === 'data') callback(Buffer.from('pandoc error'));
          }),
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(1); // Error exit code
        }),
      };
      mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      // Make sure output file is not created
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/output.docx') return false;
        return false;
      });

      const result = await converter.convert(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('pandoc error');
    });

    it('should handle pandoc not being available', async () => {
      const mockChild = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'error') callback(new Error('spawn pandoc ENOENT'));
        }),
      };
      mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      const result = await converter.convert(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('pandoc not available: spawn pandoc ENOENT');
    });

    it('should handle missing output file after successful execution', async () => {
      // Pandoc exits successfully but output file is not created
      mockFs.existsSync.mockImplementation((filePath) => {
        if (filePath === '/test/input.md') return true;
        if (filePath === '/test/output.docx') return false;
        return false;
      });

      const result = await converter.convert(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Conversion failed - output file not created');
    });
  });

  describe('mocked execution', () => {
    const context = {
      inputFile: '/test/input.md',
      outputFile: '/test/output.docx',
      format: 'docx' as const,
      collectionPath: '/test',
      assetsDir: '/test/assets',
      intermediateDir: '/test/intermediate',
    };

    beforeEach(() => {
      process.env.MOCK_PANDOC = 'true';
    });

    afterEach(() => {
      delete process.env.MOCK_PANDOC;
    });

    it('should create mock DOCX file when mocking is enabled', async () => {
      mockFs.readFileSync.mockReturnValue('test markdown content');

      const result = await converter.convert(context);

      expect(result.success).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/test/output.docx', expect.any(Buffer));
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should create mock HTML file when mocking is enabled', async () => {
      const htmlContext = { ...context, outputFile: '/test/output.html', format: 'html' as const };
      mockFs.readFileSync.mockReturnValue('test markdown content');

      const result = await converter.convert(htmlContext);

      expect(result.success).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/test/output.html', expect.any(Buffer));
    });

    it('should create mock PDF file when mocking is enabled', async () => {
      const pdfContext = { ...context, outputFile: '/test/output.pdf', format: 'pdf' as const };
      mockFs.readFileSync.mockReturnValue('test markdown content');

      const result = await converter.convert(pdfContext);

      expect(result.success).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/test/output.pdf', expect.any(Buffer));
    });

    it('should create mock PPTX file when mocking is enabled', async () => {
      const pptxContext = { ...context, outputFile: '/test/output.pptx', format: 'pptx' as const };
      mockFs.readFileSync.mockReturnValue('test markdown content');

      const result = await converter.convert(pptxContext);

      expect(result.success).toBe(true);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/test/output.pptx', expect.any(Buffer));
    });

    it('should return error for unsupported mock format', async () => {
      const unsupportedContext = {
        ...context,
        outputFile: '/test/output.xyz',
        format: 'xyz' as 'docx',
      };

      const result = await converter.convert(unsupportedContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Format xyz not supported by pandoc converter');
    });

    it('should create deterministic mock content based on input', async () => {
      mockFs.readFileSync.mockReturnValue('consistent input content');

      await converter.convert(context);
      await converter.convert(context);

      // Both calls should write the same content
      const writeCall1 = (mockFs.writeFileSync as jest.Mock).mock.calls.find(
        (call) => call[0] === '/test/output.docx',
      );
      const writeCall2 = (mockFs.writeFileSync as jest.Mock).mock.calls.findLast(
        (call) => call[0] === '/test/output.docx',
      );

      expect(writeCall1[1]).toEqual(writeCall2[1]);
    });
  });

  describe('simple hash function', () => {
    it('should create consistent hash for same input', () => {
      const hash1 = converter['createSimpleHash']('test content');
      const hash2 = converter['createSimpleHash']('test content');

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{8}$/); // 8-character hex string
    });

    it('should create different hashes for different input', () => {
      const hash1 = converter['createSimpleHash']('content 1');
      const hash2 = converter['createSimpleHash']('content 2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = converter['createSimpleHash']('');

      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });
});
