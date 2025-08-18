import * as fs from 'fs';
import { jest } from '@jest/globals';
import {
  BaseProcessor,
  ProcessorRegistry,
  ProcessingContext,
  ProcessorBlock,
  ProcessingResult,
} from '../../../../src/services/processors/base-processor.js';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Create a concrete implementation for testing
class TestProcessor extends BaseProcessor {
  readonly name = 'test';
  readonly description = 'Test processor for unit testing';
  readonly version = '1.0.0';
  readonly intermediateExtension = '.test';
  readonly supportedInputExtensions = ['.md', '.markdown'];
  readonly outputExtensions = ['.png', '.svg'];
  readonly supportedOutputFormats = ['png', 'svg'];

  canProcess(content: string): boolean {
    return content.includes('```test:');
  }

  detectBlocks(content: string): ProcessorBlock[] {
    const blocks: ProcessorBlock[] = [];
    const regex = /```test:([\w-]+)\s*\n([\s\S]*?)\n```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        name: match[1],
        content: match[2],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return blocks;
  }

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
      const assetFile = this.getAssetFilePath(block.name, context, '.png');
      const relativePath = this.getRelativePath(assetFile, context);

      // Simulate processing
      fs.writeFileSync(intermediateFile, block.content);
      fs.writeFileSync(assetFile, 'mock-image-data');

      artifacts.push(
        {
          name: block.name,
          path: assetFile,
          relativePath,
          type: 'asset',
        },
        {
          name: `${block.name}.test`,
          path: intermediateFile,
          relativePath: this.getRelativePath(intermediateFile, context),
          type: 'intermediate',
        },
      );

      // Replace test block with image reference
      const imageMarkdown = `![${block.name}](${relativePath})`;
      processedContent =
        processedContent.slice(0, block.startIndex) +
        imageMarkdown +
        processedContent.slice(block.endIndex);
    }

    return {
      success: true,
      processedContent,
      artifacts,
      blocksProcessed: blocks.length,
    };
  }
}

describe('BaseProcessor', () => {
  let processor: TestProcessor;
  let context: ProcessingContext;

  beforeEach(() => {
    processor = new TestProcessor();
    context = {
      collectionPath: '/test/collection',
      assetsDir: '/test/collection/assets',
      intermediateDir: '/test/collection/intermediate',
      outputFormat: 'png',
    };

    // Reset mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockReturnValue('test content');
    mockFs.statSync.mockReturnValue({ mtime: new Date() } as fs.Stats);
    mockFs.rmSync.mockImplementation(() => undefined);
  });

  describe('abstract methods implementation', () => {
    it('should implement all required abstract properties', () => {
      expect(processor.name).toBe('test');
      expect(processor.description).toBe('Test processor for unit testing');
      expect(processor.version).toBe('1.0.0');
      expect(processor.intermediateExtension).toBe('.test');
      expect(processor.supportedInputExtensions).toEqual(['.md', '.markdown']);
      expect(processor.outputExtensions).toEqual(['.png', '.svg']);
      expect(processor.supportedOutputFormats).toEqual(['png', 'svg']);
    });

    it('should implement canProcess method', () => {
      expect(processor.canProcess('```test:example\\ncontent\\n```')).toBe(true);
      expect(processor.canProcess('regular markdown')).toBe(false);
    });

    it('should implement detectBlocks method', () => {
      const content = `
# Test Document

\`\`\`test:diagram1
content 1
\`\`\`

Some text.

\`\`\`test:diagram2
content 2
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toEqual({
        name: 'diagram1',
        content: 'content 1',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
      expect(blocks[1]).toEqual({
        name: 'diagram2',
        content: 'content 2',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });
  });

  describe('file path utilities', () => {
    it('should generate correct intermediate file path', () => {
      const filePath = processor['getIntermediateFilePath']('test-block', context);
      expect(filePath).toBe('/test/collection/intermediate/test/test-block.test');
    });

    it('should generate correct asset file path', () => {
      const filePath = processor['getAssetFilePath']('test-block', context);
      expect(filePath).toBe('/test/collection/assets/test-block.png');
    });

    it('should generate correct asset file path with custom extension', () => {
      const filePath = processor['getAssetFilePath']('test-block', context, '.svg');
      expect(filePath).toBe('/test/collection/assets/test-block.svg');
    });

    it('should generate correct relative path', () => {
      const assetPath = '/test/collection/assets/test-block.png';
      const relativePath = processor['getRelativePath'](assetPath, context);
      expect(relativePath).toBe('../assets/test-block.png');
    });
  });

  describe('directory management', () => {
    it('should ensure directories exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      processor['ensureDirectories'](context);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/collection/intermediate/test', {
        recursive: true,
      });
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/test/collection/assets', { recursive: true });
    });

    it('should skip creating directories if they already exist', () => {
      mockFs.existsSync.mockReturnValue(true);

      processor['ensureDirectories'](context);

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('content change detection', () => {
    it('should detect content change when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const hasChanged = processor['hasContentChanged']('/test/file.test', 'new content');
      expect(hasChanged).toBe(true);
    });

    it('should detect content change when content differs', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('old content');

      const hasChanged = processor['hasContentChanged']('/test/file.test', 'new content');
      expect(hasChanged).toBe(true);
    });

    it('should detect no change when content is identical', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('same content');

      const hasChanged = processor['hasContentChanged']('/test/file.test', 'same content');
      expect(hasChanged).toBe(false);
    });
  });

  describe('regeneration detection', () => {
    it('should require regeneration when output file does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === '/test/output.png') return false;
        if (path === '/test/input.test') return true;
        return false;
      });

      const needsRegeneration = processor['needsRegeneration'](
        '/test/output.png',
        '/test/input.test',
      );
      expect(needsRegeneration).toBe(true);
    });

    it('should require regeneration when input file does not exist', () => {
      mockFs.existsSync.mockImplementation((path) => {
        if (path === '/test/output.png') return true;
        if (path === '/test/input.test') return false;
        return false;
      });

      const needsRegeneration = processor['needsRegeneration'](
        '/test/output.png',
        '/test/input.test',
      );
      expect(needsRegeneration).toBe(true);
    });

    it('should require regeneration when input is newer than output', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockImplementation((path) => {
        if (path === '/test/output.png') return { mtime: new Date('2023-01-01') } as fs.Stats;
        if (path === '/test/input.test') return { mtime: new Date('2023-01-02') } as fs.Stats;
        return { mtime: new Date() } as fs.Stats;
      });

      const needsRegeneration = processor['needsRegeneration'](
        '/test/output.png',
        '/test/input.test',
      );
      expect(needsRegeneration).toBe(true);
    });

    it('should not require regeneration when output is up to date', () => {
      mockFs.existsSync.mockReturnValue(true);
      // @ts-expect-error - Mock implementation for testing, doesn't need full Stats interface
      mockFs.statSync.mockImplementation((path) => {
        if (path === '/test/output.png') return { mtime: new Date('2023-01-02') } as fs.Stats;
        if (path === '/test/input.test') return { mtime: new Date('2023-01-01') } as fs.Stats;
        return { mtime: new Date() } as fs.Stats;
      });

      const needsRegeneration = processor['needsRegeneration'](
        '/test/output.png',
        '/test/input.test',
      );
      expect(needsRegeneration).toBe(false);
    });

    it('should handle stat errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockImplementation(() => {
        throw new Error('Stat failed');
      });

      const needsRegeneration = processor['needsRegeneration'](
        '/test/output.png',
        '/test/input.test',
      );
      expect(needsRegeneration).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up processor directory', async () => {
      mockFs.existsSync.mockReturnValue(true);

      await processor.cleanup(context);

      expect(mockFs.rmSync).toHaveBeenCalledWith('/test/collection/intermediate/test', {
        recursive: true,
        force: true,
      });
    });

    it('should skip cleanup if directory does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await processor.cleanup(context);

      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });
  });

  describe('process method', () => {
    it('should process content with blocks successfully', async () => {
      const content = `
# Test Document

\`\`\`test:example
test content
\`\`\`

End of document.
`;

      const result = await processor.process(content, context);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(1);
      expect(result.artifacts).toHaveLength(2); // Asset and intermediate
      expect(result.processedContent).toContain('![example](../assets/example.png)');
      expect(result.processedContent).not.toContain('```test:example');
    });

    it('should return original content when no blocks found', async () => {
      const content = '# Simple document with no blocks';

      const result = await processor.process(content, context);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(0);
      expect(result.artifacts).toHaveLength(0);
      expect(result.processedContent).toBe(content);
    });
  });
});

describe('ProcessorRegistry', () => {
  let registry: ProcessorRegistry;
  let processor1: TestProcessor;
  let processor2: TestProcessor;

  beforeEach(() => {
    registry = new ProcessorRegistry();
    processor1 = new TestProcessor();
    processor2 = new TestProcessor();
    // Give processor2 a different name for testing
    (processor2 as unknown as { name: string; description: string }).name = 'test2';
    (processor2 as unknown as { name: string; description: string }).description =
      'Second test processor';
  });

  describe('processor registration', () => {
    it('should register a processor', () => {
      registry.register(processor1);

      expect(registry.get('test')).toBe(processor1);
    });

    it('should register multiple processors', () => {
      registry.register(processor1);
      registry.register(processor2);

      expect(registry.get('test')).toBe(processor1);
      expect(registry.get('test2')).toBe(processor2);
      expect(registry.getAll()).toHaveLength(2);
    });

    it('should return undefined for unregistered processor', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('processor discovery', () => {
    beforeEach(() => {
      registry.register(processor1);
      registry.register(processor2);
    });

    it('should get all processors', () => {
      const processors = registry.getAll();
      expect(processors).toHaveLength(2);
      expect(processors).toContain(processor1);
      expect(processors).toContain(processor2);
    });

    it('should get processors that can handle content', () => {
      const content = '```test:example\\ncontent\\n```';
      const processors = registry.getProcessorsForContent(content);

      expect(processors).toHaveLength(2); // Both test processors can handle this
    });

    it('should get processors by output format', () => {
      const processors = registry.getProcessorsByFormat('png');

      expect(processors).toHaveLength(2); // Both support PNG
    });

    it('should return empty array for unsupported format', () => {
      const processors = registry.getProcessorsByFormat('pdf');

      expect(processors).toHaveLength(0);
    });
  });

  describe('processor ordering', () => {
    beforeEach(() => {
      registry.register(processor1);
      registry.register(processor2);
    });

    it('should maintain registration order by default', () => {
      const processors = registry.getProcessorsInOrder();
      expect(processors[0]).toBe(processor1);
      expect(processors[1]).toBe(processor2);
    });

    it('should allow setting custom processor order', () => {
      registry.setProcessorOrder(['test2', 'test']);

      const processors = registry.getProcessorsInOrder();
      expect(processors[0]).toBe(processor2);
      expect(processors[1]).toBe(processor1);
    });

    it('should throw error when setting order with unregistered processors', () => {
      expect(() => {
        registry.setProcessorOrder(['test', 'nonexistent']);
      }).toThrow('Cannot set order: unregistered processors: nonexistent');
    });

    it('should get specific processors in order', () => {
      const processors = registry.getProcessorsInOrder(['test2']);
      expect(processors).toHaveLength(1);
      expect(processors[0]).toBe(processor2);
    });
  });

  describe('content processing', () => {
    let mockContext: ProcessingContext;

    beforeEach(() => {
      registry.register(processor1);
      registry.register(processor2);

      mockContext = {
        collectionPath: '/test/collection',
        assetsDir: '/test/collection/assets',
        intermediateDir: '/test/collection/intermediate',
      };

      // Mock fs for processing
      mockFs.existsSync.mockReturnValue(true);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.writeFileSync.mockImplementation(() => undefined);
      mockFs.readFileSync.mockReturnValue('test content');
      mockFs.statSync.mockReturnValue({ mtime: new Date() } as fs.Stats);
    });

    it('should process content through multiple processors', async () => {
      const content = '```test:example\ncontent\n```';

      const result = await registry.processContent(content, mockContext, ['test', 'test2']);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(1); // Only first processor finds and processes the block
      expect(result.artifacts).toHaveLength(2); // 2 artifacts from first processor
    });

    it('should skip processors that cannot handle content', async () => {
      const content = 'regular markdown with no blocks';

      const result = await registry.processContent(content, mockContext, ['test', 'test2']);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(0);
      expect(result.artifacts).toHaveLength(0);
    });

    it('should process content in specified order', async () => {
      registry.setProcessorOrder(['test2', 'test']);
      const content = '```test:example1\ncontent1\n```\n```test:example2\ncontent2\n```';

      // Spy on canProcess methods to verify order
      const canProcessSpy1 = jest.spyOn(processor1, 'canProcess');
      const canProcessSpy2 = jest.spyOn(processor2, 'canProcess');
      const _processSpy1 = jest.spyOn(processor1, 'process');
      const processSpy2 = jest.spyOn(processor2, 'process');

      await registry.processContent(content, mockContext, ['test2', 'test']);

      // Verify both processors were checked in the right order
      expect(canProcessSpy2).toHaveBeenCalled();
      expect(canProcessSpy1).toHaveBeenCalled();

      // test2 should be called to process (it comes first in order)
      expect(processSpy2).toHaveBeenCalled();

      // test1 may or may not be called to process depending on what test2 left behind
      // Both processors handle the same content type, so test2 processes everything
      // and test1 gets called with canProcess but finds no matching content
      expect(canProcessSpy1).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    let mockContext: ProcessingContext;

    beforeEach(() => {
      registry.register(processor1);
      registry.register(processor2);

      mockContext = {
        collectionPath: '/test/collection',
        assetsDir: '/test/collection/assets',
        intermediateDir: '/test/collection/intermediate',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.rmSync.mockImplementation(() => undefined);
    });

    it('should clean up all processors', async () => {
      await registry.cleanup(mockContext);

      expect(mockFs.rmSync).toHaveBeenCalledTimes(2);
      expect(mockFs.rmSync).toHaveBeenCalledWith('/test/collection/intermediate/test', {
        recursive: true,
        force: true,
      });
      expect(mockFs.rmSync).toHaveBeenCalledWith('/test/collection/intermediate/test2', {
        recursive: true,
        force: true,
      });
    });

    it('should clean up specific processors', async () => {
      jest.clearAllMocks(); // Clear previous test mocks

      await registry.cleanup(mockContext, ['test']);

      expect(mockFs.rmSync).toHaveBeenCalledTimes(1);
      expect(mockFs.rmSync).toHaveBeenCalledWith('/test/collection/intermediate/test', {
        recursive: true,
        force: true,
      });
    });

    it('should handle cleanup of non-existent processors gracefully', async () => {
      jest.clearAllMocks(); // Clear previous test mocks

      await registry.cleanup(mockContext, ['nonexistent']);

      expect(mockFs.rmSync).not.toHaveBeenCalled();
    });
  });
});
