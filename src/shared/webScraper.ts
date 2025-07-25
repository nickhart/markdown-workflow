/**
 * Web scraping utility with fallback chain: wget → curl → native HTTP
 * No Chrome dependency for reliability and simplicity
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
import { URL } from 'url';
import { spawn } from 'child_process';
import { ProjectConfig } from '../core/schemas.js';

export interface WebScrapingConfig {
  scraper?: 'wget' | 'curl' | 'native' | 'auto';
  timeout?: number;
  add_utf8_bom?: boolean;
  html_cleanup?: 'none' | 'scripts' | 'markdown';
}

export interface ScrapingResult {
  success: boolean;
  outputFile: string;
  method: 'wget' | 'curl' | 'native';
  error?: string;
  fileSize?: number;
}

export interface ScrapingOptions {
  outputFile: string;
  outputDir: string;
  config?: WebScrapingConfig;
}

/**
 * Main web scraping function with fallback chain
 */
export async function scrapeUrl(
  url: string,
  options: ScrapingOptions,
): Promise<ScrapingResult> {
  const config = options.config || {};
  const scraper = config.scraper || 'auto';

  // Validate URL
  try {
    new URL(url);
  } catch (error) {
    return {
      success: false,
      outputFile: options.outputFile,
      method: 'native',
      error: `Invalid URL: ${url}`,
    };
  }

  // Ensure output directory exists
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  const outputPath = path.join(options.outputDir, options.outputFile);

  // Try scrapers in order based on preference
  if (scraper === 'wget' || scraper === 'auto') {
    const result = await tryWget(url, outputPath, config);
    if (result.success) return result;
  }

  if (scraper === 'curl' || scraper === 'auto') {
    const result = await tryCurl(url, outputPath, config);
    if (result.success) return result;
  }

  // Always try native as final fallback
  return await tryNativeHttp(url, outputPath, config);
}

/**
 * Try scraping with wget (best option - handles assets and redirects)
 */
async function tryWget(
  url: string,
  outputPath: string,
  config: WebScrapingConfig,
): Promise<ScrapingResult> {
  if (!await commandExists('wget')) {
    return {
      success: false,
      outputFile: path.basename(outputPath),
      method: 'wget',
      error: 'wget not available',
    };
  }

  return new Promise((resolve) => {
    const timeout = (config.timeout || 30) * 1000;
    const args = [
      '--page-requisites',         // Download CSS, images, etc.
      '--convert-links',           // Convert links for offline viewing
      '--adjust-extension',        // Add proper file extensions
      '--no-host-directories',     // Don't create host directories
      '--directory-prefix', path.dirname(outputPath),
      '--output-document', outputPath,
      '--timeout', String(config.timeout || 30),
      '--tries', '3',
      '--user-agent', 'Mozilla/5.0 (compatible; markdown-workflow)',
      url,
    ];

    const child = spawn('wget', args);
    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        postProcessFile(outputPath, config);
        resolve({
          success: true,
          outputFile: path.basename(outputPath),
          method: 'wget',
          fileSize: fs.statSync(outputPath).size,
        });
      } else {
        resolve({
          success: false,
          outputFile: path.basename(outputPath),
          method: 'wget',
          error: `wget failed (code ${code}): ${stderr}`,
        });
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        outputFile: path.basename(outputPath),
        method: 'wget',
        error: `wget error: ${error.message}`,
      });
    });

    // Set timeout
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        outputFile: path.basename(outputPath),
        method: 'wget',
        error: 'wget timeout',
      });
    }, timeout);
  });
}

/**
 * Try scraping with curl (good fallback - reliable and fast)
 */
async function tryCurl(
  url: string,
  outputPath: string,
  config: WebScrapingConfig,
): Promise<ScrapingResult> {
  if (!await commandExists('curl')) {
    return {
      success: false,
      outputFile: path.basename(outputPath),
      method: 'curl',
      error: 'curl not available',
    };
  }

  return new Promise((resolve) => {
    const timeout = (config.timeout || 30) * 1000;
    const args = [
      '-L',                        // Follow redirects
      '-o', outputPath,            // Output file
      '--max-time', String(config.timeout || 30),
      '--retry', '3',
      '--user-agent', 'Mozilla/5.0 (compatible; markdown-workflow)',
      '--fail',                    // Fail on HTTP errors
      url,
    ];

    const child = spawn('curl', args);
    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        postProcessFile(outputPath, config);
        resolve({
          success: true,
          outputFile: path.basename(outputPath),
          method: 'curl',
          fileSize: fs.statSync(outputPath).size,
        });
      } else {
        resolve({
          success: false,
          outputFile: path.basename(outputPath),
          method: 'curl',
          error: `curl failed (code ${code}): ${stderr}`,
        });
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        outputFile: path.basename(outputPath),
        method: 'curl',
        error: `curl error: ${error.message}`,
      });
    });

    // Set timeout
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        outputFile: path.basename(outputPath),
        method: 'curl',
        error: 'curl timeout',
      });
    }, timeout);
  });
}

/**
 * Try scraping with native Node.js HTTP (simple fallback - just raw HTML)
 */
async function tryNativeHttp(
  url: string,
  outputPath: string,
  config: WebScrapingConfig,
): Promise<ScrapingResult> {
  return new Promise((resolve) => {
    const timeout = (config.timeout || 30) * 1000;
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; markdown-workflow)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout,
    };

    const req = httpModule.request(options, (res) => {
      // Handle redirects manually
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        // Recursive call for redirect (with simple loop protection)
        if (redirectUrl !== url) {
          tryNativeHttp(redirectUrl, outputPath, config).then(resolve);
          return;
        }
      }

      if (res.statusCode && res.statusCode >= 400) {
        resolve({
          success: false,
          outputFile: path.basename(outputPath),
          method: 'native',
          error: `HTTP ${res.statusCode}: ${res.statusMessage}`,
        });
        return;
      }

      // Check content type to ensure we're getting HTML/text
      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
        resolve({
          success: false,
          outputFile: path.basename(outputPath),
          method: 'native',
          error: `Unexpected content type: ${contentType}`,
        });
        return;
      }

      // Handle compressed responses
      let stream: NodeJS.ReadableStream = res;
      const encoding = res.headers['content-encoding'];
      
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      let data = '';
      stream.setEncoding('utf8');

      stream.on('data', (chunk) => {
        data += chunk;
      });

      stream.on('end', () => {
        try {
          // Validate that we got actual HTML content
          if (data.length < 100 || (!data.includes('<html') && !data.includes('<!DOCTYPE'))) {
            resolve({
              success: false,
              outputFile: path.basename(outputPath),
              method: 'native',
              error: 'Response does not appear to be valid HTML',
            });
            return;
          }

          fs.writeFileSync(outputPath, data, 'utf8');
          postProcessFile(outputPath, config);
          resolve({
            success: true,
            outputFile: path.basename(outputPath),
            method: 'native',
            fileSize: fs.statSync(outputPath).size,
          });
        } catch (error) {
          resolve({
            success: false,
            outputFile: path.basename(outputPath),
            method: 'native',
            error: `Write error: ${error}`,
          });
        }
      });

      stream.on('error', (error) => {
        resolve({
          success: false,
          outputFile: path.basename(outputPath),
          method: 'native',
          error: `Decompression error: ${error.message}`,
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        outputFile: path.basename(outputPath),
        method: 'native',
        error: `Request error: ${error.message}`,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        outputFile: path.basename(outputPath),
        method: 'native',
        error: 'Request timeout',
      });
    });

    req.end();
  });
}

/**
 * Post-process the downloaded file based on configuration
 */
function postProcessFile(outputPath: string, config: WebScrapingConfig): void {
  if (!fs.existsSync(outputPath)) return;

  let content = fs.readFileSync(outputPath, 'utf8');

  // Add UTF-8 BOM if requested
  if (config.add_utf8_bom && !content.startsWith('\uFEFF')) {
    content = '\uFEFF' + content;
  }

  // HTML cleanup based on configuration
  if (config.html_cleanup === 'scripts') {
    // Remove script tags and their content
    content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Remove event handlers
    content = content.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');
  }

  // Write back processed content
  fs.writeFileSync(outputPath, content, 'utf8');
}

/**
 * Check if a command exists in the system PATH
 */
async function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore' });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve(false);
    }, 5000);
  });
}

/**
 * Extract web scraping configuration from project config
 */
export function getWebScrapingConfig(projectConfig?: ProjectConfig): WebScrapingConfig {
  if (!projectConfig?.system?.web_download) {
    return {
      scraper: 'auto',
      timeout: 30,
      add_utf8_bom: true,
      html_cleanup: 'scripts',
    };
  }

  const webConfig = projectConfig.system.web_download;
  return {
    scraper: (projectConfig.system.scraper as any) || 'auto',
    timeout: webConfig.timeout || 30,
    add_utf8_bom: webConfig.add_utf8_bom ?? true,
    html_cleanup: webConfig.html_cleanup || 'scripts',
  };
}

/**
 * Generate a reasonable filename from URL if not provided
 */
export function generateFilenameFromUrl(url: string, defaultName: string = 'job_description.html'): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    
    // Extract filename from path
    const pathParts = pathname.split('/').filter(part => part.length > 0);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart.includes('.') && !lastPart.endsWith('/')) {
        return lastPart;
      }
    }

    // Generate filename from hostname and path
    const hostname = parsedUrl.hostname.replace(/^www\./, '');
    const pathSafe = pathname.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    
    if (pathSafe) {
      return `${hostname}_${pathSafe}.html`;
    } else {
      return `${hostname}.html`;
    }
  } catch {
    return defaultName;
  }
}