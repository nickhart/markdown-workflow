#!/usr/bin/env node

/**
 * Fix ES module imports in compiled JS files by adding .js extensions
 * This is needed because Node.js ES modules require explicit file extensions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

function fixImportsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Pattern to match relative imports without .js extension
  const importPattern = /(from\s+['"])(\.[^'"]*?)(['"])/g;

  let fixed = content.replace(importPattern, (match, prefix, importPath, suffix) => {
    // Skip if already has extension
    if (path.extname(importPath)) {
      return match;
    }

    // Add .js extension
    return `${prefix}${importPath}.js${suffix}`;
  });

  // Also fix dynamic imports
  const dynamicImportPattern = /(import\s*\(\s*['"])(\.[^'"]*?)(['"])/g;
  fixed = fixed.replace(dynamicImportPattern, (match, prefix, importPath, suffix) => {
    if (path.extname(importPath)) {
      return match;
    }
    return `${prefix}${importPath}.js${suffix}`;
  });

  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed, 'utf-8');
    console.log(`Fixed imports in: ${path.relative(distDir, filePath)}`);
  }
}

function walkDirectory(dir) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      walkDirectory(itemPath);
    } else if (item.endsWith('.js')) {
      fixImportsInFile(itemPath);
    }
  }
}

if (fs.existsSync(distDir)) {
  console.log('Fixing ES module imports...');
  walkDirectory(distDir);
  console.log('Import fixing complete!');
} else {
  console.error(`Dist directory not found: ${distDir}`);
  process.exit(1);
}
