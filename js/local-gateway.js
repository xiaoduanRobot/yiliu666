const WebSocket = require('ws');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn, exec } = require('child_process');
const http = require('http');
const url = require('url');

const PORT = 18888;
const FFMPEG_PATH = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');

const MAX_IMAGE_BYTES = 200 * 1024;
function compressImageIfNeeded(base64Data, mimeType) {
  const buf = Buffer.from(base64Data, 'base64');
  if (buf.length <= MAX_IMAGE_BYTES) return { base64: base64Data, mimeType };
  const tempIn = path.join(os.tmpdir(), `img_in_${Date.now()}`);
  const tempOut = path.join(os.tmpdir(), `img_out_${Date.now()}.jpg`);
  try {
    fs.writeFileSync(tempIn, buf);
    execSync(`"${FFMPEG_PATH}" -i "${tempIn}" -q:v 5 "${tempOut}" -y`, { stdio: 'pipe', timeout: 10000 });
    const compressed = fs.readFileSync(tempOut);
    return { base64: compressed.toString('base64'), mimeType: 'image/jpeg' };
  } catch (e) {
    console.log('[图片压缩] 压缩失败，使用原图:', e.message?.substring(0, 80));
    return { base64: base64Data, mimeType };
  } finally {
    try { fs.unlinkSync(tempIn); } catch (_) {}
    try { fs.unlinkSync(tempOut); } catch (_) {}
  }
}
const STATE_DIR = path.join(os.homedir(), '.xiaoduan');

let Lark;
try {
  Lark = require('@larksuiteoapi/node-sdk');
} catch (e) {
  console.log('[Feishu] SDK not installed, Feishu support disabled');
}

// ========== 工具函数 ==========

// keyword 搜索记忆（完整版）
function getNearbyText(text, keyword, contextLength = 500) {
  const pos = text.indexOf(keyword);
  if (pos === -1) return '';
  const start = Math.max(0, pos - Math.floor(contextLength / 2));
  const end = Math.min(text.length, pos + keyword.length + Math.floor(contextLength / 2));
  return text.substring(start, end).trim();
}

function extractTextFromJsonl(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const results = [];

  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      let text = '';
      if (json.message?.content) {
        const c = json.message.content;
        if (Array.isArray(c)) {
          text = c.map(x => x.text || x.content || '').join('');
        } else if (typeof c === 'string') {
          text = c;
        }
      } else if (json.content) {
        const c = json.content;
        if (Array.isArray(c)) {
          text = c.map(x => x.text || x.content || '').join('');
        } else if (typeof c === 'string') {
          text = c;
        }
      }
      const timestamp = json.timestamp ? new Date(json.timestamp).getTime() : json.message?.timestamp || 0;
      if (text.trim()) {
        results.push({ text: text.trim(), timestamp });
      }
    } catch {}
  }

  return results.sort((a, b) => b.timestamp - a.timestamp);
}

function searchKeywordInFiles(sessionsDir, keywords, sessionKey) {
  try {
    let userId = 'main';
    if (sessionKey && sessionKey.includes(':')) {
      userId = sessionKey.split(':')[1];
    } else if (sessionKey) {
      userId = sessionKey;
    }
    const safeUserId = userId.replace(/[^a-zA-Z0-9]/g, '_');

    const memoryDir = path.join(sessionsDir, '..', '记忆');
    const memoryFile = path.join(memoryDir, `${safeUserId}.txt`);

    const allMessages = [];
    const keywordBases = keywords.map(k => k.replace(/\d+$/, ''));

    // 搜索记忆文件
    if (fs.existsSync(memoryFile)) {
      const content = fs.readFileSync(memoryFile, 'utf-8');
      const entries = content.split('\n\n').filter(e => e.trim());
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        let matchScore = 0;
        let matchCount = 0;

        for (const keywordBase of keywordBases) {
          if (entry.includes(keywordBase)) {
            matchScore += 1;
            matchCount += 1;
            const regex = new RegExp(keywordBase, 'gi');
            const matches = entry.match(regex);
            matchScore += (matches?.length || 0) * 0.5;
          }
        }

        if (matchCount === keywordBases.length) {
          allMessages.push({
            text: entry.trim(),
            timestamp: entries.length - 1 - i,
            file: `记忆_${safeUserId}.txt`,
            matchScore
          });
        }
      }
    }

    // 搜索 sessions 目录
    if (allMessages.length === 0) {
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));

      for (const file of files) {
        const filePath = path.join(sessionsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const messages = extractTextFromJsonl(content);

        for (const msg of messages) {
          let matchScore = 0;
          let matchCount = 0;

          for (const keywordBase of keywordBases) {
            if (msg.text.includes(keywordBase)) {
              matchScore += 1;
              matchCount += 1;
              const regex = new RegExp(keywordBase, 'gi');
              const matches = msg.text.match(regex);
              matchScore += (matches?.length || 0) * 0.5;
            }
          }

          if (matchCount === keywordBases.length) {
            allMessages.push({ ...msg, file, matchScore });
          }
        }
      }
    }

    allMessages.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return b.timestamp - a.timestamp;
    });

    return allMessages;
  } catch {
    return [];
  }
}

function keywordSearch(keywordsStr, limit = 3) {
  const parts = keywordsStr.trim().split(/\s+/);
  const keywords = [];

  for (const part of parts) {
    const match = part.match(/^(.+?)(\d+)$/);
    if (match) {
      const keyword = match[1];
      if (keyword) keywords.push(keyword);
    } else {
      keywords.push(part);
    }
  }

  if (keywords.length === 0) {
    return { result: '请输入至少一个关键词', keywords: [], matches: 0 };
  }

  if (keywords.length > 5) {
    keywords.length = 5;
  }

  const memoryFile = path.join(MEMORY_DIR, '记忆.txt');
  if (!fs.existsSync(memoryFile)) {
    return { result: '记忆文件不存在', keywords, matches: 0 };
  }

  const content = fs.readFileSync(memoryFile, 'utf-8');
  const cleanContent = content.replace(/<think[\s\S]*?<\/think>/gi, '');
  const msgRegex = /^\[.*?\]\s*(用户|助手):\s*/gm;
  let m;
  const positions = [];
  while ((m = msgRegex.exec(cleanContent)) !== null) {
    positions.push({ headerEnd: m.index + m[0].length });
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].headerEnd;
    const end = i + 1 < positions.length ? cleanContent.lastIndexOf('\n[', positions[i + 1].headerEnd - 1) : cleanContent.length;
    positions[i].text = cleanContent.substring(start, end > start ? end : cleanContent.length).trim();
  }
  const entries = positions.map(p => p.text);
  const keywordBases = keywords.map(k => k.replace(/\d+$/, ''));
  const allMessages = [];

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i].trim();
    let matchScore = 0;
    let matchCount = 0;
    const relatedKeywords = [];

    for (const keywordBase of keywordBases) {
      if (entry.includes(keywordBase)) {
        matchScore += 1;
        matchCount += 1;
        relatedKeywords.push(keywordBase);
        const regex = new RegExp(keywordBase, 'gi');
        const matches = entry.match(regex);
        matchScore += (matches?.length || 0) * 0.5;
      }
    }

    if (matchCount === keywordBases.length) {
      allMessages.push({
        text: entry.substring(0, 500),
        matchScore,
        relatedKeywords
      });
    }
  }

  allMessages.sort((a, b) => b.matchScore - a.matchScore);
  const results = allMessages.slice(0, limit);

  if (results.length === 0) {
    return { result: `未找到同时包含"${keywords.join('" 和 "')}"的聊天记录`, keywords, matches: 0 };
  }

  const output = results.map((r, idx) => {
    return `【结果${idx + 1}】(相关度:${r.matchScore.toFixed(1)})\n关键词:${r.relatedKeywords.join(',')}\n\n${r.text}`;
  }).join('\n\n---\n\n');

  return {
    result: output,
    keywords,
    matches: results.length,
    summary: `找到${results.length}条匹配记录`
  };
}

// neirong 搜索内容（完整版）
function extractAllToolResults(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const results = [];

  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json.message?.role === 'toolResult') {
        let text = '';
        const contentArray = json.message?.content || [];
        if (Array.isArray(contentArray)) {
          text = contentArray.map(c => c.text || c.content || '').join('');
        } else if (typeof contentArray === 'string') {
          text = contentArray;
        }
        const timestamp = json.timestamp ? new Date(json.timestamp).getTime() :
                          json.message?.timestamp || 0;
        const toolName = json.message?.toolName || '';

        if (text.trim()) {
          results.push({ rawJson: json, text: text.trim(), timestamp, toolName });
        }
      }
    } catch {}
  }

  return results.sort((a, b) => b.timestamp - a.timestamp);
}

function searchNeirongInFiles(sessionsDir) {
  try {
    const allResults = [];
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(sessionsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const messages = extractAllToolResults(content);

      for (const msg of messages) {
        allResults.push({ ...msg, file });
      }
    }

    allResults.sort((a, b) => b.timestamp - a.timestamp);
    return allResults;
  } catch {
    return [];
  }
}

function neirongSearch(keywordsStr) {
  const parts = keywordsStr.trim().split(/\s+/);
  const keywordRequests = [];

  for (const part of parts) {
    if (!part) continue;
    const match = part.match(/^(.+?)(\d+)$/);
    if (match) {
      const keyword = match[1];
      let count = parseInt(match[2], 10);
      if (count < 1) count = 1;
      if (count > 10) count = 10;
      keywordRequests.push({ keyword, count });
    } else {
      keywordRequests.push({ keyword: part, count: 1 });
    }
  }

  if (keywordRequests.length === 0) {
    return { result: '请输入至少一个关键词', keyword: '', matches: 0 };
  }

  if (keywordRequests.length > 5) {
    keywordRequests.length = 5;
  }

  const neirongFile = NEIRONG_CONTENT_FILE;
  if (!fs.existsSync(neirongFile)) {
    return { result: '内容文件不存在', keyword: keywordRequests.map(k => k.keyword).join(' '), matches: 0 };
  }

  const content = fs.readFileSync(neirongFile, 'utf-8');
  const entries = content.split('\n').filter(e => e.trim());
  const finalResults = [];
  const seen = new Set();

  for (const req of keywordRequests) {
    let matched = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i].trim();
      if (entry.includes(req.keyword)) {
        const key = entry.substring(0, 200);
        if (!seen.has(key)) {
          seen.add(key);
          finalResults.push({ text: entry, keyword: req.keyword });
          matched++;
          if (matched >= req.count) break;
        }
      }
    }
  }

  if (finalResults.length === 0) {
    return {
      result: `未找到包含"${keywordRequests.map(k => k.keyword).join('"或"')}"的内容`,
      keyword: keywordRequests.map(k => k.keyword).join(' '),
      matches: 0
    };
  }

  const output = finalResults.map((r, idx) => {
    return `【结果${idx + 1}】关键词:${r.keyword}\n\n${r.text.substring(0, 1000)}`;
  }).join('\n\n---\n\n');

  return {
    result: output,
    keyword: keywordRequests.map(k => k.keyword).join(' '),
    matches: finalResults.length,
    summary: `找到${finalResults.length}条匹配记录`
  };
}

// ========== Core 风格工具参数标准化 ==========

const CLAUDE_PARAM_GROUPS = {
  read: [{ keys: ["path", "file_path"], label: "path (path or file_path)" }],
  write: [{ keys: ["path", "file_path"], label: "path (path or file_path)" }],
  edit: [
    { keys: ["path", "file_path"], label: "path (path or file_path)" },
    {
      keys: ["oldText", "old_string"],
      label: "oldText (oldText or old_string)",
    },
    {
      keys: ["newText", "new_string"],
      label: "newText (newText or new_string)",
    },
  ],
};

function normalizeToolParams(params) {
  if (!params || typeof params !== "object") return undefined;
  const record = params;
  const normalized = { ...record };
  if ("file_path" in normalized && !("path" in normalized)) {
    normalized.path = normalized.file_path;
    delete normalized.file_path;
  }
  if ("old_string" in normalized && !("oldText" in normalized)) {
    normalized.oldText = normalized.old_string;
    delete normalized.old_string;
  }
  if ("new_string" in normalized && !("newText" in normalized)) {
    normalized.newText = normalized.new_string;
    delete normalized.new_string;
  }
  return normalized;
}

function assertRequiredParams(record, groups, toolName) {
  if (!record || typeof record !== "object") {
    throw new Error(`Missing parameters for ${toolName}`);
  }

  for (const group of groups) {
    const satisfied = group.keys.some((key) => {
      if (!(key in record)) return false;
      const value = record[key];
      if (typeof value !== "string") return false;
      if (group.allowEmpty) return true;
      return value.trim().length > 0;
    });

    if (!satisfied) {
      const label = group.label ?? group.keys.join(" or ");
      throw new Error(`Missing required parameter: ${label}`);
    }
  }
}

const GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "patternProperties",
  "additionalProperties",
  "$schema",
  "$id",
  "$ref",
  "$defs",
  "definitions",
  "examples",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "multipleOf",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);

function cleanSchemaForGemini(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(cleanSchemaForGemini);

  const obj = schema;
  const cleaned = {};

  for (const [key, value] of Object.entries(obj)) {
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;

    if (key === "const") {
      cleaned.enum = [value];
      continue;
    }

    if (key === "properties" && value && typeof value === "object") {
      const props = value;
      cleaned[key] = Object.fromEntries(
        Object.entries(props).map(([k, v]) => [
          k,
          cleanSchemaForGemini(v),
        ]),
      );
    } else if (key === "items" && value) {
      if (Array.isArray(value)) {
        cleaned[key] = value.map(cleanSchemaForGemini);
      } else if (typeof value === "object") {
        cleaned[key] = cleanSchemaForGemini(value);
      } else {
        cleaned[key] = value;
      }
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

function normalizeToolParameters(tool) {
  const schema =
    tool.parameters && typeof tool.parameters === "object"
      ? tool.parameters
      : undefined;
  if (!schema) return tool;

  if ("type" in schema && "properties" in schema && !Array.isArray(schema.anyOf)) {
    return {
      ...tool,
      parameters: cleanSchemaForGemini(schema),
    };
  }

  if (
    !("type" in schema) &&
    (typeof schema.properties === "object" || Array.isArray(schema.required)) &&
    !Array.isArray(schema.anyOf) &&
    !Array.isArray(schema.oneOf)
  ) {
    return {
      ...tool,
      parameters: cleanSchemaForGemini({ ...schema, type: "object" }),
    };
  }

  const variantKey = Array.isArray(schema.anyOf)
    ? "anyOf"
    : Array.isArray(schema.oneOf)
      ? "oneOf"
      : null;
  if (!variantKey) return tool;
  const variants = schema[variantKey];
  const mergedProperties = {};
  const requiredCounts = new Map();
  let objectVariants = 0;

  for (const entry of variants) {
    if (!entry || typeof entry !== "object") continue;
    const props = entry.properties;
    if (!props || typeof props !== "object") continue;
    objectVariants += 1;
    for (const [key, value] of Object.entries(props)) {
      if (!(key in mergedProperties)) {
        mergedProperties[key] = value;
        continue;
      }
    }
    const required = Array.isArray(entry.required)
      ? entry.required
      : [];
    for (const key of required) {
      if (typeof key !== "string") continue;
      requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
    }
  }

  const baseRequired = Array.isArray(schema.required)
    ? schema.required.filter((key) => typeof key === "string")
    : undefined;
  const mergedRequired =
    baseRequired && baseRequired.length > 0
      ? baseRequired
      : objectVariants > 0
        ? Array.from(requiredCounts.entries())
            .filter(([, count]) => count === objectVariants)
            .map(([key]) => key)
        : undefined;

  const nextSchema = { ...schema };
  return {
    ...tool,
    parameters: cleanSchemaForGemini({
      type: "object",
      ...(typeof nextSchema.title === "string" ? { title: nextSchema.title } : {}),
      ...(typeof nextSchema.description === "string"
        ? { description: nextSchema.description }
        : {}),
      properties:
        Object.keys(mergedProperties).length > 0 ? mergedProperties : (schema.properties ?? {}),
      ...(mergedRequired && mergedRequired.length > 0 ? { required: mergedRequired } : {}),
      additionalProperties: "additionalProperties" in schema ? schema.additionalProperties : true,
    }),
  };
}

// ========== 工具函数完整版 ==========

// browser - Playwright 完整实现（1:1 复刻 core browser-tool.ts）
let pw = null;
let pwBrowser = null;
let pwPage = null;
const BROWSER_USER_DATA = path.join(STATE_DIR, 'browser', 'user-data');

async function getPw() {
  if (!pw) {
    try {
      pw = require('playwright');
    } catch (e) {
      // playwright 模块未找到（打包后可能缺失），给出明确提示而非让模型瞎装
      throw new Error('playwright 模块未加载。这是Node.js内置模块，不需要pip install。如果浏览器功能不可用，请告知用户重启程序或检查安装目录。');
    }
  }
  return pw;
}

async function findChromiumExe() {
  const pwPath = path.join(process.env.APPDATA || '', '..', 'Local', 'ms-playwright');
  if (!fs.existsSync(pwPath)) return null;
  try {
    const dirs = fs.readdirSync(pwPath);
    for (const dir of dirs) {
      const exe1 = path.join(pwPath, dir, 'chrome-win', 'chrome.exe');
      if (fs.existsSync(exe1)) return exe1;
      const exe2 = path.join(pwPath, dir, 'chrome.exe');
      if (fs.existsSync(exe2)) return exe2;
    }
    const directExe = path.join(pwPath, 'chrome-win', 'chrome.exe');
    if (fs.existsSync(directExe)) return directExe;
  } catch (e) {}
  return null;
}

async function ensureBrowser() {
  const playwright = await getPw();
  if (!pwBrowser || !pwBrowser.isConnected()) {
    if (!fs.existsSync(BROWSER_USER_DATA)) fs.mkdirSync(BROWSER_USER_DATA, { recursive: true });
    const chromiumExe = await findChromiumExe();
    const launchOptions = {
      headless: false,
      args: [
        '--no-sandbox',
        '--no-first-run',
        '--disable-sync',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--ignore-certificate-errors',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--no-default-browser-check'
      ]
    };
    if (chromiumExe) launchOptions.executablePath = chromiumExe;
    const context = await playwright.chromium.launchPersistentContext(BROWSER_USER_DATA, launchOptions);
    pwBrowser = context.browser();
    pwPage = context.pages()[0] || await context.newPage();
  }
  if (!pwPage || pwPage.isClosed()) {
    const ctx = pwBrowser.contexts()[0] || await pwBrowser.newContext();
    pwPage = ctx.pages()[0] || await ctx.newPage();
  }
  return { browser: pwBrowser, page: pwPage };
}

async function browserTool(action, params = {}) {
  try {
    switch (action) {
      case 'status': {
        if (pwBrowser && pwBrowser.isConnected()) {
          const pages = pwBrowser.contexts().flatMap(c => c.pages());
          const tabs = pages.map((p, i) => ({ index: i, url: p.url(), title: '' }));
          return { result: JSON.stringify({ running: true, tabCount: tabs.length, tabs }) };
        }
        return { result: JSON.stringify({ running: false }) };
      }
      case 'start': {
        await ensureBrowser();
        const pages = pwBrowser.contexts().flatMap(c => c.pages());
        return { result: JSON.stringify({ ok: true, running: true, tabCount: pages.length }) };
      }
      case 'stop': {
        if (pwBrowser) { await pwBrowser.close(); pwBrowser = null; pwPage = null; }
        return { result: JSON.stringify({ ok: true, running: false }) };
      }
      case 'tabs': {
        const { browser } = await ensureBrowser();
        const pages = browser.contexts().flatMap(c => c.pages());
        const tabs = await Promise.all(pages.map(async (p, i) => ({
          index: i, url: p.url(), title: await p.title().catch(() => '')
        })));
        return { result: JSON.stringify({ tabs }) };
      }
      case 'open': {
        const targetUrl = params.targetUrl || params.url;
        if (!targetUrl) throw new Error('targetUrl required');
        const { browser, page } = await ensureBrowser();
        const newPage = await browser.contexts()[0].newPage();
        await newPage.goto(targetUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
        pwPage = newPage;
        return { result: JSON.stringify({ ok: true, url: newPage.url(), title: await newPage.title() }) };
      }
      case 'navigate': {
        const targetUrl = params.targetUrl || params.url;
        if (!targetUrl) throw new Error('targetUrl required');
        const { page } = await ensureBrowser();
        await page.goto(targetUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
        pwPage = page;
        return { result: JSON.stringify({ ok: true, url: page.url(), title: await page.title() }) };
      }
      case 'snapshot': {
        const { page } = await ensureBrowser();
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1500).catch(() => {});
        await page.waitForFunction(
          () => document.body && document.body.innerText && document.body.innerText.trim().length > 50,
          { timeout: 8000 }
        ).catch(() => {});

        // 点击输入区域激活 contenteditable（豆包等网站需要先点击才出现输入框）
        try {
          const hiddenInput = page.locator('textarea[aria-hidden="true"]').first();
          if (await hiddenInput.isVisible().catch(() => false)) {
            await hiddenInput.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(500).catch(() => {});
          }
        } catch (e) {}

        const maxChars = params.maxChars || 20000;

        // 生成带 ref 编号的可交互元素列表，供 act click/type 使用
        const INTERACTIVE_SELECTOR = 'a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [role="link"], [role="menuitem"], [onclick], [contenteditable="true"], [contenteditable=""]';
        const interactiveRefs = await page.evaluate((sel) => {
          const els = Array.from(document.querySelectorAll(sel));
          return els.slice(0, 80).map((el, i) => {
            const tag = el.tagName.toLowerCase();
            const text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().substring(0, 40);
            const href = el.getAttribute('href') || '';
            const type = el.getAttribute('type') || '';
            return `[e${i + 1}] ${tag}${type ? '[' + type + ']' : ''}${href ? '(' + href.substring(0, 50) + ')' : ''} "${text}"`;
          });
        }, INTERACTIVE_SELECTOR).catch(() => []);

        // 页面正文
        let snapshot = await page.evaluate(() => {
          return (document.body || document.documentElement).innerText || '';
        }).catch(() => '');

        if (!snapshot || snapshot.trim().length < 100) {
          snapshot = await page.evaluate(() => {
            const html = (document.body || document.documentElement).innerHTML || '';
            return html
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ').trim();
          }).catch(() => '');
        }

        const title = await page.title().catch(() => '');
        const currentUrl = page.url();
        if (!snapshot || snapshot.trim().length < 50) {
          snapshot = `[snapshot无法获取页面内容] URL: ${currentUrl} | 标题: ${title}\n建议改用 browser evaluate 或 web_fetch 获取内容`;
        }

        const refsSection = interactiveRefs.length > 0
          ? `\n\n--- 可交互元素（用 act click/type 时填 ref: "e1" 等）---\n${interactiveRefs.join('\n')}`
          : '';

        const trimmed = (snapshot.replace(/\n{3,}/g, '\n\n').trim() + refsSection).substring(0, maxChars);
        return { result: trimmed, url: currentUrl, title };
      }
      case 'screenshot': {
        const { page } = await ensureBrowser();
        const screenshotBuf = await page.screenshot({
          fullPage: Boolean(params.fullPage),
          type: 'jpeg',
          quality: 40
        });
        const base64 = screenshotBuf.toString('base64');
        const imageContent = [
          { type: 'text', text: `[浏览器截图] URL: ${page.url()}` },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ];
        return { result: `[浏览器截图] URL: ${page.url()}`, _imageContent: imageContent, url: page.url() };
      }
      case 'act': {
        const { page } = await ensureBrowser();
        const req = params.request || params;
        const kind = req.kind;
        // ref 可能是 snapshot 返回的索引号如 "e12"，也可能是 CSS selector
        const INTERACTIVE_SELECTOR = 'a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [role="link"], [role="menuitem"], [onclick], [contenteditable="true"], [contenteditable=""]';
        function resolveLocator(ref, fallback) {
          if (!ref) return page.locator(fallback || 'body');
          // e+数字：对应 snapshot 里的 ref 编号，用 nth 定位可交互元素
          if (/^e\d+$/.test(ref)) {
            const idx = parseInt(ref.slice(1)) - 1;
            return page.locator(INTERACTIVE_SELECTOR).nth(idx);
          }
          // 纯数字：同上
          if (/^\d+$/.test(ref)) {
            const idx = parseInt(ref) - 1;
            return page.locator(INTERACTIVE_SELECTOR).nth(idx);
          }
          // 否则当 CSS selector 或文本选择器
          return page.locator(ref);
        }
        switch (kind) {
          case 'click': {
            const locator = resolveLocator(req.ref, req.element);
            await locator.first().click({ button: req.button || 'left', clickCount: req.doubleClick ? 2 : 1, timeout: req.timeoutMs || 10000 });
            return { result: JSON.stringify({ ok: true, kind: 'click' }) };
          }
          case 'type': {
            // 完全复刻 Edge 方式：click 聚焦 → keyboard.type 输入，跟人手动打字一样
            const locator = req.ref ? resolveLocator(req.ref) : page.locator('input:visible,textarea:visible,[contenteditable="true"],[contenteditable=""]').first();
            await locator.click({ timeout: req.timeoutMs || 10000 });
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Backspace');
            await page.keyboard.type(req.text || '', { delay: 30 });
            if (req.submit) await page.keyboard.press('Enter');
            return { result: JSON.stringify({ ok: true, kind: 'type' }) };
          }
          case 'press': {
            await page.keyboard.press(req.key);
            return { result: JSON.stringify({ ok: true, kind: 'press' }) };
          }
          case 'hover': {
            const locator = resolveLocator(req.ref, 'body');
            await locator.first().hover({ timeout: req.timeoutMs || 10000 });
            return { result: JSON.stringify({ ok: true, kind: 'hover' }) };
          }
          case 'scroll': {
            await page.evaluate(({ x, y }) => window.scrollBy(x || 0, y || 500), req);
            return { result: JSON.stringify({ ok: true, kind: 'scroll' }) };
          }
          case 'wait': {
            if (req.timeMs) await page.waitForTimeout(req.timeMs);
            else if (req.selector) await page.waitForSelector(req.selector, { timeout: req.timeoutMs || 10000 });
            else if (req.text) await page.waitForFunction(t => document.body.innerText.includes(t), req.text, { timeout: req.timeoutMs || 10000 });
            return { result: JSON.stringify({ ok: true, kind: 'wait' }) };
          }
          case 'evaluate': {
            const result = await page.evaluate(req.fn || req.expression || 'null');
            return { result: JSON.stringify({ ok: true, result: String(result).substring(0, 5000) }) };
          }
          case 'select': {
            const locator = req.ref ? resolveLocator(req.ref) : page.locator('select:visible').first();
            await locator.selectOption(req.values || [], { timeout: req.timeoutMs || 10000 });
            return { result: JSON.stringify({ ok: true, kind: 'select' }) };
          }
          case 'close': {
            if (pwPage && !pwPage.isClosed()) await pwPage.close();
            const pages = pwBrowser?.contexts().flatMap(c => c.pages()) || [];
            pwPage = pages[0] || null;
            return { result: JSON.stringify({ ok: true, kind: 'close' }) };
          }
          default:
            throw new Error(`未知 act kind: ${kind}`);
        }
      }
      case 'evaluate': {
        const { page } = await ensureBrowser();
        const expression = String(params.expression || params.fn || '').trim();
        if (!expression) throw new Error('expression required');
        const evaluator = new Function('fnBody', `
          "use strict";
          try {
            var candidate = eval("(" + fnBody + ")");
            return typeof candidate === "function" ? candidate() : candidate;
          } catch (err) {
            throw new Error("Invalid evaluate expression: " + (err && err.message ? err.message : String(err)));
          }
        `);
        const result = await page.evaluate(evaluator, expression);
        const displayResult = result === undefined ? '(JS返回undefined，操作可能已生效)' : result === null ? '(JS返回null)' : String(result).substring(0, 10000);
        return { result: JSON.stringify({ ok: true, result: displayResult }) };
      }
      case 'console': {
        const { page } = await ensureBrowser();
        // 返回最近的 console 消息（需要提前监听，这里返回当前 URL 作为占位）
        return { result: JSON.stringify({ ok: true, url: page.url(), messages: [] }) };
      }
      case 'pdf': {
        const { page } = await ensureBrowser();
        const pdfDir = path.join(STATE_DIR, 'downloads');
        if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
        const pdfPath = path.join(pdfDir, `page-${Date.now()}.pdf`);
        await page.pdf({ path: pdfPath, format: 'A4' });
        return { result: JSON.stringify({ ok: true, path: pdfPath }) };
      }
      case 'focus': {
        const { browser } = await ensureBrowser();
        const idx = typeof params.index === 'number' ? params.index : 0;
        const pages = browser.contexts().flatMap(c => c.pages());
        if (pages[idx]) { pwPage = pages[idx]; await pages[idx].bringToFront(); }
        return { result: JSON.stringify({ ok: true, index: idx }) };
      }
      case 'close_tab': {
        const { browser } = await ensureBrowser();
        const idx = typeof params.index === 'number' ? params.index : 0;
        const pages = browser.contexts().flatMap(c => c.pages());
        if (pages[idx]) await pages[idx].close();
        const remaining = browser.contexts().flatMap(c => c.pages());
        pwPage = remaining[0] || null;
        return { result: JSON.stringify({ ok: true }) };
      }
      case 'upload': {
        const { page } = await ensureBrowser();
        const filePath = params.filePath;
        if (!filePath) throw new Error('filePath required');
        if (!fs.existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`);
        // 找到文件输入框并上传
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(filePath);
          return { result: JSON.stringify({ ok: true, uploaded: filePath }) };
        }
        // 没有file input，尝试通过文件选择对话框
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
          page.click('input[type="file"], [type="file"], button:has-text("上传"), button:has-text("upload")').catch(() => null)
        ]);
        if (fileChooser) {
          await fileChooser.setFiles(filePath);
          return { result: JSON.stringify({ ok: true, uploaded: filePath }) };
        }
        throw new Error('未找到文件上传输入框');
      }
      case 'dialog': {
        const { page } = await ensureBrowser();
        const dialogAction = params.dialogAction || 'accept';
        const dialogText = params.dialogText || '';
        // 注册一次性对话框处理器
        page.once('dialog', async (dialog) => {
          if (dialogAction === 'dismiss') {
            await dialog.dismiss();
          } else {
            await dialog.accept(dialogText);
          }
        });
        return { result: JSON.stringify({ ok: true, dialogAction, dialogText }) };
      }
      default:
        throw new Error(`未知 browser action: ${action}`);
    }
  } catch (e) {
    return { result: `Browser错误: ${e.message}`, error: true };
  }
}

// cron 完整实现
const cronJobs = new Map();
let cronGlobalTimer = null; // 全局轮询定时器
const CRON_STATE_FILE = path.join(STATE_DIR, 'agents', 'main', 'cron_jobs.json');
const CRON_TICK_MS = 10_000; // 每10秒检查一次

function loadCronJobs() {
  try {
    if (fs.existsSync(CRON_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CRON_STATE_FILE, 'utf-8'));
      for (const [id, job] of Object.entries(data)) {
        cronJobs.set(id, job);
      }
    }
  } catch {}
}

function saveCronJobs() {
  try {
    fs.writeFileSync(CRON_STATE_FILE, JSON.stringify(Object.fromEntries(cronJobs), null, 2), 'utf-8');
  } catch {}
}

// 计算下次执行时间（对齐 core schedule.ts 逻辑）
function computeNextRunAtMs(schedule, nowMs) {
  if (!schedule) return undefined;
  const now = nowMs ?? Date.now();

  if (schedule.kind === 'at') {
    const atMs = typeof schedule.atMs === 'number' ? schedule.atMs
      : schedule.at ? new Date(schedule.at).getTime() : null;
    if (atMs === null) return undefined;
    // 允许 10 秒内的轻微过期任务也能执行
    return atMs > now - 10000 ? atMs : undefined;
  }

  if (schedule.kind === 'every') {
    const everyMs = Math.max(1, Math.floor(schedule.everyMs || 60000));
    const anchor = Math.max(0, Math.floor(schedule.anchorMs ?? now));
    // 从 now 开始，找下一个未来的时间点
    let next = anchor;
    while (next <= now) {
      next += everyMs;
    }
    return next;
  }

  if (schedule.kind === 'cron') {
    // 用 croner 库解析，如果没装则降级到简单解析
    try {
      const { Cron } = require('croner');
      const cron = new Cron(schedule.expr.trim(), {
        timezone: schedule.tz?.trim() || 'Asia/Shanghai',
        catch: false
      });
      const next = cron.nextRun(new Date(now));
      return next ? next.getTime() : undefined;
    } catch {
      // 降级：解析 "分 时 * * *" 格式
      const parts = (schedule.expr || '').trim().split(/\s+/);
      if (parts.length >= 5) {
        const minute = parseInt(parts[0]);
        const hour = parseInt(parts[1]);
        if (!isNaN(minute) && !isNaN(hour)) {
          const next = new Date(now);
          next.setHours(hour, minute, 0, 0);
          if (next.getTime() <= now) next.setDate(next.getDate() + 1);
          return next.getTime();
        }
      }
      return undefined;
    }
  }
  return undefined;
}

// 全局轮询：每 CRON_TICK_MS 检查一次到期任务
function startCronTicker() {
  if (cronGlobalTimer) return;
  cronGlobalTimer = setInterval(async () => {
    const now = Date.now();
    for (const [jobId, job] of cronJobs) {
      if (!job.enabled) continue;
      if (job.state?.runningAtMs) continue; // 正在运行，跳过
      const next = job.state?.nextRunAtMs;
      if (typeof next === 'number' && now >= next) {
        await runCronJob(jobId);
      }
    }
  }, CRON_TICK_MS);
}

function stopCronTicker() {
  if (cronGlobalTimer) { clearInterval(cronGlobalTimer); cronGlobalTimer = null; }
}

// 重新计算 job 的 nextRunAtMs 并保存
function recomputeJobNextRun(job) {
  if (!job.enabled) { job.state.nextRunAtMs = undefined; return; }
  job.state.nextRunAtMs = computeNextRunAtMs(job.schedule, Date.now());
}

// 兼容旧代码调用
function scheduleCronJob(job) {
  if (!job.state) job.state = {};
  recomputeJobNextRun(job);
  startCronTicker();
}

function unscheduleCronJob(jobId) {
  // 全局定时器模式下，只需清除 nextRunAtMs
  const job = cronJobs.get(jobId);
  if (job?.state) job.state.nextRunAtMs = undefined;
}

async function runCronJob(jobId) {
  const job = cronJobs.get(jobId);
  if (!job || !job.enabled) return;
  if (!job.state) job.state = {};
  if (job.state.runningAtMs) return;

  // 【修复】如果 shouldStopAll 为 true，等它重置后再执行（最多等3秒）
  // 避免Cron触发时恰好有任务被停止，导致callModel立刻抛异常
  if (shouldStopAll) {
    console.log(`[Cron] 等待停止标志重置: ${job.name || jobId}`);
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (!shouldStopAll) break;
    }
    if (shouldStopAll) {
      console.log(`[Cron] 停止标志未重置，跳过本次执行: ${job.name || jobId}`);
      return;
    }
  }

  const startedAt = Date.now();
  job.state.runningAtMs = startedAt;
  saveCronJobs();
  console.log(`[Cron] executing: ${job.name || jobId}`);

  let cronStatus = 'ok';
  let cronError = '';

  try {
    const payload = job.payload || {};
    if (payload.kind === 'agentTurn' && payload.message) {
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'event',
            event: 'cron.announce',
            payload: { jobId, message: `[cron] ${job.name || jobId}: ${payload.message}`, job }
          }));
        }
      });

      const config = loadConfig();
      const systemPrompt = getSystemPrompt(config?.complexTaskEnabled ?? false);
      const resolvedModel = payload.model || getDefaultModel();
      const cronSessionKey = `session:cron:${jobId}`;
      const runId = `cron-run-${Date.now()}`;
      const deliverChannel = payload.channel || job.delivery?.channel || null;
      const deliverTo = payload.to || job.delivery?.to || null;

      const broadcastChunk = (delta) => {
        const cleanDelta = filterToolBlocks(delta);
        if (!cleanDelta) return;
        wss.clients.forEach(c => {
          if (c.readyState === 1) c.send(JSON.stringify({ type: 'event', event: 'chat', payload: { state: 'streaming', message: { content: cleanDelta }, runId, sessionKey: cronSessionKey } }));
        });
      };

      let messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `[当前时间: ${new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}] ${payload.message}` }
      ];
      let cronFullResponse = '';
      let cronToolCallsHistory = [];
      let cronLastRoundResponse = ''; // 记录最后一轮模型的文字回复（用于记忆.txt）

      // 工具调用循环（Core方式：结构化tool_calls + role:'tool' + 滑动窗口）
      for (let loop = 0; loop < 50; loop++) {
        if (shouldStopAll) { console.log('[Cron] 工具循环被停止'); cronError = '任务被用户停止'; cronFullResponse = cronFullResponse || '[定时任务被停止]'; break; }
        // 【实时更新】每轮callModel前刷新system prompt和动态上下文
        if (loop > 0) {
          // 刷新上下文（内容.txt已在上轮写入完整结果并截断，本轮通过内容.txt截断版回顾）
          messages[0] = { role: 'system', content: getSystemPrompt(config?.complexTaskEnabled ?? false) };
          const ctx = getContextPayload(config?.complexTaskEnabled ?? false);
          messages[1] = { role: 'user', content: `[当前时间: ${new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}] ${payload.message}` + (ctx ? '\n\n' + ctx : '') };
        }

        let rawToolCalls = [];
        let cronNewResponse = '';
        cronLastRoundResponse = ''; // 重置，只保留最后一轮
        try {
          const cronModelResult = await callModel(messages, { model: resolvedModel, stream: true, sessionKey: cronSessionKey, tools: CORE_TOOLS,
            onThinking: (thinking) => {
              // cron不推thinking到前端
            },
            onChunk: (delta) => { cronFullResponse += delta; cronNewResponse += delta; cronLastRoundResponse += delta; broadcastChunk(delta); }
          });

          // 【Core方式】只使用API返回的结构化tool_calls
          const structuredToolCalls = cronModelResult?.choices?.[0]?.message?.tool_calls || [];
          rawToolCalls = [];
          if (structuredToolCalls && structuredToolCalls.length > 0) {
            for (const tc of structuredToolCalls) {
              const tcName = tc.name || tc.function?.name;
              const tcArgs = tc.arguments || tc.function?.arguments;
              if (tcName && tcArgs) {
                try {
                  const params = typeof tcArgs === 'string' ? JSON.parse(tcArgs) : tcArgs;
                  rawToolCalls.push({ name: tcName, params });
                } catch (e) {
                  console.log('[Cron Core方式] 参数解析失败:', e.message);
                }
              }
            }
          } else {
            // 【文本回退】本地模型不支持结构化tool_calls，回退到文本解析
            const textCalls = parseToolCalls(cronNewResponse || '');
            if (textCalls.length > 0) {
              console.log('[Cron文本回退] 从模型输出中解析到', textCalls.length, '个工具调用');
              rawToolCalls = textCalls;
            }
          }
          // 【工具总结】只在有工具调用时保存（纯回复用户的那轮不写，避免与记忆.txt重复）
          // 先不写，等下面判断是否有工具调用后再决定
        } catch (e) {
          console.error('[Cron] 调用模型失败:', e.message);
          cronError = e.message;
          // 【注意】Cron报错不调stopAllTasks，Cron是独立任务，不应影响用户正在进行的对话
          // 把错误信息作为回复内容，确保投递时用户能看到
          cronFullResponse = `[定时任务执行失败] ${e.message}`;
          // 【自我进化】Cron报错也通知前端触发自我进化
          wss.clients.forEach(c => {
            if (c.readyState === 1) {
              c.send(JSON.stringify({ type: 'event', event: 'evolution.trigger', payload: { source: 'cron-error' } }));
            }
          });
          break;
        }

        const toolCalls = rawToolCalls;
        if (toolCalls.length === 0) break;

        // 【工具总结】有工具调用时，保存模型这轮的文字回复到工具总结.txt
        if (cronNewResponse) {
          saveAssistantResponseToSummary(cronNewResponse);
        }

        // 【滑动窗口】先删除上一轮的工具结果
        messages = messages.filter(m => {
          if (m.role === 'tool') return false;
          if (m.role === 'assistant' && m.tool_calls && !m.content) return false;
          return true;
        });

        // 添加 assistant 的 tool_calls 消息（Core API规范）
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: toolCalls.map((tc, i) => ({
            id: `call_${loop}_${i}`,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.params) }
          }))
        });

        for (const call of toolCalls) {
          console.log(`[Cron tool] ${call.name}`);
          wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify({ type: 'event', event: 'agent', payload: { stream: 'tool', runId, sessionKey: cronSessionKey, data: { name: call.name, phase: 'start', args: call.params } } })); });
          const toolResult = await executeTool(call.name, call.params);
          if (shouldStopAll) { console.log('[Cron] 工具被用户停止'); break; }
          cronToolCallsHistory.push({ ...call, result: toolResult });
          // 立刻写工具总结.txt（工具名+参数）
          saveToolCalls([{ ...call, result: toolResult }]);
          wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify({ type: 'event', event: 'agent', payload: { stream: 'tool', runId, sessionKey: cronSessionKey, data: { name: call.name, phase: 'result', result: toolResult.error ? { error: toolResult.result } : { ok: true } } } })); });

          // 【完整传递】工具结果完整写入 messages（role:'tool'），当轮大模型直接看到完整内容
          const toolResultContent = buildToolResultMessage(call, toolResult);
          messages.push({
            role: 'tool',
            tool_call_id: `call_${loop}_${toolCalls.indexOf(call)}`,
            name: call.name,
            content: toolResultContent
          });

          // view_video 工具：把视频帧画面作为 user 消息插入，让模型能"看到"视频
          if (call.name === 'view_video' && toolResult._videoContent && toolResult._videoContent.length > 0) {
            messages.push({
              role: 'user',
              content: toolResult._videoContent
            });
          }

          if (toolResult._imageContent && toolResult._imageContent.length > 0) {
            messages.push({
              role: 'user',
              content: toolResult._imageContent
            });
          }

          // 写入内容.txt持久化（messages里也保留tool结果，下轮callModel时模型直接看到）
          saveToolResultsToNeirong([{ ...call, result: toolResult }]);
        }

        // 【不再删除本轮tool消息】工具结果必须留在messages里，下轮callModel时模型才能看到！
        // 上一轮的tool消息会在下轮 callModel 之后、push新assistant(tool_calls)之前删除（模型已看过）
      }

      const cleanCronResponse = filterToolBlocks(stripThinking(cronLastRoundResponse));
      if (cleanCronResponse) saveAssistantToMemory(cleanCronResponse);

      // 如果有错误标记状态
      if (cronError) {
        cronStatus = 'error';
      }

      // 大模型成功回复（定时任务），更新存活时间戳
      if (!cronError) lastModelMsgTime = Date.now();

      // 空回复检查
      if (!cronFullResponse) {
        console.log(`[Cron] 任务 ${job.name || jobId} 无回复内容（可能模型调用失败或被停止）`);
      }

      wss.clients.forEach(c => {
        if (c.readyState === 1) c.send(JSON.stringify({ type: 'event', event: 'chat', payload: { state: 'final', message: { content: cronFullResponse }, runId, sessionKey: cronSessionKey } }));
      });

      if (deliverChannel === 'feishu' && deliverTo) {
        try {
          const feishuConfig = loadConfig()?.channels?.feishu;
          const appId = feishuConfig?.accounts?.main?.appId;
          const appSecret = feishuConfig?.accounts?.main?.appSecret;
          if (appId && appSecret) {
            const tokenResp = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', { app_id: appId, app_secret: appSecret });
            const token = tokenResp.data.tenant_access_token;
            await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', { receive_id: deliverTo, content: JSON.stringify({ text: cronFullResponse }), msg_type: 'text' }, { headers: { Authorization: `Bearer ${token}` } });
            console.log(`[Cron] delivered to feishu: ${deliverTo}`);
          }
        } catch (e) { console.error('[Cron] feishu delivery failed:', e.message); }
      } else if (deliverChannel === 'qq' && deliverTo) {
        wss.clients.forEach(c => {
          if (c.readyState === 1) c.send(JSON.stringify({ type: 'event', event: 'cron.deliver', payload: { channel: 'qq', to: deliverTo, message: cronFullResponse } }));
        });
        console.log(`[Cron] broadcast qq delivery event: ${deliverTo}`);
      }

      // 【默认投递】无指定渠道时，自动投递到所有已配置的渠道
      if (!deliverChannel) {
        // 投递到飞书（如果已配置）
        try {
          const feishuConfig = loadConfig()?.channels?.feishu;
          const fsAppId = feishuConfig?.accounts?.main?.appId;
          const fsAppSecret = feishuConfig?.accounts?.main?.appSecret;

          if (fsAppId && fsAppSecret && feishuConfig?.enabled) {
            const tokenResp = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', { app_id: fsAppId, app_secret: fsAppSecret });
            const token = tokenResp.data.tenant_access_token;

            // 【修复】优先发送给个人用户（open_id），其次是群（chat_id）
            let feishuSent = false;

            // 1. 优先发送到最后活跃的飞书用户（单聊）
            if (lastFeishuOpenId) {
              try {
                await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
                  receive_id: lastFeishuOpenId,
                  content: JSON.stringify({ text: cronFullResponse }),
                  msg_type: 'text'
                }, { headers: { Authorization: `Bearer ${token}` } });
                console.log(`[Cron] 默认投递到飞书用户: ${lastFeishuOpenId}`);
                feishuSent = true;
              } catch (e) {
                console.log('[Cron] 投递到飞书用户失败:', e.message);
              }
            }

            // 2. 如果没有发送过个人消息，尝试发送到最后活跃的群
            if (!feishuSent && lastFeishuChatId) {
              try {
                await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                  receive_id: lastFeishuChatId,
                  content: JSON.stringify({ text: cronFullResponse }),
                  msg_type: 'text'
                }, { headers: { Authorization: `Bearer ${token}` } });
                console.log(`[Cron] 默认投递到飞书群: ${lastFeishuChatId}`);
                feishuSent = true;
              } catch (e) {
                console.log('[Cron] 投递到飞书群失败:', e.message);
              }
            }

            // 3. 如果还是没有缓存，尝试从飞书 API 获取机器人所在群
            if (!feishuSent) {
              try {
                const listResp = await axios.get('https://open.feishu.cn/open-apis/im/v1/chats?page_size=5', { headers: { Authorization: `Bearer ${token}` } });
                const chats = listResp.data?.data?.items;
                if (chats && chats.length > 0) {
                  const fsDefaultChatId = chats[0].chat_id;
                  lastFeishuChatId = fsDefaultChatId;
                  saveFeishuState(); // 持久化保存
                  await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                    receive_id: fsDefaultChatId,
                    content: JSON.stringify({ text: cronFullResponse }),
                    msg_type: 'text'
                  }, { headers: { Authorization: `Bearer ${token}` } });
                  console.log(`[Cron] 默认投递到飞书群: ${fsDefaultChatId}`);
                }
              } catch (e2) {
                console.log('[Cron] 获取飞书群列表失败:', e2.message);
              }
            }
          }
        } catch (e) { console.error('[Cron] 飞书默认投递失败:', e.message); }

        // 投递到 QQ（如果已配置）
        wss.clients.forEach(c => {
          if (c.readyState === 1) c.send(JSON.stringify({ type: 'event', event: 'cron.deliver', payload: { channel: 'qq', to: 'all', message: cronFullResponse } }));
        });
        console.log('[Cron] 默认广播到 QQ');
      }
    }
  } catch (e) {
    cronStatus = 'error';
    cronError = e.message;
    console.error(`[Cron] job failed: ${jobId}`, e.message);
  }

  const endedAt = Date.now();
  job.state.runningAtMs = undefined;
  job.state.lastRunAtMs = startedAt;
  job.state.lastStatus = cronStatus;
  job.state.lastDurationMs = endedAt - startedAt;
  if (cronError) job.state.lastError = cronError;
  // 【修复】追加执行历史记录（供 runs 操作查询）
  if (!job.runs) job.runs = [];
  job.runs.push({
    ranAt: new Date(startedAt).toISOString(),
    status: cronStatus,
    durationMs: endedAt - startedAt,
    error: cronError || null
  });
  // 保留最近20条记录
  if (job.runs.length > 20) job.runs = job.runs.slice(-20);

  if (job.schedule.kind === 'at') {
    job.enabled = false;
    job.state.nextRunAtMs = undefined;
    if (job.deleteAfterRun) {
      cronJobs.delete(jobId);
      console.log(`[Cron] one-shot job deleted: ${jobId}`);
    } else {
      cronJobs.set(jobId, job);
    }
  } else {
    job.state.nextRunAtMs = computeNextRunAtMs(job.schedule, endedAt);
    cronJobs.set(jobId, job);
    console.log(`[Cron] next run: ${job.name || jobId} @ ${job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : 'none'}`);
  }
  saveCronJobs();
}

function cronTool(action, params = {}) {
  loadCronJobs();

  switch (action) {
    case 'status': {
      const active = Array.from(cronJobs.values()).filter(j => j.enabled).length;
      return { result: JSON.stringify({ ok: true, jobCount: cronJobs.size, activeCount: active }) };
    }
    case 'list': {
      const includeDisabled = Boolean(params.includeDisabled);
      const jobs = Array.from(cronJobs.values())
        .filter(j => includeDisabled || j.enabled)
        .map(j => ({ id: j.id, name: j.name, schedule: j.schedule, enabled: j.enabled, payload: j.payload }));
      return { result: JSON.stringify({ ok: true, jobs }) };
    }
    case 'add': {
      const job = params.job;
      if (!job || typeof job !== 'object') throw new Error('job object required');
      if (!job.schedule) throw new Error('job.schedule required');
      if (!job.payload) throw new Error('job.payload required');
      if (job.payload.kind !== 'agentTurn') throw new Error('payload.kind must be agentTurn');
      if (!job.payload.message) throw new Error('payload.message required');

      const id = 'cron_' + Date.now();
      const now = Date.now();
      const deleteAfterRun = typeof job.deleteAfterRun === 'boolean' ? job.deleteAfterRun : (job.schedule.kind === 'at' ? true : undefined);
      // 【修复】模型可能传delivery为JSON字符串而非对象，需解析
      let deliveryObj = job.delivery || { mode: 'announce' };
      if (typeof deliveryObj === 'string') {
        try { deliveryObj = JSON.parse(deliveryObj); } catch { deliveryObj = { mode: 'announce' }; }
      }
      const newJob = {
        id,
        name: job.name || id,
        schedule: job.schedule,
        payload: job.payload,
        delivery: deliveryObj,
        enabled: job.enabled !== false,
        deleteAfterRun,
        createdAtMs: now,
        updatedAtMs: now,
        state: {}
      };
      newJob.state.nextRunAtMs = computeNextRunAtMs(newJob.schedule, now);
      cronJobs.set(id, newJob);
      saveCronJobs();
      if (newJob.enabled) startCronTicker();
      return { result: JSON.stringify({ ok: true, jobId: id, job: newJob }) };
    }
    case 'update': {
      const id = params.jobId || params.id;
      if (!id) throw new Error('jobId required');
      const job = cronJobs.get(id);
      if (!job) throw new Error(`任务 ${id} 不存在`);
      const patch = params.patch || {};
      // 【安全】禁止覆盖内部字段
      const protectedKeys = ['id', 'state', 'createdAtMs'];
      for (const key of protectedKeys) delete patch[key];
      Object.assign(job, patch);
      job.updatedAtMs = Date.now();
      cronJobs.set(id, job);
      saveCronJobs();
      // 重新调度
      unscheduleCronJob(id);
      if (job.enabled) scheduleCronJob(job);
      return { result: JSON.stringify({ ok: true, job }) };
    }
    case 'remove': {
      const id = params.jobId || params.id;
      if (!id) throw new Error('jobId required');
      unscheduleCronJob(id);
      cronJobs.delete(id);
      saveCronJobs();
      return { result: JSON.stringify({ ok: true, removed: id }) };
    }
    case 'run': {
      const id = params.jobId || params.id;
      if (!id) throw new Error('jobId required');
      if (!cronJobs.has(id)) throw new Error(`任务 ${id} 不存在`);
      runCronJob(id); // 异步执行
      return { result: JSON.stringify({ ok: true, triggered: id }) };
    }
    case 'runs': {
      const id = params.jobId || params.id;
      if (!id) throw new Error('jobId required');
      const job = cronJobs.get(id);
      if (!job) throw new Error(`任务 ${id} 不存在`);
      // 【修复】返回真实的执行历史记录
      return { result: JSON.stringify({ ok: true, runs: job.runs || [], lastStatus: job.state?.lastStatus, lastError: job.state?.lastError || null }) };
    }
    case 'wake': {
      const text = params.text;
      if (!text) throw new Error('text required');
      wss.clients.forEach(client => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({ type: 'event', event: 'cron.wake', payload: { text } }));
        }
      });
      return { result: JSON.stringify({ ok: true, mode: params.mode || 'now' }) };
    }
    default:
      throw new Error(`未知 cron action: ${action}`);
  }
}

// exec 命令执行完整版
function decodeGbk(buf) {
  if (!buf || buf.length === 0) return '';
  try {
    const iconv = require('iconv-lite');
    return iconv.decode(buf, 'gbk');
  } catch {
    return buf.toString('utf-8');
  }
}

function execTool(command, options = {}) {
  const { timeout = 60, cwd, env, pty, background, yieldMs = 3000 } = options;

  // 检查参数
  if (!command || typeof command !== 'string' || !command.trim()) {
    return Promise.resolve({ result: '错误：命令不能为空', error: true });
  }

  // 规范化命令：修复模型常见的转义问题
  let cmd = String(command || '').trim();
  cmd = cmd.replace(/^cmd\s+\/[cCdD]\s+/i, '');
  cmd = cmd.replace(/\\"/g, '"');
  cmd = cmd.replace(/\\\\([^\\])/g, '\\$1');
  cmd = cmd.replace(/\\\\$/, '\\');
  cmd = cmd.replace(/^([a-zA-Z][a-zA-Z0-9]*)(")/g, '$1 $2');
  cmd = cmd.replace(/\|([a-zA-Z][a-zA-Z0-9]*)(")/g, '|$1 $2');

  // 保命逻辑2补充：拦截删除命令，备份被删文件到 putongbeifen
  backupFilesIfDeleteCommand(cmd);
  
  const finalEnv = env ? { ...process.env, ...env } : process.env;
  const finalCwd = cwd || process.cwd();
  
  // PTY模式：使用windows-builtin-pty或node-pty（如果可用），否则降级到普通spawn
  if (pty) {
    try {
      const ptyLib = require('node-pty');
      return new Promise((resolve) => {
        const startTime = Date.now();
        const ptyProcess = ptyLib.spawn(cmd, [], {
          cwd: finalCwd,
          env: finalEnv,
          useConpty: true,
          cols: 120,
          rows: 30
        });
        let output = '';
        const timer = setTimeout(() => {
          ptyProcess.kill();
          resolve({
            result: `PTY命令超时 (${timeout}s)\n\n输出:\n${output.substring(0, 10000)}`,
            timedOut: true,
            duration: Date.now() - startTime
          });
        }, timeout * 1000);
        ptyProcess.onData((data) => { output += data; });
        ptyProcess.onExit(({ exitCode }) => {
          clearTimeout(timer);
          const result = output.trim() || '(no output)';
          resolve({
            result,
            exitCode,
            pty: true,
            duration: Date.now() - startTime
          });
        });
      });
    } catch (e) {
      // node-pty不可用，降级到普通spawn并标注
      console.log('[exec] node-pty不可用，降级到普通spawn:', e.message);
    }
  }
  
  // 后台模式：启动进程后等待yieldMs获取初始输出，然后返回
  if (background) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const child = spawn(cmd, [], {
        cwd: finalCwd,
        env: finalEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        detached: true,
        windowsHide: false
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => { stdout += decodeGbk(Buffer.isBuffer(data) ? data : Buffer.from(data)); });
      child.stderr.on('data', (data) => { stderr += decodeGbk(Buffer.isBuffer(data) ? data : Buffer.from(data)); });
      child.unref(); // 不等待子进程退出
      
      // 等待yieldMs获取初始输出
      setTimeout(() => {
        const out = (stdout || stderr || '').trim() || '(后台进程已启动，无初始输出)';
        resolve({
          result: out,
          background: true,
          pid: child.pid,
          duration: Date.now() - startTime
        });
      }, Math.min(yieldMs, 10000));
    });
  }

  // 标准模式
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn(cmd, [], {
      cwd: finalCwd,
      env: finalEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });
    
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    
    child.stdout.on('data', (data) => { stdout = Buffer.concat([stdout, data]); });
    child.stderr.on('data', (data) => { stderr = Buffer.concat([stderr, data]); });
    
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      const out = decodeGbk(stdout);
      resolve({
        result: `命令超时 (${timeout}s)\n\n输出:\n${out.substring(0, 10000)}`,
        timedOut: true,
        duration: Date.now() - startTime
      });
    }, timeout * 1000);
    
    child.on('close', (code) => {
      clearTimeout(timer);
      const out = decodeGbk(stdout);
      const err = decodeGbk(stderr);
      const aggregated = (out || err || '').trim();
      const result = aggregated || '(no output)';
      
      resolve({
        result: String(result).substring(0, 10000),
        exitCode: code,
        stderr: err.substring(0, 5000),
        duration: Date.now() - startTime
      });
    });
    
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ result: `执行错误: ${err.message}`, error: true });
    });
  });
}

// read 文件读取 - Core风格实现
function readTool(filePath, options = {}) {
  const { maxChars = 100000, offset = 0, limit } = options;
  
  try {
    const normalizedParams = normalizeToolParams({ path: filePath, maxChars, offset, ...options }) || { path: filePath, maxChars, offset };
    const record = normalizedParams;
    assertRequiredParams(record, CLAUDE_PARAM_GROUPS.read, 'read');
    
    const actualPath = record.path;
    if (!actualPath || typeof actualPath !== 'string' || !actualPath.trim()) {
      return { result: '错误：文件路径不能为空', error: true };
    }
    
    if (!fs.existsSync(actualPath)) {
      return { result: `文件不存在: ${actualPath}` };
    }
    
    const stats = fs.statSync(actualPath);
    if (stats.isDirectory()) {
      const files = fs.readdirSync(actualPath);
      return { 
        result: `目录: ${actualPath}\n\n` + files.slice(0, 100).join('\n'),
        isDirectory: true,
        files: files.slice(0, 100)
      };
    }
    
    const buffer = fs.readFileSync(actualPath);
    
    const isBinary = buffer.slice(0, 100).some(b => b === 0);
    if (isBinary) {
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      return { 
        result: `[二进制文件: ${actualPath}, 大小: ${sizeMB}MB]`,
        isBinary: true,
        size: buffer.length
      };
    }
    
    let content = buffer.toString('utf-8');
    const actualOffset = record.offset || offset || 0;
    const actualMaxChars = record.maxChars || maxChars || 100000;
    
    // 行数限制：如果指定了limit，按行截取
    if (limit && limit > 0) {
      const allLines = content.split('\n');
      const startLine = Math.floor(actualOffset / Math.max(content.length / allLines.length, 1));
      const selectedLines = allLines.slice(startLine, startLine + limit);
      content = selectedLines.join('\n');
    } else if (actualOffset > 0) {
      content = content.substring(actualOffset);
    }
    if (content.length > actualMaxChars) content = content.substring(0, actualMaxChars) + '\n... (内容已截断)';
    
    return { 
      result: content,
      size: buffer.length,
      truncated: buffer.length > actualMaxChars
    };
  } catch (e) {
    return { result: `读取失败: ${e.message}`, error: true };
  }
}

// write 文件写入 - Core风格实现
function writeTool(filePath, content, options = {}) {
  const { append = false } = options;
  
  try {
    const normalizedParams = normalizeToolParams({ path: filePath, content, append, ...options }) || { path: filePath, content, append };
    const record = normalizedParams;
    assertRequiredParams(record, CLAUDE_PARAM_GROUPS.write, 'write');
    
    const actualPath = record.path;
    if (!actualPath || typeof actualPath !== 'string' || !actualPath.trim()) {
      return { result: '错误：文件路径不能为空', error: true };
    }
    
    const actualContent = record.content !== undefined ? record.content : content;
    const actualAppend = record.append !== undefined ? record.append : append;
    
    const dir = path.dirname(actualPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 【关键修复】先备份再写入，这样如果写入导致崩溃，备份还是修改前的版本
    backupFileIfNeeded(actualPath);
    checkAndBackupIfCoreModified(actualPath);
    
    if (actualAppend && fs.existsSync(actualPath)) {
      fs.appendFileSync(actualPath, actualContent, 'utf-8');
    } else {
      fs.writeFileSync(actualPath, actualContent, 'utf-8');
    }
    
    return { result: `已${actualAppend ? '追加' : '写入'}: ${actualPath}`, success: true };
  } catch (e) {
    return { result: `写入失败: ${e.message}`, error: true };
  }
}

// edit 文件编辑 - Core风格实现
function editTool(filePath, oldText, newText) {
  try {
    const normalizedParams = normalizeToolParams({ path: filePath, oldText, newText }) || { path: filePath, oldText, newText };
    const record = normalizedParams;
    assertRequiredParams(record, CLAUDE_PARAM_GROUPS.edit, 'edit');
    
    const actualPath = record.path;
    if (!actualPath || typeof actualPath !== 'string' || !actualPath.trim()) {
      return { result: '错误：文件路径不能为空', error: true };
    }
    
    const actualOldText = record.oldText !== undefined ? record.oldText : oldText;
    const actualNewText = record.newText !== undefined ? record.newText : newText;
    
    if (!fs.existsSync(actualPath)) {
      return { result: `文件不存在: ${actualPath}` };
    }
    
    let content = fs.readFileSync(actualPath, 'utf-8');
    if (!content.includes(actualOldText)) {
      return { result: `未找到要替换的文本: ${actualOldText.substring(0, 100)}` };
    }
    
    // 先备份再修改
    backupFileIfNeeded(actualPath);
    checkAndBackupIfCoreModified(actualPath);
    
    content = content.replace(actualOldText, actualNewText);
    fs.writeFileSync(actualPath, content, 'utf-8');
    
    return { result: `已替换: ${actualPath}`, success: true };
  } catch (e) {
    return { result: `编辑失败: ${e.message}`, error: true };
  }
}

async function webFetchTool(fetchUrl, extractMode = 'markdown', maxChars = 50000) {
  try {
    let cleanUrl = String(fetchUrl).replace(/^[`'"\s]+|[`'"\s]+$/g, '').trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    console.log('[web_fetch] 请求 URL:', cleanUrl);

    const response = await axios.get(cleanUrl, {
      timeout: 15000,
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      maxRedirects: 5
    });

    const contentType = response.headers['content-type'] || '';
    let text = '';
    let title = '';

    if (contentType.includes('application/json')) {
      try { text = JSON.stringify(JSON.parse(response.data), null, 2); } catch { text = response.data; }
    } else if (contentType.includes('text/html') || contentType.includes('text/plain')) {
      // 优先用 Readability 提取正文
      try {
        const { JSDOM } = require('jsdom');
        const { Readability } = require('@mozilla/readability');
        const dom = new JSDOM(response.data, { url: cleanUrl });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (article && article.textContent && article.textContent.trim().length > 200) {
          title = article.title || '';
          text = extractMode === 'text'
            ? article.textContent.replace(/\s+/g, ' ').trim()
            : (title ? `# ${title}\n\n` : '') + article.textContent.replace(/\s+/g, ' ').trim();
        } else {
          // Readability 失败，降级到正则去标签
          text = extractHtmlText(response.data);
        }
      } catch (e) {
        text = extractHtmlText(response.data);
      }
    } else {
      text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    }

    if (text.length > maxChars) text = text.substring(0, maxChars) + '...[\u5df2\u622a\u65ad]';

    return {
      result: text,
      url: cleanUrl,
      finalUrl: response.request?.res?.responseUrl || cleanUrl,
      title,
      contentType,
      length: text.length,
      extractMode
    };
  } catch (e) {
    return { result: `web_fetch 错误: ${e.message}`, url: fetchUrl };
  }
}

function extractHtmlText(html) {
  if (!html || typeof html !== 'string') return '';
  
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  
  // HTML 实体转义
  const entities = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&apos;': "'", '&ndash;': '-', '&mdash;': '-', '&lsquo;': "'", '&rsquo;': "'",
    '&ldquo;': '"', '&rdquo;': '"', '&bull;': '-', '&hellip;': '...', '&copy;': '(c)',
    '&reg;': '(R)', '&trade;': '(TM)', '&deg;': 'deg', '&plusmn;': '+-', '&times;': 'x',
    '&divide;': '/', '&euro;': 'EUR', '&pound;': 'GBP', '&yen;': 'JPY', '&cent;': 'cent',
  };
  for (const [entity, char] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'gi'), char);
  }
  
  // 处理 Unicode 实体 &#xFFFF; 和 &#NNNN;
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch { return _; }
  });
  text = text.replace(/&#(\d+);/g, (_, dec) => {
    try { return String.fromCharCode(parseInt(dec, 10)); } catch { return _; }
  });
  
  return text.replace(/\s+/g, ' ').trim();
}

// 构建工具结果消息 - 统一3个入口(Cron/主聊天/飞书)的结果格式，防止模型无限重试
function buildToolResultMessage(call, toolResult) {
  const resultStr = typeof toolResult.result === 'string'
    ? toolResult.result
    : JSON.stringify(toolResult.result || toolResult);
  let content = resultStr.substring(0, 10000);
  
  // GUI命令检测（start/explorer等打开窗口的命令，Windows本身不输出文本）
  const command = call.params?.command || '';
  const isGuiCommand = /^\s*(explorer|start|mspaint|notepad|calc|write|cmd|powershell)\b/i.test(command);
  const noOutput = resultStr === '(no output)' || resultStr.trim() === '';
  
  if (typeof toolResult.exitCode === 'number') {
    if (toolResult.exitCode === 0) {
      if (noOutput && isGuiCommand) {
        // GUI命令成功但无输出：明确告诉模型成功，不需要重试
        content = `✅ 命令执行成功（GUI窗口命令，无控制台输出是正常的）\n命令: ${command}\nexit code: 0\n⚠️ 该命令已成功执行，请勿重复执行！`;
      } else {
        content += `\nexit code: 0 ✅成功`;
      }
    } else {
      if (isGuiCommand) {
        content = `💡 GUI命令已执行（exit code: ${toolResult.exitCode}，GUI命令的exit code不一定代表失败）\n命令: ${command}`;
      } else {
        content += `\nexit code: ${toolResult.exitCode} ⚠️可能出错`;
        if (toolResult.stderr) content += `\n错误输出: ${toolResult.stderr.substring(0, 2000)}`;
      }
    }
  } else if (toolResult.error) {
    content = `❌ 执行失败: ${resultStr}`;
  } else if (noOutput) {
    // 没有exitCode也没有输出（如background模式），给出明确反馈
    if (toolResult.background) {
      content = `🔄 后台进程已启动 (PID: ${toolResult.pid || '未知'})`;
    } else {
      content += `\n💡 命令无输出`;
    }
  }
  
  // 超时提示
  if (toolResult.timedOut) {
    content += `\n⏰ 命令超时，请勿重复执行相同命令！`;
  }
  
  return content;
}

// 执行工具调用 - Core风格实现
async function executeTool(name, params) {
  // 应用参数规范化
  const normalizedParams = normalizeToolParams(params) || params;
  
  switch (name) {
    case 'keyword':
      return keywordSearch(normalizedParams.keywords || normalizedParams.keyword || '');
    case 'neirong':
      return neirongSearch(normalizedParams.keyword || '');
    case 'send_file': {
      const sendPath = normalizedParams.path || normalizedParams.file_path || '';
      if (!sendPath) return { result: JSON.stringify({ error: '缺少文件路径' }) };
      // 验证文件存在
      if (!fs.existsSync(sendPath)) return { result: JSON.stringify({ error: `文件不存在: ${sendPath}` }) };
      // 加入待发送文件列表（飞书回复时自动发送）
      pendingFeishuFiles.push(sendPath);
      const ext = path.extname(sendPath).toLowerCase();
      const isImg = FEISHU_IMAGE_EXTS.has(ext);
      return { result: JSON.stringify({ ok: true, path: sendPath, type: isImg ? 'image' : 'file' }) };
    }
    case 'view_video': {
      const videoPath = normalizedParams.path || normalizedParams.file_path || '';
      if (!videoPath) return { result: JSON.stringify({ error: '缺少视频路径' }) };
      if (!fs.existsSync(videoPath)) return { result: JSON.stringify({ error: `文件不存在: ${videoPath}` }) };
      const vExt = path.extname(videoPath).toLowerCase();
      if (!['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.3gp'].includes(vExt)) {
        return { result: JSON.stringify({ error: `不支持的视频格式: ${vExt}` }) };
      }
      try {
        const videoBuffer = fs.readFileSync(videoPath);
        const base64 = videoBuffer.toString('base64');
        // 调用已有的 processVideoContent（提取帧+音频转录）
        const videoContent = await processVideoContent(base64, 'video/mp4');
        // 把多模态内容数组存到特殊字段，后续拼入模型输入
        return { result: JSON.stringify({ ok: true, path: videoPath, frames: videoContent.filter(c => c.type === 'image_url').length }), _videoContent: videoContent };
      } catch (e) {
        return { result: JSON.stringify({ error: `处理视频失败: ${e.message}` }) };
      }
    }
    case 'view_image': {
      const imgPath = normalizedParams.path || normalizedParams.file_path || '';
      if (!imgPath) return { result: JSON.stringify({ error: '缺少图片路径' }) };
      if (!fs.existsSync(imgPath)) return { result: JSON.stringify({ error: `文件不存在: ${imgPath}` }) };
      const iExt = path.extname(imgPath).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.gif', '.tiff', '.ico'].includes(iExt)) {
        return { result: JSON.stringify({ error: `不支持的图片格式: ${iExt}` }) };
      }
      try {
        const imgBuffer = fs.readFileSync(imgPath);
        const base64 = imgBuffer.toString('base64');
        const mimeType = iExt === '.jpg' || iExt === '.jpeg' ? 'image/jpeg'
          : iExt === '.png' ? 'image/png'
          : iExt === '.gif' ? 'image/gif'
          : iExt === '.bmp' ? 'image/bmp'
          : iExt === '.webp' ? 'image/webp'
          : iExt === '.tiff' ? 'image/tiff'
          : iExt === '.ico' ? 'image/x-icon'
          : 'image/png';
        const compressed = compressImageIfNeeded(base64, mimeType);
        const imageContent = [
          { type: 'text', text: `[图片: ${path.basename(imgPath)}]` },
          { type: 'image_url', image_url: { url: `data:${compressed.mimeType};base64,${compressed.base64}` } }
        ];
        return { result: JSON.stringify({ ok: true, path: imgPath }), _imageContent: imageContent };
      } catch (e) {
        return { result: JSON.stringify({ error: `读取图片失败: ${e.message}` }) };
      }
    }
    case 'browser':
      return await browserTool(normalizedParams.action || 'status', normalizedParams);
    case 'cron':
      return cronTool(normalizedParams.action || 'status', normalizedParams);
    case 'exec':
      return execTool(normalizedParams.command || '', { 
        timeout: normalizedParams.timeout, 
        cwd: normalizedParams.workdir || normalizedParams.cwd,
        env: normalizedParams.env,
        pty: normalizedParams.pty,
        background: normalizedParams.background,
        yieldMs: normalizedParams.yieldMs
      });
    case 'read':
      return readTool(normalizedParams.path || normalizedParams.file_path || '', { 
        maxChars: normalizedParams.maxChars, 
        offset: normalizedParams.offset,
        limit: normalizedParams.limit
      });
    case 'write':
      return writeTool(normalizedParams.path || normalizedParams.file_path || '', normalizedParams.content || '', { 
        append: normalizedParams.append 
      });
    case 'edit':
      return editTool(
        normalizedParams.path || normalizedParams.file_path || '', 
        normalizedParams.oldText || normalizedParams.old_string || '', 
        normalizedParams.newText || normalizedParams.new_string || ''
      );
    case 'web_fetch':
      return await webFetchTool(
        normalizedParams.url || normalizedParams.fetchUrl,
        normalizedParams.extractMode || 'markdown',
        normalizedParams.maxChars || 50000
      );
    default:
      return { result: `未知工具: ${name}` };
  }
}

// 工具调用解析：只解析明确的工具调用块，不解析普通文本
function parseToolCalls(text) {
  const calls = [];
  const seen = new Set();
  const TOOL_NAMES = ['exec', 'read', 'write', 'edit', 'browser', 'cron', 'keyword', 'neirong', 'web_fetch'];

  function addCall(name, params) {
    if (!TOOL_NAMES.includes(name)) return;
    const key = `${name}:${JSON.stringify(params)}`;
    if (!seen.has(key)) {
      seen.add(key);
      const normalizedParams = normalizeToolParams(params) || params;
      calls.push({ name, params: normalizedParams });
    }
  }

  // 【关键修复】先移除思考内容和普通文本，只保留工具调用块
  let cleanText = text
    // 移除 <think>...</think> 标签内容
    .replace(/<think[\s\S]*?<\/think>/gi, '')
    // 清理模型特殊标记
    .replace(/<\|tool_call\|>call:/g, '')
    .replace(/<tool_call\|>/g, '')
    .replace(/<\|tool_call\|>/g, '');

  // ===== 方式0：[TOOL_CALL] 块 =====
  // 支持多种内部格式：
  //   {tool => "browser", args => {--action "navigate" --targetUrl "xxx"}}
  //   {tool: "browser", args: {"action":"navigate"}}
  //   --tool browser --action navigate --targetUrl xxx

  // 辅助：解析 --key value 风格参数为对象
  function parseCLIArgs(s) {
    const result = {};
    // 匹配 --key "value" 或 --key value（value 到下一个 -- 或结尾）
    const re = /--([\w-]+)\s+(?:"([^"]*)"|'([^']*)'|(\S+))/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      // 将 kebab-case 转 camelCase
      const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      result[key] = m[2] ?? m[3] ?? m[4];
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  // 匹配 [TOOL_CALL] 块，内容到下一个 [TOOL_CALL] 或文本结尾
  const tcBlockRe = /\[TOOL_CALL\]([\s\S]*?)(?=\[TOOL_CALL\]|$)/gi;
  let tcm;
  while ((tcm = tcBlockRe.exec(cleanText)) !== null) {
    const block = tcm[1].trim();
    if (!block) continue;

    // 尝试从块中提取工具名
    let toolName = null;
    let toolParams = null;

    // 形式 A： {tool => "xxx", args => {...}} 或 {tool: "xxx", args: {...}}
    const braceM = block.match(/\{([\s\S]*)\}/);
    if (braceM) {
      const inner = braceM[1];
      const nameM = inner.match(/(?:"?(?:tool|name)"?)\s*(?:=>|:)\s*["']([\w_]+)["']/);
      if (nameM) toolName = nameM[1];

      // args 内容可能是 JSON 对象或 --flag 风格
      const argsM = inner.match(/(?:"?(?:args|params|parameters)"?)\s*(?:=>|:)\s*(\{([\s\S]*)\})/);
      if (argsM) {
        // 先尝试 JSON
        try { toolParams = JSON.parse(argsM[1]); } catch {}
        // 失败则尝试 --flag 解析
        if (!toolParams) toolParams = parseCLIArgs(argsM[2] || argsM[1]);
      }
      // 没有显式 args，把整个 inner 当 --flag 解析
      if (!toolParams) toolParams = parseCLIArgs(inner);
    }

    // 形式 B：纯 --flag 风格（无花括号）
    if (!toolName) {
      const cliArgs = parseCLIArgs(block);
      if (cliArgs) {
        toolName = cliArgs.tool || cliArgs.name;
        delete cliArgs.tool; delete cliArgs.name;
        toolParams = cliArgs;
      }
    }

    if (toolName && TOOL_NAMES.includes(toolName)) {
      addCall(toolName, toolParams || {});
    }
  }

  // ===== 方式1：```json 代码块 =====
  const codeBlockRe = /```(?:json|tool)?\s*([\s\S]*?)```/g;
  let cbm;
  while ((cbm = codeBlockRe.exec(cleanText)) !== null) {
    const raw = cbm[1].trim();
    // 可能是单个对象或数组
    const candidates = raw.startsWith('[') ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : [raw];
    for (const item of candidates) {
      try {
        const obj = typeof item === 'string' ? JSON.parse(item) : item;
        const name = obj.name || obj.tool;
        const params = obj.parameters || obj.params || obj.arguments || obj.args;
        if (name && params) addCall(name, params);
      } catch {}
    }
  }

  // ===== 方式2：裸 JSON 对象（含嵌套） =====
  // 【关键修复】只在没有找到工具调用时才解析裸JSON，避免重复
  if (calls.length === 0) {
    function extractJsonObjects(s) {
      const results = [];
      let depth = 0, start = -1;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '{') { if (depth === 0) start = i; depth++; }
        else if (s[i] === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            results.push(s.slice(start, i + 1));
            start = -1;
          }
        }
      }
      return results;
    }
    for (const jsonStr of extractJsonObjects(cleanText)) {
    try {
      // 【关键修复】处理 Windows 路径反斜杠转义问题
      let fixedJson = jsonStr
        // 1. 先修复路径中的反斜杠：C:\Users -> C:\\Users
        .replace(/([A-Za-z]):\\([^\\"\s}])/g, '$1:\\\\$2')
        // 2. 修复路径中间的反斜杠：\Desktop\ -> \\Desktop\\
        .replace(/\\([A-Za-z][^\\"\s}]*)\\/g, '\\\\$1\\\\')
        // 3. 修复路径末尾的反斜杠（在引号前）：\wangqian" -> \\wangqian"
        .replace(/\\([A-Za-z][^\\"\s}]*)("|')/g, '\\\\$1$2')
        // 4. 修复 %USERPROFILE% 等环境变量中的反斜杠
        .replace(/%([A-Z_]+)%\\([A-Za-z])/g, '%$1%\\\\$2');
      
      const obj = JSON.parse(fixedJson);
      const name = obj.name || obj.tool;
      const params = obj.parameters || obj.params || obj.arguments || obj.args;
      if (name && params && typeof params === 'object') addCall(name, params);
    } catch (e) {
      console.log('[parseToolCalls 方式2] JSON解析失败:', e.message, '原始:', jsonStr.substring(0, 100));
    }
    }
  }

  // ===== 方式3：toolName({...}) 格式 ===== 
  // 本地模型（如llama.cpp）经常输出 read({"path":"xxx"}) 或 exec({"command":"xxx"}) 这种格式
  if (calls.length === 0) {
    const funcCallRe = /\b(exec|read|write|edit|browser|cron|keyword|neirong|web_fetch)\s*\(\s*(\{[\s\S]*?\})\s*\)/gi;
    let fm;
    while ((fm = funcCallRe.exec(cleanText)) !== null) {
      try {
        const name = fm[1].toLowerCase();
        let jsonStr = fm[2]
          .replace(/([A-Za-z]):\\([^\\"\s}])/g, '$1:\\\\$2')
          .replace(/\\([A-Za-z][^\\"\s}]*)\\/g, '\\\\$1\\\\')
          .replace(/\\([A-Za-z][^\\"\s}]*)("|')/g, '\\\\$1$2');
        const params = JSON.parse(jsonStr);
        addCall(name, params);
      } catch (e) {
        console.log('[parseToolCalls 方式3] 解析失败:', e.message, '原始:', fm[2]?.substring(0, 100));
      }
    }
  }

  // ===== 方式4：write 大块内容特殊处理 =====
  // 【关键修复】只在没有找到write调用时才特殊处理
  if (calls.length === 0 || !calls.some(c => c.name === 'write')) {
    const writeRe = /write\s*[({]\s*"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*("(?:[^"\\]|\\.)*"|`[\s\S]*?`)/gi;
    let wm;
    while ((wm = writeRe.exec(cleanText)) !== null) {
      let content = wm[2].slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      addCall('write', { path: wm[1], content });
    }
  }

  return calls;
}

// ========== 飞书消息去重 ==========
const DEDUP_TTL_MS = 20 * 60 * 1000; // 20分钟
const DEDUP_MAX_SIZE = 5000;
const processedMessages = new Map(); // key -> timestamp

function buildDedupeKey(provider, accountId, chatId, messageId) {
  if (!provider || !messageId) return null;
  if (!chatId) return null;
  return `${provider}|${accountId || ''}|${chatId}|${messageId}`;
}

function tryRecordMessage(provider, accountId, chatId, messageId) {
  if (!messageId) return true;
  
  const key = buildDedupeKey(provider, accountId, chatId, messageId);
  if (!key) return true;
  
  const now = Date.now();

  // 清理过期条目
  for (const [k, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL_MS) processedMessages.delete(k);
  }

  // 缓存满时删除最旧的
  if (processedMessages.size >= DEDUP_MAX_SIZE) {
    const first = processedMessages.keys().next().value;
    if (first) processedMessages.delete(first);
  }

  if (processedMessages.has(key)) {
    // console.log('[Feishu] 跳过重复消息:', messageId); // 调试用，屏蔽以减少日志
    return false;
  }

  processedMessages.set(key, now);
  return true;
}

// 最近活跃的飞书 chat_id（供 cron 默认投递使用）
let lastFeishuChatId = null;
// 最近活跃的飞书用户 open_id（供 cron 单聊投递使用）
let lastFeishuOpenId = null;

// 飞书状态文件（持久化 open_id 和 chat_id）
const FEISHU_STATE_FILE = path.join(os.homedir(), '.xiaoduan', 'feishu-state.json');

function loadFeishuState() {
  try {
    if (fs.existsSync(FEISHU_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(FEISHU_STATE_FILE, 'utf-8'));
      if (state.lastFeishuChatId) lastFeishuChatId = state.lastFeishuChatId;
      if (state.lastFeishuOpenId) lastFeishuOpenId = state.lastFeishuOpenId;
      console.log('[Feishu] 已加载飞书状态:', { lastFeishuChatId, lastFeishuOpenId });
    }
  } catch (e) {
    console.error('[Feishu] 加载飞书状态失败:', e.message);
  }
}

function saveFeishuState() {
  try {
    const state = {
      lastFeishuChatId,
      lastFeishuOpenId,
      updatedAt: new Date().toISOString()
    };
    const dir = path.dirname(FEISHU_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FEISHU_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Feishu] 保存飞书状态失败:', e.message);
  }
}

// 启动时加载飞书状态
loadFeishuState();

function loadConfig() {
  const configPath = path.join(os.homedir(), '.xiaoduan', 'xiaoduan.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.error('[LocalGateway] 读取配置失败:', e.message);
    }
  }
  return null;
}

function getModelConfig(modelKey) {
  const config = loadConfig();
  if (!config || !modelKey) return null;
  
  const [providerName, modelId] = modelKey.split('/');
  const provider = config.models?.providers?.[providerName];
  
  if (provider) {
    return {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelId: modelId
    };
  }
  
  return null;
}

function getDefaultModel() {
  const config = loadConfig();
  return config?.agents?.defaults?.model?.primary || 'custom/gemma4:26b';
}

// 文件路径
const TOOL_SUMMARY_FILE = path.join(STATE_DIR, 'agents', 'main', '工具总结.txt');
const MEMORY_DIR = path.join(STATE_DIR, 'agents', 'main', '记忆');
const NEIRONG_CONTENT_FILE = path.join(STATE_DIR, 'agents', 'main', '内容.txt');

// ========== 停止机制 ==========
// 跟踪是否需要停止所有任务
let shouldStopAll = false;
let stopTimestamp = 0;  // STOP时的时间戳，不重置
// 记录最后一次大模型成功回复的时间（用于核心备份存活检测）
// 检测大模型回复而非用户消息：若小端改坏自己，用户消息仍能到达但大模型无法回复
let lastModelMsgTime = Date.now();
// 跟踪正在运行的任务（按 sessionKey）
const runningTasks = new Map(); // sessionKey -> { abortController, cancelToken }

// 检测是否是停止命令
function isStopCommand(text) {
  if (!text) return false;
  const cleanText = text.trim();
  return cleanText.length < 10 && cleanText.includes('停止任务');
}

// 文件大小管理：超限后删除旧的、保留新的（增量方式）
const MAX_NEIRONG_BYTES = 10 * 1024 * 1024;      // 内容.txt 10MB
const MAX_TOOL_SUMMARY_BYTES = 1 * 1024 * 1024;  // 工具总结.txt 1MB
// 记忆.txt 永久保存，不裁剪
const KEEP_RATIO = 0.5;                           // 超限后保留后50%

function rotateFileIfNeeded(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size <= maxBytes) return;
    // 用 Buffer 操作，避免字节/字符混用导致 UTF-8 中文乱码
    const buf = fs.readFileSync(filePath);
    const keepFromByte = Math.floor(buf.length * (1 - KEEP_RATIO));
    // 从 keepFromByte 往后找第一个换行符，确保从完整行开始
    let cutByte = keepFromByte;
    while (cutByte < buf.length && buf[cutByte] !== 0x0a) cutByte++;
    cutByte++; // 跳过换行符本身
    fs.writeFileSync(filePath, buf.slice(cutByte));
    console.log(`[轮转] ${path.basename(filePath)}: ${(stat.size/1024/1024).toFixed(1)}MB -> 保留后50%`);
  } catch (e) {}
}

// 统一保存函数：保存记忆、工具总结、内容
function stripThinking(text) {
  return text.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
}

function saveAssistantToMemory(finalResponse) {
  if (!finalResponse) return;
  const MEMORY_FILE = path.join(MEMORY_DIR, '记忆.txt');
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const entry = `[${timestamp}] 助手: ${finalResponse}\n`;
  try {
    const memDir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(memDir)) {
      fs.mkdirSync(memDir, { recursive: true });
    }
    fs.appendFileSync(MEMORY_FILE, Buffer.from(entry, 'utf-8'));
  } catch (e) {}
}

// 保存大模型每轮的文字回复到工具总结.txt
function saveAssistantResponseToSummary(text) {
  if (!text || !text.trim()) return;
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  // 工具总结如实记录大模型返回的所有内容，不过滤思考内容（前端聊天框屏蔽是前端的事）
  const cleanText = filterToolBlocks(text).trim();
  if (!cleanText) return;
  const entry = `[${timestamp}] ${cleanText}\n`;
  try { fs.appendFileSync(TOOL_SUMMARY_FILE, entry, 'utf-8'); } catch (e) {}
  rotateFileIfNeeded(TOOL_SUMMARY_FILE, MAX_TOOL_SUMMARY_BYTES);
}

// 保存工具调用到工具总结.txt（立刻写入：工具名+参数，结果由内容.txt负责）
function saveToolCalls(toolCalls = []) {
  if (!toolCalls || toolCalls.length === 0) return;
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  for (const call of toolCalls) {
    // 工具总结.txt：只记录调用了什么工具+参数（结果由内容.txt负责，模型通过messages的role:'tool'已看到）
    const toolEntry = `[${timestamp}] ${call.name}(${JSON.stringify(call.params)})\n`;
    try { fs.appendFileSync(TOOL_SUMMARY_FILE, toolEntry, 'utf-8'); } catch (e) {}
  }
  rotateFileIfNeeded(TOOL_SUMMARY_FILE, MAX_TOOL_SUMMARY_BYTES);
}

// 延迟保存工具结果到内容.txt（在下一轮模型获取上下文之后再写入，避免上下文中重复看到）
function saveToolResultsToNeirong(toolCalls = []) {
  if (!toolCalls || toolCalls.length === 0) return;
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  for (const call of toolCalls) {
    if (call.result) {
      // 使用 buildToolResultMessage 生成友好结果，让模型在内容.txt中也能看到明确的成功/失败
      const friendlyContent = buildToolResultMessage(call, call.result);
      const contentEntry = `[${timestamp}] ${call.name} => ${friendlyContent}\n`;
      try { fs.appendFileSync(NEIRONG_CONTENT_FILE, contentEntry, 'utf-8'); } catch (e) {}
    }
  }
  rotateFileIfNeeded(NEIRONG_CONTENT_FILE, MAX_NEIRONG_BYTES);
}

// 停止标志重置定时器（防重入）
let stopResetTimer = null;

// 执行停止所有任务
function stopAllTasks() {
  console.log('[LocalGateway] 收到停止命令，停止所有任务');
  
  // 设置全局停止标志
  shouldStopAll = true;
  stopTimestamp = Date.now();  // 记录STOP时的时间戳
  
  // 取消所有正在运行的任务
  for (const [sessionKey, task] of runningTasks.entries()) {
    if (task.abortController) {
      try {
        task.abortController.abort();
        console.log('[LocalGateway] 已取消任务:', sessionKey);
      } catch (e) {
        console.error('[LocalGateway] 取消任务失败:', sessionKey, e.message);
      }
    }
  }
  
  // 清空 runningTasks
  runningTasks.clear();
  
  // 防重入：先清除旧的重置定时器，避免多个定时器同时触发
  if (stopResetTimer) clearTimeout(stopResetTimer);
  
  // 1秒后重置停止标志，给所有循环足够时间退出
  stopResetTimer = setTimeout(() => {
    shouldStopAll = false;
    stopResetTimer = null;
    console.log('[LocalGateway] 停止标志已重置，可以接受新任务');
  }, 1000);
}

// ========== 核心配置备份与自动恢复 ==========
const HEXIN_BACKUP_DIR = path.join(os.homedir(), '.xiaoduan', 'hexinbeifen');
const CORE_CONFIG_FILE = path.join(os.homedir(), '.xiaoduan', 'xiaoduan.json');
const MEMORY_FILE_PATH = path.join(MEMORY_DIR, '记忆.txt');

// 核心文件范围：安装目录核心代码 + .xiaoduan 目录核心配置
function isCoreFile(filePath) {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  // .xiaoduan 核心配置
  if (normalized.includes('xiaoduan.json')) return true;
  // 安装目录核心代码
  const appDir = __dirname.replace(/\\/g, '/').toLowerCase();
  if (normalized.startsWith(appDir)) {
    // 安装目录下的核心文件：.js / .json / .html / .py
    if (/\.(js|json|html|py)$/i.test(normalized)) return true;
  }
  return false;
}

function ensureHexinBackupDir() {
  if (!fs.existsSync(HEXIN_BACKUP_DIR)) fs.mkdirSync(HEXIN_BACKUP_DIR, { recursive: true });
}

// 备份核心文件
function backupCoreFile(filePath, reason = '') {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    ensureHexinBackupDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const backupPath = path.join(HEXIN_BACKUP_DIR, `${base}_${ts}${ext}`);
    fs.copyFileSync(filePath, backupPath);
    console.log(`[核心备份] 已备份: ${backupPath}${reason ? ' 原因:' + reason : ''}`);
    return { backupPath, originalPath: filePath };
  } catch (e) {
    console.error('[核心备份] 失败:', e.message);
    return null;
  }
}

// 在 hexinbeifen 创建 PY 恢复脚本
function createRecoveryScript(backupInfo) {
  try {
    ensureHexinBackupDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const scriptPath = path.join(HEXIN_BACKUP_DIR, `recovery_${ts}.py`);
    const script = `# 小端自动恢复脚本 - ${new Date().toLocaleString('zh-CN')}
# 如果5分钟内小端没有新的工具总结/记忆/内容更新，说明小端改死了自己
# 此脚本用于手动恢复核心文件
import shutil
import os

backup_path = r'${backupInfo.backupPath.replace(/\\/g, '\\\\')}'
original_path = r'${backupInfo.originalPath.replace(/\\/g, '\\\\')}'

if os.path.exists(backup_path):
    shutil.copy2(backup_path, original_path)
    print(f'已恢复: {original_path}')
else:
    print(f'备份不存在: {backup_path}')
`;
    fs.writeFileSync(scriptPath, script, 'utf-8');
    console.log(`[核心备份] 已创建恢复脚本: ${scriptPath}`);
  } catch (e) {}
}

// 检测核心文件是否被修改（write/edit 工具写入核心文件时触发）
function checkAndBackupIfCoreModified(filePath) {
  if (!isCoreFile(filePath)) return;

  const backupInfo = backupCoreFile(filePath, '大模型修改了核心文件');
  if (!backupInfo) return;

  // 创建恢复脚本
  createRecoveryScript(backupInfo);

  // 创建核心备份标记文件（供 PY 脚本检测）
  const CORE_BACKUP_FLAG = path.join(HEXIN_BACKUP_DIR, '.core_backup_flag');
  const flagData = {
    backupTime: Date.now(),
    backupPath: backupInfo.backupPath,
    originalPath: backupInfo.originalPath
  };
  try {
    fs.writeFileSync(CORE_BACKUP_FLAG, JSON.stringify(flagData, null, 2), 'utf-8');
  } catch (e) {}

  // 记录备份时间点，5分钟后检测
  const backupTime = Date.now();
  // 记录3个文件的大小（PY脚本双保险检测用：比较大小变化而非mtime，避免误判）
  let memSize = -1, toolSize = -1, neirongSize = -1;
  try { if (fs.existsSync(MEMORY_FILE_PATH)) memSize = fs.statSync(MEMORY_FILE_PATH).size; } catch (e) {}
  try { if (fs.existsSync(TOOL_SUMMARY_FILE)) toolSize = fs.statSync(TOOL_SUMMARY_FILE).size; } catch (e) {}
  try { if (fs.existsSync(NEIRONG_CONTENT_FILE)) neirongSize = fs.statSync(NEIRONG_CONTENT_FILE).size; } catch (e) {}

  // 更新标记文件（加入文件大小信息，供PY脚本检测）
  try {
    const flagDataWithSize = {
      backupTime: Date.now(),
      backupPath: backupInfo.backupPath,
      originalPath: backupInfo.originalPath,
      memSize, toolSize, neirongSize
    };
    fs.writeFileSync(CORE_BACKUP_FLAG, JSON.stringify(flagDataWithSize, null, 2), 'utf-8');
  } catch (e) {}

  console.log(`[核心备份] 5分钟后检测小端是否存活，备份时间:${new Date(backupTime).toLocaleString()} — 若5分钟内无新对话活动将自动恢复核心文件并重启，请勿手动关闭小端`);

  setTimeout(() => {
    try {
      // 【关键修复】存活检测：不再看文件mtime（小端改坏自己时mtime也会变，导致误判存活）
      // 也不再只看用户消息（用户发消息但大模型已死，说明小端已坏）
      // 改为检测"5分钟内大模型是否有成功回复"（即 lastModelMsgTime 是否晚于备份时间）
      const hasNewActivity = lastModelMsgTime > backupTime;

      console.log(`[核心备份] 5分钟后检测，最后模型回复时间:${new Date(lastModelMsgTime).toLocaleString()} 备份时间:${new Date(backupTime).toLocaleString()} ${hasNewActivity?'✅模型正常回复→小端正常':'❌模型无回复→可能已改死自己'}`);

      if (!hasNewActivity) {
        // 5分钟内大模型无成功回复，说明小端改坏了自己后无法正常服务，强制恢复
        console.log('[核心备份] ⚠️ 5分钟内大模型无成功回复，判定小端改死了自己，强制恢复核心文件并重启！');
        try {
          fs.copyFileSync(backupInfo.backupPath, backupInfo.originalPath);
          console.log('[核心备份] ✅ 已恢复核心文件');
        } catch (e) {
          console.error('[核心备份] 恢复失败:', e.message);
        }
        // 强制重启：通知所有客户端，然后退出进程（main.js 会自动重启）
        if (wss && wss.clients) {
          wss.clients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'event',
                event: 'core.restart',
                payload: { reason: '核心文件恢复，自动重启' }
              }));
            }
          });
        }
        setTimeout(() => process.exit(1), 500);
      } else {
        // 有新活动，小端正常，删除备份和恢复脚本和标记文件
        try { fs.unlinkSync(backupInfo.backupPath); } catch (e) {}
        try { fs.unlinkSync(CORE_BACKUP_FLAG); } catch (e) {}
        console.log('[核心备份] ✅ 小端正常，已删除备份和标记');
      }
    } catch (e) {
      console.error('[核心备份] 检测失败:', e.message);
    }
  }, 5 * 60 * 1000); // 5分钟
}

// 普通备份：小端删除或修改文件时自动备份到 putongbeifen
const PUTONG_BACKUP_DIR = path.join(os.homedir(), '.xiaoduan', 'putongbeifen');

function backupFileIfNeeded(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return;
    // 跳过内容文件和记忆文件（只备份代码/配置类文件）
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (normalized.includes('内容.txt') || normalized.includes('记忆.txt') || normalized.includes('工具总结.txt')) return;
    if (!fs.existsSync(PUTONG_BACKUP_DIR)) fs.mkdirSync(PUTONG_BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const backupPath = path.join(PUTONG_BACKUP_DIR, `${base}_${ts}${ext}`);
    fs.copyFileSync(filePath, backupPath);
    console.log(`[普通备份] ${backupPath}`);
  } catch (e) {}
}

// 保命逻辑2补充：exec工具中的删除命令拦截，先备份再删除
function backupFilesIfDeleteCommand(cmd) {
  try {
    // 检测 del / erase / rm / Remove-Item 等删除命令
    // 支持带引号和不带引号的路径，支持Windows反斜杠路径
    const delPatterns = [
      /(?:del|erase)\s+["']?([^\s"']+)["']?/gi,
      /rm\s+(?:-[rfS]+\s+)*["']?([^\s"']+)["']?/gi,
      /Remove-Item\s+(?:-[A-Za-z]+\s+)*["']?([^\s"']+)["']?/gi,
    ];
    for (const pattern of delPatterns) {
      let match;
      while ((match = pattern.exec(cmd)) !== null) {
        const targetPath = match[1];
        // 尝试解析为绝对路径
        let absPath = targetPath;
        if (!path.isAbsolute(absPath)) {
          absPath = path.resolve(process.cwd(), absPath);
        }
        if (fs.existsSync(absPath)) {
          backupFileIfNeeded(absPath);
          console.log(`[删除拦截] 已备份待删文件: ${absPath}`);
        }
      }
    }
  } catch (e) {}
}

// 确保目录存在
function ensureDirs() {
  const dirs = [
    path.join(STATE_DIR, 'agents', 'main'),
    MEMORY_DIR,
    path.join(STATE_DIR, 'work'),           // 工作目录
    path.join(STATE_DIR, 'putongbeifen'),    // 普通备份
    path.join(STATE_DIR, 'hexinbeifen'),     // 核心备份
    path.join(STATE_DIR, 'jineng'),          // 技能库
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  // 确保文件存在（touch 风格）
  if (!fs.existsSync(TOOL_SUMMARY_FILE)) {
    fs.writeFileSync(TOOL_SUMMARY_FILE, '', 'utf-8');
  }
  if (!fs.existsSync(NEIRONG_CONTENT_FILE)) {
    fs.writeFileSync(NEIRONG_CONTENT_FILE, '', 'utf-8');
  }

  // ===== 修复：启动时加载并调度已有 cron 任务 =====
  loadCronJobs();
  const now = Date.now();
  let hasEnabledJobs = false;
  for (const [id, job] of cronJobs) {
    if (!job.state) job.state = {};
    if (job.enabled) {
      hasEnabledJobs = true;
      // 重新计算 nextRunAtMs（防止重启后时间漂移）
      job.state.nextRunAtMs = computeNextRunAtMs(job.schedule, now);
      console.log(`[Cron] 已恢复任务: ${job.name || id}, next: ${job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : 'none'}`);
    }
  }
  if (hasEnabledJobs) {
    saveCronJobs();
    startCronTicker();
    console.log('[Cron] 全局轮询定时器已启动');
  }
}

// 普通模式配置
const MAX_MEMORY_CHARS = 3000;
const MAX_NEIRONG_CONTENT_CHARS = 2000;
const MAX_TOOL_SUMMARY_CHARS = 2000;
const MAX_TOOL_SUMMARY_CHARS_COMPLEX = 5000;
const MAX_MEMORY_CHARS_COMPLEX = 40000;
const MAX_NEIRONG_CONTENT_CHARS_COMPLEX = 20000;

function getSystemPrompt(complexTaskEnabled = false) {
  // 1. 读取 xiaoduan.txt 作为基础（优先应用程序目录）
  const appPromptPath = path.join(__dirname, 'xiaoduan.txt');
  const userPromptPath = path.join(STATE_DIR, 'xiaoduan.txt');
  const promptPath = fs.existsSync(appPromptPath) ? appPromptPath : userPromptPath;

  let baseContent = '你是小端AI，一个智能助手。简洁回复，禁止猜测。';
  if (fs.existsSync(promptPath)) {
    try {
      baseContent = fs.readFileSync(promptPath, 'utf-8').trim();
    } catch (e) {}
  }

  // 【修复】确保 userHome 末尾有反斜杠
  const userHomeRaw = os.homedir();
  const userHome = userHomeRaw.endsWith('\\') ? userHomeRaw : userHomeRaw + '\\';
  const systemPaths = [
    `- 用户主目录：${userHomeRaw}`,
    `- 工作目录：${userHome}.xiaoduan\\work`,
    `- 配置目录：${userHome}.xiaoduan`,
    `- 桌面：${userHome}Desktop`,
    `- 技能库：${userHome}.xiaoduan\\jineng`,
  ].join('\n');

  // system prompt 只放固定内容，不塞动态内容（KV cache 优化）
  let result = baseContent
    .replace(/\{\{SYSTEM_PATHS\}\}/g, systemPaths)
    .replace(/\{\{USER_HOME\}\}/g, userHome);

  return result;
}

// 获取动态上下文（记忆/工具总结/neirong），拼到 user message 里，不经过 system prompt
function getContextPayload(complexTaskEnabled = false) {
  const parts = [];

  // 记忆
  const maxMemory = complexTaskEnabled ? MAX_MEMORY_CHARS_COMPLEX : MAX_MEMORY_CHARS;
  let memoryContent = '';
  try {
    const memoryFile = path.join(MEMORY_DIR, '记忆.txt');
    if (fs.existsSync(memoryFile)) {
      const raw = fs.readFileSync(memoryFile, 'utf-8').trim();
      if (raw) memoryContent = raw.length > maxMemory ? raw.slice(-maxMemory) : raw;
    }
  } catch (e) {}
  if (memoryContent) parts.push(`## 对话记忆\n${memoryContent}`);

  // 内容记录（普通模式2000字符，复杂模式20000字符）
  {
    const maxNeirong = complexTaskEnabled ? MAX_NEIRONG_CONTENT_CHARS_COMPLEX : MAX_NEIRONG_CONTENT_CHARS;
    let neirongContent = '';
    try {
      if (fs.existsSync(NEIRONG_CONTENT_FILE)) {
        const raw = fs.readFileSync(NEIRONG_CONTENT_FILE, 'utf-8').trim();
        if (raw) {
          neirongContent = raw.length > maxNeirong ? raw.slice(-maxNeirong) : raw;
        }
      }
    } catch (e) {}
    if (neirongContent) parts.push(`## 工具获取的内容记录\n${neirongContent}`);
  }

  // 工具总结
  const maxToolSummary = complexTaskEnabled ? MAX_TOOL_SUMMARY_CHARS_COMPLEX : MAX_TOOL_SUMMARY_CHARS;
  let toolSummaryContent = '';
  if (fs.existsSync(TOOL_SUMMARY_FILE)) {
    try {
      const raw = fs.readFileSync(TOOL_SUMMARY_FILE, 'utf-8').trim();
      if (raw) toolSummaryContent = raw.length > maxToolSummary ? raw.slice(-maxToolSummary) : raw;
    } catch (e) {}
  }
  if (toolSummaryContent) parts.push(`## 工具调用记录\n${toolSummaryContent}`);

  return parts.length > 0 ? parts.join('\n\n') : '';
}

// 【Core方式工具定义】传给API让模型返回结构化tool_calls（1:1还原Core版schema）
const CORE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'exec',
      description: '执行Windows系统命令(CMD语法)。支持PTY交互模式、后台运行、实时输出流。命令名和路径之间必须有空格。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令(CMD语法)' },
          timeout: { type: 'number', description: '超时秒数，默认60' },
          workdir: { type: 'string', description: '工作目录(cwd)' },
          env: { type: 'object', description: '环境变量键值对', additionalProperties: { type: 'string' } },
          pty: { type: 'boolean', description: '是否使用PTY交互模式(适合需要实时交互的命令如python repl)' },
          background: { type: 'boolean', description: '是否后台运行(立即返回，不等待完成)' },
          yieldMs: { type: 'number', description: '后台模式下等待初始输出的毫秒数，默认3000' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description: '读取文件内容或列出目录。支持行号偏移和行数限制、最大字符数限制。自动检测二进制文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件或目录路径(也接受file_path)' },
          offset: { type: 'number', description: '字符偏移量(从0开始)，用于读取大文件的后半部分' },
          limit: { type: 'number', description: '读取的行数限制(从offset开始)' },
          maxChars: { type: 'number', description: '最大返回字符数，默认100000' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: '写入文件内容(自动创建目录)。支持覆盖和追加模式。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径(也接受file_path)' },
          content: { type: 'string', description: '写入内容' },
          append: { type: 'boolean', description: '是否追加模式(默认false=覆盖)' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: '替换文件中的文本片段(也接受Claude Code参数名file_path/old_string/new_string)。精确匹配oldText，替换为newText。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径(也接受file_path)' },
          oldText: { type: 'string', description: '要查找的旧文本(也接受old_string)' },
          newText: { type: 'string', description: '替换的新文本(也接受new_string)' }
        },
        required: ['path', 'oldText', 'newText']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: '获取网页文本内容。先用Readability提取正文，失败则降级正则去标签。支持提取模式和最大字符限制。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '网页URL(也接受fetchUrl)' },
          extractMode: { type: 'string', enum: ['markdown', 'text'], description: '提取模式：markdown(带标题格式)或text(纯文本)，默认markdown' },
          maxChars: { type: 'number', description: '最大返回字符数，默认50000' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browser',
      description: '浏览器控制(Playwright/Chromium)。支持16种操作：start启动浏览器、stop关闭、open新标签打开URL、navigate当前页导航、snapshot获取页面快照+可交互元素ref列表、screenshot截图、tabs标签列表、act交互操作(click/type/press/hover/scroll/wait/select/evaluate/close)、evaluate执行JS、focus切换标签、close_tab关闭标签、console获取控制台消息、pdf导出PDF、upload上传文件、dialog处理对话框。act操作中的ref对应snapshot返回的e1,e2...编号。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'stop', 'open', 'navigate', 'snapshot', 'screenshot', 'tabs', 'act', 'evaluate', 'status', 'focus', 'close_tab', 'console', 'pdf', 'upload', 'dialog'],
            description: '操作类型'
          },
          targetUrl: { type: 'string', description: '目标URL(open/navigate用)' },
          request: {
            type: 'object',
            description: 'act操作的请求对象',
            properties: {
              kind: { type: 'string', enum: ['click', 'type', 'press', 'hover', 'scroll', 'wait', 'select', 'evaluate', 'close'], description: '交互类型' },
              ref: { type: 'string', description: '元素引用(snapshot返回的e1,e2...或CSS selector)' },
              element: { type: 'string', description: 'CSS selector备选(当ref不适用时)' },
              text: { type: 'string', description: 'type操作输入的文本' },
              key: { type: 'string', description: 'press操作的按键(如Enter,Tab,Escape)' },
              button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'click操作的鼠标键，默认left' },
              doubleClick: { type: 'boolean', description: 'click操作是否双击' },
              values: { type: 'array', items: { type: 'string' }, description: 'select操作的选项值数组' },
              submit: { type: 'boolean', description: 'type后是否按Enter提交' },
              x: { type: 'number', description: 'scroll水平偏移' },
              y: { type: 'number', description: 'scroll垂直偏移，默认500' },
              timeMs: { type: 'number', description: 'wait操作等待毫秒数' },
              selector: { type: 'string', description: 'wait操作等待的CSS选择器' },
              fn: { type: 'string', description: 'evaluate操作执行的JS函数字符串' },
              expression: { type: 'string', description: 'evaluate操作的JS表达式' },
              timeoutMs: { type: 'number', description: '操作超时毫秒数，默认10000' }
            }
          },
          expression: { type: 'string', description: 'JS表达式(evaluate动作用)' },
          index: { type: 'number', description: '标签索引(focus/close_tab用)，默认0' },
          maxChars: { type: 'number', description: 'snapshot最大返回字符数，默认20000' },
          fullPage: { type: 'boolean', description: 'screenshot是否全页截图' },
          type: { type: 'string', enum: ['png', 'jpeg'], description: 'screenshot图片格式，默认png' },
          filePath: { type: 'string', description: 'upload操作的文件路径' },
          dialogAction: { type: 'string', enum: ['accept', 'dismiss'], description: 'dialog操作：accept确认或dismiss取消' },
          dialogText: { type: 'string', description: 'dialog操作输入的文本(prompt用)' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cron',
      description: '定时任务管理。支持8种操作：status状态、list列表、add添加、update更新、remove删除、run手动触发、runs查看执行记录、wake唤醒通知。任务支持3种调度：at(单次定时)、cron(cron表达式)、every(固定间隔)。',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['status', 'list', 'add', 'update', 'remove', 'run', 'runs', 'wake'],
            description: '操作类型'
          },
          job: {
            type: 'object',
            description: '任务定义(add用)',
            properties: {
              name: { type: 'string', description: '任务名称' },
              schedule: {
                type: 'object',
                description: '调度定义',
                properties: {
                  kind: { type: 'string', enum: ['at', 'cron', 'every'], description: '调度类型：at单次/cron表达式/every间隔' },
                  atMs: { type: 'number', description: 'at类型的执行时间戳(毫秒)' },
                  expr: { type: 'string', description: 'cron表达式(如"0 9 * * *")' },
                  tz: { type: 'string', description: '时区(如Asia/Shanghai)' },
                  intervalMs: { type: 'number', description: 'every类型的间隔毫秒数' }
                }
              },
              payload: {
                type: 'object',
                description: '任务内容',
                properties: {
                  kind: { type: 'string', description: '固定填"agentTurn"' },
                  message: { type: 'string', description: '执行时发送给AI的消息' }
                }
              },
              deleteAfterRun: { type: 'boolean', description: '执行后自动删除(单次任务默认true)' },
              enabled: { type: 'boolean', description: '是否启用，默认true' },
              delivery: {
                type: 'object',
                description: '通知方式',
                properties: {
                  mode: { type: 'string', enum: ['announce', 'silent'], description: 'announce通知用户/silent静默执行' }
                }
              }
            }
          },
          jobId: { type: 'string', description: '任务ID(update/remove/run/runs用)' },
          patch: { type: 'object', description: '更新字段(update用)，如{name:"新名称",enabled:false}' },
          includeDisabled: { type: 'boolean', description: 'list操作是否包含已禁用的任务' },
          text: { type: 'string', description: 'wake操作的唤醒文本' },
          mode: { type: 'string', description: 'wake操作模式(如"now")' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'keyword',
      description: '搜索对话记忆(像人一样思考检索记忆)。多词AND关系，数字后缀表示第N个结果。',
      parameters: {
        type: 'object',
        properties: {
          keywords: { type: 'string', description: '搜索关键词，多个用空格分隔(如"北京 旅游")' },
          limit: { type: 'number', description: '返回结果数，默认3' }
        },
        required: ['keywords']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'neirong',
      description: '搜索之前工具调用返回过的完整历史内容。数字后缀表示第N个结果。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词(如"天气预报")' },
          limit: { type: 'number', description: '返回结果数，默认3' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_file',
      description: '发送文件或图片到飞书聊天。当飞书用户要求发送文件时使用此工具，系统会自动上传并发送。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要发送的文件完整路径(如C:\\Users\\xxx\\Desktop\\report.pdf)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'view_video',
      description: '查看本地视频文件。自动提取关键帧画面和音频转录文字，让你能"看到"视频内容。支持mp4/mov/avi/mkv等格式。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '视频文件完整路径(如D:\\视频\\test.mp4)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'view_image',
      description: '查看本地图片文件。读取图片并展示给你，让你能"看到"图片内容。支持png/jpg/jpeg/bmp/webp/gif等格式。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '图片文件完整路径(如C:\\Users\\nuoyan\\Desktop\\screenshot.png)' }
        },
        required: ['path']
      }
    }
  }
];

// 解析并分离  <think> 内容，返回 { thinkingText, replyText }
function splitThinkingFromDelta(buffer, newDelta) {
  const combined = buffer + newDelta;
  // 提取所有 <think>...</think> 块
  let thinking = '';
  let reply = combined.replace(/<think>([\s\S]*?)<\/think>/gi, (_, t) => { thinking += t; return ''; });
  // 如果有未闭合的 <think>（流式中途），暂存到 buffer
  const openIdx = reply.lastIndexOf('<think>');
  let pendingBuffer = '';
  if (openIdx !== -1) {
    pendingBuffer = reply.slice(openIdx);
    reply = reply.slice(0, openIdx);
  }
  return { thinking: thinking.trim(), reply: reply.trim(), pendingBuffer };
}

// 过滤流式输出中的工具调用块，只保留纯文字
function filterToolBlocks(text) {
  if (!text) return '';
  
  // 1. 过滤所有 ```json 或 ``` 包裹的代码块（只要包含工具名就过滤）
  let clean = text.replace(/```(?:json)?[\s\S]*?```/gi, (match) => {
    // 检查是否包含工具名
    if (/(?:read|write|edit|exec|browser|cron|keyword|neirong|web_fetch)/i.test(match)) {
      return '';
    }
    return match;
  });
  
  // 2. 过滤 [TOOL_CALL] 块
  clean = clean.replace(/\[TOOL_CALL\][\s\S]*?(?=\[TOOL_CALL\]|\n\n|$)/gi, '');
  
  // 3. 过滤裸 JSON 对象（包含 name/tool 和 parameters/params 字段）
  clean = clean.replace(/\{[\s\S]*?"(?:name|tool)"[\s\S]*?"(?:parameters|params|arguments|args)"[\s\S]*?\}/gi, (match) => {
    // 检查是否包含工具名
    if (/"(?:name|tool)"\s*:\s*"(?:read|write|edit|exec|browser|cron|keyword|neirong|web_fetch)"/i.test(match)) {
      return '';
    }
    return match;
  });
  
  // 4. 过滤 <|tool_call|> 标记
  clean = clean.replace(/<\|?tool_call\|?>[\s\S]*?(?=<\|?tool_call\|?>|$)/gi, '');
  
  // 5. 清理多余空行
  return clean.replace(/\n{3,}/g, '\n\n').trim();
}

async function callModel(messages, options = {}) {
  let { model, stream = false, tools = [], onChunk, onThinking, ws, msgId, sessionKey } = options;
  
  if (!model) {
    model = getDefaultModel();
  }
  
  const modelConfig = getModelConfig(model);
  if (!modelConfig) {
    throw new Error(`找不到模型配置: ${model}`);
  }
  
  // 检查是否需要停止
  if (shouldStopAll) {
    throw new Error('任务已停止');
  }
  
  // 创建 AbortController 用于取消请求
  const abortController = new AbortController();
  const signal = abortController.signal;
  
  // 保存到 runningTasks
  if (sessionKey) {
    runningTasks.set(sessionKey, { abortController });
  }
  
  const body = {
    model: modelConfig.modelId,
    messages,
    temperature: 0.7,
    stream
  };

  if (tools.length > 0) {
    body.tools = tools;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (modelConfig.apiKey) {
    headers['Authorization'] = `Bearer ${modelConfig.apiKey}`;
  }

  try {
    // 流式处理
    if (stream && onChunk) {
      return new Promise((resolve, reject) => {
        // 检查停止标志
        if (shouldStopAll) {
          if (sessionKey) runningTasks.delete(sessionKey);
          reject(new Error('任务已停止'));
          return;
        }
        
        axios.post(`${modelConfig.baseUrl}/chat/completions`, body, {
          headers,
          timeout: 300000,
          responseType: 'stream',
          signal
        }).then(response => {
          let fullContent = '';
          let accumulatedToolCalls = [];
          let currentToolCall = null;
          
          let thinkBuffer = '';
          let sseBuffer = '';
          response.data.on('data', (chunk) => {
            if (shouldStopAll) {
              response.data.destroy();
              if (sessionKey) runningTasks.delete(sessionKey);
              reject(new Error('任务已停止'));
              return;
            }
            
            sseBuffer += chunk.toString();
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop();
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6);
                if (data === '[DONE]') {
                  if (sessionKey) runningTasks.delete(sessionKey);
                  // 【关键修复】保存最后一个 tool_call 再 resolve
                  if (currentToolCall && currentToolCall.name) {
                    accumulatedToolCalls.push(currentToolCall);
                    currentToolCall = null;
                  }
                  const doneResult = { choices: [{ message: { content: fullContent } }] };
                  if (accumulatedToolCalls.length > 0) {
                    doneResult.choices[0].message.tool_calls = accumulatedToolCalls;
                  }
                  resolve(doneResult);
                  return;
                }
                
                try {
                  const parsed = JSON.parse(data);
                  const deltaObj = parsed.choices?.[0]?.delta || {};

                  // 提取 tool_calls（结构化工具调用，core方式）
                  const toolCallsDelta = deltaObj.tool_calls;
                  if (toolCallsDelta && Array.isArray(toolCallsDelta)) {
                    for (const tc of toolCallsDelta) {
                      const idx = tc.index || 0;
                      if (!currentToolCall || currentToolCall.index !== idx) {
                        if (currentToolCall) {
                          accumulatedToolCalls.push(currentToolCall);
                        }
                        currentToolCall = {
                          index: idx,
                          name: '',
                          arguments: ''
                        };
                      }
                      if (tc.function) {
                        if (tc.function.name) currentToolCall.name += tc.function.name;
                        if (tc.function.arguments) currentToolCall.arguments += tc.function.arguments;
                      }
                    }
                    if (currentToolCall && !accumulatedToolCalls.some(t => t.index === currentToolCall.index)) {
                      // 标记需要工具调用
                    }
                  }

                  // 1. content 字段（正文，可能含 thinking 标签）
                  const delta = deltaObj.content || '';

                  // 2. reasoning_content 字段（llama.cpp 思考内容 / MiniMax正文）
                  const reasoningDelta = deltaObj.reasoning_content || '';

                  if (delta) {
                    // content有值 → 正常处理：reasoning_content当思考，content当正文
                    if (reasoningDelta && onThinking) onThinking(reasoningDelta);
                    const { thinking, reply, pendingBuffer } = splitThinkingFromDelta(thinkBuffer, delta);
                    thinkBuffer = pendingBuffer;
                    if (thinking) {
                      // console.log('[思考]', thinking.substring(0, 100));
                      if (onThinking) onThinking(thinking);
                    }
                    fullContent += reply + pendingBuffer;
                    if (reply) onChunk(reply);
                  } else if (reasoningDelta) {
                    // content为空但reasoning_content有值 → MiniMax把正文放reasoning_content
                    // 只当正文处理，不触发onThinking，避免同一段文字又显示🤔又显示正文
                    fullContent += reasoningDelta;
                    onChunk(reasoningDelta);
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          });
          
          response.data.on('end', () => {
            if (sseBuffer.trim()) {
              const trimmed = sseBuffer.trim();
              if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6);
                if (data !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(data);
                    const deltaObj = parsed.choices?.[0]?.delta || {};
                    const toolCallsDelta = deltaObj.tool_calls;
                    if (toolCallsDelta && Array.isArray(toolCallsDelta)) {
                      for (const tc of toolCallsDelta) {
                        const idx = tc.index || 0;
                        if (!currentToolCall || currentToolCall.index !== idx) {
                          if (currentToolCall) accumulatedToolCalls.push(currentToolCall);
                          currentToolCall = { index: idx, name: '', arguments: '' };
                        }
                        if (tc.function) {
                          if (tc.function.name) currentToolCall.name += tc.function.name;
                          if (tc.function.arguments) currentToolCall.arguments += tc.function.arguments;
                        }
                      }
                    }
                    const delta = deltaObj.content || '';
                    const reasoningDelta = deltaObj.reasoning_content || '';
                    if (delta) {
                      fullContent += delta;
                      onChunk(delta);
                    } else if (reasoningDelta) {
                      fullContent += reasoningDelta;
                      onChunk(reasoningDelta);
                    }
                  } catch (e) {}
                }
              }
            }
            if (sessionKey) runningTasks.delete(sessionKey);
            if (currentToolCall && currentToolCall.name) {
              accumulatedToolCalls.push(currentToolCall);
            }
            const result = { choices: [{ message: { content: fullContent } }] };
            if (accumulatedToolCalls.length > 0) {
              result.choices[0].message.tool_calls = accumulatedToolCalls;
            }
            resolve(result);
          });
          
          response.data.on('error', (err) => {
            if (sessionKey) runningTasks.delete(sessionKey);
            reject(err);
          });
        }).catch((err) => {
          if (sessionKey) runningTasks.delete(sessionKey);
          reject(err);
        });
      });
    }

    // 非流式处理
    // 检查停止标志
    if (shouldStopAll) {
      if (sessionKey) runningTasks.delete(sessionKey);
      throw new Error('任务已停止');
    }

    const response = await axios.post(`${modelConfig.baseUrl}/chat/completions`, body, {
      headers,
      timeout: 300000,
      signal
    });

    if (sessionKey) runningTasks.delete(sessionKey);
    return response.data;

  } catch (err) {
    if (sessionKey) runningTasks.delete(sessionKey);
    throw err;
  }
}



// 从视频/音频文件提取音轨为WAV
function extractAudioTrack(mediaPath) {
  const tempAudioDir = path.join(os.tmpdir(), `xiaoduan-audio-${Date.now()}`);
  fs.mkdirSync(tempAudioDir, { recursive: true });
  const wavPath = path.join(tempAudioDir, 'audio.wav');
  
  try {
    // 提取音轨转16kHz单声道WAV（whisper需要的格式）
    execSync(`"${FFMPEG_PATH}" -i "${mediaPath}" -vn -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`, { stdio: 'pipe', timeout: 60000 });
    
    if (fs.existsSync(wavPath) && fs.statSync(wavPath).size > 1000) {
      return { wavPath, tempAudioDir };
    }
    return null;
  } catch (e) {
    console.log('[LocalGateway] 提取音轨失败（可能无音轨）:', e.message?.substring(0, 100));
    try { fs.rmSync(tempAudioDir, { recursive: true, force: true }); } catch (_) {}
    return null;
  }
}

// 检测 Python whisper 是否可用
let _whisperAvailable = null; // 缓存检测结果
function isWhisperAvailable() {
  if (_whisperAvailable !== null) return _whisperAvailable;
  try {
    const result = execSync('python -c "import whisper; print(1)"', { stdio: 'pipe', timeout: 10000 });
    _whisperAvailable = result.toString().trim() === '1';
    if (_whisperAvailable) {
      ensureWhisperModel();
    } else {
      console.log('[Whisper] Python whisper 不可用');
    }
  } catch (e) {
    console.log('[Whisper] Python whisper 未安装，音频转录不可用');
    _whisperAvailable = false;
  }
  return _whisperAvailable;
}

// 使用 Python whisper 转录音频
let _whisperModelReady = false;
function ensureWhisperModel() {
  if (_whisperModelReady) return;
  const modelDir = path.join(os.homedir(), '.cache', 'whisper');
  const modelPath = path.join(modelDir, 'small.pt');
  if (fs.existsSync(modelPath) && fs.statSync(modelPath).size > 100000000) {
    _whisperModelReady = true;
    return;
  }
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
  const dl = spawn('curl', ['-s', '-L', '-o', modelPath, 'https://www.modelscope.cn/datasets/yiliu666/moxing/resolve/master/small.pt'], { stdio: 'ignore', windowsHide: true });
  dl.on('close', (code) => {
    if (code === 0 && fs.existsSync(modelPath) && fs.statSync(modelPath).size > 100000000) {
      _whisperModelReady = true;
    }
  });
}

function transcribeAudio(wavPath) {
  if (!isWhisperAvailable()) return null;
  
  try {
    const wavPathEscaped = wavPath.replace(/\\/g, '/');
    const tmpScript = path.join(os.tmpdir(), 'whisper_transcribe.py');
    const pythonCode = `# -*- coding: utf-8 -*-\nimport sys\nimport io\nsys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')\nimport whisper\nm = whisper.load_model("small")\nr = m.transcribe("${wavPathEscaped}", language="zh", fp16=False)\nprint(r["text"])`;
    fs.writeFileSync(tmpScript, pythonCode, 'utf-8');
    
    const ffmpegBin = path.join(__dirname, 'ffmpeg', 'bin');
    const execEnv = { ...process.env, PATH: `${ffmpegBin}${path.delimiter}${process.env.PATH}`, PYTHONIOENCODING: 'utf-8' };
    
    const result = execSync(`python "${tmpScript}"`, { stdio: 'pipe', timeout: 120000, env: execEnv, encoding: 'utf-8' });
    const text = result.trim();
    if (text) {
      console.log('[Whisper] 转录成功, 长度:', text.length);
      return text;
    }
    return null;
  } catch (e) {
    console.log('[Whisper] 转录失败:', e.message?.substring(0, 200));
    return null;
  }
}

// 处理视频：提取帧 + 提取音轨转录 → 返回多模态内容数组
async function processVideoContent(videoBase64, mimeType) {
  const content = [];
  const tempDir = path.join(os.tmpdir(), `xiaoduan-video-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  const videoPath = path.join(tempDir, 'input.mp4');
  const outputPattern = path.join(tempDir, 'frame_%04d.png');
  
  // 保存视频文件
  const videoBuffer = Buffer.from(videoBase64, 'base64');
  fs.writeFileSync(videoPath, videoBuffer);
  
  try {
    // 1. 提取视频帧
    try {
      execSync(`"${FFMPEG_PATH}" -i "${videoPath}" -vf "fps=1,scale=512:512" -vframes 15 "${outputPattern}" -y`, { stdio: 'pipe' });
      const files = fs.readdirSync(tempDir).filter(f => f.startsWith('frame_') && f.endsWith('.png')).sort();
      for (const file of files) {
        const framePath = path.join(tempDir, file);
        const frameData = fs.readFileSync(framePath);
        const compressed = compressImageIfNeeded(frameData.toString('base64'), 'image/png');
        content.push({
          type: 'image_url',
          image_url: { url: `data:${compressed.mimeType};base64,${compressed.base64}` }
        });
      }
      if (files.length > 0) {
        content.unshift({ type: 'text', text: `[视频画面，共${files.length}帧]` });
      }
    } catch (e) {
      console.log('[LocalGateway] 视频帧提取失败:', e.message?.substring(0, 100));
    }
    
    // 2. 提取音轨并转录
    try {
      const audioResult = extractAudioTrack(videoPath);
      if (audioResult) {
        const transcript = await transcribeAudio(audioResult.wavPath);
        if (transcript) {
          content.push({ type: 'text', text: `[视频音频转录]\n${transcript}` });
        }
        // 清理音频临时文件
        try { fs.rmSync(audioResult.tempAudioDir, { recursive: true, force: true }); } catch (_) {}
      }
    } catch (e) {
      console.log('[LocalGateway] 视频音频转录失败:', e.message?.substring(0, 100));
    }
    
    return content;
  } finally {
    // 清理视频临时文件
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// 处理音频文件：提取音轨转录 → 返回文本内容
async function processAudioContent(audioBase64, mimeType, fileName) {
  const tempDir = path.join(os.tmpdir(), `xiaoduan-audio-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  
  // 保存音频文件（先按原始格式保存，再用ffmpeg转wav）
  const ext = mimeType.split('/')[1] || 'wav';
  const audioPath = path.join(tempDir, `input.${ext}`);
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  fs.writeFileSync(audioPath, audioBuffer);
  
  try {
    // 转为WAV
    const wavPath = path.join(tempDir, 'audio.wav');
    try {
      execSync(`"${FFMPEG_PATH}" -i "${audioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`, { stdio: 'pipe', timeout: 60000 });
    } catch (e) {
      console.log('[LocalGateway] 音频转WAV失败:', e.message?.substring(0, 100));
      return { type: 'text', text: `[音频消息: ${fileName || ext}] 音频处理失败` };
    }
    
    if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size < 1000) {
      return { type: 'text', text: `[音频消息: ${fileName || ext}] 音频为空或处理失败` };
    }
    
    // 转录
    const transcript = await transcribeAudio(wavPath);
    if (transcript) {
      return { type: 'text', text: `[音频转录: ${fileName || ext}]\n${transcript}` };
    }
    
    return { type: 'text', text: `[音频消息: ${fileName || ext}] 音频转录不可用，请用户发送文字` };
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// 处理附件（视频/音频/图片）
async function processAttachments(attachments, message) {
  const content = [];
  
  if (message) {
    content.push({ type: 'text', text: message });
  }
  
  for (const att of attachments) {
    const mimeType = att.mimeType || '';
    
    if (mimeType.startsWith('image/')) {
      let imageUrl;
      if (att.content.startsWith('data:')) {
        imageUrl = att.content;
      } else {
        imageUrl = `data:${mimeType};base64,${att.content}`;
      }
      content.push({
        type: 'image_url',
        image_url: { url: imageUrl }
      });
    } else if (mimeType.startsWith('video/')) {
      // 视频：提取帧 + 音频转录
      console.log('[LocalGateway] 处理视频（帧提取+音频转录）...');
      const videoContent = await processVideoContent(att.content, mimeType);
      content.push(...videoContent);
    } else if (mimeType.startsWith('audio/')) {
      // 音频：转录为文字
      console.log('[LocalGateway] 处理音频（转录）...');
      const audioResult = await processAudioContent(att.content, mimeType, att.name);
      content.push(audioResult);
    }
  }
  
  return content;
}

const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`Gateway started, listening on 18888`);
  console.log(`使用配置文件: ~/.xiaoduan/xiaoduan.json`);
  ensureDirs(); // 确保必要目录存在
  initFeishu(); // 初始化飞书连接
  isWhisperAvailable(); // 启动时检测whisper并预下载模型
});

wss.on('connection', (ws) => {
  console.log('[LocalGateway] 客户端已连接');

  ws.on('message', async (data) => {
    let fullResponse = ''; // 提升到外层作用域
    let sessionKey = 'main'; // 提升到外层作用域
    let toolCallsHistory = []; // 记录所有工具调用
    try {
      const msg = JSON.parse(data.toString());
      
      // 处理 connect 请求（WebSocket 握手）
      if (msg.method === 'connect') {
        ws.send(JSON.stringify({
          id: msg.id,
          type: 'res',
          ok: true,
          result: { sessionId: `session-${Date.now()}` }
        }));
        return;
      }
      
      // 处理 chat.send 请求（main.js 的格式）
      if (msg.method === 'chat.send' && msg.params) {
        const { message, model, attachments } = msg.params;
        sessionKey = msg.params.sessionKey || 'main';
        
        console.log('[LocalGateway] 收到消息:', message?.substring(0, 50));
        const resolvedModel = model || getDefaultModel();
        // 使用模型日志（简化显示：去掉 provider 前缀）
        const modelDisplayName = resolvedModel.includes('/') ? resolvedModel.split('/').pop() : resolvedModel;
        console.log('[LocalGateway] 使用模型:', modelDisplayName);

        const config = loadConfig();
        const complexTaskEnabled = config?.complexTaskEnabled ?? false;
        const systemPrompt = getSystemPrompt(complexTaskEnabled);
        
        let userContent;
        if (attachments && attachments.length > 0) {
          userContent = await processAttachments(attachments, message);
        } else {
          userContent = message || '';
        }
        
        // ===== 第一时间保存用户消息到记忆文件 =====
        const userTime = new Date();
        const userTimeStr = userTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        // 提取纯文本用于记忆（如果是多模态内容）
        let userTextForMemory = '';
        if (Array.isArray(userContent)) {
          for (const block of userContent) {
            if (block.type === 'text' && block.text) {
              userTextForMemory += (userTextForMemory ? '\n' : '') + block.text;
            } else if (block.type === 'image_url') {
              userTextForMemory += (userTextForMemory ? '\n' : '') + '[图片]';
            }
          }
        } else {
          userTextForMemory = String(userContent || '');
        }
        const userEntry = `[${userTimeStr}] 用户: ${userTextForMemory}\n`;
        const MEMORY_FILE = path.join(MEMORY_DIR, '记忆.txt');
        try {
          // 确保目录存在
          const memDir = path.dirname(MEMORY_FILE);
          if (!fs.existsSync(memDir)) {
            fs.mkdirSync(memDir, { recursive: true });
          }
          // 【关键修复】使用 Buffer.from 确保 UTF-8 编码
          fs.appendFileSync(MEMORY_FILE, Buffer.from(userEntry, 'utf-8'));
        } catch (e) {
          console.log('[记忆] 保存用户消息失败:', e.message);
        }
        
        // 检测是否是停止命令
        if (isStopCommand(message)) {
          stopAllTasks();
          ws.send(JSON.stringify({
            id: msg.id,
            type: 'res',
            ok: true,
            payload: { runId: `stop-${Date.now()}`, output: { text: '已停止所有任务' } }
          }));
          return;
        }
        
        // 构建用户消息：正确处理多模态数组（图片/视频帧）+ 上下文拼接
        const ctxPayload = getContextPayload(complexTaskEnabled);
        let userMessage;
        if (Array.isArray(userContent)) {
          userMessage = [];
          const textItems = userContent.filter(c => c.type === 'text');
          const imageItems = userContent.filter(c => c.type === 'image_url');
          userMessage.push(...textItems);
          userMessage.push(...imageItems);
          if (ctxPayload) {
            userMessage.push({ type: 'text', text: ctxPayload });
          }
        } else {
          userMessage = String(userContent || '') + (ctxPayload ? '\n\n' + ctxPayload : '');
        }

        let messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ];

        const runId = `run-${Date.now()}`;
        let lastSaveTime = Date.now();
        const SAVE_INTERVAL = 2000;

        // 【关键修复2】在同一次响应内去重99%相似的工具调用
        function deduplicateToolCalls(calls) {
          const unique = [];
          for (const call of calls) {
            const isDuplicate = unique.some(existing => 
              existing.name === call.name && 
              JSON.stringify(existing.params) === JSON.stringify(call.params)
            );
            if (!isDuplicate) {
              unique.push(call);
            }
          }
          return unique;
        }

        // 【跨轮去重】追踪最近执行过的工具调用，防止本地模型无限重复同一调用
        const recentToolCalls = []; // { name, paramsKey, loop }
        const MAX_REPEAT_SAME_TOOL = 3; // 同一工具+参数最多连续执行3次，超过则跳过

        function isCrossRoundDuplicate(call, currentLoop) {
          const paramsKey = JSON.stringify(call.params);
          // 统计最近连续几轮中相同调用的次数
          const sameCallCount = recentToolCalls.filter(
            r => r.name === call.name && r.paramsKey === paramsKey && currentLoop - r.loop <= 2
          ).length;
          return sameCallCount >= MAX_REPEAT_SAME_TOOL;
        }

        // 处理工具调用循环（Core方式）
        const maxLoop = 999;
        let lastRoundResponse = ''; // 记录最后一轮模型的文字回复（用于记忆.txt）
        let stoppedByUser = false;
        for (let loop = 0; loop < maxLoop; loop++) {
          if (shouldStopAll || stoppedByUser) { break; }
          // 调用模型获取新的回复
          let newResponse = '';
          lastRoundResponse = ''; // 重置，只保留最后一轮
          
          // 【实时更新】每轮callModel前刷新system prompt和动态上下文，让大模型看到最新的工具总结/内容/记忆
          if (loop > 0) {
            // 刷新上下文（内容.txt已在上轮写入完整结果并截断，本轮通过内容.txt截断版回顾）
            messages[0] = { role: 'system', content: getSystemPrompt(complexTaskEnabled) };
            const ctx = getContextPayload(complexTaskEnabled);
            // 正确处理多模态数组拼接
            if (Array.isArray(userContent)) {
              const refreshedUserMessage = [...userContent];
              if (ctx) refreshedUserMessage.push({ type: 'text', text: ctx });
              messages[1] = { role: 'user', content: refreshedUserMessage };
            } else {
              messages[1] = { role: 'user', content: userContent + (ctx ? '\n\n' + ctx : '') };
            }
          }
          
          let rawToolCalls = [];
          try {
            const modelResult = await callModel(messages, { model: resolvedModel, stream: true, sessionKey,
              tools: CORE_TOOLS,
              onThinking: (thinking) => {
                ws.send(JSON.stringify({
                  id: msg.id, type: 'event', event: 'chat',
                  payload: { state: 'streaming', thinking, runId, sessionKey: sessionKey || 'main' }
                }));
              },
              onChunk: (delta) => {
              try {
              // console.log('[onChunk回调] delta前50字:', delta?.substring(0, 50));
              newResponse += delta;
              fullResponse += delta;
              lastRoundResponse += delta; // 记录最后一轮的回复
              // streaming delta 只发纯文字（过滤工具调用块）
              const cleanDelta = filterToolBlocks(delta);
              // console.log('[onChunk发送] delta:', JSON.stringify(delta), 'cleanDelta:', JSON.stringify(cleanDelta), '发送:', !!cleanDelta);
              if (cleanDelta) {
                ws.send(JSON.stringify({
                  id: msg.id,
                  type: 'event',
                  event: 'chat',
                  payload: {
                    state: 'streaming',
                    message: { content: cleanDelta },
                    runId: runId,
                    sessionKey: sessionKey || 'main'
                  }
                }));
              }
              } catch(e) { console.log('[onChunk错误]', e.message); }
            }});

          // 【Core方式】只使用API返回的结构化tool_calls
          const structuredToolCalls = modelResult?.choices?.[0]?.message?.tool_calls || [];
          rawToolCalls = [];  // 重置数组
          if (structuredToolCalls && structuredToolCalls.length > 0) {
            // 转换为本地格式（统一用 name + params）
            for (const tc of structuredToolCalls) {
              const tcName = tc.name || tc.function?.name;
              const tcArgs = tc.arguments || tc.function?.arguments;
              if (tcName && tcArgs) {
                try {
                  const args = typeof tcArgs === 'string' ? JSON.parse(tcArgs) : tcArgs;
                  rawToolCalls.push({ name: tcName, params: args });
                } catch {
                  rawToolCalls.push({ name: tcName, params: tcArgs });
                }
              }
            }
          } else {
            // 【文本回退】本地模型（如llama.cpp）不支持结构化tool_calls，回退到文本解析
            const textCalls = parseToolCalls(fullResponse);
            if (textCalls.length > 0) {
              console.log('[文本回退] 从模型输出中解析到', textCalls.length, '个工具调用');
              rawToolCalls = textCalls;
            }
          }
          // 【工具总结】先不写，等判断是否有工具调用后再决定
          } catch (error) {
            console.error('[LocalGateway] 调用模型失败:', error.message);
            stopAllTasks(); // 模型调用失败自动停止，让用户可以继续
            // 错误时记录已有回复（工具结果已在执行时立刻写入，不重复写）
            const cleanErr = filterToolBlocks(stripThinking(fullResponse));
            if (cleanErr) saveAssistantToMemory(cleanErr);
            // 【关键修复】模型报错时必须同时发 res(ok:false) 让 main.js 按 msg.id 匹配 pending 并 reject
            // 否则 pending 永远挂着，前端停止按钮不恢复，用户发不了消息，自我进化也卡住
            ws.send(JSON.stringify({ id: msg.id, type: 'res', ok: false, error: { message: error.message } }));
            ws.send(JSON.stringify({ type: 'event', event: 'chat', payload: { state: 'error', errorMessage: error.message, runId, sessionKey: sessionKey || 'main' } }));
            // 【自我进化】模型报错导致的停止，通知前端触发自我进化继续（区别于用户手动停止）
            wss.clients.forEach(c => {
              if (c.readyState === 1) {
                c.send(JSON.stringify({ type: 'event', event: 'evolution.trigger', payload: { source: 'model-error' } }));
              }
            });
            return;
          }
          
          const toolCalls = deduplicateToolCalls(rawToolCalls);
          
          if (rawToolCalls.length > toolCalls.length) {
            console.log(`[去重] 原始${rawToolCalls.length}个工具调用，去重后${toolCalls.length}个`);
          }
          
          if (toolCalls.length === 0) break;

          // 【工具总结】有工具调用时，保存模型这轮的文字回复到工具总结.txt（让模型知道自己说了什么）
          if (newResponse) {
            saveAssistantResponseToSummary(newResponse);
          }

          // 【关键修复】不清空fullResponse，让模型看到之前的回复
          // fullResponse = '';  // 注释掉，保留模型的完整回复历史

          // 【滑动窗口】先删除上一轮的工具结果（模型已看过并做出决定）
          // （完整结果已写入文件，下次对话通过 {{TOOL_SUMMARY}}/{{NEIRONG}} 可见）
          messages = messages.filter(m => {
            if (m.role === 'tool') return false;
            if (m.role === 'assistant' && m.tool_calls && !m.content) return false;
            return true;
          });

          // 添加 assistant 的 tool_calls 消息（Core API规范：tool消息必须跟在assistant(tool_calls)后面）
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: toolCalls.map((tc, i) => ({
              id: `call_${loop}_${i}`,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.params) }
            }))
          });

          for (const call of toolCalls) {
            if (shouldStopAll) { console.log('[工具循环] 被用户停止'); break; }
            console.log(`✅ [工具调用] ${call.name}(${JSON.stringify(call.params)})`);

            // 【跨轮去重】检查是否重复调用了同一工具+参数
            if (isCrossRoundDuplicate(call, loop)) {
              console.log(`[跨轮去重] 跳过重复调用: ${call.name}(${JSON.stringify(call.params)})`);
              const dupMsg = `⚠️ 该工具调用已连续执行${MAX_REPEAT_SAME_TOOL}次以上，结果相同，不再重复执行。请换一种方式或换其他工具。`;
              messages.push({
                role: 'tool',
                tool_call_id: `call_${loop}_${toolCalls.indexOf(call)}`,
                name: call.name,
                content: dupMsg
              });
              continue;
            }
            recentToolCalls.push({ name: call.name, paramsKey: JSON.stringify(call.params), loop });

            const toolStartTime = Date.now();
            // 通知前端：工具开始（显示在系统日志）
            ws.send(JSON.stringify({
              id: msg.id,
              type: 'event',
              event: 'agent',
              payload: {
                stream: 'tool',
                runId: runId,
                sessionKey: sessionKey || 'main',
                data: { name: call.name, phase: 'start', args: call.params }
              }
            }));

            const toolResult = await executeTool(call.name, call.params);
            if (stopTimestamp && toolStartTime <= stopTimestamp) {
              stoppedByUser = true;
              break;
            }
            toolCallsHistory.push({ ...call, result: toolResult });
            // 立刻写工具总结.txt（工具名+参数）
            saveToolCalls([{ ...call, result: toolResult }]);

            // 通知前端：工具结束（显示在系统日志）
            ws.send(JSON.stringify({
              id: msg.id,
              type: 'event',
              event: 'agent',
              payload: {
                stream: 'tool',
                runId: runId,
                sessionKey: sessionKey || 'main',
                data: {
                  name: call.name,
                  phase: 'result',
                  result: toolResult.error ? { error: toolResult.result } : { ok: true }
                }
              }
            }));

            // 【完整传递】工具结果完整写入 messages（role:'tool'），当轮大模型直接看到完整内容
            const toolResultContent = buildToolResultMessage(call, toolResult);
            
            messages.push({
              role: 'tool',
              tool_call_id: `call_${loop}_${toolCalls.indexOf(call)}`,
              name: call.name,
              content: toolResultContent
            });

            // view_video 工具：把视频帧画面作为 user 消息插入，让模型能"看到"视频
            if (call.name === 'view_video' && toolResult._videoContent && toolResult._videoContent.length > 0) {
              messages.push({
                role: 'user',
                content: toolResult._videoContent
              });
            }

            if (toolResult._imageContent && toolResult._imageContent.length > 0) {
              messages.push({
                role: 'user',
                content: toolResult._imageContent
              });
            }

            // 写入内容.txt持久化（messages里也保留tool结果，下轮callModel时模型直接看到）
            saveToolResultsToNeirong([{ ...call, result: toolResult }]);
          }

          if (shouldStopAll) { console.log('[工具循环] 被用户停止，退出外层循环'); break; }

          // 【不再删除本轮tool消息】工具结果必须留在messages里，下轮callModel时模型才能看到！
          // 上一轮的tool消息会在下轮循环顶部、push新assistant(tool_calls)之前删除（模型已看过）

        }

        // 【记忆】只记录大模型最后一句回复（过滤工具调用块），不记录工具过程
        const cleanFinalResponse = filterToolBlocks(stripThinking(lastRoundResponse));
        if (cleanFinalResponse) {
          saveAssistantToMemory(cleanFinalResponse);
        }

        // 大模型成功回复，更新存活时间戳
        lastModelMsgTime = Date.now();

        // 发送 final
        ws.send(JSON.stringify({
          id: msg.id,
          type: 'event',
          event: 'chat',
          payload: {
            state: 'final',
            message: { content: fullResponse },
            runId: runId,
            sessionKey: sessionKey || 'main'
          }
        }));

        ws.send(JSON.stringify({
          id: msg.id,
          type: 'res',
          ok: true,
          payload: {
            runId: runId,
            output: { text: fullResponse }
          }
        }));

      }
      
      // 处理 sessions.patch 请求（忽略）
      else if (msg.method === 'sessions.patch') {
        ws.send(JSON.stringify({ id: msg.id, type: 'res', ok: true, payload: {} }));
      }
      
      // 处理 chat.abort 请求（停止所有任务）
      else if (msg.method === 'chat.abort') {
        stopAllTasks();
        ws.send(JSON.stringify({ id: msg.id, type: 'res', ok: true, payload: {} }));
      }
      
    } catch (error) {
    console.error('[LocalGateway] 错误:', error.message);
    const cleanErr = filterToolBlocks(stripThinking(fullResponse));
    if (cleanErr) saveAssistantToMemory(cleanErr);
    // 【关键修复】必须发 res(ok:false) 让 main.js 按 msg.id 匹配 pending 并 reject
    if (msg?.id) {
      ws.send(JSON.stringify({ id: msg.id, type: 'res', ok: false, error: { message: error.message } }));
    }
    ws.send(JSON.stringify({ type: 'event', event: 'chat', payload: { state: 'error', errorMessage: error.message } }));
    }
  });

  ws.on('close', () => {
    console.log('[LocalGateway] 客户端断开');
  });
});

// ==================== 飞书支持 ====================

// 飞书文件类型映射
const FEISHU_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico', '.tiff']);
// 飞书待发送文件列表（send_file工具调用时添加，回复时消费）
let pendingFeishuFiles = [];
function resolveFileType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (['.opus', '.ogg'].includes(ext)) return 'opus';
  if (['.mp4', '.mov', '.avi'].includes(ext)) return 'mp4';
  if (ext === '.pdf') return 'pdf';
  if (['.doc', '.docx'].includes(ext)) return 'doc';
  if (['.xls', '.xlsx'].includes(ext)) return 'xls';
  if (['.ppt', '.pptx'].includes(ext)) return 'ppt';
  return 'stream';
}
// 根据 file_type 推断发送消息的 msg_type（必须匹配，否则报 230055）
function resolveMsgType(fileType) {
  if (fileType === 'mp4') return 'video';
  if (fileType === 'opus') return 'audio';
  return 'file';
}

// 发送飞书回复（支持文本+文件/图片，文件来自send_file工具调用）
async function sendFeishuReply(client, chatId, text) {
  const filesToSend = pendingFeishuFiles.splice(0); // 取出并清空列表
  const config = loadConfig();
  const feishuConfig = config?.channels?.feishu;
  const appId = feishuConfig?.accounts?.main?.appId;
  const appSecret = feishuConfig?.accounts?.main?.appSecret;
  
  if (filesToSend.length > 0 && appId && appSecret) {
    // 获取 tenant_access_token
    let token;
    try {
      const tokenResp = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        app_id: appId, app_secret: appSecret
      });
      token = tokenResp.data.tenant_access_token;
    } catch (e) {
      console.error('[Feishu] 获取token失败:', e.message);
    }
    
    if (token) {
      // 先发送文件/图片
      for (const filePath of filesToSend) {
        try {
          const ext = path.extname(filePath).toLowerCase();
          const fileName = path.basename(filePath);
          const isImage = FEISHU_IMAGE_EXTS.has(ext);
          const fileBuffer = fs.readFileSync(filePath);
          
          // 构建上传 form-data
          const boundary = '----FormBoundary' + Date.now();
          
          if (isImage) {
            // 上传图片到飞书
            const uploadBody = Buffer.concat([
              Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image_type"\r\n\r\nmessage\r\n`),
              Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
              fileBuffer,
              Buffer.from(`\r\n--${boundary}--\r\n`)
            ]);
            
            const uploadRes = await axios.post('https://open.feishu.cn/open-apis/im/v1/images', uploadBody, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
              }
            });
            
            const imageKey = uploadRes.data?.data?.image_key;
            if (imageKey) {
              // 发送图片消息
              await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                receive_id: chatId,
                msg_type: 'image',
                content: JSON.stringify({ image_key: imageKey })
              }, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
              });
              console.log(`[Feishu] 已发送图片: ${fileName}`);
            }
          } else {
            // 上传文件到飞书
            const fileType = resolveFileType(fileName);
            const msgType = resolveMsgType(fileType);
            const uploadBody = Buffer.concat([
              Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_type"\r\n\r\n${fileType}\r\n`),
              Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_name"\r\n\r\n${fileName}\r\n`),
              Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
              fileBuffer,
              Buffer.from(`\r\n--${boundary}--\r\n`)
            ]);
            
            const uploadRes = await axios.post('https://open.feishu.cn/open-apis/im/v1/files', uploadBody, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
              }
            });
            
            const fileKey = uploadRes.data?.data?.file_key;
            if (fileKey) {
              // 发送消息（msg_type 必须与 file_type 匹配：mp4→video, opus→audio, 其他→file）
              const contentKey = msgType === 'video' ? 'video_key' : msgType === 'audio' ? 'audio_key' : 'file_key';
              await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                receive_id: chatId,
                msg_type: msgType,
                content: JSON.stringify({ [contentKey]: fileKey })
              }, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
              });
              console.log(`[Feishu] 已发送${msgType === 'video' ? '视频' : msgType === 'audio' ? '音频' : '文件'}: ${fileName}`);
            }
          }
        } catch (err) {
          console.error(`[Feishu] 发送文件失败 ${filePath}:`, err.response?.data || err.message);
        }
      }
    }
  }
  
  // 发送文本（如果有内容）
  const cleanText = text ? text.trim() : '';
  if (cleanText) {
    await client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: JSON.stringify({ text: cleanText }),
        msg_type: 'text'
      }
    });
  }
}

function initFeishu() {
  const config = loadConfig();
  const feishuConfig = config?.channels?.feishu;
  
  if (!feishuConfig || !feishuConfig.enabled) {
    console.log('[Feishu] 飞书未启用或未配置');
    return;
  }
  
  if (!Lark) {
    console.log('[Feishu] SDK 未安装，跳过飞书初始化');
    return;
  }

  // 防止重复初始化
  if (global.feishuInitialized) {
    console.log('[Feishu] 已初始化，跳过');
    return;
  }
  global.feishuInitialized = true;
  
  // 从 accounts.main 读取配置
  const appId = feishuConfig.accounts?.main?.appId;
  const appSecret = feishuConfig.accounts?.main?.appSecret;
  
  if (!appId || !appSecret) {
    console.log('[Feishu] AppID 或 AppSecret 未配置');
    return;
  }
  
  console.log('[Feishu] 初始化飞书连接...');
  console.log('[Feishu] AppID:', appId);
  
  const larkClient = new Lark.Client({
    appId,
    appSecret,
    loggerLevel: Lark.LoggerLevel.debug
  });
  
  const wsClient = new Lark.WSClient({
    appId,
    appSecret,
    loggerLevel: Lark.LoggerLevel.debug
  });
  
  wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        try {
          const { message, sender } = data;
          const { chat_id, content, message_type, key, message_id, create_time } = message;

          // 【关键修复】过滤机器人自己发的消息，否则会无限循环（回复→收到→再回复）
          // 飞书群消息会收到所有消息，包括机器人自己的回复
          const senderType = sender?.sender_type || '';
          const senderId = sender?.sender_id?.open_id || sender?.sender_id?.user_id || '';
          if (senderType === 'app' || senderId === appId) {
            console.log('[Feishu] 跳过机器人自己的消息:', message_id);
            return;
          }

          // 检查消息时间戳，过滤离线推送的旧消息（超过5分钟不处理）
          if (create_time) {
            const msgTime = Number(create_time) * 1000;
            const now = Date.now();
            if (now - msgTime > 10 * 60 * 1000) {
              console.log('[Feishu] 跳过太旧的消息:', message_id, '消息时间:', new Date(msgTime).toLocaleString());
              return;
            }
          }

          // 去重检查
          if (!tryRecordMessage('feishu', appId, chat_id, message_id)) {
            console.log('[Feishu] 跳过重复消息:', message_id);
            return;
          }

          console.log('[Feishu] 收到消息类型:', message_type, 'message_id:', message_id);

          // 构建用户消息内容（支持多模态：文本+图片）
          let userContent = [];
          let hasValidContent = false;

          // 处理图片类型
          if (message_type === 'image') {
            try {
              // 从 content 中解析 image_key
              let imageKey = key;
              try {
                const parsedContent = JSON.parse(content);
                imageKey = parsedContent.image_key || key;
              } catch (e) {}

              // 使用正确的 API 下载图片（messageResource.get 需要 message_id）
              if (!message_id) {
                throw new Error('缺少 message_id');
              }

              // 先获取 token
              const tokenResp = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
                app_id: appId,
                app_secret: appSecret
              });
              const token = tokenResp.data.tenant_access_token;

              // 下载图片
              const imageResp = await axios.get(
                `https://open.feishu.cn/open-apis/im/v1/messages/${message_id}/resources/${imageKey}?type=image`,
                {
                  headers: { Authorization: `Bearer ${token}` },
                  responseType: 'arraybuffer'
                }
              );
              const buffer = Buffer.from(imageResp.data);
              const base64 = buffer.toString('base64');
              const compressed = compressImageIfNeeded(base64, 'image/png');
              userContent.push({
                type: 'image_url',
                image_url: { url: `data:${compressed.mimeType};base64,${compressed.base64}` }
              });
              hasValidContent = true;
              console.log('[Feishu] 已下载图片');
            } catch (imgErr) {
              console.error('[Feishu] 下载图片失败:', imgErr.message);
              userContent.push({ type: 'text', text: '[图片消息]' });
              hasValidContent = true;
            }
          }
          // 处理文本类型
          else if (message_type === 'text') {
            try {
              const parsed = JSON.parse(content);
              if (parsed.text) {
                userContent.push({ type: 'text', text: parsed.text });
                hasValidContent = true;
              }
            } catch (e) {
              console.error('[Feishu] 解析文本失败:', e.message);
            }
          }
          // 处理富文本类型
          else if (message_type === 'post') {
            try {
              const parsed = JSON.parse(content);
              if (parsed.title !== undefined && parsed.content !== undefined) {
                let text = parsed.title || '';
                if (Array.isArray(parsed.content)) {
                  for (const item of parsed.content) {
                    if (item.tag === 'text' && item.text) {
                      text += item.text;
                    } else if (item.tag === 'img') {
                      text += '[图片]';
                    }
                  }
                }
                if (text) {
                  userContent.push({ type: 'text', text });
                  hasValidContent = true;
                }
              }
            } catch (e) {}
          }
          // 处理文件类型
          else if (message_type === 'file') {
            try {
              const parsed = JSON.parse(content);
              const fileKey = parsed.file_key;
              const fileName = parsed.file_name || '文件';
              if (fileKey) {
                // 下载文件
                const tokenResp = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
                  app_id: appId,
                  app_secret: appSecret
                });
                const token = tokenResp.data.tenant_access_token;

                const fileResp = await axios.get(
                  `https://open.feishu.cn/open-apis/im/v1/messages/${message_id}/resources/${fileKey}?type=file`,
                  {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'arraybuffer'
                  }
                );
                const buffer = Buffer.from(fileResp.data);
                const base64 = buffer.toString('base64');
                const contentType = fileResp.headers['content-type'] || 'application/octet-stream';
                userContent.push({
                  type: 'text',
                  text: `[文件: ${fileName}]`
                });
                // 如果是文本文件，添加内容
                if (contentType.startsWith('text/') || fileName.endsWith('.txt')) {
                  try {
                    const textContent = buffer.toString('utf-8');
                    userContent.push({ type: 'text', text: `文件内容:\n${textContent.substring(0, 1000)}` });
                  } catch (e) {}
                }
                hasValidContent = true;
                console.log('[Feishu] 已下载文件:', fileName);
              }
            } catch (e) {
              console.error('[Feishu] 处理文件失败:', e.message);
            }
          }
          // 处理音频类型
          else if (message_type === 'audio') {
            try {
              const parsed = JSON.parse(content);
              const fileKey = parsed.file_key;
              if (fileKey && message_id) {
                const tokenResp = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
                  app_id: appId,
                  app_secret: appSecret
                });
                const token = tokenResp.data.tenant_access_token;

                const audioResp = await axios.get(
                  `https://open.feishu.cn/open-apis/im/v1/messages/${message_id}/resources/${fileKey}?type=file`,
                  {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'arraybuffer'
                  }
                );
                const buffer = Buffer.from(audioResp.data);
                const base64 = buffer.toString('base64');
                // 音频转录
                const audioResult = await processAudioContent(base64, 'audio/opus', 'feishu-audio');
                userContent.push(audioResult);
                hasValidContent = true;
                console.log('[Feishu] 已处理音频（转录）');
              }
            } catch (e) {
              console.error('[Feishu] 处理音频失败:', e.message);
            }
          }
          // 处理视频类型
          else if (message_type === 'media') {
            try {
              const parsed = JSON.parse(content);
              const fileKey = parsed.file_key;
              if (fileKey && message_id) {
                // 下载视频
                const tokenResp = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
                  app_id: appId,
                  app_secret: appSecret
                });
                const token = tokenResp.data.tenant_access_token;

                const videoResp = await axios.get(
                  `https://open.feishu.cn/open-apis/im/v1/messages/${message_id}/resources/${fileKey}?type=file`,
                  {
                    headers: { Authorization: `Bearer ${token}` },
                    responseType: 'arraybuffer'
                  }
                );
                const buffer = Buffer.from(videoResp.data);
                const base64 = buffer.toString('base64');
                // 视频：帧提取 + 音频转录
                const videoContent = await processVideoContent(base64, 'video/mp4');
                userContent.push(...videoContent);
                hasValidContent = true;
                console.log('[Feishu] 已处理视频（帧+音频转录）');
              }
            } catch (e) {
              console.error('[Feishu] 处理视频失败:', e.message);
            }
          }

          if (!hasValidContent || userContent.length === 0) {
            console.log('[Feishu] 无有效内容，跳过');
            return;
          }

          console.log('[Feishu] 消息内容:', userContent.length, '个内容块');

          // 记录最近活跃的 chat_id
          lastFeishuChatId = chat_id;
          // 记录最近活跃的用户 open_id（用于单聊投递）
          if (senderId) {
            lastFeishuOpenId = senderId;
          }
          // 持久化保存飞书状态
          saveFeishuState();

          // 从 userContent 中提取纯文本
          let userText = '';
          for (const block of userContent) {
            if (block.type === 'text' && block.text) {
              userText += (userText ? '\n' : '') + block.text;
            }
          }

          // ===== 第一时间保存用户消息到记忆文件 =====
          lastUserMsgTime = Date.now(); // 更新存活时间戳
          const userTime = new Date();
          const userTimeStr = userTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
          const userEntry = `[${userTimeStr}] 用户: ${userText || '[图片/文件消息]'}\n`;
          const feishuMemoryFile = path.join(MEMORY_DIR, '记忆.txt');
          try {
            // 确保目录存在
            const memDir = path.dirname(feishuMemoryFile);
            if (!fs.existsSync(memDir)) {
              fs.mkdirSync(memDir, { recursive: true });
            }
            // 【关键修复】使用 Buffer.from 确保 UTF-8 编码
            fs.appendFileSync(feishuMemoryFile, Buffer.from(userEntry, 'utf-8'));
            console.log('[Feishu] 已保存用户消息到记忆');
          } catch (e) {
            console.log('[Feishu] 保存用户消息失败:', e.message);
          }

          // 检测是否是停止命令
          if (isStopCommand(userText)) {
            stopAllTasks();
            // 发送回复到飞书
            await larkClient.im.v1.message.create({
              params: { receive_id_type: 'chat_id' },
              data: {
                receive_id: chat_id,
                content: JSON.stringify({ text: '已停止所有任务' }),
                msg_type: 'text'
              }
            });
            console.log('[Feishu] 已回复停止命令');
            return;
          }

          // 创建一个假的 reqId 和 msg 对象，让飞书消息也通过标准的聊天流程处理
          const fakeReqId = `feishu-chat-${Date.now()}`;
          const fakeMsg = {
            id: fakeReqId,
            type: 'req',
            method: 'chat.send',
            params: {
              sessionKey: 'feishu:' + chat_id,
              message: userText || '',
              deliver: false
            }
          };

          // 发送飞书用户消息到 main.js，让前端显示
          const feishuUserMsgEvent = JSON.stringify({
            type: 'feishu.user-message',
            data: { message: userText || '[图片/文件消息]', chatId: chat_id }
          });
          wss.clients.forEach(wsClient2 => {
            if (wsClient2.readyState === 1) {
              wsClient2.send(feishuUserMsgEvent);
            }
          });

          // 现在像处理电脑端消息一样处理飞书消息
          const config = loadConfig();
          const complexTaskEnabled = config?.complexTaskEnabled ?? false;
          const systemPrompt = getSystemPrompt(complexTaskEnabled);
          const resolvedModel = getDefaultModel();
          const sessionKey = fakeMsg.params.sessionKey;

          let feishuUserMessage;
          if (Array.isArray(userContent)) {
            feishuUserMessage = [...userContent];
            const ctx = getContextPayload(complexTaskEnabled);
            if (ctx) feishuUserMessage.push({ type: 'text', text: ctx });
          } else {
            feishuUserMessage = String(userContent || '') + (getContextPayload(complexTaskEnabled) ? '\n\n' + getContextPayload(complexTaskEnabled) : '');
          }

          let messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: feishuUserMessage }
          ];

          const runId = `run-${Date.now()}`;
          let feishuFullResponse = '';
          let feishuToolCallsHistory = [];
          let feishuLastRoundResponse = ''; // 记录最后一轮模型的文字回复（用于记忆.txt）

          // 工具调用循环（Core方式：结构化tool_calls + role:'tool' + 滑动窗口）
          const maxLoop = 999;
          for (let loop = 0; loop < maxLoop; loop++) {
            if (shouldStopAll) { console.log('[Feishu] 工具循环被停止'); break; }
            let newResponse = '';
            feishuLastRoundResponse = ''; // 重置，只保留最后一轮

            // 【实时更新】每轮callModel前刷新system prompt和动态上下文
            if (loop > 0) {
              // 刷新上下文（内容.txt已在上轮写入完整结果并截断，本轮通过内容.txt截断版回顾）
              messages[0] = { role: 'system', content: getSystemPrompt(complexTaskEnabled) };
              const ctx = getContextPayload(complexTaskEnabled);
              // 正确处理多模态数组拼接
              if (Array.isArray(userContent)) {
                const refreshedUserMessage = [...userContent];
                if (ctx) refreshedUserMessage.push({ type: 'text', text: ctx });
                messages[1] = { role: 'user', content: refreshedUserMessage };
              } else {
                messages[1] = { role: 'user', content: userContent + (ctx ? '\n\n' + ctx : '') };
              }
            }

            let rawToolCalls = [];
            try {
              const modelResult = await callModel(messages, { model: resolvedModel, stream: true, sessionKey,
                tools: CORE_TOOLS,
                onThinking: (thinking) => {
                  wss.clients.forEach(c => {
                    if (c.readyState === 1) c.send(JSON.stringify({
                      id: fakeReqId, type: 'event', event: 'chat',
                      payload: { state: 'streaming', thinking, runId, sessionKey: sessionKey || 'main' }
                    }));
                  });
                },
                onChunk: (delta) => {
                  newResponse += delta;
                  feishuFullResponse += delta;
                  feishuLastRoundResponse += delta; // 记录最后一轮的回复
                  const cleanDelta = filterToolBlocks(delta);
                  if (cleanDelta) {
                    wss.clients.forEach(c => {
                      if (c.readyState === 1) c.send(JSON.stringify({
                        id: fakeReqId, type: 'event', event: 'chat',
                        payload: { state: 'streaming', message: { content: cleanDelta }, runId, sessionKey: sessionKey || 'main' }
                      }));
                    });
                  }
                }
              });

              // 【Core方式】只使用API返回的结构化tool_calls
              const structuredToolCalls = modelResult?.choices?.[0]?.message?.tool_calls || [];
              rawToolCalls = [];
              if (structuredToolCalls && structuredToolCalls.length > 0) {
                for (const tc of structuredToolCalls) {
                  const tcName = tc.name || tc.function?.name;
                  const tcArgs = tc.arguments || tc.function?.arguments;
                  if (tcName && tcArgs) {
                    try {
                      const args = typeof tcArgs === 'string' ? JSON.parse(tcArgs) : tcArgs;
                      rawToolCalls.push({ name: tcName, params: args });
                    } catch {
                      rawToolCalls.push({ name: tcName, params: tcArgs });
                    }
                  }
                }
              } else {
                // 【文本回退】本地模型不支持结构化tool_calls，回退到文本解析
                const textCalls = parseToolCalls(feishuLastRoundResponse || '');
                if (textCalls.length > 0) {
                  console.log('[Feishu文本回退] 从模型输出中解析到', textCalls.length, '个工具调用');
                  rawToolCalls = textCalls;
                }
              }
              // 【工具总结】先不写，等判断是否有工具调用后再决定
            } catch (err) {
              console.error('[Feishu] 调用模型失败:', err.message);
              stopAllTasks(); // 模型调用失败自动停止，让用户可以继续
              // 【自我进化】飞书报错也通知前端触发自我进化
              wss.clients.forEach(c => {
                if (c.readyState === 1) {
                  c.send(JSON.stringify({ type: 'event', event: 'evolution.trigger', payload: { source: 'feishu-error' } }));
                }
              });
              break;
            }

            const toolCalls = rawToolCalls;
            if (toolCalls.length === 0) break;

            // 【工具总结】有工具调用时，保存模型这轮的文字回复到工具总结.txt
            if (newResponse) {
              saveAssistantResponseToSummary(newResponse);
            }

            // 【滑动窗口】先删除上一轮的工具结果
            messages = messages.filter(m => {
              if (m.role === 'tool') return false;
              if (m.role === 'assistant' && m.tool_calls && !m.content) return false;
              return true;
            });

            // 添加 assistant 的 tool_calls 消息（Core API规范）
            messages.push({
              role: 'assistant',
              content: null,
              tool_calls: toolCalls.map((tc, i) => ({
                id: `call_${loop}_${i}`,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.params) }
              }))
            });

            for (const call of toolCalls) {
              console.log(`✅ [Feishu工具调用] ${call.name}(${JSON.stringify(call.params)})`);
              wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify({ id: fakeReqId, type: 'event', event: 'agent', payload: { stream: 'tool', runId, sessionKey, data: { name: call.name, phase: 'start', args: call.params } } })); });
              const toolResult = await executeTool(call.name, call.params);
              if (shouldStopAll) { console.log('[Feishu] 工具被用户停止'); break; }
              feishuToolCallsHistory.push({ ...call, result: toolResult });
              // 立刻写工具总结.txt（工具名+参数）
              saveToolCalls([{ ...call, result: toolResult }]);
              wss.clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify({ id: fakeReqId, type: 'event', event: 'agent', payload: { stream: 'tool', runId, sessionKey, data: { name: call.name, phase: 'result', result: toolResult.error ? { error: toolResult.result } : { ok: true } } } })); });

              // 【完整传递】工具结果完整写入 messages（role:'tool'），当轮大模型直接看到完整内容
              const toolResultContent = buildToolResultMessage(call, toolResult);
              messages.push({
                role: 'tool',
                tool_call_id: `call_${loop}_${toolCalls.indexOf(call)}`,
                name: call.name,
                content: toolResultContent
              });

              // view_video 工具：把视频帧画面作为 user 消息插入，让模型能"看到"视频
              if (call.name === 'view_video' && toolResult._videoContent && toolResult._videoContent.length > 0) {
                messages.push({
                  role: 'user',
                  content: toolResult._videoContent
                });
              }

              if (toolResult._imageContent && toolResult._imageContent.length > 0) {
                messages.push({
                  role: 'user',
                  content: toolResult._imageContent
                });
              }

              // 写入内容.txt持久化（messages里也保留tool结果，下轮callModel时模型直接看到）
              saveToolResultsToNeirong([{ ...call, result: toolResult }]);
            }

            // 【不再删除本轮tool消息】工具结果必须留在messages里，下轮callModel时模型才能看到！
            // 上一轮的tool消息会在下轮循环顶部、push新assistant(tool_calls)之前删除（模型已看过）
          }

          // 发送 final
          wss.clients.forEach(wsClient2 => {
            if (wsClient2.readyState === 1) {
              wsClient2.send(JSON.stringify({
                id: fakeReqId,
                type: 'event',
                event: 'chat',
                payload: {
                  state: 'final',
                  message: { content: feishuFullResponse },
                  runId: runId,
                  sessionKey: sessionKey || 'main'
                }
              }));
            }
          });

          // 【记忆】飞书路径也只记大模型最后一句回复
          const cleanFeishuResponse = filterToolBlocks(stripThinking(feishuLastRoundResponse));
          if (cleanFeishuResponse) saveAssistantToMemory(cleanFeishuResponse);

          // 大模型成功回复（飞书），更新存活时间戳
          lastModelMsgTime = Date.now();

          // 【自我进化】飞书回复完成后，通知前端触发自我进化
          wss.clients.forEach(c => {
            if (c.readyState === 1) {
              c.send(JSON.stringify({ type: 'event', event: 'evolution.trigger', payload: { source: 'feishu' } }));
            }
          });

          // 发送回复到飞书（支持文件和图片）
          await sendFeishuReply(larkClient, chat_id, feishuFullResponse);

          console.log('[Feishu] 已回复');
        } catch (error) {
          console.error('[Feishu] 处理消息失败:', error.message);
        }
      }
    })
  });
  
  console.log('[Feishu] 飞书连接已启动');
}
