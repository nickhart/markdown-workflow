import {
  MermaidProcessor,
  type MermaidConfig,
} from '../../../../src/services/processors/mermaid-processor.js';
import type { SystemConfig } from '../../../../src/engine/schemas.js';
import { ProcessingContext } from '../../../../src/services/processors/base-processor.js';
import { jest } from '@jest/globals';
import * as fs from 'fs';
import { execSync } from 'child_process';

// Mock external dependencies
jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('MermaidProcessor', () => {
  let processor: MermaidProcessor;
  let mockConfig: MermaidConfig;
  let mockSystemConfig: SystemConfig;

  beforeEach(() => {
    mockConfig = {
      output_format: 'png',
      theme: 'default',
      timeout: 30,
    };

    mockSystemConfig = {
      scraper: 'wget',
      web_download: {
        timeout: 30,
        add_utf8_bom: true,
        html_cleanup: 'scripts',
      },
      output_formats: ['docx', 'html', 'pdf'],
      git: {
        auto_commit: true,
        commit_message_template: 'Add {{workflow}} collection: {{collection_id}}',
      },
      collection_id: {
        date_format: 'YYYYMMDD',
        sanitize_spaces: '_',
        max_length: 50,
      },
      testing: {},
      mermaid: mockConfig,
    };

    processor = new MermaidProcessor(mockConfig);

    // Reset mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);
    mockFs.unlinkSync.mockImplementation(() => undefined);
    mockExecSync.mockImplementation(() => Buffer.from(''));
  });

  describe('fromSystemConfig', () => {
    it('should create processor with system config mermaid settings', () => {
      const processor = MermaidProcessor.fromSystemConfig(mockSystemConfig);
      expect(processor).toBeInstanceOf(MermaidProcessor);
    });

    it('should use default config when mermaid config is undefined', () => {
      const systemConfigNoMermaid = { ...mockSystemConfig };
      delete systemConfigNoMermaid.mermaid;

      const processor = MermaidProcessor.fromSystemConfig(systemConfigNoMermaid);
      expect(processor).toBeInstanceOf(MermaidProcessor);
    });
  });

  describe('BaseProcessor interface methods', () => {
    describe('canProcess', () => {
      it('should detect content with mermaid blocks', () => {
        const content = `
# Test

\`\`\`mermaid:diagram-name
flowchart TD
  A --> B
\`\`\`
`;
        expect(processor.canProcess(content)).toBe(true);
      });

      it('should not detect content without mermaid blocks', () => {
        const content = `
# Regular Markdown

No mermaid diagrams here.
`;
        expect(processor.canProcess(content)).toBe(false);
      });
    });

    describe('detectBlocks', () => {
      it('should extract basic mermaid blocks', () => {
        const markdown = `
# Test

\`\`\`mermaid:diagram-name
flowchart TD
  A --> B
\`\`\`
`;

        const blocks = processor.detectBlocks(markdown);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toEqual({
          name: 'diagram-name',
          content: 'flowchart TD\n  A --> B',
          startIndex: expect.any(Number),
          endIndex: expect.any(Number),
        });
      });

      it('should extract multiple mermaid blocks', () => {
        const markdown = `
\`\`\`mermaid:first-diagram
flowchart TD
  A --> B
\`\`\`

Some text

\`\`\`mermaid:second-diagram
graph LR
  X --> Y
\`\`\`
`;

        const blocks = processor.detectBlocks(markdown);
        expect(blocks).toHaveLength(2);
        expect(blocks[0].name).toBe('first-diagram');
        expect(blocks[1].name).toBe('second-diagram');
      });

      it('should return empty array when no mermaid blocks found', () => {
        const markdown = `
# Regular Markdown

No mermaid diagrams here.
`;

        const blocks = processor.detectBlocks(markdown);
        expect(blocks).toHaveLength(0);
      });
    });
  });

  describe('extractMermaidBlocks (legacy)', () => {
    it('should extract basic mermaid blocks', () => {
      const markdown = `
# Test

\`\`\`mermaid:diagram-name
flowchart TD
  A --> B
\`\`\`
`;

      const blocks = processor.extractMermaidBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        name: 'diagram-name',
        code: 'flowchart TD\n  A --> B',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });

    it('should extract mermaid blocks (attributes no longer supported)', () => {
      const markdown = `
\`\`\`mermaid:solution-overview
flowchart LR
  A --> B --> C
\`\`\`
`;

      const blocks = processor.extractMermaidBlocks(markdown);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        name: 'solution-overview',
        code: 'flowchart LR\n  A --> B --> C',
        startIndex: expect.any(Number),
        endIndex: expect.any(Number),
      });
    });

    it('should extract multiple mermaid blocks', () => {
      const markdown = `
\`\`\`mermaid:first-diagram
flowchart TD
  A --> B
\`\`\`

Some text

\`\`\`mermaid:second-diagram
graph LR
  X --> Y
\`\`\`
`;

      const blocks = processor.extractMermaidBlocks(markdown);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].name).toBe('first-diagram');
      expect(blocks[1].name).toBe('second-diagram');
      // Attributes no longer supported in simplified implementation
    });

    it('should return empty array when no mermaid blocks found', () => {
      const markdown = `
# Regular Markdown

No mermaid diagrams here.
`;

      const blocks = processor.extractMermaidBlocks(markdown);
      expect(blocks).toHaveLength(0);
    });
  });

  describe('detectMermaidCLI', () => {
    it('should return true when Mermaid CLI is available', async () => {
      mockExecSync.mockReturnValue(Buffer.from('10.6.1'));

      const isAvailable = await MermaidProcessor.detectMermaidCLI();
      expect(isAvailable).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        'npx @mermaid-js/mermaid-cli --version',
        expect.objectContaining({
          stdio: 'pipe',
          timeout: 10000,
          encoding: 'utf8',
        }),
      );
    });

    it('should return false when Mermaid CLI is not available', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const isAvailable = await MermaidProcessor.detectMermaidCLI();
      expect(isAvailable).toBe(false);
    });
  });

  describe('generateDiagram', () => {
    const mockMermaidCode = 'flowchart TD\n  A --> B';
    const mockOutputPath = '/path/to/output.png';

    beforeEach(() => {
      // Mock successful CLI detection
      mockExecSync.mockReturnValue(Buffer.from('10.6.1'));
    });

    it('should generate diagram with default settings', async () => {
      const result = await processor.generateDiagram(mockMermaidCode, mockOutputPath);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(mockOutputPath);
      expect(mockFs.writeFileSync).toHaveBeenCalled(); // temp file creation
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npx @mermaid-js/mermaid-cli'),
        expect.any(Object),
      );
    });

    it('should fail gracefully when Mermaid CLI is not available', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.toString().includes('--version')) {
          throw new Error('Command not found');
        }
        return Buffer.from('');
      });

      const result = await processor.generateDiagram(mockMermaidCode, mockOutputPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Mermaid CLI not available');
    });

    it('should fail gracefully when diagram generation fails', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.toString().includes('--version')) {
          return Buffer.from('10.6.1');
        }
        throw new Error('Generation failed');
      });

      const result = await processor.generateDiagram(mockMermaidCode, mockOutputPath);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Mermaid generation failed');
    });

    it('should clean up temporary files', async () => {
      await processor.generateDiagram(mockMermaidCode, mockOutputPath);

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('process (BaseProcessor interface)', () => {
    let mockContext: ProcessingContext;

    beforeEach(() => {
      mockContext = {
        collectionPath: '/test/collection',
        assetsDir: '/test/collection/assets',
        intermediateDir: '/test/collection/intermediate',
      };

      // Mock successful CLI detection and execution
      mockExecSync.mockReturnValue(Buffer.from('10.6.1'));
    });

    it('should process content with mermaid blocks successfully', async () => {
      const content = `
# Test Presentation

\`\`\`mermaid:solution-overview
flowchart LR
  A --> B --> C
\`\`\`

Some description text.
`;

      const result = await processor.process(content, mockContext);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(1);
      expect(result.artifacts).toHaveLength(2); // Asset + intermediate file
      expect(result.processedContent).toContain('![solution-overview]');
      expect(result.processedContent).not.toContain('```mermaid:solution-overview');
    });

    it('should return original content when no blocks found', async () => {
      const content = '# Simple document with no diagrams';

      const result = await processor.process(content, mockContext);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(0);
      expect(result.artifacts).toHaveLength(0);
      expect(result.processedContent).toBe(content);
    });

    it('should create intermediate and asset files', async () => {
      const content = `
\`\`\`mermaid:test-diagram
flowchart TD
  A --> B
\`\`\`
`;

      await processor.process(content, mockContext);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-diagram.mmd'),
        'flowchart TD\n  A --> B',
      );
    });

    it('should handle processing errors gracefully', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.toString().includes('--version')) {
          throw new Error('CLI not found');
        }
        return Buffer.from('');
      });

      const content = `
\`\`\`mermaid:failing-diagram
flowchart TD
  A --> B
\`\`\`
`;

      const result = await processor.process(content, mockContext);

      expect(result.success).toBe(true); // Overall processing still succeeds
      expect(result.processedContent).toContain('<!-- Mermaid Error:');
      expect(result.processedContent).toContain('mermaid:failing-diagram');
    });
  });

  describe('processMarkdown (legacy)', () => {
    const mockAssetsDir = '/path/to/assets';
    const mockIntermediateDir = '/path/to/intermediate';

    beforeEach(() => {
      // Mock successful CLI detection and execution
      mockExecSync.mockReturnValue(Buffer.from('10.6.1'));
    });

    it('should process markdown with mermaid blocks', async () => {
      const markdown = `
# Test Presentation

\`\`\`mermaid:solution-overview
flowchart LR
  A --> B --> C
\`\`\`

Some description text.
`;

      const result = await processor.processMarkdown(markdown, mockAssetsDir, mockIntermediateDir);

      expect(result.diagrams).toHaveLength(1);
      expect(result.diagrams[0]).toEqual({
        name: 'solution-overview',
        path: expect.stringContaining('solution-overview.png'),
        relativePath: expect.any(String),
      });

      expect(result.processedMarkdown).toContain('![solution-overview]');
      // Layout attributes no longer supported
    });

    it('should return original markdown when no mermaid blocks found', async () => {
      const markdown = '# Simple markdown with no diagrams';

      const result = await processor.processMarkdown(markdown, mockAssetsDir);

      expect(result.diagrams).toHaveLength(0);
      expect(result.processedMarkdown).toBe(markdown);
    });

    it('should create assets directory if it does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const markdown = `
\`\`\`mermaid:test-diagram
flowchart TD
  A --> B
\`\`\`
`;

      await processor.processMarkdown(markdown, mockAssetsDir);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockAssetsDir, { recursive: true });
    });

    it('should save intermediate mermaid source files when intermediateDir provided', async () => {
      const markdown = `
\`\`\`mermaid:test-diagram
flowchart TD
  A --> B
\`\`\`
`;

      await processor.processMarkdown(markdown, mockAssetsDir, mockIntermediateDir);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-diagram.mmd'),
        'flowchart TD\n  A --> B',
      );
    });

    it('should handle diagram generation errors gracefully', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.toString().includes('--version')) {
          throw new Error('CLI not found');
        }
        return Buffer.from('');
      });

      const markdown = `
\`\`\`mermaid:failing-diagram
flowchart TD
  A --> B
\`\`\`
`;

      const result = await processor.processMarkdown(markdown, mockAssetsDir);

      expect(result.processedMarkdown).toContain('<!-- Mermaid Error:');
      expect(result.processedMarkdown).toContain('mermaid:failing-diagram');
    });
  });
});
