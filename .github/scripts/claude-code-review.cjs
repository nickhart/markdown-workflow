#!/usr/bin/env node

/**
 * Claude AI Code Review Script
 *
 * Analyzes PR diffs using Claude API and provides structured code review feedback.
 * Designed for GitHub Actions with manual triggering via PR comments.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class ClaudeCodeReviewer {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.config = {
      model: options.model || 'claude-3-haiku-20240307',
      maxTokens: options.maxTokens || 4000,
      focus: options.focus || ['security', 'performance', 'maintainability', 'typescript'],
      brief: options.brief || false,
      ...options,
    };
  }

  /**
   * Make a request to Claude API
   */
  async callClaude(messages, systemPrompt) {
    console.error('DEBUG: Preparing Claude API request...');
    const requestBody = {
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      system: systemPrompt,
      messages: messages,
    };
    const data = JSON.stringify(requestBody);
    console.error(`DEBUG: Request body size: ${data.length} bytes`);

    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data, 'utf8'),
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
    };

    return new Promise((resolve, reject) => {
      console.error('DEBUG: Sending HTTPS request to Claude API...');
      const req = https.request(options, (res) => {
        console.error(`DEBUG: Got response with status: ${res.statusCode}`);
        let responseData = '';

        // Set encoding to handle UTF-8 properly
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          console.error(`DEBUG: Response complete. Size: ${responseData.length} chars`);
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode >= 400) {
              console.error(`DEBUG: API error response: ${JSON.stringify(parsed)}`);
              reject(new Error(`Claude API error: ${parsed.error?.message || responseData}`));
            } else {
              console.error('DEBUG: API call successful');
              resolve(parsed);
            }
          } catch (error) {
            console.error(`DEBUG: JSON parse error: ${error.message}`);
            console.error(`DEBUG: Raw response: ${responseData.substring(0, 500)}...`);
            reject(new Error(`Failed to parse Claude response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error(`DEBUG: Request error: ${error.message}`);
        reject(new Error(`Request failed: ${error.message}`));
      });

      console.error('DEBUG: Writing request data and ending request...');
      req.write(data);
      req.end();
    });
  }

  /**
   * Generate system prompt based on review focus areas
   */
  generateSystemPrompt() {
    const focusAreas = this.config.focus.join(', ');
    const briefness = this.config.brief
      ? 'Keep feedback concise and high-level.'
      : 'Provide detailed explanations for your suggestions.';

    return `You are an expert code reviewer specializing in TypeScript/JavaScript. Review the provided code changes and focus on: ${focusAreas}.

Guidelines:
- Identify security vulnerabilities, logic bugs, and maintainability issues
- Suggest TypeScript best practices and type safety improvements
- Flag performance concerns and potential runtime errors
- Provide constructive, actionable feedback
- Use severity levels: 🔴 Critical (security/bugs), 🟡 Warning (maintainability), 🔵 Suggestion (improvements)
- ${briefness}
- Format output as GitHub markdown with clear sections

If no significant issues are found, acknowledge the code quality and provide 1-2 minor suggestions if any.`;
  }

  /**
   * Filter and process diff content
   */
  processDiff(diff, config) {
    const lines = diff.split('\n');
    const filteredLines = [];
    let currentFile = '';
    let includeFile = false;

    for (const line of lines) {
      // Check for file headers
      if (line.startsWith('diff --git') || line.startsWith('+++')) {
        const match = line.match(/\+\+\+ b\/(.+)$/);
        if (match) {
          currentFile = match[1];
          includeFile = this.shouldIncludeFile(currentFile, config);
        }
        if (includeFile) filteredLines.push(line);
      } else if (includeFile) {
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  /**
   * Check if file should be included in review
   */
  shouldIncludeFile(filename, config) {
    // Check exclude patterns
    if (config.excludePatterns) {
      for (const pattern of config.excludePatterns) {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        if (regex.test(filename)) return false;
      }
    }

    // Check include patterns
    if (config.includePatterns) {
      for (const pattern of config.includePatterns) {
        const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
        if (regex.test(filename)) return true;
      }
      return false; // If include patterns exist, file must match one
    }

    return true; // Include by default if no patterns specified
  }

  /**
   * Estimate token count (rough approximation)
   */
  estimateTokens(text) {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if diff exceeds reasonable limits (but don't truncate)
   */
  checkDiffSize(diff, maxInputTokens = 100000) {
    const estimatedTokens = this.estimateTokens(diff);

    if (estimatedTokens <= maxInputTokens) {
      return { diff, truncated: false, originalTokens: estimatedTokens };
    }

    return {
      diff: diff, // Don't truncate - review the full diff
      truncated: false,
      originalTokens: estimatedTokens,
    };
  }

  /**
   * Format the final review comment
   */
  formatReviewComment(response, metadata) {
    const { model, focus, brief } = this.config;
    const { truncated, originalTokens } = metadata;

    let comment = `## 🤖 Claude AI Code Review\n\n`;

    // Add metadata
    comment += `<details>\n<summary>Review Details</summary>\n\n`;
    comment += `- **Model**: ${model}\n`;
    comment += `- **Focus Areas**: ${focus.join(', ')}\n`;
    comment += `- **Mode**: ${brief ? 'Brief' : 'Detailed'}\n`;
    comment += `- **Tokens Used**: ~${originalTokens}\n`;
    if (truncated) {
      comment += `- **Note**: Large diff detected but reviewed in full\n`;
    }
    comment += `\n</details>\n\n`;

    // Add the actual review content
    comment += response.content[0].text;

    // Add footer
    comment += `\n\n---\n*AI-generated review • May contain errors • Use human judgment*`;

    return comment;
  }

  /**
   * Main review function
   */
  async reviewCode(diff, config = {}) {
    console.error('DEBUG: Starting reviewCode method...');
    try {
      // Process and filter diff
      console.error('DEBUG: Processing diff...');
      const processedDiff = this.processDiff(diff, config);
      console.error(`DEBUG: Processed diff size: ${processedDiff.length} characters`);

      if (!processedDiff.trim()) {
        console.error('DEBUG: No reviewable code changes found');
        return {
          success: true,
          comment:
            '## 🤖 Claude AI Code Review\n\nNo reviewable code changes found in this PR (only excluded files or non-code changes).',
          metadata: { tokens: 0 },
        };
      }

      // Check diff size but don't truncate
      const maxInputTokens = config.maxInputTokens || 100000; // Use config value or default to 100k
      console.error(`DEBUG: Using maxInputTokens: ${maxInputTokens}`);
      const { diff: finalDiff, ...sizeInfo } = this.checkDiffSize(processedDiff, maxInputTokens);
      console.error(`DEBUG: Final diff size: ${finalDiff.length} chars, estimated tokens: ${sizeInfo.originalTokens}`);

      // Generate prompts
      console.error('DEBUG: Generating system prompt...');
      const systemPrompt = this.generateSystemPrompt();
      const messages = [
        {
          role: 'user',
          content: `Please review these code changes:\n\n\`\`\`diff\n${finalDiff}\n\`\`\``,
        },
      ];
      console.error('DEBUG: About to call Claude API...');

      const response = await this.callClaude(messages, systemPrompt);
      console.error('DEBUG: Claude API call completed successfully');

      // Format final comment
      const comment = this.formatReviewComment(response, sizeInfo);

      return {
        success: true,
        comment,
        metadata: {
          tokens: response.usage?.input_tokens + response.usage?.output_tokens || 'unknown',
          model: this.config.model,
          truncated: sizeInfo.truncated,
        },
      };
    } catch (error) {
      console.error('DEBUG: Error in reviewCode method:', error.message);
      console.error('DEBUG: Full error stack:', error.stack);
      return {
        success: false,
        error: error.message,
        comment: `## 🤖 Claude AI Code Review - Error\n\n❌ **Review failed**: ${error.message}\n\nPlease try again or contact the repository maintainer if the issue persists.`,
      };
    }
  }
}

// CLI interface for GitHub Actions
async function main() {
  console.error('DEBUG: Claude review script starting...');
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }
  console.error('DEBUG: API key found');

  // Parse command line arguments
  const args = process.argv.slice(2);
  console.error(`DEBUG: Command line args: ${JSON.stringify(args)}`);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) {
      options.model = args[i + 1].includes('sonnet')
        ? 'claude-3-5-sonnet-20241022'
        : 'claude-3-haiku-20240307';
      i++;
    } else if (args[i] === '--focus' && args[i + 1]) {
      options.focus = args[i + 1].split(',');
      i++;
    } else if (args[i] === '--brief') {
      options.brief = true;
    } else if (args[i] === '--diff' && args[i + 1]) {
      options.diffFile = args[i + 1];
      i++;
    } else if (args[i] === '--config' && args[i + 1]) {
      options.configFile = args[i + 1];
      i++;
    }
  }

  // Load configuration if provided
  let config = {};
  console.error(`DEBUG: Options parsed: ${JSON.stringify(options)}`);
  
  if (options.configFile && fs.existsSync(options.configFile)) {
    console.error(`DEBUG: Loading config file: ${options.configFile}`);
    try {
      config = JSON.parse(fs.readFileSync(options.configFile, 'utf8'));
      console.error(`DEBUG: Config loaded successfully: ${JSON.stringify(Object.keys(config))}`);
    } catch (error) {
      console.error('ERROR: Failed to load config file:', error.message);
      process.exit(1);
    }
  } else {
    console.error(`DEBUG: No config file specified or file doesn't exist: ${options.configFile}`);
  }

  // Read diff from file or stdin
  let diff = '';
  if (options.diffFile && fs.existsSync(options.diffFile)) {
    console.error(`DEBUG: Reading diff from file: ${options.diffFile}`);
    diff = fs.readFileSync(options.diffFile, 'utf8');
    console.error(`DEBUG: Diff loaded, size: ${diff.length} characters`);
  } else {
    console.error('DEBUG: Reading diff from stdin');
    // Read from stdin
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      diff += chunk;
    }
    console.error(`DEBUG: Diff read from stdin, size: ${diff.length} characters`);
  }

  if (!diff.trim()) {
    console.error('ERROR: No diff content provided');
    process.exit(1);
  }

  // Perform review
  console.error('DEBUG: Creating Claude reviewer...');
  const reviewer = new ClaudeCodeReviewer(apiKey, options);
  console.error('DEBUG: Starting review process...');
  const result = await reviewer.reviewCode(diff, config);
  console.error(`DEBUG: Review completed, success: ${result.success}`);

  // Output results
  console.error('DEBUG: Formatting output...');
  if (result.success) {
    console.error('DEBUG: Review successful, outputting success result');
    console.log('REVIEW_SUCCESS=true');
    console.log('REVIEW_COMMENT<<EOF');
    console.log(result.comment);
    console.log('EOF');
    if (result.metadata) {
      console.log(`REVIEW_TOKENS=${result.metadata.tokens}`);
      console.log(`REVIEW_MODEL=${result.metadata.model}`);
    }
    console.error('DEBUG: Success output complete');
  } else {
    console.error(`DEBUG: Review failed with error: ${result.error}`);
    console.log('REVIEW_SUCCESS=false');
    console.log('REVIEW_ERROR=' + result.error);
    console.log('REVIEW_COMMENT<<EOF');
    console.log(result.comment);
    console.log('EOF');
    console.error('DEBUG: Error output complete, exiting with code 1');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('DEBUG: Fatal error in main():', error.message);
    console.error('DEBUG: Fatal error stack:', error.stack);
    process.exit(1);
  });
}

module.exports = { ClaudeCodeReviewer };
