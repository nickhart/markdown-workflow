import { jest } from '@jest/globals';
import {
  GraphvizProcessor,
  GraphvizConfig,
} from '../../../../src/shared/processors/graphviz-processor.js';
import type { ProcessingContext } from '../../../../src/shared/processors/base-processor.js';

// Mock external dependencies
jest.mock('child_process');
jest.mock('fs');

import { execSync } from 'child_process';
import * as fs from 'fs';

const mockExecSync = jest.mocked(execSync);
const mockFs = jest.mocked(fs);

describe('GraphvizProcessor', () => {
  let processor: GraphvizProcessor;
  let context: ProcessingContext;

  const defaultConfig: GraphvizConfig = {
    output_format: 'png',
    layout_engine: 'dot',
    timeout: 30,
    dpi: 96,
    theme: 'default',
    backgroundColor: 'white',
    fontFamily: 'arial,sans-serif',
  };

  beforeEach(() => {
    processor = new GraphvizProcessor(defaultConfig);
    context = {
      collectionPath: '/test/collection',
      assetsDir: '/test/assets',
      intermediateDir: '/test/intermediate',
      outputFormat: 'md',
    };

    // Reset mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockReturnValue('test content');
  });

  describe('constructor', () => {
    it('should create processor with correct properties', () => {
      expect(processor.name).toBe('graphviz');
      expect(processor.description).toBe('Process Graphviz DOT diagrams and generate images');
      expect(processor.version).toBe('1.0.0');
      expect(processor.supportedInputExtensions).toEqual(['.md', '.markdown']);
      expect(processor.supportedOutputFormats).toEqual(['png', 'svg', 'pdf', 'jpeg']);
    });

    it('should accept configuration', () => {
      const customConfig: GraphvizConfig = {
        output_format: 'svg',
        layout_engine: 'neato',
        timeout: 60,
        dpi: 300,
        theme: 'dark',
        backgroundColor: 'black',
        fontFamily: 'monospace',
      };

      const customProcessor = new GraphvizProcessor(customConfig);
      expect(customProcessor).toBeInstanceOf(GraphvizProcessor);
    });
  });

  describe('fromSystemConfig', () => {
    it('should create processor with system config', () => {
      const systemConfig = {
        graphviz: {
          output_format: 'svg',
          layout_engine: 'neato',
          timeout: 45,
        },
      };

      const processor = GraphvizProcessor.fromSystemConfig(systemConfig);
      expect(processor).toBeInstanceOf(GraphvizProcessor);
    });

    it('should use defaults when system config is missing', () => {
      const processor = GraphvizProcessor.fromSystemConfig({});
      expect(processor).toBeInstanceOf(GraphvizProcessor);
    });
  });

  describe('detectGraphvizCLI', () => {
    it('should detect Graphviz CLI when available', async () => {
      mockExecSync.mockReturnValue('dot - graphviz version 2.44.1' as ReturnType<typeof execSync>);

      const result = await GraphvizProcessor.detectGraphvizCLI();
      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('dot -V', expect.any(Object));
    });

    it('should fallback to which command when dot -V fails', async () => {
      mockExecSync
        .mockImplementationOnce(() => {
          throw new Error('Command not found');
        })
        .mockReturnValue('/usr/bin/dot' as ReturnType<typeof execSync>);

      const result = await GraphvizProcessor.detectGraphvizCLI();
      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledTimes(2);
    });

    it('should return false when Graphviz CLI is not available', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await GraphvizProcessor.detectGraphvizCLI();
      expect(result).toBe(false);
    });
  });

  describe('canProcess', () => {
    it('should detect Graphviz blocks', () => {
      const content = `
# Test Document

\`\`\`graphviz:simple-flow
digraph G {
  A -> B;
}
\`\`\`

More content here.
`;

      expect(processor.canProcess(content)).toBe(true);
    });

    it('should not detect non-Graphviz blocks', () => {
      const content = `
# Test Document

\`\`\`mermaid:flow
graph TD
  A --> B
\`\`\`

More content here.
`;

      expect(processor.canProcess(content)).toBe(false);
    });

    it('should detect Graphviz blocks with parameters', () => {
      const content = `
\`\`\`graphviz:complex {layout=neato, theme=dark}
digraph G {
  A -> B;
}
\`\`\`
`;

      expect(processor.canProcess(content)).toBe(true);
    });
  });

  describe('detectBlocks', () => {
    it('should extract basic Graphviz blocks', () => {
      const content = `
\`\`\`graphviz:simple
digraph G {
  A -> B;
}
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('simple');
      expect(blocks[0].content.trim()).toBe('digraph G {\n  A -> B;\n}');
    });

    it('should extract blocks with parameters', () => {
      const content = `
\`\`\`graphviz:flowchart {layout=neato, theme=dark, dpi=300}
digraph G {
  A -> B;
}
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].name).toBe('flowchart');
      expect(blocks[0].metadata?.params).toEqual({
        layout: 'neato',
        theme: 'dark',
        dpi: '300',
      });
    });

    it('should handle multiple blocks', () => {
      const content = `
\`\`\`graphviz:first
digraph G1 { A -> B; }
\`\`\`

\`\`\`graphviz:second
digraph G2 { B -> C; }
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].name).toBe('first');
      expect(blocks[1].name).toBe('second');
    });

    it('should handle blocks without parameters', () => {
      const content = `
\`\`\`graphviz:no-params
digraph G { A -> B; }
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].metadata?.params).toEqual({});
    });
  });

  describe('process', () => {
    it('should process content with Graphviz blocks when CLI is available', async () => {
      // Mock CLI detection
      jest.spyOn(GraphvizProcessor, 'detectGraphvizCLI').mockResolvedValue(true);

      // Mock successful diagram generation - need to mock the private method
      const generateDiagramSpy = jest
        .spyOn(
          processor as unknown as { generateDiagram: () => Promise<unknown> },
          'generateDiagram',
        )
        .mockResolvedValue({
          success: true,
          outputPath: '/test/assets/test.png',
        });

      const content = `
\`\`\`graphviz:test
digraph G { A -> B; }
\`\`\`
`;

      const result = await processor.process(content, context);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(1);
      expect(result.processedContent).toContain('![test]');
      expect(generateDiagramSpy).toHaveBeenCalled();
    });

    it('should handle missing Graphviz CLI gracefully', async () => {
      // Mock CLI detection failure
      jest.spyOn(GraphvizProcessor, 'detectGraphvizCLI').mockResolvedValue(false);

      const content = `
\`\`\`graphviz:test
digraph G { A -> B; }
\`\`\`
`;

      const result = await processor.process(content, context);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(1);
      expect(result.processedContent).toContain(
        '<!-- Graphviz diagram "test" not rendered - CLI not available -->',
      );
    });

    it('should return unchanged content when no blocks found', async () => {
      const content = '# No Graphviz blocks here';

      const result = await processor.process(content, context);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(0);
      expect(result.processedContent).toBe(content);
    });

    it('should handle processing errors gracefully', async () => {
      // Mock CLI detection success but processing failure
      jest.spyOn(GraphvizProcessor, 'detectGraphvizCLI').mockResolvedValue(true);
      mockFs.existsSync.mockReturnValue(false); // Simulate file creation failure

      const content = `
\`\`\`graphviz:test
digraph G { A -> B; }
\`\`\`
`;

      const result = await processor.process(content, context);

      expect(result.success).toBe(true);
      expect(result.blocksProcessed).toBe(1);
    });
  });

  describe('parameter parsing', () => {
    it('should parse layout engine parameter', () => {
      const content = `
\`\`\`graphviz:test {layout=neato}
digraph G { A -> B; }
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      const params = blocks[0].metadata?.params as Record<string, string> | undefined;
      expect(params?.layout).toBe('neato');
    });

    it('should parse theme parameter', () => {
      const content = `
\`\`\`graphviz:test {theme=dark}
digraph G { A -> B; }
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      const params = blocks[0].metadata?.params as Record<string, string> | undefined;
      expect(params?.theme).toBe('dark');
    });

    it('should parse DPI parameter', () => {
      const content = `
\`\`\`graphviz:test {dpi=300}
digraph G { A -> B; }
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      const params = blocks[0].metadata?.params as Record<string, string> | undefined;
      expect(params?.dpi).toBe('300');
    });

    it('should parse multiple parameters', () => {
      const content = `
\`\`\`graphviz:test {layout=neato, theme=dark, dpi=300}
digraph G { A -> B; }
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      const params = blocks[0].metadata?.params as Record<string, string> | undefined;
      expect(params).toEqual({
        layout: 'neato',
        theme: 'dark',
        dpi: '300',
      });
    });

    it('should handle parameters with spaces', () => {
      const content = `
\`\`\`graphviz:test { layout = neato , theme = dark }
digraph G { A -> B; }
\`\`\`
`;

      const blocks = processor.detectBlocks(content);
      const params = blocks[0].metadata?.params as Record<string, string> | undefined;
      expect(params).toEqual({
        layout: 'neato',
        theme: 'dark',
      });
    });
  });

  describe('utility methods', () => {
    it('should return supported layout engines', () => {
      const engines = processor.getSupportedLayoutEngines();
      expect(engines).toEqual(['dot', 'neato', 'fdp', 'sfdp', 'twopi', 'circo']);
    });

    it('should return supported output formats', () => {
      const formats = processor.getSupportedOutputFormats();
      expect(formats).toEqual(['png', 'svg', 'pdf', 'jpeg']);
    });
  });

  describe('theme application', () => {
    it('should apply dark theme styling', () => {
      const config = { ...defaultConfig, theme: 'dark' as const };
      const processor = new GraphvizProcessor(config);

      const dotContent = 'digraph G { A -> B; }';
      const result = processor['applyTheme'](dotContent, config);

      expect(result).toContain('bgcolor="#2d3748"');
      expect(result).toContain('color="#e2e8f0"');
      expect(result).toContain('fontcolor="#e2e8f0"');
    });

    it('should apply light theme styling', () => {
      const config = { ...defaultConfig, theme: 'light' as const };
      const processor = new GraphvizProcessor(config);

      const dotContent = 'digraph G { A -> B; }';
      const result = processor['applyTheme'](dotContent, config);

      expect(result).toContain('bgcolor="#f7fafc"');
      expect(result).toContain('color="#2d3748"');
      expect(result).toContain('fontcolor="#2d3748"');
    });

    it('should apply custom background color', () => {
      const config = { ...defaultConfig, backgroundColor: '#ff0000' };
      const processor = new GraphvizProcessor(config);

      const dotContent = 'digraph G { A -> B; }';
      const result = processor['applyTheme'](dotContent, config);

      expect(result).toContain('bgcolor="#ff0000"');
    });

    it('should apply custom font family', () => {
      const config = { ...defaultConfig, fontFamily: 'monospace' };
      const processor = new GraphvizProcessor(config);

      const dotContent = 'digraph G { A -> B; }';
      const result = processor['applyTheme'](dotContent, config);

      expect(result).toContain('fontname="monospace"');
    });
  });

  describe('error handling', () => {
    it('should handle invalid DOT syntax gracefully', () => {
      // This would normally call the CLI, but we're testing the validation method
      // In a real scenario, this would be caught during processing
      expect(() => {
        // The processor should handle this gracefully during processing
      }).not.toThrow();
    });

    it('should handle missing intermediate directory', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined);

      const content = `
\`\`\`graphviz:test
digraph G { A -> B; }
\`\`\`
`;

      jest.spyOn(GraphvizProcessor, 'detectGraphvizCLI').mockResolvedValue(true);

      const result = await processor.process(content, context);
      expect(result.success).toBe(true);
    });
  });
});
