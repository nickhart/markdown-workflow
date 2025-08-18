/**
 * Simple web scraping utility: wget → curl → basic HTTP
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn } from 'child_process';

export interface ScrapingResult {
  success: boolean;
  outputFile: string;
  method: 'wget' | 'curl' | 'native';
  error?: string;
}

export interface ScrapingOptions {
  outputFile: string;
  outputDir: string;
}

/**
 * Main scraping function with fallbacks
 */
export async function scrapeUrl(url: string, options: ScrapingOptions): Promise<ScrapingResult> {
  // Ensure output directory exists
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  const outputPath = path.join(options.outputDir, options.outputFile);

  // Try wget first
  const wgetResult = await tryCommand('wget', ['-O', outputPath, url]);
  if (wgetResult.success) {
    return { ...wgetResult, method: 'wget', outputFile: options.outputFile };
  }

  // Try curl next
  const curlResult = await tryCommand('curl', ['-o', outputPath, '-L', url]);
  if (curlResult.success) {
    return { ...curlResult, method: 'curl', outputFile: options.outputFile };
  }

  // Fall back to basic HTTP
  return await tryBasicHttp(url, outputPath);
}

/**
 * Try running a shell command
 */
async function tryCommand(
  command: string,
  args: string[],
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });

    child.on('close', (code) => {
      resolve({ success: code === 0, error: code !== 0 ? `${command} failed` : undefined });
    });

    child.on('error', () => {
      resolve({ success: false, error: `${command} not available` });
    });
  });
}

/**
 * Basic HTTP download as last resort
 */
async function tryBasicHttp(url: string, outputPath: string): Promise<ScrapingResult> {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const httpModule = urlObj.protocol === 'https:' ? https : http;

    const req = httpModule.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve({
          success: false,
          outputFile: path.basename(outputPath),
          method: 'native',
          error: `HTTP ${res.statusCode}`,
        });
        return;
      }

      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve({
          success: true,
          outputFile: path.basename(outputPath),
          method: 'native',
        });
      });

      fileStream.on('error', () => {
        resolve({
          success: false,
          outputFile: path.basename(outputPath),
          method: 'native',
          error: 'Write failed',
        });
      });
    });

    req.on('error', () => {
      resolve({
        success: false,
        outputFile: path.basename(outputPath),
        method: 'native',
        error: 'Request failed',
      });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve({
        success: false,
        outputFile: path.basename(outputPath),
        method: 'native',
        error: 'Timeout',
      });
    });
  });
}

/**
 * Generate filename from URL
 */
export function generateFilenameFromUrl(
  url: string,
  defaultName: string = 'url-download.html',
): string {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');
    const pathSafe = parsedUrl.pathname
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return pathSafe ? `${hostname}_${pathSafe}.html` : `${hostname}.html`;
  } catch {
    return defaultName;
  }
}
