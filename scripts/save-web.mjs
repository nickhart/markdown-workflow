#!/usr/bin/env node
// save-web.mjs
// Usage:
//   node save-web.mjs <url> <out> [options]
// Examples:
//   node save-web.mjs "https://example.com" out.pdf
//   node save-web.mjs "https://example.com" out.html --method=pandoc-html --strip-scripts -v
//
// Options:
//   --method=chrome|pandoc|wget-pandoc|pandoc-html|wget-html|curl-html|node-html
//   -v, --verbose
//   --timeout-ms=45000
//   --user-agent="..."
//   --pdf-format=Letter|A4|...            (Chrome; Pandoc respects @page if present)
//   --pandoc-engine=xelatex|pdflatex|tectonic
//   --workdir=/tmp/web2pdf-work
//   --strip-scripts                       (for HTML outputs only)
//   --keep-dirs                         (wget: preserve dirs; improves asset paths)
//   --span-hosts                        (wget: allow assets from other hosts/CDNs)
//   --keep-work                        (do not delete working dir on success)
//   --reuse-work                       (skip wget; reuse existing WORKDIR contents)
//   --cache-dir=/path                  (alias of --workdir; explicit cache location)
// Default (no --method): wget-html → curl-html → node-html

import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(`Usage: node save-web.mjs <url> <out.[pdf|html]> [options]
Options:
  --method=chrome|pandoc|wget-pandoc|pandoc-html|wget-html|curl-html|node-html
  -v, --verbose
  --timeout-ms=45000
  --user-agent="..."
  --pdf-format=Letter|A4|...
  --pandoc-engine=xelatex|pdflatex|tectonic
  --workdir=/path/to/workdir
  --strip-scripts   (strip <script> tags for HTML outputs)
  --keep-dirs                         (wget: preserve dirs; improves asset paths)
  --span-hosts                        (wget: allow assets from other hosts/CDNs)
  --keep-work                        (do not delete working dir on success)
  --reuse-work                       (skip wget; reuse existing WORKDIR contents)
  --cache-dir=/path                  (alias of --workdir; explicit cache location)

Default order (no --method): wget-html → curl-html → node-html
`);
  process.exit(2);
}

const url = args[0];
const out = args[1];

const kv = Object.fromEntries(
  args.slice(2).map(s => {
    const m = s.match(/^--?([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [s, true];
  })
);

const METHOD = (kv.method ?? '').toLowerCase();
const VERBOSE = !!(kv.v || kv.verbose);
const TIMEOUT_MS = Number(kv['timeout-ms'] ?? 45000);
const USER_AGENT = kv['user-agent'] || null;
const PDF_FORMAT = kv['pdf-format'] || 'Letter';
const PANDOC_ENGINE = kv['pandoc-engine'] || 'xelatex';
const WORKDIR = kv['workdir'] || null;
const STRIP_SCRIPTS = 'strip-scripts' in kv;
const KEEP_DIRS = 'keep-dirs' in kv;     // if set, do NOT use -nd so wget preserves directories
const SPAN_HOSTS = 'span-hosts' in kv;   // if set, let wget span hosts for assets on CDNs

const CACHE_DIR = kv['cache-dir'] || null; // alias for workdir
const KEEP_WORK = 'keep-work' in kv;       // keep working dir on success
const REUSE_WORK = 'reuse-work' in kv;     // skip wget; reuse existing contents

// If cache-dir is provided, prefer it over workdir
const EFFECTIVE_WORKDIR = CACHE_DIR || WORKDIR || null;

const outIsPDF = /\.pdf$/i.test(out);
const outIsHTML = /\.html?$/i.test(out);

function whichCandidates(cands) {
  return cands.find(c => existsSync(c)) || null;
}

function chromeCandidates() {
  const plat = process.platform;
  if (plat === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta'
    ];
  } else if (plat === 'linux') {
    return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  } else if (plat === 'win32') {
    return [
      (process.env.PROGRAMFILES || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      (process.env['PROGRAMFILES(X86)'] || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
  }
  return [];
}

async function canRun(cmd, args = ['--version']) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('exit', code => resolve(code === 0));
  });
}

async function run(cmd, argv, opts = {}) {
  if (VERBOSE) {
    console.error(`> ${cmd} ${argv.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  }
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: 'inherit', ...opts });
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      p.kill('SIGKILL');
    }, TIMEOUT_MS + 5000);
    p.on('error', reject);
    p.on('exit', code => {
      clearTimeout(timer);
      if (killed) return reject(new Error('Timed out'));
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with ${code}`));
    });
  });
}

async function ensureDir(path) {
  try { await access(path); } catch { await mkdir(path, { recursive: true }); }
}

async function fetchRawHTML(targetUrl, { timeoutMs = TIMEOUT_MS, userAgent = USER_AGENT, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const seen = new Set();
    function doRequest(u) {
      if (redirects > maxRedirects) return reject(new Error('Too many redirects'));
      let parsed;
      try { parsed = new URL(u); } catch (e) { return reject(e); }
      const mod = parsed.protocol === 'http:' ? http : https;
      const req = mod.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: parsed.pathname + (parsed.search || ''),
        method: 'GET',
        headers: {
          'User-Agent': userAgent || 'Mozilla/5.0 (compatible; webgrab/1.0)'
        }
      }, res => {
        const { statusCode, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          const loc = new URL(headers.location, u).toString();
          if (seen.has(loc)) return reject(new Error('Redirect loop'));
          seen.add(loc); redirects++; res.resume(); doRequest(loc); return;
        }
        if (statusCode && statusCode >= 400) {
          return reject(new Error(`HTTP ${statusCode}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(new Error('Request timed out')); });
      req.on('error', reject);
      req.end();
    }
    doRequest(targetUrl);
  });
}

async function getWorkDir() {
  if (EFFECTIVE_WORKDIR) {
    await ensureDir(EFFECTIVE_WORKDIR);
    if (VERBOSE) console.error(`[workdir] using: ${EFFECTIVE_WORKDIR}`);
    return { path: EFFECTIVE_WORKDIR, createdTemp: false };
  }
  const path = await mkdtemp(join(process.cwd(), 'webgrab-'));
  if (VERBOSE) console.error(`[workdir] created temp in PWD: ${path}`);
  return { path, createdTemp: true };
}

async function pickMainHtml(dir) {
  const entries = await readdir(dir);
  const htmls = entries.filter(n => /\.(html?)$/i.test(n));
  if (htmls.length === 0) return null;
  // Prefer exact index.html
  const exactIndex = htmls.find(n => n.toLowerCase() === 'index.html');
  if (exactIndex) return join(dir, exactIndex);
  // Otherwise pick the largest .html file (likely the main page)
  let best = htmls[0];
  let bestSize = 0;
  for (const name of htmls) {
    try {
      const s = await stat(join(dir, name));
      if (s.size > bestSize) { bestSize = s.size; best = name; }
    } catch {}
  }
  return join(dir, best);
}

// --- PDF methods ---------------------------------------------------------------
async function tryChromePDF() {
  if (!outIsPDF) throw new Error('Output must end with .pdf for chrome method');
  const cands = chromeCandidates();
  let chrome = whichCandidates(cands);
  if (!chrome) {
    for (const name of cands) { if (await canRun(name)) { chrome = name; break; } }
  }
  if (!chrome) throw new Error('Chrome/Chromium not found');

  const args = [
    '--headless=new',
    '--disable-gpu',
    `--print-to-pdf=${out}`,
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--virtual-time-budget=${String(TIMEOUT_MS)}`,
  ];
  if (USER_AGENT) args.push(`--user-agent=${USER_AGENT}`);
  if (PDF_FORMAT) args.push(`--print-to-pdf-no-header`, `--pdf-page-size=${PDF_FORMAT}`);
  if (VERBOSE) args.push('--enable-logging=stderr', '--v=1');
  args.push(url);
  await run(chrome, args);
}

async function tryPandocPDFDirect() {
  if (!outIsPDF) throw new Error('Output must end with .pdf for pandoc method');
  if (!(await canRun('pandoc'))) throw new Error('pandoc not found');
  const pandocArgs = [
    '-f', 'html',
    '-t', 'pdf',
    '--standalone',
    '--embed-resources',
    `--pdf-engine=${PANDOC_ENGINE}`,
    '-o', out,
    url
  ];
  if (VERBOSE) pandocArgs.unshift('--verbose');
  await run('pandoc', pandocArgs);
}

async function tryWgetPandocPDF() {
  if (!outIsPDF) throw new Error('Output must end with .pdf for wget-pandoc method');
  if (!(await canRun('wget'))) throw new Error('wget not found');
  if (!(await canRun('pandoc'))) throw new Error('pandoc not found');

  const { path: work, createdTemp } = await getWorkDir();

  if (!REUSE_WORK) {
    const wgetArgs = [
      '--page-requisites',
      '--convert-links',
      '--adjust-extension',
      '--no-parent',
      '--continue',
      '--tries=2',
      '--timeout=' + Math.ceil(TIMEOUT_MS / 1000),
    ];
    if (!KEEP_DIRS) wgetArgs.push('-nd');
    wgetArgs.push('-E');
    if (SPAN_HOSTS) wgetArgs.push('--span-hosts');
    wgetArgs.push('-P', work, url);

    if (VERBOSE) wgetArgs.unshift('-v'); else wgetArgs.unshift('-nv');

    await run('wget', wgetArgs);
  } else if (VERBOSE) {
    console.error('[wget] reuse-work enabled; skipping download');
  }

  const htmlPath = await pickMainHtml(work);
  if (VERBOSE) console.error(`[pick] main html: ${htmlPath}`);
  if (!htmlPath) throw new Error('wget succeeded but no HTML file found');

  const pandocArgs = [
    '-f', 'html',
    '-t', 'pdf',
    '--standalone',
    `--pdf-engine=${PANDOC_ENGINE}`,
    '--resource-path', work,
    '-o', out,
    htmlPath
  ];
  if (VERBOSE) pandocArgs.unshift('--verbose');

  await run('pandoc', pandocArgs);

  if (createdTemp && !KEEP_WORK) {
    // Only remove temp dir on success; caller handles errors by not reaching here
    if (VERBOSE) console.error(`[workdir] cleaning up: ${work}`);
    await rm(work, { recursive: true, force: true }).catch(() => {});
  } else if (VERBOSE) {
    console.error('[workdir] preserved');
  }
}

// --- HTML (self-contained) methods --------------------------------------------
async function stripScriptsOnFile(filePath) {
  if (!STRIP_SCRIPTS) return;
  const html = await readFile(filePath, 'utf8');
  // crude but effective removal of <script>...</script> (including attributes, multiline)
  const cleaned = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  await writeFile(filePath, cleaned, 'utf8');
}

async function tryPandocHTMLDirect() {
  if (!outIsHTML) throw new Error('Output must end with .html for pandoc-html method');
  if (!(await canRun('pandoc'))) throw new Error('pandoc not found');

  const args = [
    '-f', 'html',
    '-t', 'html5',
    '--standalone',
    '--self-contained',   // <- inlines css/img as data URIs
    '-o', out,
    url
  ];
  if (VERBOSE) args.unshift('--verbose');

  await run('pandoc', args);
  await stripScriptsOnFile(out);
}

async function tryCurlHTML() {
  if (!outIsHTML) throw new Error('Output must end with .html for curl-html method');
  if (!(await canRun('curl'))) throw new Error('curl not found');
  const secs = Math.ceil(TIMEOUT_MS / 1000);
  const args = [
    '-L',
    '--max-time', String(secs),
    '-o', out,
  ];
  if (USER_AGENT) { args.push('-A', USER_AGENT); }
  if (VERBOSE) { args.unshift('-v'); } else { args.unshift('-sS'); }
  args.push(url);
  await run('curl', args);
}

async function tryNodeHTML() {
  if (!outIsHTML) throw new Error('Output must end with .html for node-html method');
  const buf = await fetchRawHTML(url, { timeoutMs: TIMEOUT_MS, userAgent: USER_AGENT });
  await writeFile(out, buf);
  if (VERBOSE) console.error(`[node] wrote raw HTML to ${out} (${buf.length} bytes)`);
}

async function tryWgetPandocHTML() {
  if (!outIsHTML) throw new Error('Output must end with .html for wget-html method');
  if (!(await canRun('wget'))) throw new Error('wget not found');
  if (!(await canRun('pandoc'))) throw new Error('pandoc not found');

  const { path: work, createdTemp } = await getWorkDir();

  if (!REUSE_WORK) {
    const wgetArgs = [
      '--page-requisites',
      '--convert-links',
      '--adjust-extension',
      '--no-parent',
      '--continue',
      '--tries=2',
      '--timeout=' + Math.ceil(TIMEOUT_MS / 1000),
    ];
    if (!KEEP_DIRS) wgetArgs.push('-nd');
    wgetArgs.push('-E');
    if (SPAN_HOSTS) wgetArgs.push('--span-hosts');
    wgetArgs.push('-P', work, url);

    if (VERBOSE) wgetArgs.unshift('-v'); else wgetArgs.unshift('-nv');

    await run('wget', wgetArgs);
  } else if (VERBOSE) {
    console.error('[wget] reuse-work enabled; skipping download');
  }

  const htmlPath = await pickMainHtml(work);
  if (VERBOSE) console.error(`[pick] main html: ${htmlPath}`);
  if (!htmlPath) throw new Error('wget succeeded but no HTML file found');

  const pandocArgs = [
    '-f', 'html',
    '-t', 'html5',
    '--standalone',
    '--self-contained',
    '--resource-path', work,
    '-o', out,
    htmlPath
  ];
  if (VERBOSE) pandocArgs.unshift('--verbose');

  await run('pandoc', pandocArgs);
  await stripScriptsOnFile(out);

  if (createdTemp && !KEEP_WORK) {
    // Only remove temp dir on success; caller handles errors by not reaching here
    if (VERBOSE) console.error(`[workdir] cleaning up: ${work}`);
    await rm(work, { recursive: true, force: true }).catch(() => {});
  } else if (VERBOSE) {
    console.error('[workdir] preserved');
  }
}

// --- Orchestration -------------------------------------------------------------
const defaultSeq = outIsPDF
  ? [tryChromePDF, tryPandocPDFDirect, tryWgetPandocPDF, tryPandocHTMLDirect, tryWgetPandocHTML, tryCurlHTML, tryNodeHTML]
  : [tryWgetPandocHTML, tryCurlHTML, tryNodeHTML, tryPandocHTMLDirect, tryChromePDF, tryPandocPDFDirect, tryWgetPandocPDF];

const seq =
  METHOD === 'chrome'       ? [tryChromePDF] :
  METHOD === 'pandoc'       ? [tryPandocPDFDirect] :
  METHOD === 'wget-pandoc'  ? [tryWgetPandocPDF] :
  METHOD === 'pandoc-html'  ? [tryPandocHTMLDirect] :
  METHOD === 'wget-html'    ? [tryWgetPandocHTML] :
  METHOD === 'curl-html'    ? [tryCurlHTML] :
  METHOD === 'node-html'    ? [tryNodeHTML] :
  defaultSeq;

(async () => {
  let lastErr = null;
  for (const fn of seq) {
    try {
      if (VERBOSE) console.error(`Trying method: ${fn.name}`);
      await fn();
      console.error(`OK: wrote ${out}`);
      process.exit(0);
    } catch (e) {
      lastErr = e;
      if (VERBOSE) console.error(`Method ${fn.name} failed: ${e?.message || e}`);
    }
  }
  console.error('All methods failed.');
  if (lastErr) console.error(String(lastErr));
  process.exit(1);
})();
