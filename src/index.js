#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium } from 'playwright';
import XLSX from 'xlsx';
import { writeFileSync, readFileSync } from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import express from 'express';
import cors from 'cors';
import { fileURLToPath, pathToFileURL } from 'url';
import https from 'https';
import http from 'http';
import { execSync } from 'child_process';
import {
  DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE,
  DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE,
  DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE,
  DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE,
  DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE,
  DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE,
  DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE,
  DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE,
  resolveMaterialKeyContentPromptTemplate,
  resolveMaterialKeywordExplainPromptTemplate,
  registerMaterialLibraryRoutes
} from './modules/material-library.js';

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const SHANGHAI_DB_TIME_ZONE = '+08:00';

process.env.TZ = SHANGHAI_TIME_ZONE;

const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

const SHANGHAI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const getFormatterParts = (formatter, date) => Object.fromEntries(
  formatter
    .formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value])
);

const formatShanghaiDateString = (value) => {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const directDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (directDateMatch) {
      return `${directDateMatch[1]}-${directDateMatch[2]}-${directDateMatch[3]}`;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value ? String(value) : null;
  }

  const parts = getFormatterParts(SHANGHAI_DATE_FORMATTER, date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const formatShanghaiTimestampString = (value = new Date()) => {
  if (value === null || value === undefined || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value ? String(value) : null;
  }

  const parts = getFormatterParts(SHANGHAI_DATE_TIME_FORMATTER, date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
};

const formatShanghaiMonthDay = (value) => {
  const dateStr = formatShanghaiDateString(value);
  if (!dateStr) return '';
  const [, month, day] = dateStr.split('-');
  return `${month}-${day}`;
};

const applyShanghaiTimeZoneToConnection = async (connection) => {
  if (!connection || connection.__btShanghaiTimeZoneApplied) {
    return connection;
  }

  await connection.query(`SET time_zone = '${SHANGHAI_DB_TIME_ZONE}'`);
  connection.__btShanghaiTimeZoneApplied = true;
  return connection;
};

export class YuekebaoGrabberServer {
  constructor() {
    this.server = new Server(
      {
        name: "yuekebao-grabber",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize Express app for web dashboard
    this.app = null;
    this.webServer = null;
    this.__filename = fileURLToPath(import.meta.url);
    this.__dirname = path.dirname(this.__filename);

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      if (this.webServer) {
        this.webServer.close();
      }
      process.exit(0);
    });
  }

  // 閫氱敤閲嶈瘯鏈哄埗锛氭娴嬪厓绱犳垨鏁版嵁鏄惁瀛樺湪锛屾渶澶氶噸璇?0娆★紝姣忔闂撮殧10000ms
  async retryWithDetection(detectFunction, description, maxRetries = 10, interval = 10000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await detectFunction();
        if (result !== null && result !== undefined && result !== false) {
          if (attempt > 1) {
            console.log(`检测成功: ${description} - 第 ${attempt} 次尝试成功`);
          }
          return result;
        }

        if (attempt < maxRetries) {
          console.log(`等待重试: ${description} - 第 ${attempt} 次尝试未命中，${interval}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      } catch (error) {
        if (attempt < maxRetries) {
          console.log(`重试异常: ${description} - 第 ${attempt} 次尝试报错: ${error.message}，${interval}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, interval));
        } else {
          console.log(`检测失败: ${description} - 第 ${attempt} 次尝试后仍失败: ${error.message}`);
        }
      }
    }

    console.log(`结束重试: ${description} - 已重试 ${maxRetries} 次，继续后续流程`);
    return null;
  }

  /**
   * 鏅鸿兘绛夊緟鏁版嵁绋冲畾 - 绛夊緟椤甸潰鏁版嵁鍔犺浇瀹屾垚
   * @param {Page} page - Playwright page 瀵硅薄
   * @param {Function} getDataCount - 鑾峰彇鏁版嵁鏁伴噺鐨勫嚱鏁?
   * @param {string} description - 鎻忚堪淇℃伅
   * @param {number} maxWaitTime - 鏈€澶х瓑寰呮椂闂?(ms)
   * @param {number} stableTime - 鏁版嵁绋冲畾鎵€闇€鏃堕棿 (ms)
   * @returns {number} 鏈€缁堟暟鎹暟閲?
   */
  async waitForDataStable(page, getDataCount, description = '鏁版嵁鍔犺浇', maxWaitTime = 10000, stableTime = 1000) {
    const startTime = Date.now();
    let lastCount = -1;
    let stableStartTime = null;

    console.log(`鈴?${description} - 寮€濮嬫櫤鑳界瓑寰呮暟鎹ǔ瀹?..`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const currentCount = await getDataCount();

        if (currentCount === lastCount && currentCount > 0) {
          // 鏁版嵁鏁伴噺娌℃湁鍙樺寲
          if (!stableStartTime) {
            stableStartTime = Date.now();
          } else if (Date.now() - stableStartTime >= stableTime) {
            // 鏁版嵁宸茬ǔ瀹氳冻澶熼暱鏃堕棿
            console.log(`鉁?${description} - 鏁版嵁宸茬ǔ瀹氾紝鍏?${currentCount} 鏉¤褰?(绛夊緟 ${Date.now() - startTime}ms)`);
            return currentCount;
          }
        } else {
          // 鏁版嵁鏁伴噺鍙樺寲浜嗭紝閲嶇疆绋冲畾璁℃椂鍣?
          if (currentCount !== lastCount) {
            console.log(`馃搳 ${description} - 鏁版嵁鍔犺浇涓? ${lastCount} -> ${currentCount}`);
          }
          lastCount = currentCount;
          stableStartTime = null;
        }

        await page.waitForTimeout(200);
      } catch (error) {
        console.log(`鈿狅笍 ${description} - 妫€娴嬪嚭閿? ${error.message}`);
        await page.waitForTimeout(300);
      }
    }

    console.log(`鈴?${description} - 绛夊緟瓒呮椂锛屽綋鍓嶆暟鎹噺: ${lastCount} (宸茬瓑寰?${maxWaitTime}ms)`);
    return lastCount > 0 ? lastCount : 0;
  }

  /**
   * 绛夊緟琛ㄦ牸琛屾暟绋冲畾
   * @param {Page} page - Playwright page 瀵硅薄
   * @param {string} rowSelector - 琛岄€夋嫨鍣?
   * @param {string} description - 鎻忚堪淇℃伅
   * @param {number} maxWaitTime - 鏈€澶х瓑寰呮椂闂?(ms)
   * @returns {number} 绋冲畾鍚庣殑琛屾暟
   */
  async waitForTableRowsStable(page, rowSelector, description = '琛ㄦ牸鏁版嵁', maxWaitTime = 8000) {
    return await this.waitForDataStable(
      page,
      async () => {
        try {
          const rows = await page.$$(rowSelector);
          return rows.length;
        } catch (e) {
          return 0;
        }
      },
      description,
      maxWaitTime,
      800 // 鏁版嵁绋冲畾 800ms 璁や负鍔犺浇瀹屾垚
    );
  }

  async waitForQuickStableCount(page, getDataCount, description = '鏁版嵁鍔犺浇', options = {}) {
    const {
      initialDelay = 450,
      pollDelay = 250,
      maxAttempts = 4
    } = options;

    console.log(`鈴?${description} - 寮€濮嬪揩閫熺瓑寰呮暟鎹埛鏂?..`);

    if (initialDelay > 0) {
      await page.waitForTimeout(initialDelay);
    }

    const readCountSafely = async () => {
      try {
        return await getDataCount();
      } catch (error) {
        console.log(`鈿狅笍 ${description} - 蹇€熸娴嬪嚭閿? ${error.message}`);
        return 0;
      }
    };

    let lastCount = await readCountSafely();
    console.log(`馃搳 ${description} - 蹇€熺瓑寰呭垵濮嬫暟閲? ${lastCount}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await page.waitForTimeout(pollDelay);
      const currentCount = await readCountSafely();

      if (currentCount !== lastCount) {
        console.log(`馃搳 ${description} - 蹇€熷埛鏂? ${lastCount} -> ${currentCount}`);
      }

      if (currentCount > 0 && currentCount === lastCount) {
        console.log(`快速等待完成: ${description}，共 ${currentCount} 条记录`);
        return currentCount;
      }

      lastCount = currentCount;
    }

    console.log(`鈩癸笍 ${description} - 蹇€熺瓑寰呯粨鏉燂紝褰撳墠鏁伴噺: ${lastCount}`);
    return lastCount > 0 ? lastCount : 0;
  }

  async waitForQuickStableCount(page, getDataCount, description = '鏁版嵁鍔犺浇', optionsOrLegacy = {}, legacyStableTime = 600) {
    let options = optionsOrLegacy;
    if (typeof optionsOrLegacy === 'number') {
      options = {
        initialDelay: Math.min(Math.max(Math.floor(legacyStableTime * 0.75), 300), 600),
        pollDelay: 200,
        maxAttempts: Math.min(Math.max(Math.ceil(optionsOrLegacy / 2500), 3), 4)
      };
    }

    const {
      initialDelay = 450,
      pollDelay = 250,
      maxAttempts = 4
    } = options || {};

    console.log(`鈴?${description} - 寮€濮嬪揩閫熺瓑寰呮暟鎹埛鏂?..`);

    if (initialDelay > 0) {
      await page.waitForTimeout(initialDelay);
    }

    const readCountSafely = async () => {
      try {
        return await getDataCount();
      } catch (error) {
        console.log(`鈿狅笍 ${description} - 蹇€熸娴嬪嚭閿? ${error.message}`);
        return 0;
      }
    };

    let lastCount = await readCountSafely();
    console.log(`馃搳 ${description} - 蹇€熺瓑寰呭垵濮嬫暟閲? ${lastCount}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await page.waitForTimeout(pollDelay);
      const currentCount = await readCountSafely();

      if (currentCount !== lastCount) {
        console.log(`馃搳 ${description} - 蹇€熷埛鏂? ${lastCount} -> ${currentCount}`);
      }

      if (currentCount > 0 && currentCount === lastCount) {
        console.log(`快速等待完成: ${description}，共 ${currentCount} 条记录`);
        return currentCount;
      }

      lastCount = currentCount;
    }

    console.log(`鈩癸笍 ${description} - 蹇€熺瓑寰呯粨鏉燂紝褰撳墠鏁伴噺: ${lastCount}`);
    return lastCount > 0 ? lastCount : 0;
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "scrape_yuekebao_courses",
          description: "Login to yuekebao admin and scrape course management data",
          inputSchema: {
            type: "object",
            properties: {
              email: {
                type: "string",
                description: "Login email",
                default: "3kkg7a7k4d66@qq.com"
              },
              password: {
                type: "string",
                description: "Login password",
                default: "flyegg"
              },
              headless: {
                type: "boolean",
                description: "Whether to run browser in headless mode",
                default: false
              },
              timeout: {
                type: "number",
                description: "Page load timeout in milliseconds",
                default: 30000
              }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "scrape_yuekebao_courses") {
        return await this.scrapeYuekebaoCourses(args);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async scrapeYuekebaoCourses(args = {}) {
    const {
      email = "3kkg7a7k4d66@qq.com",
      password = "flyegg",
      headless = false,
      timeout = 30000
    } = args;

    let browser;
    let context;
    let page;

    try {
      // 璁剧疆 Playwright 娴忚鍣ㄨ矾寰勶紙浜戝嚱鏁扮幆澧冿級
      const playwrightBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ||
        process.env.HOME + '/.cache/ms-playwright';
      console.log(`馃搧 Playwright 娴忚鍣ㄨ矾寰? ${playwrightBrowsersPath}`);

      // Launch browser
      browser = await chromium.launch({
        headless, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: undefined, // 璁?Playwright 鑷姩鏌ユ壘
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath
        }
      });

      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true
      });

      page = await context.newPage();
      page.setDefaultTimeout(timeout);

      // 娣诲姞椤甸潰瀵艰埅閲嶈瘯杈呭姪鍑芥暟
      const gotoWithRetry = async (url, options = {}, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`Navigating to ${url}... (灏濊瘯 ${attempt}/${maxRetries})`);
            await page.goto(url, options);
            console.log(`鉁?椤甸潰鍔犺浇鎴愬姛`);
            return;
          } catch (error) {
            console.log(`鉂?椤甸潰鍔犺浇澶辫触 (灏濊瘯 ${attempt}/${maxRetries}): ${error.message}`);
            if (attempt === maxRetries) {
              throw error;
            }
            console.log(`鈴?绛夊緟3绉掑悗閲嶈瘯...`);
            await page.waitForTimeout(3000);
          }
        }
      };

      console.log('Navigating to login page...');

      // Navigate to login page (浣跨敤 domcontentloaded 绛栫暐鏇寸ǔ瀹? 甯﹂噸璇?
      await gotoWithRetry('https://www.yuekebao.cn/admin/login.php', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      console.log('Filling in login form...');

      // Debug: Check page content and available selectors
      const pageContent = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body.innerText.substring(0, 500),
          inputElements: Array.from(document.querySelectorAll('input')).map(input => ({
            name: input.name,
            type: input.type,
            id: input.id,
            className: input.className
          }))
        };
      });

      console.log('Page debug info:', JSON.stringify(pageContent, null, 2));

      // Wait for login form elements
      // 浣跨敤閲嶈瘯鏈哄埗妫€娴嬮偖绠辫緭鍏ユ
      const emailSelector = await this.retryWithDetection(
        async () => {
          try {
            await page.waitForSelector('input[name="email"]', { timeout: 2000 });
            return 'input[name="email"]';
          } catch (error) {
            // 灏濊瘯澶囩敤閫夋嫨鍣?
            const alternativeEmailSelectors = ['#adminEmail', '#email', 'input[type="email"]', 'input[placeholder*="閭"]'];
            for (let selector of alternativeEmailSelectors) {
              try {
                await page.waitForSelector(selector, { timeout: 1000 });
                return selector;
              } catch (altError) {
                // 缁х画灏濊瘯涓嬩竴涓€夋嫨鍣?
              }
            }
            return null;
          }
        },
        '妫€娴嬮偖绠辫緭鍏ユ'
      );

      if (emailSelector) {
        console.log(`鉁?閭杈撳叆妗嗘娴嬫垚鍔? ${emailSelector}`);
      } else {
        console.log('邮箱输入框未命中，继续后续流程');
      }

      // 浣跨敤閲嶈瘯鏈哄埗妫€娴嬪瘑鐮佽緭鍏ユ
      const passwordSelector = await this.retryWithDetection(
        async () => {
          try {
            await page.waitForSelector('input[name="password"]', { timeout: 2000 });
            return 'input[name="password"]';
          } catch (error) {
            // 灏濊瘯澶囩敤閫夋嫨鍣?
            const alternativePasswordSelectors = ['#adminPassword', '#password', 'input[type="password"]', 'input[placeholder*="瀵嗙爜"]'];
            for (let selector of alternativePasswordSelectors) {
              try {
                await page.waitForSelector(selector, { timeout: 1000 });
                return selector;
              } catch (altError) {
                // 缁х画灏濊瘯涓嬩竴涓€夋嫨鍣?
              }
            }
            return null;
          }
        },
        '妫€娴嬪瘑鐮佽緭鍏ユ'
      );

      if (passwordSelector) {
        console.log(`鉁?瀵嗙爜杈撳叆妗嗘娴嬫垚鍔? ${passwordSelector}`);
      } else {
        console.log('密码输入框未命中，继续后续流程');
      }

      // Fill in email and password using detected selectors
      if (emailSelector) {
        await page.fill(emailSelector, email);
        console.log('邮箱已填入');
      }
      if (passwordSelector) {
        await page.fill(passwordSelector, password);
        console.log('密码已填入');
      }

      console.log('Submitting login form to trigger captcha...');

      // Submit the login form first to trigger captcha
      await page.click('#submit');

      console.log('Looking for slider captcha after submit...');

      // Wait for captcha modal to appear (澧炲姞绛夊緟鏃堕棿鍜岄噸璇?
      let captchaAppeared = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`馃攳 灏濊瘯妫€娴嬮獙璇佺爜寮圭獥... (绗?{attempt}/3娆?`);
          // Wait for the verification wrapper to appear
          await page.waitForSelector('#JQ_verify_wrap', { timeout: 12000 });
          console.log('鉁?楠岃瘉鐮佸脊绐楀凡鍑虹幇');
          captchaAppeared = true;
          break;
        } catch (waitError) {
          console.log(`鈿狅笍  绗?{attempt}娆℃娴嬪け璐? ${waitError.message}`);
          if (attempt < 3) {
            console.log('鈴?绛夊緟2绉掑悗閲嶈瘯...');
            await page.waitForTimeout(2000);
            // 灏濊瘯閲嶆柊鐐瑰嚮鎻愪氦鎸夐挳
            try {
              await page.click('#submit');
              console.log('馃攧 閲嶆柊鐐瑰嚮鎻愪氦鎸夐挳浠ヨЕ鍙戦獙璇佺爜');
              await page.waitForTimeout(1000);
            } catch (clickError) {
              console.log(`鈿狅笍  閲嶆柊鐐瑰嚮澶辫触: ${clickError.message}`);
            }
          }
        }
      }

      if (!captchaAppeared) {
        console.log('鉂?楠岃瘉鐮佸脊绐楁湭鍑虹幇,灏濊瘯缁х画鐧诲綍娴佺▼...');
        // 鍙兘涓嶉渶瑕侀獙璇佺爜,缁х画鎵ц
      }

      if (captchaAppeared) {
        console.log('Captcha triggered, looking for slider elements...');

        // Wait a bit more for captcha to fully load
        await page.waitForTimeout(500);

        // Look for the slider elements in the captcha
        const sliderSelectors = [
          '.drag-btn',
          '.dragBtn',
          'span.drag-btn',
          'span.dragBtn',
          '.slide_block',
          '.slider-move',
          '.slider-btn'
        ];

        let sliderHandle = null;
        for (let selector of sliderSelectors) {
          try {
            sliderHandle = await page.waitForSelector(selector, { timeout: 2000 });
            if (sliderHandle) {
              console.log(`Found slider handle with selector: ${selector}`);
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (sliderHandle) {
          console.log('Found slider captcha, attempting to solve...');

          try {
            // Method: Using dragAndDrop with calculated positions
            const dragBtn = await page.$('.drag-btn');
            const wrapper = await page.$('#JQ_verify_wrap');

            if (dragBtn && wrapper) {
              const btnBounds = await dragBtn.boundingBox();
              const wrapperBounds = await wrapper.boundingBox();

              const baseDistance = wrapperBounds.width - btnBounds.width - 10;
              // 浣跨敤鏇存櫤鑳界殑璺濈璁＄畻锛氬熀纭€璺濈 + 闅忔満鍋忕Щ
              const randomOffset = (Math.random() - 0.5) * 20; // -10 鍒?+10 鐨勯殢鏈哄亸绉?
              const slideDistance = baseDistance * (1.35 + Math.random() * 0.1) + randomOffset; // 1.35-1.45鍊嶈窛绂?
              console.log(`Base distance: ${baseDistance}px, Slide distance: ${slideDistance.toFixed(2)}px (offset: ${randomOffset.toFixed(2)}px)`);

              // Use human-like mouse movements instead of dragAndDrop
              const startX = btnBounds.x + btnBounds.width / 2;
              const startY = btnBounds.y + btnBounds.height / 2;
              const endX = btnBounds.x + slideDistance;
              const endY = startY;

              console.log(`Starting human-like drag from (${startX.toFixed(2)}, ${startY.toFixed(2)}) to (${endX.toFixed(2)}, ${endY.toFixed(2)})`);

              // Move to slider handle with slight randomness
              const approachX = startX + (Math.random() - 0.5) * 5; // 鎺ヨ繎鏃舵湁灏忓亸宸?
              const approachY = startY + (Math.random() - 0.5) * 5;
              await page.mouse.move(approachX, approachY, { steps: 8 });
              await page.waitForTimeout(100 + Math.random() * 150);

              // Start dragging
              await page.mouse.down();
              await page.waitForTimeout(80 + Math.random() * 80); // 鎸変笅鍚庣◢浣滃仠椤?

              // 浣跨敤璐濆灏旀洸绾挎ā鎷熸洿鐪熷疄鐨勬嫋鍔ㄨ建杩?
              const totalSteps = 25 + Math.floor(Math.random() * 15); // 25-40姝?

              for (let i = 1; i <= totalSteps; i++) {
                const progress = i / totalSteps;

                // 浣跨敤缂撳姩鍑芥暟锛氬紑濮嬪揩锛屼腑闂存參锛岀粨鏉熸洿鎱?
                let easedProgress;
                if (progress < 0.7) {
                  // 鍓?0%浣跨敤浜屾缂撳姩
                  easedProgress = progress * progress;
                } else {
                  // 鍚?0%鍑忛€?
                  const t = (progress - 0.7) / 0.3;
                  easedProgress = 0.49 + 0.51 * (1 - Math.pow(1 - t, 3));
                }

                const currentX = startX + (endX - startX) * easedProgress;

                // 娣诲姞鍨傜洿鏂瑰悜鐨勯殢鏈烘姈鍔紝妯℃嫙浜虹被涓嶇簿纭殑绉诲姩
                const verticalShake = Math.sin(progress * Math.PI * 3) * 2 + (Math.random() - 0.5) * 4;
                const currentY = startY + verticalShake;

                await page.mouse.move(currentX, currentY);

                // 鍔ㄦ€佸欢杩燂細寮€濮嬪揩锛屼腑闂存參锛岀粨鏉熸渶鎱?
                let delay;
                if (progress < 0.3) {
                  delay = 10 + Math.random() * 15; // 蹇€熷惎鍔?
                } else if (progress < 0.7) {
                  delay = 20 + Math.random() * 25; // 涓棿鍑忛€?
                } else {
                  delay = 35 + Math.random() * 30; // 鎺ヨ繎缁堢偣澶у箙鍑忛€?
                }

                await page.waitForTimeout(delay);
              }

              // Hold at end position with slight adjustment
              const finalX = endX + (Math.random() - 0.5) * 3;
              const finalY = startY + (Math.random() - 0.5) * 2;
              await page.mouse.move(finalX, finalY);
              await page.waitForTimeout(150 + Math.random() * 100);

              // Release
              await page.mouse.up();

              console.log('Slider moved using human-like mouse movements, waiting for validation...');
              await page.waitForTimeout(1000);

              // Check if captcha was successful (澶氭妫€鏌?澧炲姞鎴愬姛鐜?
              let captchaSolved = false;
              for (let checkAttempt = 1; checkAttempt <= 5; checkAttempt++) {
                const successVisible = await page.isVisible('.sucMsg');
                if (successVisible) {
                  console.log(`鉁?Captcha solved successfully! 楠岃瘉閫氳繃 (妫€鏌ョ${checkAttempt}娆?`);
                  captchaSolved = true;
                  break;
                }
                console.log(`鈴?楠岃瘉涓?.. (绗?{checkAttempt}/5娆℃鏌?`);
                await page.waitForTimeout(500);
              }

              if (!captchaSolved) {
                console.log('鈿狅笍  Captcha verification may have failed or still processing');
              }
            }
          } catch (dragError) {
            console.log('DragAndDrop failed:', dragError.message);
          }
        } else {
          console.log('No slider handle found, captcha may need manual completion');
          // Wait for manual completion
          await page.waitForTimeout(10000);
        }
      }

      console.log('Checking login status...');

      console.log('Waiting for login redirect...');

      // Wait for successful login (redirect or page change)
      try {
        await page.waitForURL(/admin\/index\.php|admin\/dashboard|admin\/main/, { timeout: 10000 });
        console.log('Login successful, navigating to course page...');
      } catch (redirectError) {
        // Check if we're still on login page (login failed)
        const currentUrl = page.url();
        if (currentUrl.includes('login.php')) {
          throw new Error('Login failed - still on login page. Please check credentials or captcha.');
        }
        console.log('Continuing despite redirect timeout...');
      }

      const waitForWeeklyCoursePageReady = async (reason = 'initial') => {
        console.log(`Navigating to weekly course management page... (${reason})`);
        await gotoWithRetry('https://www.yuekebao.cn/admin/course.php?dataName=course_week', {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });

        console.log(`Setting up weekly course view... (${reason})`);
        await page.waitForSelector('body', { timeout: 10000 });
        await page.waitForTimeout(500);

        console.log(`鈴憋笍  绛夊緟閬僵灞傛秷澶?.. (${reason})`);
        try {
          await page.waitForFunction(() => {
            const shade = document.querySelector('.layui-layer-shade');
            return !shade || shade.style.display === 'none';
          }, { timeout: 5000 });
          console.log('鉁?閬僵灞傚凡娑堝け');
        } catch (e) {
          console.log('鈿狅笍  閬僵灞傜瓑寰呰秴鏃讹紝缁х画鎵ц');
        }
        await page.waitForTimeout(500);
      };

      const waitForShadeToDisappear = async (reason = 'unknown') => {
        console.log(`鈴憋笍 绛夊緟閬僵灞傛秷澶?.. (${reason})`);
        try {
          await page.waitForFunction(() => {
            const shade = document.querySelector('.layui-layer-shade');
            return !shade || shade.style.display === 'none';
          }, { timeout: 4000 });
          console.log(`鉁?閬僵灞傚凡娑堝け (${reason})`);
        } catch (error) {
          console.log(`鈿狅笍 閬僵灞傜瓑寰呰秴鏃讹紝缁х画鎵ц (${reason}): ${error.message}`);
        }
      };

      const clickWithShadeGuard = async (elementHandle, description, fallbackSelector = null) => {
        await waitForShadeToDisappear(`${description}:before-click`);
        try {
          await elementHandle.click({ timeout: 5000 });
          console.log(`鉁?${description} - Playwright 鐐瑰嚮鎴愬姛`);
          return true;
        } catch (error) {
          console.log(`鈿狅笍 ${description} - Playwright 鐐瑰嚮澶辫触锛屽皾璇曢〉闈㈠唴鍥為€€鐐瑰嚮: ${error.message}`);
          if (!fallbackSelector) {
            throw error;
          }

          const fallbackClicked = await page.evaluate((selector) => {
            const target = document.querySelector(selector);
            if (!target) {
              return false;
            }
            target.click();
            return true;
          }, fallbackSelector);

          if (!fallbackClicked) {
            throw error;
          }

          await page.waitForTimeout(250);
          console.log(`鉁?${description} - 椤甸潰鍐呭洖閫€鐐瑰嚮鎴愬姛`);
          return true;
        }
      };

      await waitForWeeklyCoursePageReady('initial');

      const knownTeacherNames = ['May', 'Angel', 'Anna Rose', 'Diana', 'Jake', 'Jenny', 'Lou', 'Milena', 'Mumu', 'Pearly', 'Shai', 'Gel', 'Hersel'];
      const inspectTeacherDropdownState = async () => {
        return await page.evaluate(() => {
          const selectContainers = Array.from(document.querySelectorAll('.layui-form-select'));
          for (const container of selectContainers) {
            const input = container.querySelector('.layui-select-title input');
            const dropdown = container.querySelector('dl');
            if (!dropdown) continue;

            const options = Array.from(dropdown.querySelectorAll('dd[lay-value]'));
            const allTeacherOption = options.find(option => {
              const layValue = (option.getAttribute('lay-value') || '').trim();
              const text = option.textContent.trim();
              return layValue === '0' && text.includes('鍏ㄩ儴');
            });
            if (!allTeacherOption) continue;

            const selectedOption = options.find(option => option.classList.contains('layui-this'));
            return {
              found: true,
              inputValue: input ? (input.value || '').trim() : '',
              inputPlaceholder: input ? (input.placeholder || '').trim() : '',
              selectedText: selectedOption ? selectedOption.textContent.trim() : '',
              optionText: allTeacherOption.textContent.trim()
            };
          }

          return {
            found: false,
            inputValue: '',
            inputPlaceholder: '',
            selectedText: '',
            optionText: ''
          };
        });
      };
      const detectVisibleTeachers = async () => {
        return await page.evaluate((teacherNames) => {
          const detected = new Set();
          const courseDivs = document.querySelectorAll('td[data-day] div.ft12.position_r.nowrap');
          courseDivs.forEach(courseDiv => {
            const fullCourseText = (courseDiv.textContent || '').replace(/\s+/g, ' ');
            teacherNames.forEach(name => {
              if (fullCourseText.includes(name)) {
                detected.add(name);
              }
            });
          });
          return Array.from(detected);
        }, knownTeacherNames);
      };
      const inspectTeacherFilterState = async () => {
        return await page.evaluate(() => {
          const teacherWrapper = document.querySelector('.layui-input-inline.select_list_2');
          if (!teacherWrapper) {
            return {
              found: false,
              inputValue: '',
              selectedText: '',
              selectedValue: '',
              optionCount: 0
            };
          }

          const formSelect = teacherWrapper.querySelector('.layui-form-select') || teacherWrapper;
          const input = formSelect.querySelector('.layui-select-title input');
          const dropdown = formSelect.querySelector('dl');
          const options = dropdown ? Array.from(dropdown.querySelectorAll('dd[lay-value]')) : [];
          const allTeacherOption = options.find(option => (option.getAttribute('lay-value') || '').trim() === '0');
          const selectedOption = options.find(option => option.classList.contains('layui-this'));

          return {
            found: options.some(option => (option.getAttribute('lay-value') || '').trim() === '0'),
            inputValue: input ? (input.value || '').trim() : '',
            inputPlaceholder: input ? (input.placeholder || '').trim() : '',
            selectedText: selectedOption ? selectedOption.textContent.trim() : '',
            selectedValue: selectedOption ? ((selectedOption.getAttribute('lay-value') || '').trim()) : '',
            optionText: allTeacherOption ? allTeacherOption.textContent.trim() : '',
            optionCount: options.length
          };
        });
      };
      const inspectTeacherFilterDebugInfo = async () => {
        return await page.evaluate(() => {
          const summarizeOptions = (options) => options.slice(0, 12).map(option => ({
            text: (option.textContent || '').trim(),
            layValue: (option.getAttribute('lay-value') || '').trim(),
            className: option.className || ''
          }));

          const summarizeContainer = (container, index) => {
            const input = container.querySelector('.layui-select-title input');
            const dropdown = container.querySelector('dl');
            const options = dropdown ? Array.from(dropdown.querySelectorAll('dd[lay-value]')) : [];
            const selectedOption = options.find(option => option.classList.contains('layui-this'));
            return {
              index,
              className: container.className || '',
              inputValue: input ? (input.value || '').trim() : '',
              inputPlaceholder: input ? (input.placeholder || '').trim() : '',
              selectedText: selectedOption ? (selectedOption.textContent || '').trim() : '',
              optionCount: options.length,
              options: summarizeOptions(options)
            };
          };

          const teacherWrapper = document.querySelector('.layui-input-inline.select_list_2');
          const teacherFormSelect = teacherWrapper
            ? (teacherWrapper.querySelector('.layui-form-select') || teacherWrapper)
            : null;
          const nativeSelect = teacherWrapper ? teacherWrapper.querySelector('select') : null;
          const nativeOptions = nativeSelect
            ? Array.from(nativeSelect.options || []).map(option => ({
                value: (option.value || '').trim(),
                text: (option.textContent || '').trim(),
                selected: !!option.selected
              }))
            : [];
          const allFormSelects = Array.from(document.querySelectorAll('.layui-form-select'));
          const globalOptions = Array.from(document.querySelectorAll('dd[lay-value]'));

          return {
            teacherWrapperFound: !!teacherWrapper,
            teacherWrapperClassName: teacherWrapper ? (teacherWrapper.className || '') : '',
            teacherWrapperHtmlSnippet: teacherWrapper ? teacherWrapper.outerHTML.slice(0, 2000) : '',
            teacherFormSelectClassName: teacherFormSelect ? (teacherFormSelect.className || '') : '',
            nativeSelectFound: !!nativeSelect,
            nativeOptions: nativeOptions.slice(0, 20),
            formSelectCount: allFormSelects.length,
            formSelects: allFormSelects.slice(0, 12).map((container, index) => summarizeContainer(container, index)),
            globalOptionCount: globalOptions.length,
            globalOptions: summarizeOptions(globalOptions),
            bodyTextSnippet: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1200)
          };
        });
      };
      const clearTeacherFilterSearch = async () => {
        return await page.evaluate(() => {
          const teacherWrapper = document.querySelector('.layui-input-inline.select_list_2');
          if (!teacherWrapper) {
            return { cleared: false, previousValue: '', mode: 'wrapper-not-found' };
          }

          const formSelect = teacherWrapper.querySelector('.layui-form-select') || teacherWrapper;
          const input = formSelect.querySelector('.layui-select-title input');
          const dropdown = formSelect.querySelector('dl');
          const previousValue = input ? (input.value || '').trim() : '';

          if (dropdown) {
            dropdown.style.display = 'block';
          }
          formSelect.classList.add('layui-form-selected');

          if (!input) {
            return { cleared: false, previousValue, mode: 'input-not-found' };
          }

          input.focus();
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace' }));
          input.dispatchEvent(new Event('change', { bubbles: true }));

          return {
            cleared: previousValue.length > 0,
            previousValue,
            mode: previousValue.length > 0 ? 'cleared' : 'already-empty'
          };
        });
      };
      const getTeacherFilterOptions = async () => {
        return await page.evaluate(() => {
          const teacherWrapper = document.querySelector('.layui-input-inline.select_list_2');
          if (!teacherWrapper) {
            return [];
          }

          const nativeSelect = teacherWrapper.querySelector('select');
          if (nativeSelect && nativeSelect.options && nativeSelect.options.length > 0) {
            return Array.from(nativeSelect.options)
              .map(option => ({
                value: (option.value || '').trim(),
                text: (option.textContent || '').trim(),
                selected: !!option.selected
              }))
              .filter(option => option.value || option.text)
              .map(option => ({
                ...option,
                isAllOption: option.value === '0' || option.text.includes('鍏ㄩ儴')
              }));
          }

          const dropdownOptions = Array.from(teacherWrapper.querySelectorAll('dd[lay-value]'));
          return dropdownOptions.map(option => ({
            value: (option.getAttribute('lay-value') || '').trim(),
            text: (option.textContent || '').trim(),
            selected: option.classList.contains('layui-this'),
            isAllOption: (option.getAttribute('lay-value') || '').trim() === '0' || (option.textContent || '').includes('鍏ㄩ儴')
          }));
        });
      };
      const selectTeacherFilterOption = async (teacherOption) => {
        if (!teacherOption || !teacherOption.value) {
          return { clicked: false, mode: 'invalid-option', targetText: teacherOption?.text || '' };
        }

        const teacherTitle = await page.$('.layui-input-inline.select_list_2 .layui-select-title');
        if (teacherTitle) {
          await teacherTitle.click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(300);
        }

        return await page.evaluate(({ targetValue, targetText }) => {
          const teacherWrapper = document.querySelector('.layui-input-inline.select_list_2');
          if (!teacherWrapper) {
            return { clicked: false, mode: 'wrapper-not-found', targetText };
          }

          const nativeSelect = teacherWrapper.querySelector('select');
          const formSelect = teacherWrapper.querySelector('.layui-form-select') || teacherWrapper;
          const input = formSelect.querySelector('.layui-select-title input');
          const dropdown = formSelect.querySelector('dl');
          const options = Array.from(teacherWrapper.querySelectorAll('dd[lay-value]'));
          const targetOption = options.find(option => (option.getAttribute('lay-value') || '').trim() === String(targetValue).trim());

          if (dropdown) {
            dropdown.style.display = 'block';
          }
          formSelect.classList.add('layui-form-selected');

          if (nativeSelect) {
            nativeSelect.value = String(targetValue).trim();
            Array.from(nativeSelect.options).forEach(option => {
              option.selected = (option.value || '').trim() === String(targetValue).trim();
            });
            nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }

          options.forEach(option => option.classList.remove('layui-this'));
          if (targetOption) {
            targetOption.classList.add('layui-this');
            targetOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }

          if (input) {
            input.value = targetText || (targetOption ? targetOption.textContent.trim() : '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }

          return {
            clicked: !!targetOption || !!nativeSelect,
            mode: targetOption ? 'dropdown-option' : (nativeSelect ? 'native-select-only' : 'option-not-found'),
            targetText,
            targetValue: String(targetValue).trim()
          };
        }, {
          targetValue: teacherOption.value,
          targetText: teacherOption.text
        });
      };
      const isSpecificTeacherSelected = (state, teacherOption) => {
        const targetValue = String(teacherOption?.value || '').trim();
        const targetText = String(teacherOption?.text || '').trim();
        return (
          ((state.selectedValue || '').trim() === targetValue && targetValue.length > 0) ||
          ((state.selectedText || '').trim() === targetText && targetText.length > 0) ||
          ((state.inputValue || '').trim() === targetText && targetText.length > 0)
        );
      };
      const teacherSelectionStrategies = [
        {
          name: '椤甸潰涓婁笅鏂囩洿杩為€夋嫨',
          run: async () => {
            return await page.evaluate(() => {
              const selectContainers = Array.from(document.querySelectorAll('.layui-form-select'));
              console.log(`Found ${selectContainers.length} layui-form-select elements`);

              for (const container of selectContainers) {
                const dropdown = container.querySelector('dl');
                if (!dropdown) continue;

                const allTeacherOption = dropdown.querySelector('dd[lay-value="0"]');
                if (!allTeacherOption) continue;

                const optionText = allTeacherOption.textContent.trim();
                if (!(optionText === '鍏ㄩ儴鑰佸笀' || optionText.includes('鍏ㄩ儴'))) continue;

                container.classList.add('layui-form-selected');
                dropdown.style.display = 'block';
                allTeacherOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return { clicked: true, optionText, mode: 'dispatch-click' };
              }

              return { clicked: false, optionText: '', mode: 'option-not-found' };
            });
          }
        },
        {
          name: '瀹氬悜鐐瑰嚮 select_list_2',
          run: async () => {
            const teacherTitle = await page.$('.layui-input-inline.select_list_2 .layui-select-title');
            if (!teacherTitle) {
              return { clicked: false, optionText: '', mode: 'title-not-found' };
            }

            await teacherTitle.click({ timeout: 3000 });
            await page.waitForTimeout(300);

            return await page.evaluate(() => {
              const teacherWrapper = document.querySelector('.layui-input-inline.select_list_2');
              if (!teacherWrapper) {
                return { clicked: false, optionText: '', mode: 'wrapper-not-found' };
              }

              const formSelect = teacherWrapper.querySelector('.layui-form-select') || teacherWrapper;
              const dropdown = formSelect.querySelector('dl');
              const options = Array.from(teacherWrapper.querySelectorAll('dd[lay-value]'));
              const allTeacherOption = options.find(option => {
                const layValue = (option.getAttribute('lay-value') || '').trim();
                return layValue === '0';
              });

              if (!allTeacherOption) {
                return { clicked: false, optionText: '', mode: 'option-not-found' };
              }

              if (dropdown) {
                dropdown.style.display = 'block';
              }
              formSelect.classList.add('layui-form-selected');
              allTeacherOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              return { clicked: true, optionText: allTeacherOption.textContent.trim(), mode: 'dispatch-click' };
            });
          }
        },
        {
          name: '鍘熺敓 select 鍥為€€',
          run: async () => {
            return await page.evaluate(() => {
              const teacherWrapper = document.querySelector('.layui-input-inline.select_list_2');
              if (!teacherWrapper) {
                return { clicked: false, optionText: '', mode: 'wrapper-not-found' };
              }

              const nativeSelect = teacherWrapper.querySelector('select');
              const formSelect = teacherWrapper.querySelector('.layui-form-select') || teacherWrapper;
              const input = formSelect.querySelector('.layui-select-title input');
              const options = Array.from(teacherWrapper.querySelectorAll('dd[lay-value]'));
              const allTeacherOption = options.find(option => {
                const layValue = (option.getAttribute('lay-value') || '').trim();
                return layValue === '0';
              });

              if (!allTeacherOption) {
                return { clicked: false, optionText: '', mode: 'option-not-found' };
              }

              if (nativeSelect) {
                nativeSelect.value = '0';
                nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
              }

              options.forEach(option => option.classList.remove('layui-this'));
              allTeacherOption.classList.add('layui-this');
              if (input) {
                input.value = allTeacherOption.textContent.trim();
              }

              return {
                clicked: !!nativeSelect,
                optionText: allTeacherOption.textContent.trim(),
                mode: nativeSelect ? 'native-select' : 'mirror-only'
              };
            });
          }
        }
      ];
      const isTeacherFilterAllSelected = (state) => {
        const displayTexts = [
          state.selectedText,
          state.inputValue,
          state.inputPlaceholder,
          state.optionText
        ].map(text => (text || '').trim());

        return (
          (state.selectedValue || '').trim() === '0' ||
          displayTexts.some(text => text.includes('鍏ㄩ儴'))
        );
      };
      const isTeacherSelectionConfirmed = (state, visibleTeachers) => {
        if (isTeacherFilterAllSelected(state)) {
          return true;
        }

        return Array.isArray(visibleTeachers) && visibleTeachers.length > 1;
      };

      // 浣跨敤 JavaScript 鐩存帴閫夋嫨鈥滃叏閮ㄨ€佸笀鈥濓紝骞舵樉寮忔牎楠岄伩鍏嶈鎶撳崟涓€佸笀鐨勬暟鎹?      console.log('Selecting all teachers from layui dropdown...');
      let teacherSelectionConfirmed = false;
      let useTeacherIterationFallback = false;
      let teacherIterationOptions = [];
      let lastTeacherSelectionState = await inspectTeacherFilterState();
      let lastVisibleTeachers = await detectVisibleTeachers();
      let teacherFilterOptions = await getTeacherFilterOptions();
      const initialTeacherFilterDebugInfo = await inspectTeacherFilterDebugInfo();
      console.log(`馃И 鑰佸笀绛涢€夊垵濮嬭瘖鏂? ${JSON.stringify(initialTeacherFilterDebugInfo)}`);
      console.log(`馃И 鑰佸笀绛涢€夐€夐」: ${JSON.stringify(teacherFilterOptions)}`);
      const initialClearResult = await clearTeacherFilterSearch();
      if (initialClearResult.cleared) {
        console.log(`馃Ч 宸叉竻绌鸿€佸笀绛涢€夋绱㈣瘝: "${initialClearResult.previousValue}"`);
        await page.waitForTimeout(600);
        lastTeacherSelectionState = await inspectTeacherFilterState();
        lastVisibleTeachers = await detectVisibleTeachers();
      }

      if (isTeacherSelectionConfirmed(lastTeacherSelectionState, lastVisibleTeachers)) {
        teacherSelectionConfirmed = true;
        console.log(`已确认全老师视图: input="${lastTeacherSelectionState.inputValue}", selected="${lastTeacherSelectionState.selectedText}", visibleTeachers=${lastVisibleTeachers.join(', ') || '无'}`);
      } else {
        console.log(`鈿狅笍  褰撳墠鏈€変腑鈥滃叏閮ㄨ€佸笀鈥濓紝寮€濮嬪皾璇曞垏鎹? input="${lastTeacherSelectionState.inputValue}", selected="${lastTeacherSelectionState.selectedText}"`);

        for (const attempt of teacherSelectionStrategies) {
          try {
            const clearResult = await clearTeacherFilterSearch();
            if (clearResult.cleared) {
              console.log(`馃Ч 鑰佸笀绛涢€夊皾璇曞墠娓呯┖妫€绱㈣瘝[${attempt.name}]: "${clearResult.previousValue}"`);
              await page.waitForTimeout(400);
            }

            const attemptResult = await attempt.run();
            console.log(`馃幆 鑰佸笀绛涢€夊皾璇昜${attempt.name}]: clicked=${attemptResult.clicked} option="${attemptResult.optionText || ''}"`);

            if (attemptResult.clicked) {
              await page.waitForTimeout(1200);
            }

            lastTeacherSelectionState = await inspectTeacherFilterState();
            lastVisibleTeachers = await detectVisibleTeachers();
            console.log(`老师筛选状态: input="${lastTeacherSelectionState.inputValue}", selected="${lastTeacherSelectionState.selectedText}", visibleTeachers=${lastVisibleTeachers.join(', ') || '无'}`);

            if (isTeacherSelectionConfirmed(lastTeacherSelectionState, lastVisibleTeachers)) {
              teacherSelectionConfirmed = true;
              break;
            }
          } catch (attemptError) {
            console.log(`鈿狅笍  鑰佸笀绛涢€夊皾璇昜${attempt.name}]澶辫触: ${attemptError.message}`);
          }
        }
      }

      if (!teacherSelectionConfirmed) {
        const failureTeacherFilterDebugInfo = await inspectTeacherFilterDebugInfo();
        console.log(`馃И 鑰佸笀绛涢€夊け璐ヨ瘖鏂? ${JSON.stringify(failureTeacherFilterDebugInfo)}`);
        teacherFilterOptions = await getTeacherFilterOptions();
        teacherIterationOptions = teacherFilterOptions.filter(option => !option.isAllOption && option.value && option.text);
        if (!teacherFilterOptions.some(option => option.isAllOption) && teacherIterationOptions.length > 1) {
          useTeacherIterationFallback = true;
          console.log(`鈩癸笍 褰撳墠璐﹀彿涓嬫媺妗嗘棤鈥滃叏閮ㄨ€佸笀鈥濋€夐」锛屽垏鎹负閫愯€佸笀鎶撳彇妯″紡: ${teacherIterationOptions.map(option => option.text).join(', ')}`);
        } else {
          throw new Error(`未能确认切换到“全部老师”视图（当前显示="${lastTeacherSelectionState.inputValue || lastTeacherSelectionState.selectedText || '未知'}"，可见老师=${lastVisibleTeachers.join(', ') || '无'}），已终止抓取以避免覆盖数据库`);
        }
      }

      if (useTeacherIterationFallback) {
        console.log('鉁?宸插惎鐢ㄩ€愯€佸笀鎶撳彇妯″紡');
      } else {
        console.log('已确认切换到“全部老师”视图');
        await page.waitForTimeout(1000); // 绛夊緟鏁版嵁鍒锋柊
      }

      const collectCoursesForCurrentTeacherScope = async (teacherScopeLabel = '鍏ㄩ儴鑰佸笀') => {
      console.log(`Extracting course data from weekly periods... [${teacherScopeLabel}]`);

      // Function to extract course data from current weekly view
      const extractWeeklyData = async (weekIndex) => {
        return await page.evaluate((weekIdx) => {
          const courses = [];

          console.log(`Extracting data for week ${weekIdx}...`);

          // Extract date information from table headers
          const dateHeaders = {};
          const headerCells = document.querySelectorAll('th.nowrap.td_top.ft16, th.nowrap.td_top');
          console.log(`Found ${headerCells.length} header cells`);

          headerCells.forEach((header, colIndex) => {
            const headerDiv = header.querySelector('div');
            if (headerDiv) {
              const headerText = headerDiv.innerText.trim();
              console.log(`Header ${colIndex}: "${headerText}"`);

              // Extract date from header like "09-22\n鍛ㄤ竴"
              const dateMatch = headerText.match(/(\d{2}-\d{2})/);
              if (dateMatch) {
                const dateStr = dateMatch[1];
                const currentYear = new Date().getFullYear();
                const [month, day] = dateStr.split('-');
                const fullDate = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

                dateHeaders[colIndex] = fullDate;
                console.log(`  鈫?Date for column ${colIndex}: ${fullDate}`);
              }
            }
          });

          // Find all table cells with course data
          const courseCells = document.querySelectorAll('td[data-day]');
          console.log(`Found ${courseCells.length} course cells`);

          courseCells.forEach((cell, cellIndex) => {
            // Get date from data-day attribute
            const dataDay = cell.getAttribute('data-day');
            if (!dataDay) return;

            // Find all course divs in this cell (there can be multiple)
            const courseDivs = cell.querySelectorAll('div.ft12.position_r.nowrap');
            if (courseDivs.length === 0) {
              console.log(`Cell ${cellIndex}: Empty (no course content)`);
              return;
            }

            console.log(`Cell ${cellIndex} (${dataDay}): Processing ${courseDivs.length} course(s)`);

            // 璇婃柇锛氫繚瀛樼涓€涓绋嬬殑HTML鏍锋湰
            let htmlDiagnostic = null;
            if (cellIndex === 0 && courseDivs.length > 0) {
              htmlDiagnostic = {
                outerHTML: courseDivs[0].outerHTML.substring(0, 2000),
                innerText: courseDivs[0].innerText
              };
            }

            // Process each course div separately
            courseDivs.forEach((courseDiv, courseIndex) => {
              console.log(`  Course ${courseIndex + 1}/${courseDivs.length}:`);

              // 淇濆瓨HTML璇婃柇淇℃伅鍒扮涓€涓绋?
              let courseHtmlSample = null;
              if (cellIndex === 0 && courseIndex === 0) {
                courseHtmlSample = htmlDiagnostic;
              }

              // Extract teacher from the teacher div
              let teacher = '';

              // 瀹屾暣鐨勮€佸笀鍒楄〃锛堝寘鎷墍鏈夊彲鑳界殑鑰佸笀鍚嶏級
              const possibleTeachers = ['May', 'Angel', 'Anna Rose', 'Diana', 'Jake', 'Jenny', 'Lou', 'Milena', 'Mumu', 'Pearly', 'Shai', 'Gel', 'Hersel'];

              // 鏂规硶1: 浠庢暣涓绋媎iv鐨則extContent涓洿鎺ユ悳绱㈣€佸笀鍚?
              // 娉ㄦ剰锛氫娇鐢╰extContent鑰屼笉鏄痠nnerText锛屽洜涓鸿€佸笀鍚嶅彲鑳藉湪闅愯棌鐨刣iv涓紙display:none锛?
              const fullCourseText = courseDiv.textContent;
              for (let t of possibleTeachers) {
                if (fullCourseText.includes(t)) {
                  teacher = t;
                  console.log(`    鈫?Teacher found in full text: ${teacher}`);
                  break;
                }
              }

              // 鏂规硶2: 濡傛灉鏂规硶1娌℃壘鍒帮紝灏濊瘯鐗瑰畾閫夋嫨鍣?
              if (!teacher) {
                // Try multiple selectors to handle different teacher HTML structures
                // 娉ㄦ剰: 鎺掗櫎瀛︾敓div (textEllipsis_1)锛屽彧鍖归厤绮剧‘鐨則extEllipsis绫?
                let teacherDiv = courseDiv.querySelector('div.memberCon div.textEllipsis');
                if (!teacherDiv) {
                  // Alternative selector for special status teachers like Gel
                  teacherDiv = courseDiv.querySelector('div.ft12.color_9.textEllipsis');
                }
                if (!teacherDiv) {
                  // 鏇寸簿纭殑閫夋嫨鍣紝鎺掗櫎瀛︾敓淇℃伅div锛坈lass鍖呭惈textEllipsis_1鐨勶級
                  const allTextEllipsis = courseDiv.querySelectorAll('div[class*="textEllipsis"]');
                  for (let div of allTextEllipsis) {
                    // 鎺掗櫎瀛︾敓div锛坈lass鍖呭惈textEllipsis_1锛?
                    if (!div.className.includes('textEllipsis_1')) {
                      teacherDiv = div;
                      break;
                    }
                  }
                }

                if (teacherDiv) {
                  const teacherText = teacherDiv.innerText.trim().replace(/\s+/g, ' ');
                  for (let t of possibleTeachers) {
                    if (teacherText.includes(t)) {
                      teacher = t;
                      break;
                    }
                  }
                  if (!teacher && teacherText) {
                    // 鏂拌€佸笀鍚嶄笉鍦ㄧ櫧鍚嶅崟鏃讹紝淇濈暀椤甸潰涓婄殑鍘熷鑰佸笀鏂囨湰锛岄伩鍏嶆暣鏉¤褰曚涪澶辫€佸笀淇℃伅
                    teacher = teacherText;
                  }
                  console.log(`    -> Teacher from div: ${teacher || '未找到'} (text: "${teacherText}")`);
                }
              }

              // 濡傛灉浠嶇劧娌℃壘鍒拌€佸笀锛岃褰曡鍛婁絾涓嶄娇鐢ㄦ湭鐭ユ枃鏈綔涓鸿€佸笀鍚?
              if (!teacher) {
                console.log(`    鈫?鈿狅笍 Warning: No teacher found for this course`);
              }

              // Extract student from the student div
              let student = '';
              const studentDiv = courseDiv.querySelector('div.clearfix div.textEllipsis_1.f_L.m_w_max');
              if (studentDiv) {
                // 鏍囧噯鍖栫┖鏍硷細灏嗗涓繛缁┖鏍兼浛鎹负鍗曚釜绌烘牸
                student = studentDiv.innerText.trim().replace(/\s+/g, ' ');
                console.log(`    鈫?Student: ${student}`);
              }

              // Extract deduction count from badge
              let deduction = '1'; // default
              const deductionSpan = courseDiv.querySelector('span.layui-badge-rim');
              if (deductionSpan) {
                const deductText = deductionSpan.innerText.trim();
                const deductMatch = deductText.match(/(\d+)/);
                if (deductMatch) {
                  deduction = deductMatch[1];
                }
                console.log(`    鈫?Deduction: ${deduction}`);
              }

              // Extract time from the time div (usually at the bottom)
              let time = '';
              const timeDivs = courseDiv.querySelectorAll('div.ft12');
              timeDivs.forEach(div => {
                const text = div.innerText.trim();
                const timeMatch = text.match(/(\d{2}:\d{2}-\d{2}:\d{2})/);
                if (timeMatch) {
                  time = timeMatch[1];
                }
              });
              console.log(`    鈫?Time: ${time}`);

              // Extract course type by analyzing div.ft12 elements
              let courseType = '';

              // 棣栧厛鐩存帴鏌ユ壘鍖呭惈璇剧▼绫诲瀷鐨?ft12 div
              const ft12Divs = courseDiv.querySelectorAll('div.ft12');
              for (const div of ft12Divs) {
                const text = div.innerText.trim();
                // 妫€鏌ユ槸鍚︽槸璇剧▼绫诲瀷鏍囪锛堜笉鏄椂闂达級
                if (!text.match(/\d{2}:\d{2}-\d{2}:\d{2}/) && !text.match(/\d+人/) && text.length > 0 && text.length < 20) {
                  // 鍙兘鐨勮绋嬬被鍨? "璇曡", "鑿叉暀25鍒嗛挓", "鑿叉暀50鍒嗛挓", "娆ф暀25鍒嗛挓", "娆ф暀50鍒嗛挓"
                  if (text.includes('璇曡') || text.includes('trial') || text.includes('璇曞惉')) {
                    courseType = '璇曡';
                    break;
                  } else if (text.includes('鑿叉暀')) {
                    courseType = '鑿叉暀';
                    break;
                  } else if (text.includes('娆ф暀')) {
                    courseType = '娆ф暀';
                    break;
                  } else if (text.includes('涓€瀵瑰')) {
                    courseType = '涓€瀵瑰';
                    break;
                  }
                }
              }

              // 濡傛灉娌℃湁浠?ft12 div 涓壘鍒帮紝鍥為€€鍒版鏌ユ暣涓枃鏈?
              if (!courseType) {
                const courseText = courseDiv.innerText.toLowerCase();

                // Check for trial class indicators (璇曡)
                if (courseText.includes('璇曡') || courseText.includes('trial') || courseText.includes('璇曞惉')) {
                  courseType = '璇曡';
                }
                // Check for other course type indicators
                else if (courseText.includes('鑿叉暀') || courseText.includes('filipino')) {
                  courseType = '鑿叉暀';
                }
                else if (courseText.includes('娆ф暀') || courseText.includes('european')) {
                  courseType = '娆ф暀';
                }
                else if (courseText.includes('涓€瀵瑰') || courseText.includes('group')) {
                  courseType = '涓€瀵瑰';
                }
                // Check teacher nationality as fallback
                else if (teacher) {
                  const filipinoTeachers = ['May', 'Angel', 'Diana', 'Jake', 'Jenny', 'Lou', 'Milena', 'Mumu', 'Pearly', 'Shai', 'Hersel'];
                  const europeanTeachers = ['Anna Rose', 'Gel'];

                  if (filipinoTeachers.includes(teacher)) {
                    courseType = '鑿叉暀';
                  } else if (europeanTeachers.includes(teacher)) {
                    courseType = '娆ф暀';
                  } else {
                    courseType = '鍏朵粬';
                  }
                }
              }

              console.log(`    鈫?Course Type: ${courseType}`);

              // Include all courses including trial classes (璇曡)
              if (teacher || student || time) {
                const courseInfo = {
                  weekIndex: weekIdx,
                  cellIndex: `cell-${cellIndex}-course-${courseIndex}`,
                  date: dataDay,
                  time: time || '',
                  teacher: teacher || '',
                  student: student || '',
                  deduction: deduction,
                  courseType: courseType || '鏈煡'
                };

                courses.push(courseInfo);

                // Output course info in requested format
                const courseOutput = `${dataDay} ${time || '鏈煡鏃堕棿'} ${teacher || '鏈煡鑰佸笀'} ${student || '鏈煡瀛︾敓'} ${deduction} [${courseType || '鏈煡绫诲瀷'}]`;
                console.log(`馃搮 璇捐〃淇℃伅: ${courseOutput}`);
              }
            });
          });

          return courses;
        }, weekIndex);
      };


      // First, try to access previous week data via dropdown
      console.log('馃攳 灏濊瘯鑾峰彇涓婂懆鏁版嵁...');
      let previousWeekData = [];

      try {
        // Look for the layui-unselect dropdown first
        console.log('馃攳 瀵绘壘 layui-unselect 涓嬫媺妗?..');

        const layuiUnselectDropdown = await page.$('.layui-unselect');
        if (layuiUnselectDropdown) {
      console.log('已找到 layui-unselect 下拉框');

          // Click the layui-unselect dropdown to open it
          console.log('馃柋锔?鐐瑰嚮 layui-unselect 涓嬫媺妗?..');
          await layuiUnselectDropdown.click();
          await page.waitForTimeout(300);

          // Look for the first option with lay-value="-1"
          console.log('馃攳 瀵绘壘 lay-value="-1" 鐨勯€夐」...');
          const pastWeekSelected = await page.evaluate(() => {
            // Look for dropdown options with lay-value="-1"
            const options = document.querySelectorAll('dd[lay-value]');
            console.log(`鎵惧埌 ${options.length} 涓笅鎷夐€夐」`);

            // List all options for debugging
            options.forEach((option, index) => {
              const text = option.textContent.trim();
              const layValue = option.getAttribute('lay-value');
              console.log(`閫夐」 ${index}: "${text}" (lay-value="${layValue}")`);
            });

            // Look for the FIRST option with lay-value="-1" (most recent past week)
            const targetOption = document.querySelector('dd[lay-value="-1"]');
            if (targetOption) {
              const text = targetOption.textContent.trim();
              console.log(`鉁?鎵惧埌绗竴涓?lay-value="-1" 閫夐」: ${text}`);
              targetOption.click();
              return text;
            }

            console.log('鈿狅笍 鏈壘鍒?lay-value="-1" 鐨勯€夐」');
            return null;
          });

          if (pastWeekSelected) {
            console.log(`鉁?宸查€夋嫨涓婂懆: ${pastWeekSelected}`);
            await page.waitForTimeout(750);
            console.log('馃搳 寮€濮嬫姄鍙栦笂鍛ㄨ琛ㄦ暟鎹?..');

            // Extract previous week data
            previousWeekData = await extractWeeklyData(-1);

            // 馃攳 HTML璇婃柇锛氳幏鍙栫涓€涓绋嬪崟鍏冩牸鐨凥TML缁撴瀯
            const htmlDiagnostic = await page.evaluate(() => {
              const courseCells = document.querySelectorAll('td[data-day]');
              for (let cell of courseCells) {
                const courseDivs = cell.querySelectorAll('div.ft12.position_r.nowrap');
                if (courseDivs.length > 0) {
                  return {
                    dataDay: cell.getAttribute('data-day'),
                    courseDivHTML: courseDivs[0].outerHTML,
                    courseDivText: courseDivs[0].innerText,
                    allChildDivs: Array.from(courseDivs[0].querySelectorAll('div')).map(div => ({
                      className: div.className,
                      text: div.innerText.substring(0, 150)
                    }))
                  };
                }
              }
              return null;
            });

            if (htmlDiagnostic) {
              console.log('\n馃攳 ========== HTML璇婃柇缁撴灉 ==========');
              console.log('鏃ユ湡:', htmlDiagnostic.dataDay);
              console.log('\n--- 璇剧▼div鐨凥TML ---');
              console.log(htmlDiagnostic.courseDivHTML);
              console.log('\n--- 璇剧▼div鐨刬nnerText ---');
              console.log(htmlDiagnostic.courseDivText);
              console.log('\n--- 鎵€鏈夊瓙div ---');
              htmlDiagnostic.allChildDivs.forEach((div, i) => {
                console.log(`${i + 1}. class="${div.className}" text="${div.text}"`);
              });
              console.log('馃攳 ========== HTML璇婃柇缁撴潫 ==========\n');
            }

            if (previousWeekData.length > 0) {
              // Add week information to each course
              previousWeekData.forEach((course, index) => {
                course.globalIndex = index + 1;
                course.weekText = pastWeekSelected;
                course.weekId = 'previous_week';
                course.weekIndex = -1;
              });
              console.log(`上周数据获取成功: ${previousWeekData.length} 条记录`);
            } else {
              console.log('鈿狅笍 涓婂懆鏆傛棤璇剧▼鏁版嵁');
            }
          } else {
            console.log('鈿狅笍 鏈壘鍒颁笂鍛ㄦ暟鎹€夐」');
          }
        } else {
      console.log('未找到 layui-unselect 下拉框');
        }
      } catch (prevWeekError) {
        console.log('鈿狅笍 鑾峰彇涓婂懆鏁版嵁澶辫触:', prevWeekError.message);
      }

      // Reset to current/future weeks view
      console.log('馃攧 鍒囨崲鍥炲綋鍓?鏈潵鍛ㄨ琛ㄨ鍥?..');
      try {
        // Find the layui-unselect dropdown again
        const layuiUnselectDropdown = await page.$('.layui-unselect');
        if (layuiUnselectDropdown) {
          await layuiUnselectDropdown.click();
          await page.waitForTimeout(750);

          // Look for current/future weeks option (typically lay-value="0" or positive values)
          const currentViewSelected = await page.evaluate(() => {
            // Try to find lay-value="0" first (usually current period)
            const currentOption = document.querySelector('dd[lay-value="0"]');
            if (currentOption) {
              const text = currentOption.textContent.trim();
              console.log(`鍒囨崲鍥炲綋鍓嶈鍥? ${text} (lay-value="0")`);
              currentOption.click();
              return true;
            }

            // Fallback: find the first option with positive or zero lay-value
            const options = document.querySelectorAll('dd[lay-value]');
            for (let option of options) {
              const layValue = option.getAttribute('lay-value');
              if (layValue && parseInt(layValue) >= 0) {
                const text = option.textContent.trim();
                console.log(`鍒囨崲鍥炲綋鍓嶈鍥? ${text} (lay-value="${layValue}")`);
                option.click();
                return true;
              }
            }

        console.log('未找到当前视图选项，保持当前状态');
            return false;
          });

          if (currentViewSelected) {
            await page.waitForTimeout(300);
      console.log('已切换回当前周课表视图');
          }
        }
      } catch (resetError) {
        console.log('鈿狅笍 鍒囨崲鍥炲綋鍓嶈鍥惧け璐ワ紝缁х画鎶撳彇褰撳墠鏁版嵁:', resetError.message);
      }

      // Get all available weekly buttons (only valid week period buttons)
      const weeklyButtons = await page.evaluate(() => {
        const buttons = [];

        // Look for weekly navigation buttons with IDs like week_str_id_0, week_str_id_1, etc.
        for (let i = 0; i < 20; i++) { // Check up to 20 weeks
          const button = document.querySelector(`#week_str_id_${i}`);
          if (button) {
            buttons.push({
              id: `week_str_id_${i}`,
              index: i,
              text: button.textContent.trim()
            });
          }
        }

        // Also look for negative week IDs (historical periods)
        for (let i = -1; i >= -50; i--) { // Check up to 50 historical weeks
          const button = document.querySelector(`#week_str_id_${i}`);
          if (button) {
            buttons.push({
              id: `week_str_id_${i}`,
              index: i,
              text: button.textContent.trim()
            });
          }
        }

        // Filter out non-week period buttons
        return buttons.filter(btn => {
          const text = btn.text.toLowerCase();
          const id = btn.id.toLowerCase();

          // Exclude specific IDs that are not week periods
          const excludeIds = [
            '__day_week_select_con', // Single day buttons
            'set_course_week_btn_con', // Function buttons like "鐙掔嫆璇?
            'week_array_con', // Week array container
            'search_week_id', // Search elements
            'week_array_old', // Historical week container
            'week_array_next' // Future week container
          ];

          if (excludeIds.includes(id)) {
            console.log(`Excluding non-week button: ${id} (${text})`);
            return false;
          }

          // Only include buttons that look like week periods (MM.DD-MM.DD format)
          const isWeekPeriod = /\d{1,2}\.\d{1,2}-\d{1,2}\.\d{1,2}/.test(text) ||
                              /\d{4}骞碶s*\d{1,2}\.\d{1,2}-\d{1,2}\.\d{1,2}/.test(text);

          if (!isWeekPeriod) {
            console.log(`Excluding non-week-format button: ${id} (${text})`);
            return false;
          }

          return true;
        });
      });

      console.log(`Found ${weeklyButtons.length} weekly periods to scrape:`, weeklyButtons.map(b => `${b.id}: ${b.text}`));

      // Filter weekly buttons to only include current time + 3 months (to capture all relevant weeks)
      const today = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(today.getMonth() + 3);
      threeMonthsLater.setDate(threeMonthsLater.getDate() + 7); // Add extra days to ensure we don't miss weeks

      const filteredWeeklyButtons = weeklyButtons.filter(weekButton => {
        // Include week buttons with IDs from -50 to 7
        // Negative IDs represent historical weeks, 0-7 are current/future weeks
        const isValidWeekId = /^week_str_id_(-[1-9]|-[1-4][0-9]|-50|[0-7])$/.test(weekButton.id);
        if (!isValidWeekId) {
          console.log(`Skipping week "${weekButton.text}" (${weekButton.id}) - ID out of valid range (-50 to 7)`);
          return false;
        }

        // Parse the week text to extract date information
        const text = weekButton.text;

        // Handle different date formats in the week text
        let weekEndDate = null;

        // Format: "MM.DD-MM.DD" or "YYYY骞?MM.DD-MM.DD"
        const dateMatch = text.match(/(\d{4}骞碶s*)?(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
        if (dateMatch) {
          const [, yearPart, startMonth, startDay, endMonth, endDay] = dateMatch;

          let year = today.getFullYear();
          if (yearPart) {
            year = parseInt(yearPart.replace(/\D/g, ''), 10);
          }

          // Use the end date of the week range
          weekEndDate = new Date(year, parseInt(endMonth) - 1, parseInt(endDay));

          // Handle year transition (if end month is smaller than start month, it's next year)
          if (parseInt(endMonth) < parseInt(startMonth) && !yearPart) {
            // Only adjust year if no explicit year was provided
            weekEndDate.setFullYear(year + 1);
          }

          console.log(`Parsed week "${text}": end date = ${formatShanghaiDateString(weekEndDate)}`);
        }

        // If we couldn't parse the date, include it for safety (might be current weeks)
        if (!weekEndDate) {
          console.log(`Could not parse date from: "${text}", including for safety`);
          return true;
        }

        // Only include weeks that are within the range: 3 weeks ago to 3 months from now
        const withinFutureRange = weekEndDate <= threeMonthsLater;
        // 鍏佽杩囧幓3鍛ㄧ殑鏁版嵁锛岀敤浜庢樉绀?涔嬪墠璇捐妭"鍜岀‘淇濆伐璧勮绠楃殑瀹屾暣鑷劧鍛ㄦ暟鎹?
        const threeWeeksAgo = new Date(today);
        threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
        const notTooOld = weekEndDate >= threeWeeksAgo;

        if (!withinFutureRange) {
          console.log(`Skipping week "${text}" (ends ${formatShanghaiDateString(weekEndDate)}) - beyond 3 month limit`);
          return false;
        }

        if (!notTooOld) {
          console.log(`Skipping week "${text}" (ends ${formatShanghaiDateString(weekEndDate)}) - older than 3 weeks`);
          return false;
        }

        return true;
      });

      console.log(`Filtered to ${filteredWeeklyButtons.length} weeks within 3 months from today (${formatShanghaiDateString(today)} to ${formatShanghaiDateString(threeMonthsLater)})`);
      console.log(`Weeks to process:`, filteredWeeklyButtons.map(b => b.text));

      // Extract data from filtered weekly periods
      let allCourses = [];
      let weekCount = 0;
      let processedWeekIds = new Set(); // Track processed week IDs to avoid duplicates

      // Add previous week data first if available
      if (previousWeekData.length > 0) {
        console.log(`\n追加上周数据: ${previousWeekData.length} 条记录`);
        allCourses = allCourses.concat(previousWeekData);
        weekCount++; // Count previous week as one of the processed weeks
      }

      for (const weekButton of filteredWeeklyButtons) {
        try {
          // Parse week date range for better feedback
          const weekText = weekButton.text;
          let weekDateRange = '';

          const dateMatch = weekText.match(/(\d{4}骞碶s*)?(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
          if (dateMatch) {
            const [, yearPart, startMonth, startDay, endMonth, endDay] = dateMatch;
            let year = new Date().getFullYear();
            if (yearPart) {
            year = parseInt(yearPart.replace(/\D/g, ''), 10);
            }
            weekDateRange = `${year}-${startMonth.padStart(2, '0')}-${startDay.padStart(2, '0')} 鍒?${year}-${endMonth.padStart(2, '0')}-${endDay.padStart(2, '0')}`;
          }

          console.log(`\n馃棑锔? 鐐瑰嚮鍛ㄦ湡鎸夐挳: ${weekButton.text}`);
          if (weekDateRange) {
            console.log(`馃搮 鏃ユ湡鑼冨洿: ${weekDateRange}`);
          }
          console.log(`馃幆 寮€濮嬫彁鍙栫${weekButton.index + 1}涓懆鏈熺殑鏁版嵁...`);

          // Track if we successfully selected a historical week from dropdown
          let historicalWeekSelected = false;

          // If this is a historical week (negative index), select it from the dropdown
          if (weekButton.index < 0) {
            console.log(`馃摐 妫€娴嬪埌鍘嗗彶鍛ㄦ湡 ${weekButton.id}锛屼粠涓嬫媺鑿滃崟涓€夋嫨...`);
            try {
              // Click "鏌ョ湅宸茬粨鏉熷懆璇捐〃" dropdown to reveal historical weeks
              const historicalDropdownClicked = await page.evaluate((weekText) => {
                // Find all layui-unselect dropdowns
                const dropdowns = document.querySelectorAll('.layui-unselect');

                for (const dropdown of dropdowns) {
                  const input = dropdown.querySelector('input');
                  if (!input) continue;

                  const value = input.value || input.placeholder || '';

                  // Look for dropdown containing "鏌ョ湅宸茬粨鏉熷懆璇捐〃" or "宸茬粨鏉?
                  if (value.includes('鏌ョ湅宸茬粨鏉熷懆璇捐〃') || value.includes('已结束')) {
                    console.log(`鎵惧埌鍘嗗彶鍛ㄦ湡涓嬫媺鑿滃崟: ${value}`);
                    dropdown.click();
                    return true;
                  }
                }

                // Fallback: try to find by common text patterns
                const allElements = document.querySelectorAll('*');
                for (const elem of allElements) {
                  const text = elem.textContent;
                  if (text && (text.includes('鏌ョ湅宸茬粨鏉熷懆璇捐〃') || text.includes('已结束'))) {
                    console.log(`閫氳繃鏂囨湰鎵惧埌鍘嗗彶鍛ㄦ湡鍏冪礌`);
                    elem.click();
                    return true;
                  }
                }

                return false;
              }, weekButton.text);

              if (historicalDropdownClicked) {
                await page.waitForTimeout(500);
          console.log(`已点击历史周下拉菜单`);

                // Select the specific historical week from the dropdown
                const weekSelected = await page.evaluate((weekText) => {
                  // Find dropdown options (dd elements with lay-value)
                  const options = document.querySelectorAll('dd[lay-value]');

                  for (const option of options) {
                    const optionText = option.textContent.trim();

                    // Match the week text (e.g., "2026骞?01.19-01.25")
                    if (optionText === weekText || optionText.includes(weekText.replace(/\s+/g, ' '))) {
                      console.log(`鎵惧埌鍖归厤鐨勫巻鍙插懆鏈熼€夐」: ${optionText}`);
                      option.click();
                      return true;
                    }
                  }

                  console.log(`鏈壘鍒板尮閰嶇殑鍘嗗彶鍛ㄦ湡閫夐」: ${weekText}`);
                  return false;
                }, weekButton.text);

                if (weekSelected) {
                  await page.waitForTimeout(1200); // Wait for page to load the selected historical week
                  console.log(`鉁?宸查€夋嫨鍘嗗彶鍛ㄦ湡: ${weekButton.text}`);
                  historicalWeekSelected = true; // Mark as successfully selected
                } else {
                  console.log(`鈿狅笍 鏈兘浠庝笅鎷夎彍鍗曚腑閫夋嫨鍘嗗彶鍛ㄦ湡: ${weekButton.text}`);
                }
              } else {
          console.log(`未找到历史周下拉菜单`);
              }
            } catch (dropdownError) {
              console.log(`鈿狅笍 閫夋嫨鍘嗗彶鍛ㄦ湡澶辫触: ${dropdownError.message}`);
            }
          }

          // For non-historical weeks OR if historical week selection failed,
          // click the weekly button with improved reliability
          if (!historicalWeekSelected) {
            try {
            const buttonElement = await page.$(`#${weekButton.id}`);
            if (buttonElement) {
              // Check if button is visible and scroll into view if needed
              const isVisible = await buttonElement.isVisible();
              if (!isVisible) {
                console.log(`Button ${weekButton.id} not visible, scrolling into view...`);
                await buttonElement.scrollIntoViewIfNeeded();
                await page.waitForTimeout(300);
              }

              await clickWithShadeGuard(buttonElement, `鍛ㄦ湡鎸夐挳 ${weekButton.id}`, `#${weekButton.id}`);
              console.log(`鉁?鎴愬姛鐐瑰嚮鎸夐挳: ${weekButton.id}`);

              // 浣跨敤鏅鸿兘绛夊緟鏇夸唬鍥哄畾绛夊緟鏃堕棿锛岀瓑寰呰〃鏍兼暟鎹姞杞藉畬鎴?
              const tableRowCount = await this.waitForQuickStableCount(
                page,
                async () => {
                  try {
                    // 妫€娴嬭绋嬪崟鍏冩牸鏁伴噺浣滀负鏁版嵁鍔犺浇鎸囨爣
                    const cellCount = await page.$$eval('td[data-day]', cells => cells.length);
                    return cellCount;
                  } catch (e) {
                    return 0;
                  }
                },
                `鍛ㄦ湡 ${weekButton.text} 璇捐〃鏁版嵁`,
                8000, // 鏈€澶х瓑寰?8 绉?
                600   // 鏁版嵁绋冲畾 600ms
              );
              console.log(`馃搳 琛ㄦ牸鍗曞厓鏍兼暟閲? ${tableRowCount}`);
            } else {
              console.log(`Button element not found: ${weekButton.id}`);
              continue;
            }
          } catch (clickError) {
            console.log(`Failed to click button ${weekButton.id}: ${clickError.message}`);
            continue;
          }
          } else {
            // For historical weeks selected from dropdown, wait for data to load
            console.log(`鈴?绛夊緟鍘嗗彶鍛ㄦ湡鏁版嵁鍔犺浇...`);
            const tableRowCount = await this.waitForQuickStableCount(
              page,
              async () => {
                try {
                  const cellCount = await page.$$eval('td[data-day]', cells => cells.length);
                  return cellCount;
                } catch (e) {
                  return 0;
                }
              },
              `鍘嗗彶鍛ㄦ湡 ${weekButton.text} 璇捐〃鏁版嵁`,
              8000,
              600
            );
            console.log(`馃搳 琛ㄦ牸鍗曞厓鏍兼暟閲? ${tableRowCount}`);
          }

            // 楠岃瘉琛ㄦ牸鏄惁瀛樺湪
            try {
              await page.waitForSelector('table, .course-table, .schedule-table', { timeout: 3000 });
              console.log('Table found, extracting data...');
            } catch (tableError) {
              console.log(`No table found for week ${weekButton.index}, trying alternative selectors...`);
            }

            const weekCourses = await extractWeeklyData(weekButton.index);
            if (weekCourses.length > 0) {
              console.log(`\n=== 馃搳 鍛ㄦ湡 ${weekButton.text} 璇捐〃鏁版嵁 ===`);

              // Add week information to each course
              weekCourses.forEach((course, index) => {
                course.globalIndex = allCourses.length + index + 1;
                course.weekText = weekButton.text;
                course.weekId = weekButton.id;
              });

              allCourses = allCourses.concat(weekCourses);
              console.log(`鉁?鏈懆鏈熷叡鎵惧埌 ${weekCourses.length} 鏉¤绋嬭褰昞n`);
            } else {
              console.log(`No course data found for week ${weekButton.index}`);
            }

            weekCount++;
            processedWeekIds.add(weekButton.id); // Track this week as processed
        } catch (weekError) {
          console.log(`Error processing week ${weekButton.index}:`, weekError.message);
        }
      }

      // 馃搮 Additional scraping: Get future weeks from "鏌ョ湅鏈潵鍛ㄨ琛? dropdown
      console.log(`\n馃敭 ===== 寮€濮嬫姄鍙栨湭鏉ュ懆璇捐〃 =====`);
      console.log(`馃摑 閫氳繃"鏌ョ湅鏈潵鍛ㄨ琛?涓嬫媺妗嗚幏鍙栨洿澶氭湭鏉ユ暟鎹?..`);

      try {
        console.log(`鉁?宸插畬鎴愬父瑙勫懆鏈熸姄鍙栵紝鐜板湪閫氳繃"鏌ョ湅鏈潵鍛ㄨ琛?涓嬫媺妗嗚幏鍙栨洿澶氭暟鎹?..`);

        console.log('馃攳 鏌ユ壘"鏌ョ湅鏈潵鍛ㄨ琛?涓嬫媺妗?..');

        // Find the future weeks dropdown by looking for the specific placeholder text
        const futureWeekDropdownInfo = await page.evaluate(() => {
          // Look for the specific dropdown with "鏌ョ湅鏈潵鍛ㄨ琛? placeholder
          const allContainers = document.querySelectorAll('.layui-form-select');
          console.log(`馃攳 鏌ユ壘鍖呭惈"鏌ョ湅鏈潵鍛ㄨ琛?鐨勪笅鎷夋锛屾€诲叡鎵惧埌 ${allContainers.length} 涓笅鎷夋瀹瑰櫒`);

          for (let i = 0; i < allContainers.length; i++) {
            const container = allContainers[i];
            const input = container.querySelector('input');
            const selectTitle = container.querySelector('.layui-select-title');

            if (input && selectTitle) {
              const placeholder = input.placeholder || '';
              const value = input.value || '';
              const containerClass = container.className;

              console.log(`涓嬫媺妗?${i}: placeholder="${placeholder}", value="${value}", class="${containerClass}"`);

              // Check if this is the future weeks dropdown
              if (placeholder.includes('查看未来周课表')) {
                return {
                  found: true,
                  index: i,
                  placeholder: placeholder,
                  value: value,
                  containerClass: containerClass,
                  isOpen: containerClass.includes('layui-form-selected'),
                  hasSelectTitle: !!selectTitle
                };
              }
            }
          }

          return { found: false };
        });

        let futureWeekDropdown = null;
        if (futureWeekDropdownInfo.found) {
          console.log(`鉁?鎵惧埌"鏌ョ湅鏈潵鍛ㄨ琛?涓嬫媺妗?(绱㈠紩 ${futureWeekDropdownInfo.index})`);
          console.log(`馃搵 placeholder="${futureWeekDropdownInfo.placeholder}"`);
          console.log(`馃搵 褰撳墠鐘舵€? ${futureWeekDropdownInfo.isOpen ? '宸插睍寮€' : '鏈睍寮€'}`);

          // Get the dropdown container
          futureWeekDropdown = await page.$$('.layui-form-select');
          futureWeekDropdown = futureWeekDropdown[futureWeekDropdownInfo.index];
        }

        if (!futureWeekDropdown) {
          console.log('未找到“查看未来周课表”下拉框，跳过未来周数据抓取');
        throw new Error('未找到“查看未来周课表”下拉框');
        }
        if (futureWeekDropdown) {
          console.log('馃幆 鎵惧埌"鏌ョ湅鏈潵鍛ㄨ琛?涓嬫媺妗嗭紝寮€濮嬭幏鍙栨湭鏉ュ懆鏁版嵁...');

          let finalCheckResult = {
            totalOptions: 0,
            validOptions: [],
            hasValidOptions: false
          };

          // Click to open the dropdown
          try {
            console.log('馃搵 寮€濮嬬偣鍑?鏌ョ湅鏈潵鍛ㄨ琛?涓嬫媺妗?..');

            // First, check current state
            const initialState = await page.evaluate((dropdown) => {
              const isOpen = dropdown.classList.contains('layui-form-selected');
              const selectTitle = dropdown.querySelector('.layui-select-title');
              return {
                isOpen: isOpen,
                className: dropdown.className,
                hasSelectTitle: !!selectTitle
              };
            }, futureWeekDropdown);

            console.log(`鍒濆鐘舵€? ${initialState.isOpen ? '宸插睍寮€' : '鏈睍寮€'} (class: ${initialState.className})`);

            if (!initialState.isOpen) {
              // Scroll into view first
              await futureWeekDropdown.scrollIntoViewIfNeeded();
              await page.waitForTimeout(300);

              console.log('馃幆 鐐瑰嚮涓嬫媺妗嗘爣棰樹互灞曞紑閫夐」...');

              // Try to click the select title specifically
              const clicked = await page.evaluate((dropdown) => {
                const selectTitle = dropdown.querySelector('.layui-select-title');
                if (selectTitle) {
                  console.log('鐐瑰嚮 .layui-select-title 鍏冪礌');
                  selectTitle.click();
                  return true;
                }
                return false;
              }, futureWeekDropdown);

              if (clicked) {
                await page.waitForTimeout(700);

                // Check if it opened
                const afterClickState = await page.evaluate((dropdown) => {
                  return {
                    isOpen: dropdown.classList.contains('layui-form-selected'),
                    className: dropdown.className
                  };
                }, futureWeekDropdown);

                console.log(`鐐瑰嚮鍚庣姸鎬? ${afterClickState.isOpen ? '宸插睍寮€' : '浠嶆湭灞曞紑'} (class: ${afterClickState.className})`);

                if (!afterClickState.isOpen) {
                  console.log('馃攧 灏濊瘯澶囩敤鐐瑰嚮鏂规硶...');
                  // 閲嶆柊閫氳繃閫夋嫨鍣ㄦ煡鎵惧苟鐐瑰嚮锛岄伩鍏嶅厓绱犲紩鐢ㄥけ鏁?
                  const reopenClicked = await page.evaluate(() => {
                    const allContainers = document.querySelectorAll('.layui-form-select');
                    for (let container of allContainers) {
                      const input = container.querySelector('input');
                      if (input && (
                        input.placeholder && input.placeholder.includes('查看未来周课表') ||
                        input.value && input.value.includes('查看未来周课表')
                      )) {
                        console.log('閫氳繃椤甸潰鑴氭湰閲嶆柊鎵惧埌骞剁偣鍑讳笅鎷夋');
                        container.click();
                        return true;
                      }
                    }
                    return false;
                  });

                  if (reopenClicked) {
                    console.log('鉁?澶囩敤鏂规硶鐐瑰嚮鎴愬姛');
                  } else {
                    console.log('鈿狅笍  澶囩敤鏂规硶鏈兘鎵惧埌鍏冪礌');
                  }
                  await page.waitForTimeout(700);
                }
              } else {
                console.log('馃攧 鐩存帴鐐瑰嚮涓嬫媺妗嗗鍣?..');
                // 浣跨敤椤甸潰鑴氭湰鐐瑰嚮锛岄伩鍏嶅厓绱犲紩鐢ㄩ棶棰?
                await page.evaluate(() => {
                  const allContainers = document.querySelectorAll('.layui-form-select');
                  for (let container of allContainers) {
                    const input = container.querySelector('input');
                    if (input && (
                  input.placeholder && input.placeholder.includes('查看未来周课表') ||
                  input.value && input.value.includes('查看未来周课表')
                    )) {
                      container.click();
                      return;
                    }
                  }
                });
                await page.waitForTimeout(700);
              }
            }

            // Verify dropdown is now open and check available options
            finalCheckResult = await page.evaluate(() => {
              const allContainers = Array.from(document.querySelectorAll('.layui-form-select'));
              const futureContainer = allContainers.find(container => {
                const input = container.querySelector('input');
                if (!input) return false;
                const placeholder = input.placeholder || '';
                const value = input.value || '';
                return placeholder.includes('查看未来周课表') || value.includes('查看未来周课表');
              });
              const options = futureContainer
                ? Array.from(futureContainer.querySelectorAll('dd[lay-value]'))
                : [];
              console.log(`鏈€缁堟鏌? 鏈潵鍛ㄤ笅鎷夋鎵惧埌 ${options.length} 涓€夐」`);

              const validOptions = [];
              options.forEach((option, index) => {
                const layValue = option.getAttribute('lay-value');
                const text = option.textContent.trim();
                const style = window.getComputedStyle(option);
                const isVisible = style.display !== 'none' && style.visibility !== 'hidden';

                console.log(`閫夐」 ${index}: lay-value="${layValue}" text="${text}" visible=${isVisible}`);

                if (layValue && layValue.trim() !== '' && !isNaN(parseInt(layValue)) && parseInt(layValue, 10) > 0 && isVisible) {
                  validOptions.push({ layValue: parseInt(layValue), text: text.trim() });
                }
              });

              console.log(`鏈夋晥閫夐」鏁伴噺: ${validOptions.length}`);
              validOptions.forEach(opt => {
                console.log(`鉁?鏈夋晥閫夐」: lay-value=${opt.layValue}, text="${opt.text}"`);
              });

              return {
                totalOptions: options.length,
                validOptions: validOptions,
                hasValidOptions: validOptions.length > 0
              };
            });

            if (!finalCheckResult.hasValidOptions) {
              console.log('鉂?鏈壘鍒版湁鏁堢殑涓嬫媺閫夐」锛屽彲鑳戒笅鎷夋鏈纭睍寮€');
              throw new Error('鏈兘鎴愬姛灞曞紑涓嬫媺妗嗘垨鏃犳湁鏁堥€夐」');
            }

            console.log(`鉁?鎴愬姛灞曞紑涓嬫媺妗嗭紝鎵惧埌 ${finalCheckResult.validOptions.length} 涓湁鏁堥€夐」`);

          } catch (clickError) {
            console.log('鉂?鐐瑰嚮鏈潵鍛ㄤ笅鎷夋澶辫触:', clickError.message);
            throw clickError;
          }

          const parseWeekEndDateFromLabel = (label) => {
            const dateMatch = label.match(/(\d{4}骞碶s*)?(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
            if (!dateMatch) {
              return null;
            }

            const [, yearPart, startMonth, , endMonth, endDay] = dateMatch;
            let year = new Date().getFullYear();
            if (yearPart) {
            year = parseInt(yearPart.replace(/\D/g, ''), 10);
            }

            const weekEndDate = new Date(year, parseInt(endMonth, 10) - 1, parseInt(endDay, 10));

            if (parseInt(endMonth, 10) < parseInt(startMonth, 10) && !yearPart) {
              weekEndDate.setFullYear(year + 1);
            }

            return weekEndDate;
          };

          // Process all future weeks exposed by the dropdown instead of a hard-coded subset.
          const targetLayValues = finalCheckResult.validOptions
            .filter(option => {
              const weekEndDate = parseWeekEndDateFromLabel(option.text);
              if (!weekEndDate) {
                console.log(`鈿狅笍  鏃犳硶瑙ｆ瀽鏈潵鍛ㄦ棩鏈燂紝淇濆畧绾冲叆鎶撳彇: ${option.text}`);
                return true;
              }
              return weekEndDate <= threeMonthsLater;
            })
            .sort((a, b) => parseInt(a.layValue, 10) - parseInt(b.layValue, 10))
            .map(option => parseInt(option.layValue, 10));
          let processedWeeks = 0;

          console.log(`\n馃搵 寮€濮嬪鐞嗘湭鏉ュ懆閫夐」寰幆`);
          console.log(`馃搳 鐩爣 lay-value 鍒楄〃: [${targetLayValues.join(', ')}]`);
          console.log(`馃搳 鎬诲叡闇€瑕佸鐞? ${targetLayValues.length} 涓湭鏉ュ懆\n`);

          for (let layValueIndex = 0; layValueIndex < targetLayValues.length; layValueIndex++) {
            const targetLayValue = targetLayValues[layValueIndex];

            try {
              console.log(`\n${'='.repeat(60)}`);
              console.log(`馃棑锔? 澶勭悊鏈潵鍛?[${layValueIndex + 1}/${targetLayValues.length}]: lay-value="${targetLayValue}"`);
              console.log(`${'='.repeat(60)}`);

              // Get fresh dropdown options each time
              console.log(`馃攳 鑾峰彇褰撳墠涓嬫媺妗嗛€夐」鍒楄〃...`);
              const currentOptions = await page.evaluate(() => {
                const allContainers = Array.from(document.querySelectorAll('.layui-form-select'));
                const futureContainer = allContainers.find(container => {
                  const input = container.querySelector('input');
                  if (!input) return false;
                  const placeholder = input.placeholder || '';
                  const value = input.value || '';
                return placeholder.includes('查看未来周课表') || value.includes('查看未来周课表');
                });
                const options = futureContainer
                  ? Array.from(futureContainer.querySelectorAll('dd[lay-value]'))
                  : [];
                const foundOptions = [];

                console.log(`馃搵 鏈潵鍛ㄤ笅鎷夋鎬诲叡鎵惧埌 ${options.length} 涓?dd[lay-value] 鍏冪礌`);

                options.forEach((option, index) => {
                  const layValue = option.getAttribute('lay-value');
                  const text = option.textContent.trim();
                  const style = window.getComputedStyle(option);
                  const isVisible = style.display !== 'none' && style.visibility !== 'hidden';

                  console.log(`  閫夐」 ${index}: "${text}" (lay-value="${layValue}", visible=${isVisible})`);

                  if (layValue && layValue.trim() !== '' && !isNaN(parseInt(layValue)) && parseInt(layValue, 10) > 0) {
                    foundOptions.push({ layValue, text, isVisible });
                  }
                });

                console.log(`鉁?杩囨护鍚庣殑鏈夋晥閫夐」鏁伴噺: ${foundOptions.length}`);
                foundOptions.forEach(opt => {
                  console.log(`  鉁?lay-value="${opt.layValue}": "${opt.text}" (visible=${opt.isVisible})`);
                });
                return foundOptions;
              });

              console.log(`当前可用选项: ${currentOptions.length} 个`);
              if (currentOptions.length === 0) {
                console.log(`鈿狅笍  璀﹀憡: 鏈壘鍒颁换浣曟湁鏁堥€夐」锛屼笅鎷夋鍙兘鏈纭睍寮€`);
              }

              // Find the target option in current list
              console.log(`馃幆 鍦ㄩ€夐」鍒楄〃涓煡鎵?lay-value="${targetLayValue}"...`);
              const targetOption = currentOptions.find(opt => opt.layValue === targetLayValue.toString());

              if (targetOption) {
                console.log(`鉁?鎵惧埌鐩爣閫夐」: ${targetOption.text} (lay-value="${targetOption.layValue}")`);

                // Click the option using page.evaluate to avoid visibility issues
                console.log(`馃柋锔? 鍦ㄩ〉闈笂涓嬫枃涓偣鍑婚€夐」: dd[lay-value="${targetOption.layValue}"]`);
                const clicked = await page.evaluate((layValue) => {
                  const allContainers = Array.from(document.querySelectorAll('.layui-form-select'));
                  const futureContainer = allContainers.find(container => {
                    const input = container.querySelector('input');
                    if (!input) return false;
                    const placeholder = input.placeholder || '';
                    const value = input.value || '';
            return placeholder.includes('查看未来周课表') || value.includes('查看未来周课表');
                  });
                  const option = futureContainer
                    ? futureContainer.querySelector(`dd[lay-value="${layValue}"]`)
                    : null;
                  if (option) {
                console.log(`找到选项元素，执行点击`);
                    option.click();
                    return true;
                  }
                  return false;
                }, targetOption.layValue);

                if (clicked) {
                  console.log(`鉁?宸茬偣鍑婚€夐」: lay-value="${targetOption.layValue}"`);

                  // 浣跨敤鏅鸿兘绛夊緟鏇夸唬鍥哄畾绛夊緟鏃堕棿锛岀瓑寰呮湭鏉ュ懆琛ㄦ牸鏁版嵁鍔犺浇瀹屾垚
                  const futureTableCellCount = await this.waitForQuickStableCount(
                    page,
                    async () => {
                      try {
                        const cellCount = await page.$$eval('td[data-day]', cells => cells.length);
                        return cellCount;
                      } catch (e) {
                        return 0;
                      }
                    },
                    `鏈潵鍛?${targetOption.text} 璇捐〃鏁版嵁`,
                    10000, // 鏈€澶х瓑寰?10 绉?
                    800    // 鏁版嵁绋冲畾 800ms
                  );
                  console.log(`馃搳 鏈潵鍛ㄨ〃鏍煎崟鍏冩牸鏁伴噺: ${futureTableCellCount}`);

                  // Extract data for this future week
                  console.log(`馃搳 鎻愬彇鏈潵鍛ㄦ暟鎹? future_${targetOption.layValue}`);
                  const futureWeekCourses = await extractWeeklyData(`future_${targetOption.layValue}`);
                  if (futureWeekCourses.length > 0) {
                  console.log(`成功提取未来周 ${targetOption.text} 的数据，共 ${futureWeekCourses.length} 条课程记录`);

                    // Add future week information to each course
                    console.log(`馃摑 涓烘瘡鏉¤绋嬫坊鍔犳湭鏉ュ懆鏍囪瘑淇℃伅...`);
                    futureWeekCourses.forEach((course, index) => {
                      course.globalIndex = allCourses.length + index + 1;
                      course.weekText = targetOption.text;
                      course.weekId = `future_${targetOption.layValue}`;
                      course.isFutureWeek = true;
                    });

                    const beforeCount = allCourses.length;
                    allCourses = allCourses.concat(futureWeekCourses);
                    weekCount++;
                    processedWeeks++;

                    console.log(`鉁?宸叉坊鍔犳湭鏉ュ懆璇剧▼鏁版嵁 (${beforeCount} 鈫?${allCourses.length}, +${futureWeekCourses.length})`);
                    console.log(`馃搱 宸插鐞嗘湭鏉ュ懆鏁伴噺: ${processedWeeks}/${targetLayValues.length}`);
                  } else {
                    console.log(`鈿狅笍  鏈潵鍛?${targetOption.text} 娌℃湁鎵惧埌璇剧▼鏁版嵁 (鍙兘璇ュ懆娌℃湁璇剧▼瀹夋帓)`);
                  }

                  // If not the last option, need to reopen dropdown for next selection
                  if (layValueIndex < targetLayValues.length - 1) {
                    console.log(`\n馃攧 鍑嗗澶勭悊涓嬩竴涓湭鏉ュ懆 (${layValueIndex + 1}/${targetLayValues.length - 1})...`);
                    console.log(`馃攧 闇€瑕侀噸鏂版墦寮€鏈潵鍛ㄤ笅鎷夋...`);

                    // Wait for any layui shade/modal to disappear
                    console.log(`鈴憋笍  妫€鏌ユ槸鍚︽湁閬僵灞傞渶瑕佺瓑寰呮秷澶?..`);
                    try {
                      await page.waitForSelector('.layui-layer-shade', { state: 'hidden', timeout: 3000 });
                      console.log('鉁?閬僵灞傚凡娑堝け');
                    } catch (e) {
                      // No shade present or already hidden - this is fine
      console.log('无遮罩层或已隐藏');
                    }

                    // Additional wait for page stability
                    console.log(`鈴憋笍  绛夊緟 500ms 纭繚椤甸潰绋冲畾...`);
                    await page.waitForTimeout(500);
                    console.log(`鉁?椤甸潰绋冲畾锛屽紑濮嬫煡鎵句笅鎷夋...`);

                    // Re-find the future week dropdown specifically (not other dropdowns)
                    let nextDropdown = null;

                    // Try to find the future week dropdown again
                    console.log(`馃攳 鏂规硶1: 閫氳繃 input placeholder/value 鏌ユ壘鏈潵鍛ㄤ笅鎷夋...`);
                    const nextFutureWeekContainer = await page.evaluate(() => {
                      const allContainers = document.querySelectorAll('.layui-input-inline');
                      console.log(`  鎵惧埌 ${allContainers.length} 涓?.layui-input-inline 瀹瑰櫒`);

                      for (let i = 0; i < allContainers.length; i++) {
                        const container = allContainers[i];
                        const input = container.querySelector('input');
                        if (input) {
                          const placeholder = input.placeholder || '';
                          const value = input.value || '';
                          console.log(`  瀹瑰櫒 ${i}: placeholder="${placeholder}", value="${value}"`);

                          if (placeholder.includes('未来周') || value.includes('未来周') ||
                    placeholder.includes('查看未来周课表') || value.includes('查看未来周课表')) {
                            console.log(`  鉁?鍖归厤鎴愬姛!`);
                            return {
                              found: true,
                              inputText: placeholder || value
                            };
                          }
                        }
                      }
                      return { found: false };
                    });

                    if (nextFutureWeekContainer.found) {
                      console.log(`鉁?鏂规硶1鎴愬姛: 鎵惧埌鏈潵鍛ㄤ笅鎷夋 "${nextFutureWeekContainer.inputText}"`);
          nextDropdown = await page.$('.layui-input-inline input[placeholder*="未来周"], .layui-input-inline input[placeholder*="查看未来周课表"], .layui-input-inline input[value*="未来周"], .layui-input-inline input[value*="查看未来周课表"]');
                      if (nextDropdown) {
                        console.log(`鉁?宸茶幏鍙栦笅鎷夋鍏冪礌寮曠敤`);
                      } else {
              console.log(`虽然找到匹配项，但未能获取元素引用`);
                      }
                    } else {
                      console.log(`鈿狅笍  鏂规硶1澶辫触: 鏈壘鍒板尮閰嶇殑瀹瑰櫒`);
                    }

                    if (!nextDropdown) {
                      // Fallback: search by text content again
                      console.log(`馃攳 鏂规硶2: 閫氳繃 .layui-select-title 鏌ユ壘...`);
                      const allDropdowns = await page.$$('.layui-select-title');
                      console.log(`  鎵惧埌 ${allDropdowns.length} 涓?.layui-select-title 鍏冪礌`);

                      for (let i = 0; i < allDropdowns.length; i++) {
                        const dropdown = allDropdowns[i];
                        const text = await page.evaluate(el => {
                          const input = el.querySelector('input');
                          return input ? (input.placeholder || input.value || '') : '';
                        }, dropdown);

                        console.log(`  涓嬫媺妗?${i}: "${text}"`);

                if (text.includes('未来周') || text.includes('查看未来周课表')) {
                          nextDropdown = dropdown;
                          console.log(`鉁?鏂规硶2鎴愬姛: 鎵惧埌鏈潵鍛ㄤ笅鎷夋 "${text}"`);
                          break;
                        }
                      }

                      if (!nextDropdown) {
            console.log(`方法2失败: 未找到匹配的下拉框`);
                      }
                    }

                    if (nextDropdown) {
                      console.log(`馃幆 宸叉壘鍒颁笅鎷夋鍏冪礌锛屽噯澶囩偣鍑?..`);
                      // Wait for element to be visible and stable before clicking
                      try {
                        console.log(`鈴憋笍  绛夊緟涓嬫媺妗嗗厓绱犲彉涓哄彲瑙佺姸鎬?(鏈€澶?绉?...`);
                        await nextDropdown.waitForElementState('visible', { timeout: 5000 });
          console.log(`元素已可见`);
                        console.log(`鈴憋笍  绛夊緟涓嬫媺妗嗗厓绱犲彉涓虹ǔ瀹氱姸鎬?(鏈€澶?绉?...`);
                        await nextDropdown.waitForElementState('stable', { timeout: 3000 });
                        console.log('鉁?鍏冪礌宸茬ǔ瀹氾紝鍑嗗鐐瑰嚮');
                      } catch (e) {
          console.log(`元素状态等待超时(${e.message})，尝试直接点击`);
                      }

                      console.log(`馃柋锔? 鐐瑰嚮涓嬫媺妗?..`);
                      await nextDropdown.click();
                      console.log('鉁?鎴愬姛閲嶆柊鎵撳紑鏈潵鍛ㄤ笅鎷夋');

                      // 浣跨敤鏅鸿兘绛夊緟锛氱瓑寰呬笅鎷夋閫夐」鍔犺浇瀹屾垚
                      const dropdownOptionsLoaded = await this.waitForQuickStableCount(
                        page,
                        async () => {
                          try {
                            // 妫€鏌ヤ笅鎷夋閫夐」鏁伴噺
                            const optionCount = await page.$$eval('.layui-form-select.layui-form-selected dd', opts => opts.length);
                            return optionCount;
                          } catch (e) {
                            return 0;
                          }
                        },
                        '涓嬫媺妗嗛€夐」',
                        5000, // 鏈€澶х瓑寰?5 绉?
                        500   // 閫夐」绋冲畾 500ms
                      );
                      console.log(`馃搵 涓嬫媺妗嗛€夐」鏁伴噺: ${dropdownOptionsLoaded}`);
                    } else {
                      console.log('鉂?鏃犳硶閲嶆柊鎵惧埌鏈潵鍛ㄤ笅鎷夋鍏冪礌锛屽彲鑳界晫闈㈠彂鐢熶簡鍙樺寲');
                      console.log(`鈿狅笍  缁堟鏈潵鍛ㄦ姄鍙栧惊鐜?(宸插鐞?${processedWeeks} 涓湭鏉ュ懆)`);
                      break; // Exit the loop if can't find dropdown
                    }
                  } else {
      console.log(`\n这是最后一个未来周选项，无需重新打开下拉框`);
                  }

                } else {
                  console.log(`鉂?鏃犳硶鐐瑰嚮閫夐」: lay-value="${targetOption.layValue}" (椤甸潰涓婁笅鏂囦腑鏈壘鍒板厓绱?`);
                  console.log(`鈿狅笍  璺宠繃姝ら€夐」锛岀户缁鐞嗕笅涓€涓?..`);
                }

              } else {
                console.log(`鈿狅笍  鏈壘鍒?lay-value="${targetLayValue}" 鐨勯€夐」锛屽彲鑳藉凡缁忓埌杈惧彲鐢ㄨ寖鍥寸殑鏈熬`);
                console.log(`   缁х画灏濊瘯涓嬩竴涓?lay-value...`);
                // Continue to next lay-value in case this one just doesn't exist
              }

            } catch (futureWeekError) {
              console.log(`鉂?澶勭悊鏈潵鍛?lay-value="${targetLayValue}" 鏃跺彂鐢熼敊璇?`);
              console.log(`   閿欒淇℃伅: ${futureWeekError.message}`);
              console.log(`   閿欒鍫嗘爤: ${futureWeekError.stack}`);
              console.log(`   缁х画澶勭悊涓嬩竴涓湭鏉ュ懆...`);
            }
          }

          console.log(`\n${'='.repeat(60)}`);
      console.log(`未来周抓取循环结束`);
          console.log(`鉁?鎴愬姛澶勭悊: ${processedWeeks}/${targetLayValues.length} 涓湭鏉ュ懆`);
          console.log(`馃搱 鎬昏绋嬫暟: ${allCourses.length}`);
          console.log(`${'='.repeat(60)}`);

          console.log(`\n鉁?鏈潵鍛ㄨ琛ㄦ姄鍙栧畬鎴愶紝鍏卞鐞?${processedWeeks} 涓湭鏉ュ懆`);

        } else {
        console.log('未找到“查看未来周课表”下拉框，跳过未来周数据抓取');
        }

      } catch (futureWeekError) {
        console.log('\n鉂?鎶撳彇鏈潵鍛ㄨ琛ㄦ椂鍙戠敓寮傚父閿欒:');
        console.log(`   閿欒绫诲瀷: ${futureWeekError.name}`);
        console.log(`   閿欒淇℃伅: ${futureWeekError.message}`);
        console.log(`   閿欒鍫嗘爤:\n${futureWeekError.stack}`);
        console.log(`鈿狅笍  灏嗙户缁鐞嗗墿浣欐祦绋?..`);
      }

      console.log(`\n馃敭 ===== 鏈潵鍛ㄨ琛ㄦ姄鍙栫粨鏉?=====`);
      console.log(`馃搳 褰撳墠鎬昏绋嬭褰曟暟: ${allCourses.length}`);
      console.log(`馃搳 褰撳墠鎬诲懆鏈熸暟: ${weekCount}\n`);

      console.log(`\n馃幆 ===== 鎶撳彇瀹屾垚缁熻 =====`);
      console.log(`馃搳 鎬诲叡鎶撳彇鍛ㄦ湡鏁? ${weekCount}`);
      console.log(`馃摎 鍘熷璇剧▼璁板綍鏁? ${allCourses.length}`);

      // 鍘婚噸澶勭悊 - 鍩轰簬teacher, student, date, time鐨勭粍鍚堝垱寤哄敮涓€鏍囪瘑
      console.log(`馃攧 寮€濮嬪幓閲嶅鐞?..`);
      const uniqueCourses = [];
      const seenKeys = new Set();

      for (const course of allCourses) {
        // 鍒涘缓鍞竴鏍囪瘑閿紝鍩轰簬鍏抽敭瀛楁缁勫悎
        const uniqueKey = `${course.teacher}-${course.student}-${course.date}-${course.time}`;

        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          uniqueCourses.push(course);
        } else {
          console.log(`馃棏锔?鍘婚櫎閲嶅璇剧▼: ${uniqueKey}`);
        }
      }

      console.log(`鉁?鍘婚噸瀹屾垚锛屽師濮嬭褰? ${allCourses.length}锛屽幓閲嶅悗: ${uniqueCourses.length}`);
      allCourses = uniqueCourses; // 浣跨敤鍘婚噸鍚庣殑鏁版嵁

      console.log(`馃捑 鍑嗗淇濆瓨鏁版嵁鍒版暟鎹簱...`);
      console.log(`============================\n`);

      // Get additional page data
      const pageData = await page.evaluate(() => {
        const title = document.title;
        const url = window.location.href;
        const timestamp = formatShanghaiTimestampString();

        // Also get any JSON data from script tags or data attributes
        const scriptTags = document.querySelectorAll('script');
        let jsonData = null;

        for (let script of scriptTags) {
          const content = script.textContent;
          if (content.includes('course') && (content.includes('{') || content.includes('['))) {
            // Try to extract JSON-like data
            const jsonMatches = content.match(/(\{.*?\}|\[.*?\])/gs);
            if (jsonMatches) {
              try {
                for (let match of jsonMatches) {
                  const parsed = JSON.parse(match);
                  if (parsed && (Array.isArray(parsed) || (typeof parsed === 'object' && parsed.course))) {
                    jsonData = parsed;
                    break;
                  }
                }
              } catch (e) {
                // Continue looking
              }
            }
          }
        }

        // Get page content
        const pageContent = document.body.innerText;

        return {
          title,
          url,
          timestamp,
          jsonData,
          pageContent: pageContent.substring(0, 10000), // Limit content
        };
      });

      return {
        pageData,
        allCourses,
        weekCount,
        weeklyButtons
      };
      };

      let pageData = null;
      let allCourses = [];
      let weekCount = 0;
      let weeklyButtons = [];

      if (useTeacherIterationFallback) {
        const weeklyButtonMap = new Map();
        const failedTeacherSelections = [];

        for (const teacherOption of teacherIterationOptions) {
          console.log(`\n馃懇鈥嶐煆?===== 寮€濮嬫姄鍙栬€佸笀瑙嗗浘: ${teacherOption.text} =====`);
          await waitForWeeklyCoursePageReady(`teacher:${teacherOption.text}`);

          const clearResult = await clearTeacherFilterSearch();
          if (clearResult.cleared) {
            console.log(`馃Ч 鍒囨崲鑰佸笀鍓嶆竻绌烘绱㈣瘝[${teacherOption.text}]: "${clearResult.previousValue}"`);
            await page.waitForTimeout(400);
          }

          const selectionResult = await selectTeacherFilterOption(teacherOption);
          console.log(`馃幆 閫愯€佸笀鍒囨崲缁撴灉[${teacherOption.text}]: clicked=${selectionResult.clicked} mode=${selectionResult.mode}`);

          if (selectionResult.clicked) {
            await this.waitForQuickStableCount(
              page,
              async () => {
                try {
                  return await page.$$eval('td[data-day] div.ft12.position_r.nowrap', elements => elements.length);
                } catch (e) {
                  return 0;
                }
              },
              `鑰佸笀 ${teacherOption.text} 璇捐〃鏁版嵁`,
              8000,
              600
            );
          }

          const teacherState = await inspectTeacherFilterState();
          const visibleTeachers = await detectVisibleTeachers();
            console.log(`逐老师切换状态[${teacherOption.text}]: input="${teacherState.inputValue}", selected="${teacherState.selectedText}", visibleTeachers=${visibleTeachers.join(', ') || '无'}`);

          if (!isSpecificTeacherSelected(teacherState, teacherOption)) {
            failedTeacherSelections.push(teacherOption.text);
            console.log(`鈿狅笍  鏈兘纭鍒囨崲鍒拌€佸笀[${teacherOption.text}]锛岃烦杩囪鑰佸笀`);
            continue;
          }

          const scopeResult = await collectCoursesForCurrentTeacherScope(`鑰佸笀:${teacherOption.text}`);
          if (!pageData && scopeResult.pageData) {
            pageData = scopeResult.pageData;
          }

          weekCount = Math.max(weekCount, scopeResult.weekCount || 0);
          (scopeResult.weeklyButtons || []).forEach(button => {
            if (button && button.id && !weeklyButtonMap.has(button.id)) {
              weeklyButtonMap.set(button.id, button);
            }
          });

          const scopedCourses = (scopeResult.allCourses || []).map(course => ({
            ...course,
            teacher: course.teacher || teacherOption.text,
            teacherScope: teacherOption.text
          }));
          allCourses = allCourses.concat(scopedCourses);
          console.log(`老师[${teacherOption.text}]抓取完成，累计课程 ${allCourses.length} 条`);
        }

        if (failedTeacherSelections.length > 0) {
          throw new Error(`閫愯€佸笀鎶撳彇鏈畬鎴愶紝浠ヤ笅鑰佸笀鍒囨崲澶辫触: ${failedTeacherSelections.join(', ')}`);
        }

        weeklyButtons = Array.from(weeklyButtonMap.values());
        const aggregatedUniqueCourses = [];
        const aggregatedSeenKeys = new Set();
        for (const course of allCourses) {
          const uniqueKey = `${course.teacher}-${course.student}-${course.date}-${course.time}`;
          if (!aggregatedSeenKeys.has(uniqueKey)) {
            aggregatedSeenKeys.add(uniqueKey);
            aggregatedUniqueCourses.push(course);
          }
        }
        allCourses = aggregatedUniqueCourses.map((course, index) => ({
          ...course,
          globalIndex: index + 1
        }));
      } else {
        const scopeResult = await collectCoursesForCurrentTeacherScope('鍏ㄩ儴鑰佸笀');
        pageData = scopeResult.pageData;
        allCourses = scopeResult.allCourses || [];
        weekCount = scopeResult.weekCount || 0;
        weeklyButtons = scopeResult.weeklyButtons || [];
      }

      const courseData = {
        ...pageData,
        courses: allCourses,
        totalCourses: allCourses.length,
        totalWeeks: weekCount,
        weeklyButtons: weeklyButtons
      };

      console.log(`Found ${courseData.totalCourses} courses`);

      // Save data to Database
      let dbResult = { success: false, message: '鏈墽琛屾暟鎹簱鎿嶄綔' };
      if (courseData.courses.length > 0) {
        try {
          console.log('Preparing data for database...');

          // Prepare data for database - required format: 鏃ユ湡銆佹椂闂淬€佽€佸笀銆佸鐢熴€佹墸璇炬暟銆佽绋嬬被鍨?
          const excelData = courseData.courses.map(course => {
            const row = {};

            // Required columns
            row['鏃ユ湡'] = course.date || '';
            row['鏃堕棿'] = course.time || '';
            row['鑰佸笀'] = course.teacher || '';
            row['瀛︾敓'] = course.student || '';
            row['扣课数'] = course.deduction || '';
            row['璇剧▼绫诲瀷'] = course.courseType || '鏈煡';

            // Additional reference info
            row['鍛ㄦ湡'] = course.weekText || '';

            return row;
          });

          // Save to database directly (Excel generation removed)
          console.log('馃捑 寮€濮嬩繚瀛樻暟鎹埌鏁版嵁搴?..');
          dbResult = await this.saveToDB(allCourses);
          console.log(dbResult.message);
          if (!dbResult.success) {
            throw new Error(dbResult.message);
          }

          // After courses data, scrape member card data
          console.log('\n馃幆 寮€濮嬫姄鍙栦細鍛樺崱鏁版嵁...');
          const cardData = await this.scrapeMemberCards(page);
      console.log(`会员卡数据抓取完成，共获得 ${cardData.length} 条记录`);

          // Save member card data to database directly (Excel generation removed)
          if (cardData.length > 0) {
            console.log('馃捑 寮€濮嬩繚瀛樹細鍛樺崱鏁版嵁鍒版暟鎹簱...');
            const cardDbResult = await this.saveCardDataToDB(cardData);
            console.log(cardDbResult.message);
            if (!cardDbResult.success) {
              throw new Error(cardDbResult.message);
            }
          }

          // Final completion summary
          console.log('\n' + '='.repeat(70));
          console.log('馃弫 鍏ㄩ儴鎶撳彇浠诲姟瀹屾垚');
          console.log('馃搳 鏈鎶撳彇姹囨€?');
      console.log(`   课程数据: ${courseData.totalCourses} 条课程记录`);
      console.log(`   会员卡数据: ${cardData.length} 条会员记录`);
          console.log(`   馃捑 鏁版嵁宸蹭繚瀛樿嚦鏁版嵁搴? yuekebao_classtime + yuekebao_student_cardnum`);
          console.log('='.repeat(70) + '\n');

        } catch (dataError) {
          console.error('Data processing failed:', dataError.message);
          console.error('Error stack:', dataError.stack);
          console.error('Course data structure:', JSON.stringify(courseData.courses.slice(0, 2), null, 2)); // Show first 2 courses for debugging
          throw dataError;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `# 绾﹁瀹濊绋嬬鐞嗘暟鎹姄鍙栫粨鏋?

## 鍩烘湰淇℃伅
- **椤甸潰鏍囬**: ${courseData.title}
- **椤甸潰URL**: ${courseData.url}
- **鎶撳彇鏃堕棿**: ${courseData.timestamp}
- **璇剧▼浼氳瘽鎬绘暟**: ${courseData.totalCourses}
- **鎶撳彇鍛ㄦ湡鏁?*: ${courseData.totalWeeks} 涓懆鏈?
- **鍙敤鍛ㄦ湡**: ${courseData.weeklyButtons.map(b => b.text).join(', ')}

## 璇剧▼浼氳瘽鏁版嵁姒傝 (鍓?鏉?
${courseData.courses.length > 0 ?
  courseData.courses.slice(0, 5).map(course =>
    `### 璇剧▼浼氳瘽 ${course.globalIndex || '鏈煡'} (${course.weekText || '鏈煡鍛ㄦ湡'})
- **鏃ユ湡**: ${course.date || '鏈煡鏃ユ湡'}
- **鏃堕棿**: ${course.time || '鏈煡鏃堕棿'}
- **鑰佸笀**: ${course.teacher || '鏈煡鑰佸笀'}
- **瀛︾敓**: ${course.student || '鏈煡瀛︾敓'}
- **扣课数**: ${course.deduction || '未知扣课数'}
`
  ).join('\n\n')
  : '未找到课程会话数据'}

${courseData.courses.length > 5 ? `\n... 杩樻湁 ${courseData.courses.length - 5} 鏉¤绋嬩細璇濇暟鎹凡淇濆瓨鍒版暟鎹簱涓璡n` : ''}

## JSON鏁版嵁
${courseData.jsonData ?
  '```json\n' + JSON.stringify(courseData.jsonData, null, 2) + '\n```'
  : '未找到 JSON 格式的课程数据'}

## 鏁版嵁搴撲繚瀛?
${dbResult.message}
`
          }
        ]
      };

    } catch (error) {
      console.error('Error scraping yuekebao courses:', error);
      console.error('Error stack:', error.stack);
      console.error('Error name:', error.name);

      // Add current page info for debugging
      let currentPageInfo = '';
      if (page) {
        try {
          const currentUrl = page.url();
          currentPageInfo = `\n- 褰撳墠椤甸潰URL: ${currentUrl}`;
        } catch (pageError) {
          currentPageInfo = '\n- 鏃犳硶鑾峰彇褰撳墠椤甸潰淇℃伅';
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `鎶撳彇绾﹁瀹濊绋嬫暟鎹椂鍙戠敓閿欒: ${error.message}

閿欒璇︽儏:
- 閿欒绫诲瀷: ${error.name}
- 瀹屾暣閿欒淇℃伅: ${error.stack}${currentPageInfo}

鍙兘鐨勮В鍐虫柟妗?
- 璇风‘璁ょ櫥褰曞嚟鎹槸鍚︽纭?
- 璇锋鏌ユ粦鍧楅獙璇佺爜鏄惁宸叉纭畬鎴?
- 璇风‘璁よ绋嬬鐞嗛〉闈㈡槸鍚﹀彲璁块棶
- 妫€鏌ョ綉椤电粨鏋勬槸鍚︽湁鍙樺寲
- 寤鸿璁剧疆 headless: false 鏉ヨ瀵熺櫥褰曡繃绋?

璋冭瘯寤鸿:
1. 鎵撳紑娴忚鍣ㄦ墜鍔ㄨ闂?https://www.yuekebao.cn/admin/login.php
2. 妫€鏌ョ櫥褰曡〃鍗曠殑瀹為檯鍏冪礌缁撴瀯
3. 确认滑块验证码的工作状态`
          }
        ],
        isError: true
      };
    } finally {
      // Clean up - always close browser after scraping
      console.log('馃敀 鍏抽棴娴忚鍣?..');
      try {
        if (page) await page.close();
        if (context) await context.close();
        if (browser) await browser.close();
        console.log('鉁?娴忚鍣ㄥ凡鍏抽棴');
      } catch (closeError) {
        console.log('鈿狅笍 鍏抽棴娴忚鍣ㄦ椂鍑洪敊:', closeError.message);
      }
    }
  }

  async saveToDB(courses) {
    let connection;
    try {
      const normalizedTeacherNames = Array.from(new Set(
        courses
          .map(course => String(course.teacher || '').trim())
          .filter(Boolean)
      ));
        console.log(`本次课程抓取识别到 ${normalizedTeacherNames.length} 位老师: ${normalizedTeacherNames.join(', ') || '无'}`);

      if (courses.length >= 100 && normalizedTeacherNames.length <= 1) {
        const onlyTeacher = normalizedTeacherNames[0] || '鏈煡鑰佸笀';
        return {
          success: false,
          message: `课程数据校验失败：仅识别到 1 位老师（${onlyTeacher}），疑似未切换到“全部老师”，已终止保存以避免覆盖数据库`,
          error: 'teacher_scope_validation_failed'
        };
      }

      // Database connection configuration
      const dbConfig = {
        host: process.env.MYSQL_HOST || '34.87.145.27',
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'dev',
        password: process.env.MYSQL_PASSWORD || '3.@d?*|X|GLc;0%z',
        database: process.env.MYSQL_DATABASE || 'baboon',
        timezone: SHANGHAI_DB_TIME_ZONE
      };

      console.log('馃敆 杩炴帴鏁版嵁搴?..');
      connection = await mysql.createConnection(dbConfig);
      await applyShanghaiTimeZoneToConnection(connection);
        console.log('数据库连接成功');

      // Prepare data for batch insert
      const insertData = courses.map(course => {
        // Parse time range (e.g., "08:00-08:25" -> start: "08:00", end: "08:25")
        let startTime = '';
        let endTime = '';
        if (course.time && course.time.includes('-')) {
          const timeParts = course.time.split('-');
          startTime = timeParts[0].trim();
          endTime = timeParts[1].trim();
        } else {
          startTime = course.time || '';
          endTime = '';
        }

        return [
          course.teacher || '',           // teacher
          course.student || '',           // student
          parseInt(course.deduction) || 1, // time_num
          course.date || null,            // class_date
          startTime,                      // class_start_time
          endTime,                        // class_end_time
          course.weekText || '',          // week_period
          course.courseType || '鏈煡',    // course_type (鏂板)
          new Date()                      // create_time
        ];
      });

      // Get date range from courses to delete existing data for the same period
      if (courses.length > 0) {
        console.log(`馃棏锔?娓呯┖鏁翠釜yuekebao_classtime琛?..`);

        const deleteQuery = 'DELETE FROM yuekebao_classtime';
        const [deleteResult] = await connection.execute(deleteQuery);

        console.log(`鉁?宸插垹闄?${deleteResult.affectedRows} 鏉℃棫璁板綍`);
      }

      // Batch insert new data using multiple VALUES
      const placeholders = insertData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const insertQuery = `
        INSERT INTO yuekebao_classtime
        (teacher, student, time_num, class_date, class_start_time, class_end_time, week_period, course_type, create_time)
        VALUES ${placeholders}
      `;

      // Flatten the data array for the query
      const flatData = insertData.flat();

      console.log(`馃摑 寮€濮嬫彃鍏?${courses.length} 鏉¤褰?..`);
      const [result] = await connection.execute(insertQuery, flatData);

      console.log(`成功插入 ${result.affectedRows} 条记录到数据库`);

      return {
        success: true,
        message: `数据库保存成功，插入了 ${result.affectedRows} 条课程记录`,
        insertedRows: result.affectedRows
      };

    } catch (error) {
      console.error('鉂?鏁版嵁搴撴搷浣滃け璐?', error.message);
      return {
        success: false,
        message: `鉂?鏁版嵁搴撲繚瀛樺け璐? ${error.message}`,
        error: error.message
      };
    } finally {
      if (connection) {
        await connection.end();
        console.log('馃攲 鏁版嵁搴撹繛鎺ュ凡鍏抽棴');
      }
    }
  }

  async scrapeMemberCards(page) {
    try {
      console.log('馃搫 瀵艰埅鑷充細鍛樺崱椤甸潰...');
      await page.goto('https://www.yuekebao.cn/admin/card_once.php', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await page.waitForTimeout(300);

      // 浣跨敤閲嶈瘯鏈哄埗鐐瑰嚮"鎵€鏈?鎸夐挳
      console.log('馃敇 鐐瑰嚮"鎵€鏈?鎸夐挳绛涢€夋墍鏈夌姸鎬?..');
      const allButtonResult = await this.retryWithDetection(
        async () => {
          try {
            const allButton = await page.$('button[onclick*="searchItemList"][onclick*="num_state"][onclick*="all"]');
            if (allButton) {
              await allButton.click();
              await page.waitForTimeout(500);
              return true;
            }
            return null;
          } catch (error) {
            console.log(`"鎵€鏈?鎸夐挳鐐瑰嚮灏濊瘯澶辫触: ${error.message}`);
            return null;
          }
        },
        '妫€娴嬪苟鐐瑰嚮"鎵€鏈?鎸夐挳'
      );

      if (allButtonResult) {
        console.log('鉁?宸叉垚鍔熺偣鍑?鎵€鏈?鎸夐挳');
      } else {
              console.log('未找到或点击“所有”按钮失败，继续使用默认筛选');
      }

      // 浣跨敤閲嶈瘯鏈哄埗璁剧疆姣忛〉鏄剧ず100鏉℃暟鎹?
      console.log('鈿欙笍 璁剧疆姣忛〉鏄剧ず100鏉℃暟鎹?..');
      const pageSizeResult = await this.retryWithDetection(
        async () => {
          try {
            const selectElement = await page.$('select[lay-ignore]');
            if (selectElement) {
              console.log('馃摑 閫夋嫨姣忛〉鏄剧ず100鏉?..');
              await selectElement.selectOption('100');
              // 绛夊緟椤甸潰閲嶆柊鍔犺浇鏁版嵁
              await page.waitForTimeout(2000);

              // 楠岃瘉鏄惁鐪熺殑鍔犺浇浜嗘洿澶氭暟鎹?
              const rowCount = await page.$$eval('tr[data-index]', rows => rows.length);
              console.log(`设置后当前页面有 ${rowCount} 行数据`);

              return rowCount > 50 ? rowCount : null; // 濡傛灉鎴愬姛搴旇鏈夋帴杩?00琛?
            }
            return null;
          } catch (error) {
            console.log(`鍒嗛〉閫夋嫨鍣ㄨ缃皾璇曞け璐? ${error.message}`);
            return null;
          }
        },
        '检测并设置分页选择器'
      );

      if (pageSizeResult) {
            console.log(`已成功设置每页显示 100 条，当前页有 ${pageSizeResult} 行数据`);
      } else {
            console.log('未找到分页选择器或设置失败，继续使用默认设置');
      }

      const allCardData = [];
      let currentPage = 1;

      while (true) {
        console.log(`馃搳 鎶撳彇绗?${currentPage} 椤垫暟鎹?..`);

        // 浣跨敤閲嶈瘯鏈哄埗绛夊緟琛ㄦ牸鍔犺浇
        const tableLoaded = await this.retryWithDetection(
          async () => {
            try {
              await page.waitForSelector('tr[data-index]', { timeout: 2000 });
              const rowCount = await page.$$eval('tr[data-index]', rows => rows.length);
              return rowCount > 0 ? rowCount : null;
            } catch (error) {
              return null;
            }
          },
          `检测第 ${currentPage} 页表格数据`
        );

        if (!tableLoaded) {
          console.log(`第 ${currentPage} 页表格加载失败或无数据，可能已到最后一页`);
          break;
        }

          console.log(`第 ${currentPage} 页找到 ${tableLoaded} 行数据`);

        // Extract data from current page
        const pageCardData = await page.evaluate(() => {
          const cards = [];
          const rows = document.querySelectorAll('tr[data-index]');

          rows.forEach(row => {
            try {
              // 1. 瀛︾敓濮撳悕 - 浠巇ata-content灞炴€ф垨鑰卻pan鍏冪礌鑾峰彇
              let studentName = '';
              const nameCell = row.querySelector('[data-field="member_name"]');
              if (nameCell) {
                const dataContent = nameCell.getAttribute('data-content');
                if (dataContent) {
                  // 鏍囧噯鍖栫┖鏍硷細灏嗗涓繛缁┖鏍兼浛鎹负鍗曚釜绌烘牸
                  studentName = dataContent.trim().replace(/\s+/g, ' ');
                } else {
                  const nameSpan = nameCell.querySelector('span.ft16');
                  if (nameSpan) {
                    // 鏍囧噯鍖栫┖鏍硷細灏嗗涓繛缁┖鏍兼浛鎹负鍗曚釜绌烘牸
                    studentName = nameSpan.innerText.trim().replace(/\s+/g, ' ');
                  }
                }
              }

              // 2. 瀛︾敓鎵嬫満鍙?- 浠巋ref="tel:xxx"鑾峰彇
              let studentPhone = '';
              const phoneLink = row.querySelector('a[href^="tel:"]');
              if (phoneLink) {
                const href = phoneLink.getAttribute('href');
                if (href && href.startsWith('tel:')) {
                  studentPhone = href.replace('tel:', '').trim();
                }
              }

              // 3. 璇剧▼绫诲瀷 - 浠庤绋嬩俊鎭崟鍏冩牸鑾峰彇
              let courseType = '';
              const courseCell = row.querySelector('[data-field="num_yu"]');
              if (courseCell) {
                const courseSpan = courseCell.querySelector('span.ft15');
                if (courseSpan) {
                  courseType = courseSpan.innerText.trim();
                }
              }

              // 4. 鍓╀綑璇炬椂鏁?- 浠?浣橷X娆?涓彁鍙栨暟瀛?
              let remainingClasses = 0;
              const remainingSpan = courseCell ? courseCell.querySelector('span.layui-badge') : null;
              if (remainingSpan) {
                const remainingText = remainingSpan.innerText.trim();

                // 妫€鏌ユ槸鍚﹀寘鍚?宸插畬鎴?鎴?宸茶繃鏈?瀛楁牱锛屽鏋滃寘鍚垯璺宠繃姝よ褰?
                if (remainingText.includes('已完成') || remainingText.includes('已过期')) {
                  console.log(`鈿狅笍 璺宠繃宸插畬鎴?宸茶繃鏈熻褰? ${studentName} | ${remainingText}`);
                  return; // 璺宠繃姝ゆ潯璁板綍
                }

                const remainingMatch = remainingText.match(/(\d+)/);
                if (remainingMatch) {
                  remainingClasses = parseInt(remainingMatch[1]) || 0;
                }
              }

              // 5. 鍓╀綑宸叉帓璇炬暟 - 浠?鏈紑璇鹃鎵X娆?涓彁鍙栨暟瀛?
              let scheduledClasses = 0;
              if (courseCell) {
                const courseText = courseCell.innerText;
                const normalizedCourseText = courseText.replace(/\s+/g, '');
                const scheduledMatch =
                  normalizedCourseText.match(/(\d+)/);
                if (scheduledMatch) {
                  scheduledClasses = parseInt(scheduledMatch[1]) || 0;
                }
              }

              // 鏁版嵁娓呮礂锛氳绋嬬被鍨嬭繃婊?
              let cleanedCourseType = '';
              if (courseType) {
                // 濡傛灉瀹屽叏绛変簬"璇曡"锛屽垯涓嶇粺璁¤繖鏉¤褰?
                if (courseType.trim() === '璇曡') {
                  console.log(`鈿狅笍 璺宠繃璇曡璁板綍: ${studentName} | ${courseType}`);
                  return; // 璺宠繃姝ゆ潯璁板綍
                }

                // 璇剧▼绫诲瀷娓呮礂
                if (courseType.includes('鑿叉暀')) {
                  cleanedCourseType = '鑿叉暀';
                } else if (courseType.includes('娆ф暀')) {
                  cleanedCourseType = '娆ф暀';
                } else if (courseType.includes('一对')) {
                  cleanedCourseType = '涓€瀵瑰';
                } else {
                  cleanedCourseType = courseType; // 淇濇寔鍘熸牱
                }
              }

              // 鍙湁褰撴湁鏈夋晥鏁版嵁鏃舵墠娣诲姞璁板綍
              if (studentName && cleanedCourseType) {
                cards.push({
                  studentName: studentName,
                  studentPhone: studentPhone,
                  courseType: cleanedCourseType,
                  remainingClasses: remainingClasses,
                  scheduledClasses: scheduledClasses
                });

                console.log(`提取数据: ${studentName} | ${studentPhone} | ${cleanedCourseType} | 余 ${remainingClasses} 次 | 已排 ${scheduledClasses} 次`);
              }

            } catch (rowError) {
              console.log('鈿狅笍 瑙ｆ瀽琛屾暟鎹椂鍑洪敊:', rowError.message);
            }
          });

          return cards;
        });

        console.log(`第 ${currentPage} 页提取了 ${pageCardData.length} 条数据`);
        allCardData.push(...pageCardData);

        // Check if there's a next page and get pagination info
        const paginationInfo = await page.evaluate(() => {
          const nextButton = document.querySelector('.layui-laypage-next');
          const hasNextPage = nextButton && !nextButton.classList.contains('layui-disabled');

          // Get all pagination links for completion verification
          const paginationContainer = document.querySelector('.layui-box.layui-laypage.layui-laypage-default');
          const allPageLinks = paginationContainer ? Array.from(paginationContainer.querySelectorAll('a')).map(a => ({
            text: a.innerText.trim(),
            className: a.className,
            isDisabled: a.classList.contains('layui-disabled')
          })) : [];

          return {
            hasNextPage,
            allPageLinks,
            totalLinks: allPageLinks.length
          };
        });

        if (!paginationInfo.hasNextPage) {
              console.log('已到达最后一页');
          console.log('馃搳 鍒嗛〉閾炬帴閬嶅巻瀹屾垚鎯呭喌:');
          console.log(`   - 鎬婚〉鐮侀摼鎺ユ暟: ${paginationInfo.totalLinks}`);
          console.log(`   - 褰撳墠宸插鐞嗛〉鏁? ${currentPage}`);
          console.log(`   - 鍒嗛〉閾炬帴璇︽儏: ${JSON.stringify(paginationInfo.allPageLinks)}`);
            console.log('所有会员卡分页已遍历完成');
          break;
        }

        // Click next page
        try {
          // 璁板綍缈婚〉鍓嶇殑鏁版嵁鐗瑰緛锛堢涓€琛岀殑瀛︾敓鍚嶏級锛岀敤浜庨獙璇佺炕椤垫垚鍔?
          const beforePageFirstStudent = await page.evaluate(() => {
            const firstRow = document.querySelector('tr[data-index="0"]');
            if (firstRow) {
              const nameCell = firstRow.querySelector('[data-field="member_name"]');
              return nameCell ? nameCell.getAttribute('data-content') || nameCell.innerText : '';
            }
            return '';
          });

          await page.click('.layui-laypage-next');

          // 浣跨敤鏅鸿兘绛夊緟锛氱瓑寰呮暟鎹彉鍖栧苟绋冲畾
          const newPageLoaded = await this.waitForDataStable(
            page,
            async () => {
              try {
                // 妫€鏌ョ涓€琛屾暟鎹槸鍚﹀凡鍙樺寲
                const currentFirstStudent = await page.evaluate(() => {
                  const firstRow = document.querySelector('tr[data-index="0"]');
                  if (firstRow) {
                    const nameCell = firstRow.querySelector('[data-field="member_name"]');
                    return nameCell ? nameCell.getAttribute('data-content') || nameCell.innerText : '';
                  }
                  return '';
                });

                // 濡傛灉绗竴琛屽鐢熷悕宸插彉鍖栵紝璇存槑鏂伴〉闈㈡暟鎹凡鍔犺浇
                if (currentFirstStudent && currentFirstStudent !== beforePageFirstStudent) {
                  const rowCount = await page.$$eval('tr[data-index]', rows => rows.length);
                  return rowCount;
                }
                return 0; // 鏁版嵁鏈彉鍖栵紝缁х画绛夊緟
              } catch (e) {
                return 0;
              }
            },
            `会员卡第 ${currentPage + 1} 页数据`,
            10000, // 鏈€澶х瓑寰?10 绉?
            600    // 鏁版嵁绋冲畾 600ms
          );

          if (newPageLoaded > 0) {
            currentPage++;
            console.log(`馃搫 鎴愬姛缈诲埌绗?${currentPage} 椤碉紝鏁版嵁琛屾暟: ${newPageLoaded}`);
          } else {
              console.log('翻页后数据未变化，可能已到最后一页');
            break;
          }
        } catch (nextError) {
          console.log('鈿狅笍 鐐瑰嚮涓嬩竴椤靛け璐?', nextError.message);
          break;
        }
      }

      // Merge data with same courseType + studentName + studentPhone
      console.log('馃攧 寮€濮嬪悎骞剁浉鍚屽鐢熺殑澶氭潯璁板綍...');
      const mergedData = this.mergeCardData(allCardData);

      console.log('\n' + '='.repeat(60));
      console.log('会员卡数据抓取流程完成');
      console.log(`总计处理页数: ${currentPage} 页`);
      console.log(`原始数据记录: ${allCardData.length} 条`);
      console.log(`合并后记录: ${mergedData.length} 条`);
      console.log('='.repeat(60) + '\n');

      return mergedData;

    } catch (error) {
      console.error('鉂?鎶撳彇浼氬憳鍗℃暟鎹け璐?', error.message);
      return [];
    }
  }

  mergeCardData(cardData) {
    const merged = {};

    cardData.forEach(card => {
      const key = `${card.courseType}_${card.studentName}_${card.studentPhone}`;

      if (merged[key]) {
        // 鍚堝苟鏁版嵁锛氱浉鍔犲墿浣欒鏃舵暟鍜屽凡鎺掕鏁?
        merged[key].remainingClasses += card.remainingClasses;
        merged[key].scheduledClasses += card.scheduledClasses;
      } else {
        merged[key] = { ...card };
      }
    });

    const mergedArray = Object.values(merged);
        console.log(`数据合并完成，从 ${cardData.length} 条原始记录合并为 ${mergedArray.length} 条记录`);

    return mergedArray;
  }

  async saveCardDataToDB(cardData) {
    let connection;
    try {
      const mysql = await import('mysql2/promise');

      // Database connection configuration (same as course data)
      const dbConfig = {
        host: process.env.MYSQL_HOST || '34.87.145.27',
        port: parseInt(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'dev',
        password: process.env.MYSQL_PASSWORD || '3.@d?*|X|GLc;0%z',
        database: process.env.MYSQL_DATABASE || 'baboon',
        timezone: SHANGHAI_DB_TIME_ZONE
      };

      console.log('馃敆 杩炴帴鏁版嵁搴?..');
      connection = await mysql.createConnection(dbConfig);
      await applyShanghaiTimeZoneToConnection(connection);
      console.log('数据库连接成功');

      // Clear existing data from yuekebao_student_cardnum table
      console.log('馃棏锔?娓呯悊浼氬憳鍗℃暟鎹〃...');
      const [deleteResult] = await connection.execute('DELETE FROM yuekebao_student_cardnum');
      console.log(`鉁?宸叉竻鐞?${deleteResult.affectedRows} 鏉℃棫璁板綍`);

      // Prepare data for database insertion
      const insertData = cardData.map(card => [
        card.studentName || '',        // student
        card.studentPhone || '',       // mobile (keep as string)
        1,                             // time_num (default value)
        card.courseType || '',         // class_card_type
        card.remainingClasses || 0,    // card_times_left
        card.scheduledClasses || 0,    // arranged_times
        new Date()                     // create_time
      ]);

      // Batch insert new data
      const placeholders = insertData.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const insertQuery = `
        INSERT INTO yuekebao_student_cardnum
        (student, mobile, time_num, class_card_type, card_times_left, arranged_times, create_time)
        VALUES ${placeholders}
      `;

      // Flatten the data array for the query
      const flatData = insertData.flat();

      console.log(`馃摑 寮€濮嬫彃鍏?${cardData.length} 鏉′細鍛樺崱璁板綍...`);
      const [result] = await connection.execute(insertQuery, flatData);

      console.log(`成功插入 ${result.affectedRows} 条记录到数据库`);

      return {
        success: true,
        message: `会员卡数据库保存成功，插入了 ${result.affectedRows} 条记录`,
        insertedRows: result.affectedRows
      };

    } catch (error) {
      console.error('鉂?浼氬憳鍗℃暟鎹簱鎿嶄綔澶辫触:', error.message);
      return {
        success: false,
        message: `鉂?浼氬憳鍗℃暟鎹簱淇濆瓨澶辫触: ${error.message}`,
        error: error.message
      };
    } finally {
      if (connection) {
        await connection.end();
        console.log('馃攲 鏁版嵁搴撹繛鎺ュ凡鍏抽棴');
      }
    }
  }

  // 鐢熸垚鑷鍚峉SL璇佷功
  generateSelfSignedCert() {
    const certDir = path.resolve(this.__dirname, '..', 'ssl');
    const keyPath = path.join(certDir, 'server.key');
    const certPath = path.join(certDir, 'server.crt');

    try {
      // 妫€鏌ヨ瘉涔︽槸鍚﹀凡瀛樺湪
      readFileSync(keyPath);
      readFileSync(certPath);
      console.log('馃攼 浣跨敤鐜版湁SSL璇佷功');
      return { keyPath, certPath };
    } catch (error) {
      // 璇佷功涓嶅瓨鍦紝鐢熸垚鏂扮殑
      console.log('馃攼 鐢熸垚鑷鍚峉SL璇佷功...');

      try {
        // 鍒涘缓ssl鐩綍
        execSync(`mkdir -p "${certDir}"`);

        // 鐢熸垚绉侀挜鍜岃瘉涔?
        const opensslCmd = `openssl req -x509 -nodes -days 365 -newkey rsa:2048 ` +
          `-keyout "${keyPath}" -out "${certPath}" ` +
          `-subj "/C=CN/ST=Beijing/L=Beijing/O=YuekebaoGrabber/CN=localhost"`;

        execSync(opensslCmd);
        console.log('鉁?SSL璇佷功鐢熸垚鎴愬姛');
        return { keyPath, certPath };
      } catch (opensslError) {
        console.warn('OpenSSL 不可用，将使用 HTTP 服务');
        return null;
      }
    }
  }

  // 鍚姩Web浠〃鏉挎湇鍔″櫒
  async startDashboard(port = 3000, useHttps = true) {
    if (this.app) {
      console.log('Web 服务已在运行中');
      return;
    }

    this.app = express();

    // 鑾峰彇璺緞鍓嶇紑(濡傛灉鏈夎嚜瀹氫箟鍩熷悕璺緞)
    const basePath = process.env.BASE_PATH || '';
    const canonicalOrigin = (process.env.CANONICAL_ORIGIN || 'https://baboontalkies.pandada.world').replace(/\/+$/, '');
    const legacyManagerHosts = new Set(
      (process.env.LEGACY_MANAGER_HOSTS || 'fc.pandada.world')
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(Boolean)
    );
    const legacyManagerBasePath = '/baboontalkies_manager';
    console.log(`馃搧 搴旂敤鍩虹璺緞: ${basePath || '/'}`);

    const defaultAutoFeedbackPrompt = [
      '浣犳槸鑻辫鑰佸笀鍔╃悊銆傝鍩轰簬璇惧爞鎴浘鐢熸垚璇惧悗鍙嶉锛岃姹傦細',
      '1) 鏈妭璇句富瑕佸唴瀹规杩帮紙2-3鍙ワ級',
      '2) 瀛︾敓琛ㄧ幇浜偣锛?-3鏉★級',
      '3) 闇€瑕佹敼杩涚偣锛?-3鏉★級',
      '4) 涓嬭妭璇惧缓璁紙1-2鏉★級',
      '语言：中文，100-200字，条理清晰。',
      '课堂信息：老师{teacherName}，学生{studentName}，课程{courseName}，时间{classTime}。',
    ].join('\n');
    const defaultMaterialKeyContentPromptTemplate = DEFAULT_MATERIAL_KEY_CONTENT_PROMPT_TEMPLATE;
    const defaultMaterialKeywordExplainPromptTemplate = DEFAULT_MATERIAL_KEYWORD_EXPLAIN_PROMPT_TEMPLATE;
    const defaultThumbnailCompanionLanguagePromptTemplate = DEFAULT_THUMBNAIL_COMPANION_LANGUAGE_PROMPT_TEMPLATE;
    const defaultThumbnailCompanionTextlessPromptTemplate = DEFAULT_THUMBNAIL_COMPANION_TEXTLESS_PROMPT_TEMPLATE;
    const defaultThumbnailCompanionBackgroundPromptTemplate = DEFAULT_THUMBNAIL_COMPANION_BACKGROUND_PROMPT_TEMPLATE;
    const defaultThumbnailAnnotationPromptTemplate = DEFAULT_THUMBNAIL_ANNOTATION_PROMPT_TEMPLATE;
    const defaultThumbnailVideoPromptTemplate = DEFAULT_THUMBNAIL_VIDEO_PROMPT_TEMPLATE;
    const defaultSummaryImagePromptTemplate = DEFAULT_SUMMARY_IMAGE_PROMPT_TEMPLATE;

    // 鍏ㄥ眬涓棿浠?
    this.app.use(cors());
    this.app.use(express.json());

    // 缁熶竴灏嗘棫闃块噷浜戝叆鍙ｅ拰鍘嗗彶璺緞鍓嶇紑閲嶅畾鍚戝埌姝ｅ紡鍏ュ彛锛岄伩鍏嶇户缁墦鍒伴仐鐣欑幆澧冦€?
    this.app.use((req, res, next) => {
      const forwardedHost = `${req.headers['x-forwarded-host'] || ''}`.split(',')[0].trim();
      const hostHeader = forwardedHost || req.get('host') || '';
      const hostname = hostHeader.split(':')[0].toLowerCase();
      const originalUrl = req.originalUrl || req.url || '/';
      const hasLegacyBasePath = originalUrl === legacyManagerBasePath
        || originalUrl.startsWith(`${legacyManagerBasePath}/`)
        || originalUrl.startsWith(`${legacyManagerBasePath}?`);
      const isLegacyHost = legacyManagerHosts.has(hostname);

      if (!isLegacyHost && !(!basePath && hasLegacyBasePath)) {
        return next();
      }

      let targetPath = originalUrl;
      if (targetPath === legacyManagerBasePath) {
        targetPath = '/';
      } else if (targetPath.startsWith(`${legacyManagerBasePath}/`)) {
        targetPath = targetPath.substring(legacyManagerBasePath.length);
      } else if (targetPath.startsWith(`${legacyManagerBasePath}?`)) {
        targetPath = targetPath.substring(legacyManagerBasePath.length);
      }

      if (!targetPath.startsWith('/')) {
        targetPath = `/${targetPath}`;
      }

      const forwardedProto = `${req.headers['x-forwarded-proto'] || ''}`.split(',')[0].trim();
      const requestProtocol = forwardedProto || req.protocol || 'https';
      const requestOrigin = hostHeader ? `${requestProtocol}://${hostHeader}` : canonicalOrigin;
      const targetOrigin = isLegacyHost ? canonicalOrigin : requestOrigin;
      const targetUrl = `${targetOrigin}${targetPath}`;

      if (targetUrl === `${requestOrigin}${originalUrl}`) {
        return next();
      }

      console.log(`鈫?Legacy manager redirect: ${hostHeader || '(unknown host)'}${originalUrl} -> ${targetUrl}`);
      return res.redirect(308, targetUrl);
    });

    // 鏁版嵁搴撻厤缃?
    const dbConfig = {
      host: process.env.MYSQL_HOST || '34.87.145.27',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'dev',
      password: process.env.MYSQL_PASSWORD || '3.@d?*|X|GLc;0%z',
      database: process.env.MYSQL_DATABASE || 'baboon',
      timezone: SHANGHAI_DB_TIME_ZONE,
      connectTimeout: parseInt(process.env.MYSQL_CONNECT_TIMEOUT || '5000', 10)
    };
    const dbPool = mysql.createPool({
      ...dbConfig,
      waitForConnections: true,
      connectionLimit: parseInt(process.env.MYSQL_POOL_SIZE || '10', 10),
      maxIdle: parseInt(process.env.MYSQL_POOL_MAX_IDLE || '10', 10),
      idleTimeout: parseInt(process.env.MYSQL_POOL_IDLE_TIMEOUT || '60000', 10),
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    // 鑾峰彇鏁版嵁搴撹繛鎺?
    const getDbConnection = async () => {
      const connection = await dbPool.getConnection();
      await applyShanghaiTimeZoneToConnection(connection);
      const release = connection.release.bind(connection);
      connection.end = async () => {
        release();
      };
      return connection;
    };

    // feifei 鏁版嵁搴撻厤缃紙宸茶縼绉诲埌鏂版湇鍔″櫒锛?
    const feifeiDbConfig = {
      host: process.env.MYSQL_HOST || '34.87.145.27',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'dev',
      password: process.env.MYSQL_PASSWORD || '3.@d?*|X|GLc;0%z',
      database: process.env.MYSQL_DATABASE || 'baboon',
      timezone: SHANGHAI_DB_TIME_ZONE,
      charset: 'utf8mb4',
      connectTimeout: parseInt(process.env.MYSQL_CONNECT_TIMEOUT || '5000', 10)
    };
    const feifeiDbPool = mysql.createPool({
      ...feifeiDbConfig,
      waitForConnections: true,
      connectionLimit: parseInt(process.env.MYSQL_POOL_SIZE || '10', 10),
      maxIdle: parseInt(process.env.MYSQL_POOL_MAX_IDLE || '10', 10),
      idleTimeout: parseInt(process.env.MYSQL_POOL_IDLE_TIMEOUT || '60000', 10),
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    // 鑾峰彇 feifei 鏁版嵁搴撹繛鎺?
    const getFeifeiDbConnection = async () => {
      const connection = await feifeiDbPool.getConnection();
      await applyShanghaiTimeZoneToConnection(connection);
      const release = connection.release.bind(connection);
      connection.end = async () => {
        release();
      };
      return connection;
    };

    const feifeiBackendUrl = process.env.FEIFEI_BACKEND_URL
      || 'https://baboontalkies-backend-627990150052.asia-southeast1.run.app';
    const postJson = (url, payload, timeoutMs = 15000) => new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const data = JSON.stringify(payload || {});
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => req.destroy(new Error('request timeout')));
      req.write(data);
      req.end();
    });

    const forwardWechatRequest = async (req, res) => {
      const upstreamBase = feifeiBackendUrl.replace(/\/$/, '');
      const targetUrl = `${upstreamBase}${req.originalUrl}`;

      try {
        const method = (req.method || 'GET').toUpperCase();
        const headers = {};
        Object.entries(req.headers || {}).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'host' || lowerKey === 'content-length') return;
          headers[key] = Array.isArray(value) ? value.join(',') : value;
        });

        let requestBody;
        if (!['GET', 'HEAD'].includes(method) && req.body !== undefined && req.body !== null) {
          if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
            requestBody = req.body;
          } else {
            requestBody = JSON.stringify(req.body);
            if (!headers['content-type'] && !headers['Content-Type']) {
              headers['content-type'] = 'application/json';
            }
          }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const upstreamResponse = await fetch(targetUrl, {
          method,
          headers,
          body: requestBody,
          redirect: 'manual',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        res.status(upstreamResponse.status);
        const contentType = upstreamResponse.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);

        const body = await upstreamResponse.text();
        res.send(body);
      } catch (error) {
        console.error(`杞彂 WeChat API 澶辫触: ${targetUrl}`, error);
        res.status(502).json({
          success: false,
          error: '杞彂 WeChat API 澶辫触',
          detail: error.message
        });
      }
    };

    // 鏁版嵁搴撹縼绉诲嚱鏁帮細娣诲姞 course_type 瀛楁
    const runDatabaseMigrations = async () => {
      let connection;
      try {
        console.log('馃敡 妫€鏌ユ暟鎹簱杩佺Щ...');
        connection = await getDbConnection();

        // 妫€鏌?course_type 瀛楁鏄惁瀛樺湪
        const [columns] = await connection.execute(
          `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'yuekebao_classtime' AND COLUMN_NAME = 'course_type'`,
          [dbConfig.database]
        );

        if (columns.length === 0) {
          console.log('馃摑 娣诲姞 course_type 瀛楁鍒?yuekebao_classtime 琛?..');
          await connection.execute(
            `ALTER TABLE yuekebao_classtime
             ADD COLUMN course_type VARCHAR(20) DEFAULT '鏈煡' AFTER week_period`
          );
          console.log('鉁?course_type 瀛楁娣诲姞鎴愬姛');
        } else {
          console.log('course_type 字段已存在');
        }

        // 妫€鏌?classFeedback2 瀛楁鏄惁瀛樺湪
        const [feedbackColumns] = await connection.execute(
          `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'base_user_studentclassrecord' AND COLUMN_NAME = 'classFeedback2'`,
          [dbConfig.database]
        );

        if (feedbackColumns.length === 0) {
          console.log('馃摑 娣诲姞 classFeedback2 瀛楁鍒?base_user_studentclassrecord 琛?..');
          await connection.execute(
            `ALTER TABLE base_user_studentclassrecord
             ADD COLUMN classFeedback2 LONGTEXT NULL AFTER classFeedback`
          );
          console.log('鉁?classFeedback2 瀛楁娣诲姞鎴愬姛');
        } else {
          console.log('classFeedback2 字段已存在');
        }
      } catch (error) {
        console.error('鉂?鏁版嵁搴撹縼绉诲け璐?', error.message);
        // 涓嶆姏鍑洪敊璇紝鍏佽鏈嶅姟鍣ㄧ户缁惎鍔?
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    };

    // 鎵ц鏁版嵁搴撹縼绉?
    await runDatabaseMigrations();

    // 濡傛灉鏈?basePath,娣诲姞璺緞閲嶅啓涓棿浠?
    if (basePath) {
      this.app.use((req, res, next) => {
        // 濡傛灉璇锋眰璺緞浠?basePath 寮€澶?鍘婚櫎鍓嶇紑
        if (req.path.startsWith(basePath)) {
          req.url = req.url.substring(basePath.length) || '/';
          console.log(`馃摑 璺緞閲嶅啓: ${basePath}${req.path} 鈫?${req.url}`);
        }
        next();
      });
    }

    // 闈欐€佹枃浠舵湇鍔?
    this.app.use(express.static(path.resolve(this.__dirname, '..')));

    console.log('馃敡 鍒濆鍖栨暀鏉愭ā鍧?..');
    await registerMaterialLibraryRoutes({
      app: this.app,
      getDbConnection,
      projectRoot: path.resolve(this.__dirname, '..')
    });
    console.log('教材模块初始化完成');

    // API鎺ュ彛锛氳幏鍙栦华琛ㄦ澘鏁版嵁
    this.app.get('/api/dashboard-data', async (req, res) => {
      let connection;
      let hiddenRemainingStudents = new Set();

      try {
        connection = await getDbConnection();
        try {
          const [configRows] = await connection.execute(
            'SELECT config FROM yuekebao_config WHERE id = 1'
          );
          if (configRows.length > 0) {
            const config = JSON.parse(configRows[0].config || '{}');
            hiddenRemainingStudents = new Set(
              (Array.isArray(config.hide_remaining_students) ? config.hide_remaining_students : [])
                .filter(Boolean)
            );
          }
        } catch (configError) {
          console.warn('闅愯棌鍓╀綑璇炬椂瀛﹀憳閰嶇疆璇诲彇澶辫触锛屽皢缁х画浣跨敤榛樿缁熻鍙ｅ緞:', configError.message);
        }
        console.log('馃搳 寮€濮嬭幏鍙栦华琛ㄦ澘鏁版嵁...');

        // 1. 鑾峰彇浼氬憳鍗℃暟鎹紙瀛︾敓鍩烘湰淇℃伅锛?
        const [allCardData] = await connection.execute(`
          SELECT
            student as name,
            mobile,
            class_card_type as courseType,
            card_times_left as remainingClasses,
            arranged_times as scheduledClasses
          FROM yuekebao_student_cardnum
          WHERE time_num > 0
          ORDER BY student
        `);

        console.log(`馃摑 鑾峰彇鍒?${allCardData.length} 鏉″師濮嬩細鍛樺崱璁板綍`);

        // 2. 鎸夊鍛樺垎缁勶紝瀹炵幇鏉′欢杩囨护閫昏緫
        const studentCardMap = new Map();
        allCardData.forEach(card => {
          const studentName = card.name;
          if (!studentCardMap.has(studentName)) {
            studentCardMap.set(studentName, []);
          }
          studentCardMap.get(studentName).push(card);
        });

        // 3. 搴旂敤杩囨护瑙勫垯锛氬绉嶇被鍨嬫椂鍙樉绀哄墿浣欒鏃?0鐨勶紝鍗曠绫诲瀷鏃跺叏閮ㄦ樉绀?
        const cardData = [];
        let multiTypeFilteredCount = 0;
        let singleTypeKeptCount = 0;

        studentCardMap.forEach((cards, studentName) => {

          if (cards.length === 1) {
            // 鍙湁涓€绉嶈绋嬬被鍨嬶紝涓嶇鍓╀綑璇炬椂鏄惁涓?閮芥樉绀?
            cardData.push(cards[0]);
            singleTypeKeptCount++;
          } else {
            // 鏈夊绉嶈绋嬬被鍨嬶紝鍙樉绀哄墿浣欒鏃?0鐨?
            const validCards = cards.filter(card => card.remainingClasses > 0);
            cardData.push(...validCards);
            multiTypeFilteredCount += (cards.length - validCards.length);
          }
        });

        console.log(`馃摑 杩囨护鍚庤幏寰?${cardData.length} 鏉℃湁鏁堜細鍛樺崱璁板綍`);

        // 4. 鑾峰彇鏈潵璇剧▼鏁版嵁锛堢敤浜庤绠椾箣鍚庤鑺傚拰90澶╁唴璇剧▼鏁帮級
        const currentDate = new Date();
        const futureDate = new Date();
        futureDate.setDate(currentDate.getDate() + 90);

        // 鑾峰彇鏈潵90澶╃殑璇剧▼鏁版嵁锛堟帓闄や粖澶╁凡缁忎笂杩囩殑璇撅級
        // 閫昏緫锛氭槑澶╁強浠ュ悗鐨勮绋?OR 浠婂ぉ浣嗕笂璇炬椂闂磋繕娌″埌鐨勮绋?
        const [futureCourseData] = await connection.execute(`
          SELECT
            yc.student,
            yc.teacher,
            yc.class_date,
            yc.class_start_time,
            yc.class_end_time,
            yc.time_num,
            COALESCE(yts.type, '鏈煡') as teacher_type
          FROM yuekebao_classtime yc
          LEFT JOIN yuekebao_teacher_salary yts ON yc.teacher = yts.teacher_name
          WHERE (
            (yc.class_date > CURDATE())
            OR (yc.class_date = CURDATE() AND yc.class_start_time > CURTIME())
          )
          AND yc.class_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)
          ORDER BY yc.class_date, yc.class_start_time
        `);

        // 5. 鑾峰彇鍘嗗彶璇剧▼鏁版嵁锛堢敤浜庤绠椾箣鍓嶈鑺傦級
        // 鍖呮嫭锛氭槰澶╁強涔嬪墠鐨勮绋?+ 浠婂ぉ宸茬粡涓婅繃鐨勮绋?
        const [pastCourseData] = await connection.execute(`
          SELECT
            student,
            teacher,
            class_date,
            class_start_time,
            class_end_time
          FROM yuekebao_classtime
          WHERE (class_date < CURDATE())
            OR (class_date = CURDATE() AND class_start_time <= CURTIME())
          ORDER BY class_date DESC, class_start_time DESC
        `);

        console.log(`获取到 ${futureCourseData.length} 条未来90天课程记录`);
        console.log(`获取到 ${pastCourseData.length} 条历史课程记录`);

        // 璋冭瘯锛氭樉绀烘湭鏉ヨ绋嬫暟鎹殑鍓嶅嚑鏉¤褰?
        if (futureCourseData.length > 0) {
          console.log(`馃搵 鏈潵璇剧▼鏁版嵁绀轰緥 (鍓?鏉?:`);
          futureCourseData.slice(0, 3).forEach((course, index) => {
            console.log(`   ${index + 1}. ${course.student} - ${course.teacher} - ${course.class_date} ${course.class_start_time}`);
          });
        } else {
          console.log(`未来90天课程数据为空，可能 yuekebao_classtime 表中没有未来课程数据`);
        }

        // 6. 鍚堝苟鏁版嵁骞惰绠楁淳鐢熷瓧娈?
        const studentsMap = new Map();

        // 棣栧厛澶勭悊浼氬憳鍗℃暟鎹?- 姣忕璇剧▼绫诲瀷鍗曠嫭涓€琛?
        cardData.forEach(card => {
          const studentName = card.name;
          const courseType = card.courseType;
          // 浣跨敤瀛﹀憳鍚嶇О+璇剧▼绫诲瀷浣滀负澶嶅悎key锛岀‘淇濇瘡绉嶈绋嬬被鍨嬮兘鍗曠嫭鏄剧ず
          const key = `${studentName}_${courseType}`;

          if (studentName && courseType) {
            studentsMap.set(key, {
              name: studentName,
              mobile: card.mobile,
              courseType: courseType,
              remainingClasses: card.remainingClasses || 0,
              scheduledClasses: card.scheduledClasses || 0,
              unscheduledClasses: 0, // 灏嗗湪鍚庨潰鏍规嵁鏈潵90澶╄绋嬫暟璁＄畻
              prevClass: null,
              nextClass: null,
              next90DaysClasses: 0,
              upcomingCourses: []
            });
          }
        });

        // 娣诲姞璇剧▼琛ㄤ腑瀛樺湪浣嗕細鍛樺崱鏁版嵁涓病鏈夛紙鎴栧墿浣欒鏃朵负0锛夌殑瀛﹀憳
        // 鏀堕泦鎵€鏈夎绋嬫暟鎹腑鐨勫鍛樺悕绉板強鍏惰€佸笀绫诲瀷
        const studentTeacherTypes = new Map(); // 瀛﹀憳鍚?-> 鑰佸笀绫诲瀷闆嗗悎
        [...futureCourseData, ...pastCourseData].forEach(course => {
          if (course.student) {
            if (!studentTeacherTypes.has(course.student)) {
              studentTeacherTypes.set(course.student, new Set());
            }
            if (course.teacher_type && course.teacher_type !== '鏈煡') {
              studentTeacherTypes.get(course.student).add(course.teacher_type);
            }
          }
        });

        // 涓鸿绋嬭〃涓瓨鍦ㄤ絾studentsMap涓病鏈夌殑瀛﹀憳鍒涘缓璁板綍
        studentTeacherTypes.forEach((teacherTypes, studentName) => {
          // 妫€鏌ヨ瀛﹀憳鏄惁宸茬粡鍦╯tudentsMap涓湁浠讳綍璇剧▼绫诲瀷鐨勮褰?
          const hasAnyRecord = Array.from(studentsMap.keys()).some(key => key.startsWith(`${studentName}_`));

          if (!hasAnyRecord) {
            // 璇ュ鍛樺湪璇剧▼琛ㄤ腑鏈夎褰曪紝浣嗗湪浼氬憳鍗℃暟鎹腑娌℃湁璁板綍
            // 鏍规嵁鑰佸笀绫诲瀷鎺ㄦ柇璇剧▼绫诲瀷
            let inferredCourseType = '鏈煡';
            if (teacherTypes.has('菲')) {
              inferredCourseType = '鑿叉暀';
            } else if (teacherTypes.has('欧')) {
              inferredCourseType = '娆ф暀';
            }

            const key = `${studentName}_${inferredCourseType}`;
            studentsMap.set(key, {
              name: studentName,
              mobile: '',
              courseType: inferredCourseType,
              remainingClasses: 0,
              scheduledClasses: 0,
              unscheduledClasses: 0,
              prevClass: null,
              nextClass: null,
              next90DaysClasses: 0,
              upcomingCourses: []
            });
          }
        });

        console.log(`馃摑 娣诲姞璇剧▼琛ㄤ腑鐨勫鍛樺悗锛屾€昏褰曟暟: ${studentsMap.size}`);

        // 鐒跺悗澶勭悊鏈潵璇剧▼鏁版嵁
        futureCourseData.forEach(course => {
          const studentName = course.student;

          if (studentName) {
            // 鏌ユ壘璇ュ鍛樼殑鎵€鏈夎绋嬬被鍨嬭褰曪紝灏嗚绋嬩俊鎭坊鍔犲埌姣忎竴绉嶇被鍨嬩腑
            for (const [key, student] of studentsMap.entries()) {
              // 濡傛灉璇ヨ褰曠殑瀛﹀憳濮撳悕鍖归厤
              if (student.name === studentName) {
                // 璁板綍璇ュ鐢熺殑鎵€鏈夋湭鏉ヨ绋?
                student.upcomingCourses.push({
                  teacher: course.teacher,
                  date: course.class_date,
                  startTime: course.class_start_time,
                  endTime: course.class_end_time
                });

                // 90澶╁唴璇剧▼鎬绘暟
                student.next90DaysClasses++;

                // 鏈€杩戜竴鑺傛湭鏉ヨ锛堝鏋滆繕娌℃湁璁剧疆鐨勮瘽锛?
                if (!student.nextClass) {
                  student.nextClass = {
                    teacher: course.teacher,
                    date: this.formatDate(course.class_date),
                    time: course.class_start_time
                  };
                }
              }
            }
          }
        });

        // 鐒跺悗澶勭悊鍘嗗彶璇剧▼鏁版嵁
        pastCourseData.forEach(course => {
          const studentName = course.student;

          if (studentName) {
            // 鏌ユ壘璇ュ鍛樼殑鎵€鏈夎绋嬬被鍨嬭褰曪紝灏嗗巻鍙茶绋嬩俊鎭坊鍔犲埌姣忎竴绉嶇被鍨嬩腑
            for (const [key, student] of studentsMap.entries()) {
              // 濡傛灉璇ヨ褰曠殑瀛﹀憳濮撳悕鍖归厤
              if (student.name === studentName) {
                // 鏈€杩戜竴鑺傚巻鍙茶锛堝鏋滆繕娌℃湁璁剧疆鐨勮瘽锛? 鐢变簬鏁版嵁宸叉寜鏃ユ湡鍊掑簭鎺掑垪锛岀涓€涓氨鏄渶杩戠殑
                if (!student.prevClass) {
                  student.prevClass = {
                    teacher: course.teacher,
                    date: this.formatDate(course.class_date),
                    time: course.class_start_time
                  };
                }
              }
            }
          }
        });

        // 4. 璁＄畻姣忎釜瀛﹀憳鐨勬€昏鏁版嵁锛堢敤浜庢帓搴忥級
        const studentTotalsMap = new Map();
        for (const student of studentsMap.values()) {
          if (!student.name) continue;

          const studentName = student.name;
          if (!studentTotalsMap.has(studentName)) {
            studentTotalsMap.set(studentName, {
              totalRemainingClasses: 0,
              totalScheduledClasses: 0,
              totalNext30DaysClasses: 0
            });
          }

          const totals = studentTotalsMap.get(studentName);
          totals.totalRemainingClasses += student.remainingClasses || 0;
          totals.totalScheduledClasses += student.scheduledClasses || 0;
          totals.totalNext90DaysClasses += student.next90DaysClasses || 0;
        }

        // 5. 杞崲涓烘暟缁勶紝娣诲姞鎬昏淇℃伅骞舵帓搴?
        const students = Array.from(studentsMap.values())
          .filter(student => student.name) // 杩囨护鎺夋病鏈夊鍚嶇殑璁板綍
          .map(student => {
            // 涓烘瘡涓鍛樿褰曟坊鍔犳€昏淇℃伅锛堢敤浜庢帓搴忥級
            const totals = studentTotalsMap.get(student.name);
            return {
              ...student,
              // 閲嶆柊璁＄畻鏈潵90澶╂湭鎺掕鏃舵暟 = 鍓╀綑璇炬椂 - 鏈潵90澶╀笂璇炬鏁?
              unscheduledClasses: Math.max(0, (student.remainingClasses || 0) - (student.next90DaysClasses || 0)),
              _totalRemainingClasses: totals.totalRemainingClasses,
              _totalScheduledClasses: totals.totalScheduledClasses,
              _totalNext30DaysClasses: totals.totalNext30DaysClasses
            };
          })
          .sort((a, b) => {
            // 鎸夋€诲墿浣欒鏃朵粠灏戝埌澶氭帓搴忥紙浼樺厛鏄剧ず璇炬椂涓嶈冻鐨勫鐢燂級
            if (a._totalRemainingClasses !== b._totalRemainingClasses) {
              return a._totalRemainingClasses - b._totalRemainingClasses;
            }
            return (a.name || '').localeCompare(b.name || '', 'zh-CN');
          });

        // 6. 璁＄畻鍒嗙被缁熻鏁版嵁
        // 璁＄畻鏈潵90澶╁凡鎺掕瀛﹀憳鏁帮紙宸叉帓璇炬椂鏁?0鐨勫鍛樻暟锛? 鎸夊鍛樺悕绉板幓閲?
        const getCombinedRemainingClasses = (student) => (
          (student.next90DaysClasses || 0) + (student.unscheduledClasses || 0)
        );
        const shouldIncludeInRemainingStats = (student) => (
          Boolean(student?.name) && !hiddenRemainingStudents.has(student.name)
        );
        const remainingStatsStudents = students.filter(shouldIncludeInRemainingStats);

        const studentsWithUpcomingClassesSet = new Set();
        students.forEach(student => {
          if ((student.next90DaysClasses || 0) > 0 && student.name) {
            studentsWithUpcomingClassesSet.add(student.name);
          }
        });
        const studentsWithUpcomingClasses = studentsWithUpcomingClassesSet.size;

        // 璁＄畻鏈潵90澶╀笂璇炬鏁颁负0鐨勫鍛樻暟 - 鎸夊鍛樺悕绉板幓閲?
        const studentsWithZeroUpcomingClassesSet = new Set();
        students.forEach(student => {
          if ((student.remainingClasses || 0) > 0 && // 鏈夊墿浣欒鏃?
              student.name && // 鏈夊鍚?
              (student.next90DaysClasses || 0) === 0) { // 鏈潵90澶╁凡鎺掕鏃舵暟涓?
            studentsWithZeroUpcomingClassesSet.add(student.name);
          }
        });
        const studentsWithZeroUpcomingClasses = studentsWithZeroUpcomingClassesSet.size;

        // 鍒犻櫎浜嗘湭鏉?4澶╂湭鎺掕瀛︾敓缁熻

        // 璁＄畻鎺掕鏁?=4鐨勫鍛樻暟锛氱粺涓€鎸夋湭鏉?0澶╁凡鎺掕鏃舵暟缁熻锛屼粎缁熻鑿叉暀瀛﹀憳
        const studentsWithLowBookings = new Set();
        students.forEach(student => {
          if (student.courseType === '鑿叉暀' &&
              (student.remainingClasses || 0) > 0 &&
              student.name) {
            const next90DaysClasses = student.next90DaysClasses || 0;
            if (next90DaysClasses <= 4) {
              studentsWithLowBookings.add(student.name);
            }
          }
        });

        const lowBookingStudents = studentsWithLowBookings.size;

        // 璋冭瘯鏃ュ織
        console.log(`馃搳 鎺掕鏁扮粺璁¤皟璇?`);
        console.log(`   - 鎺掕鏁?=4鐨勫鍛樻暟: ${lowBookingStudents}`);
        // 鏄剧ず鍓嶅嚑涓帓璇炬暟<=4瀛﹀憳鐨勮缁嗕俊鎭?
        const lowBookingStudentsList = Array.from(studentsWithLowBookings).slice(0, 3);
        lowBookingStudentsList.forEach(studentName => {
          const studentInfo = students.find(s => s.name === studentName);
          if (studentInfo) {
            console.log(`     ${studentName}: 鍓╀綑${studentInfo.remainingClasses}璇炬椂, 鏈潵90澶╁凡鎺?{studentInfo.next90DaysClasses}璇炬椂`);
          }
        });
        console.log(`馃搳 鎬诲墿浣欒鏃剁粺璁¤皟璇?`);
        console.log(`   - 鍘熷鏁版嵁鏉℃暟: ${allCardData.length}`);
        console.log(`   - 鑿叉暀鍓╀綑璇炬椂: ${allCardData.filter(card => card.courseType === '鑿叉暀').reduce((sum, card) => sum + (card.remainingClasses || 0), 0)}`);
        console.log(`   - 娆ф暀鍓╀綑璇炬椂: ${allCardData.filter(card => card.courseType === '娆ф暀').reduce((sum, card) => sum + (card.remainingClasses || 0), 0)}`);
        console.log(`   - 涓€瀵瑰鍓╀綑璇炬椂: ${allCardData.filter(card => card.courseType === '涓€瀵瑰').reduce((sum, card) => sum + (card.remainingClasses || 0), 0)}`);
        console.log(`馃搳 鏈潵90澶╄鏃剁粺璁¤皟璇?`);
        console.log(`   - 菲教课时数: ${futureCourseData.filter(course => course.teacher_type === '菲').reduce((sum, course) => sum + (course.time_num || 0), 0)}`);
        console.log(`   - 欧教课时数: ${futureCourseData.filter(course => course.teacher_type === '欧').reduce((sum, course) => sum + (course.time_num || 0), 0)}`);
        console.log(`   - 鏈煡绫诲瀷璇炬椂鏁? ${futureCourseData.filter(course => course.teacher_type === '鏈煡').reduce((sum, course) => sum + (course.time_num || 0), 0)}`);
        console.log(`   - 鎬昏鏃舵暟: ${futureCourseData.reduce((sum, course) => sum + (course.time_num || 0), 0)}`);

        const stats = {
          totalStudents: studentsWithUpcomingClasses,
          // 鎬诲墿浣欒鏃舵暟锛氱洿鎺ヤ粠鏁版嵁搴撳師濮嬫暟鎹粺璁★紝涓嶅彈杩囨护褰卞搷
          totalClasses: remainingStatsStudents.reduce((sum, student) => sum + getCombinedRemainingClasses(student), 0),
          scheduledClasses: students.reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
          // 鏈潵90澶╄鏃舵暟锛歵ime_num瀛楁涔嬪拰
          upcomingClasses: futureCourseData.reduce((sum, course) => sum + (course.time_num || 0), 0),
          lowBookingStudents: Math.max(0, lowBookingStudents),
          // 鎸夎绋嬬被鍨嬪垎缁勭粺璁?
          byType: {
            鑿叉暀: {
              // 鑿叉暀鎬诲墿浣欒鏃讹細浠庡師濮嬫暟鎹粺璁?
              totalClasses: allCardData.filter(card => card.courseType === '鑿叉暀').reduce((sum, card) => sum + (card.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '鑿叉暀').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              // 鑿叉暀鏈潵90澶╄鏃舵暟锛氭牴鎹畉eacher_type='鑿?缁熻time_num
              upcomingClasses: futureCourseData
                .filter(course => course.teacher_type === '菲')
                .reduce((sum, course) => sum + (course.time_num || 0), 0)
            },
            娆ф暀: {
              // 娆ф暀鎬诲墿浣欒鏃讹細浠庡師濮嬫暟鎹粺璁?
              totalClasses: allCardData.filter(card => card.courseType === '娆ф暀').reduce((sum, card) => sum + (card.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '娆ф暀').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              // 娆ф暀鏈潵90澶╄鏃舵暟锛氭牴鎹畉eacher_type='娆?缁熻time_num
              upcomingClasses: futureCourseData
                .filter(course => course.teacher_type === '欧')
                .reduce((sum, course) => sum + (course.time_num || 0), 0)
            },
            '一对多': {
              // 涓€瀵瑰鎬诲墿浣欒鏃讹細浠庡師濮嬫暟鎹粺璁?
              totalClasses: allCardData.filter(card => card.courseType === '涓€瀵瑰').reduce((sum, card) => sum + (card.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '涓€瀵瑰').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              // 涓€瀵瑰鏈潵90澶╄鏃舵暟锛氶€氳繃瀛﹀憳璇剧▼绫诲瀷鍖归厤缁熻time_num
              upcomingClasses: futureCourseData
                .filter(course => students.some(s => s.name === course.student && s.courseType === '涓€瀵瑰'))
                .reduce((sum, course) => sum + (course.time_num || 0), 0)
            }
          }
        };

        console.log(`馃搳 缁熻鏁版嵁: 瀛﹀憳${stats.totalStudents}浜? 鎬昏鏃?{stats.totalClasses}, 宸叉帓${stats.scheduledClasses}, 90澶╁唴${stats.upcomingClasses}`);

        // 6.5. 璇嗗埆鏈夊墿浣欒鏃朵絾鏈潵娌℃湁鎺掕鐨勫鍛橈紙鏍囩孩璀﹀憡锛?
        // 鑾峰彇鏈潵鏈夎鐨勫鍛橀泦鍚?
        Object.keys(stats.byType).forEach((courseType) => {
          stats.byType[courseType].totalClasses = remainingStatsStudents
            .filter(student => student.courseType === courseType)
            .reduce((sum, student) => sum + getCombinedRemainingClasses(student), 0);
        });


        const studentsWithFutureClasses = new Set();
        futureCourseData.forEach(course => {
          if (course.student) {
            studentsWithFutureClasses.add(course.student);
          }
        });

        // 閬嶅巻鎵€鏈夊鍛橈紝鏍囪椋庨櫓瀛﹀憳锛氭湁鍓╀綑璇炬椂浣嗘湭鏉ユ病鏈夋帓璇?
        let riskStudentCount = 0;
        students.forEach(student => {
          const hasRemainingClasses = (student.remainingClasses || 0) > 0;
          const hasNoFutureClasses = !studentsWithFutureClasses.has(student.name);

          if (hasRemainingClasses && hasNoFutureClasses) {
            student.isRiskStudent = true;
            riskStudentCount++;
          }
        });

        console.log(`风险学员统计: 有剩余课时但未来无排课的学员 ${riskStudentCount} 人`);

        // 7. 娓呯悊涓存椂鏁版嵁
        students.forEach(student => {
          delete student.upcomingCourses; // 绉婚櫎涓存椂鏁扮粍
          delete student._totalRemainingClasses; // 绉婚櫎鎺掑簭鐢ㄧ殑涓存椂鎬昏
          delete student._totalScheduledClasses;
          delete student._totalNext30DaysClasses;
        });

        res.json({
          success: true,
          stats,
          students
        });

      } catch (error) {
        console.error('鉂?API閿欒:', error);
        res.status(500).json({
          success: false,
          message: `鏁版嵁鑾峰彇澶辫触: ${error.message}`,
          stats: {
            totalStudents: 0,
            totalClasses: 0,
            scheduledClasses: 0,
            upcomingClasses: 0
          },
          students: []
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氳幏鍙栬€佸笀鍒楄〃
    this.app.post('/api/teachers-list', async (req, res) => {
      let connection;

      try {
        const { startDate, endDate } = req.body;

        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: '缺少必要参数：开始日期、结束日期'
          });
        }

        connection = await getDbConnection();
        console.log(`馃懆鈥嶐煆?鑾峰彇鑰佸笀鍒楄〃 (${startDate} ~ ${endDate})...`);

        // 鏌ヨ鎸囧畾鏃ユ湡鑼冨洿鍐呯殑鎵€鏈夎€佸笀
        const [teachersData] = await connection.execute(`
          SELECT DISTINCT teacher
          FROM yuekebao_classtime
          WHERE class_date >= ? AND class_date <= ?
            AND teacher IS NOT NULL AND teacher != ''
          ORDER BY teacher
        `, [startDate, endDate]);

        const teachers = teachersData.map(row => row.teacher);

        console.log(`馃懆鈥嶐煆?鎵惧埌 ${teachers.length} 浣嶈€佸笀: ${teachers.join(', ')}`);

        res.json({
          success: true,
          teachers
        });

      } catch (error) {
        console.error('鉂?鑾峰彇鑰佸笀鍒楄〃API閿欒:', error);
        res.status(500).json({
          success: false,
          message: `鑾峰彇鑰佸笀鍒楄〃澶辫触: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // 猸?鑾峰彇鑰佸笀鍑哄嫟鐘舵€侊紙杩熷埌/鏃疯锛夎緟鍔╁嚱鏁?
    const getTeacherAttendanceInfo = async (feifeiConnection, teacherNames, startDate, endDate, matchingContext = {}) => {
      const {
        yuekebaoClassKeysByTeacher = {},
        yuekebaoClassesByTeacherStudentDate = {},
        teacherAliasToMainMap = {},
        studentAliasToMainMap = {}
      } = matchingContext;
      const SHANGHAI_OFFSET_HOURS = 8;
      const SHANGHAI_OFFSET_MS = SHANGHAI_OFFSET_HOURS * 60 * 60 * 1000;
      const pad2 = (n) => String(n).padStart(2, '0');
      const normalizeText = (value) => String(value || '').trim();

      const parseShanghaiDateBoundaryToUnix = (dateStr, endOfDay = false) => {
        const match = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return NaN;
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const hour = endOfDay ? 23 : 0;
        const minute = endOfDay ? 59 : 0;
        const second = endOfDay ? 59 : 0;
        const utcMs = Date.UTC(year, month - 1, day, hour - SHANGHAI_OFFSET_HOURS, minute, second);
        return Math.floor(utcMs / 1000);
      };

      const parseShanghaiDateTimeToMs = (rawValue) => {
        if (rawValue === null || rawValue === undefined || rawValue === '') return NaN;

        if (rawValue instanceof Date) {
          const year = rawValue.getFullYear();
          const month = rawValue.getMonth();
          const day = rawValue.getDate();
          const hour = rawValue.getHours();
          const minute = rawValue.getMinutes();
          const second = rawValue.getSeconds();
          return Date.UTC(year, month, day, hour - SHANGHAI_OFFSET_HOURS, minute, second);
        }

        const raw = String(rawValue).trim();
        if (/^\d+$/.test(raw)) {
          const numeric = Number(raw);
          if (Number.isFinite(numeric)) {
            return numeric > 1e12 ? numeric : numeric * 1000;
          }
        }
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
        if (match) {
          const year = Number(match[1]);
          const month = Number(match[2]);
          const day = Number(match[3]);
          const hour = Number(match[4]);
          const minute = Number(match[5]);
          const second = Number(match[6] || '0');
          return Date.UTC(year, month - 1, day, hour - SHANGHAI_OFFSET_HOURS, minute, second);
        }

        const fallbackMs = new Date(raw).getTime();
        return Number.isNaN(fallbackMs) ? NaN : fallbackMs;
      };

      const formatShanghaiDateStr = (utcMs) => {
        const d = new Date(utcMs + SHANGHAI_OFFSET_MS);
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
      };

      const formatShanghaiClassTime = (utcMs) => {
        const d = new Date(utcMs + SHANGHAI_OFFSET_MS);
        return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
      };

      const formatShanghaiHourMinute = (utcMs) => {
        const d = new Date(utcMs + SHANGHAI_OFFSET_MS);
        return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
      };

      const isAbsentByStartTime = (classStartMs, teacherEntryMs, teacherEnterRawValue) => {
        if (!teacherEnterRawValue) return true;
        if (!Number.isFinite(classStartMs) || !Number.isFinite(teacherEntryMs)) return false;
        return teacherEntryMs > classStartMs + 5 * 60 * 1000;
      };

      const extractShanghaiDateStr = (rawValue) => {
        if (!rawValue) return '';
        const raw = String(rawValue).trim();
        const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
        if (match) return match[1];

        const parsedMs = parseShanghaiDateTimeToMs(rawValue);
        if (!Number.isFinite(parsedMs)) return '';
        return formatShanghaiDateStr(parsedMs);
      };

      const startTimestamp = parseShanghaiDateBoundaryToUnix(startDate, false);
      const endTimestamp = parseShanghaiDateBoundaryToUnix(endDate, true);

      if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
        throw new Error(`鏃ユ湡鏍煎紡鏃犳晥锛歴tartDate=${startDate}, endDate=${endDate}`);
      }

      if (!teacherNames || teacherNames.length === 0) return {};

      // 閫氳繃鏁欏笀鍚嶆煡鎵綰ID
      const [teacherInfo] = await feifeiConnection.execute(
        `SELECT uid, name FROM base_user_teacher
         WHERE (isdel IS NULL OR isdel = 0) AND name IN (${teacherNames.map(() => '?').join(',')})`,
        teacherNames
      );

      if (teacherInfo.length === 0) return {};

      const teacherUids = teacherInfo.map(t => t.uid);

      // 鏌ヨfeifei璇捐妭鏁版嵁锛堝寘鍚€佸笀杩涘叆鏃堕棿銆佸鐢熻繘鍏ユ椂闂淬€佺鍒扮姸鎬侊級
      const [sessions] = await feifeiConnection.execute(`
        SELECT
          cs.teacherName,
          cs.teacherUid,
          cs.classBtime,
          DATE_FORMAT(cs.teacherjongTime, '%Y-%m-%d %H:%i:%s') AS teacherjongTime,
          DATE_FORMAT(e.signInTime, '%Y-%m-%d %H:%i:%s') AS signInTime,
          COALESCE(e.isPresent, 0) AS isPresent,
          scr.studentEnterTime,
          s.studentName,
          cs.className
        FROM base_user_classsession cs
        LEFT JOIN base_user_studentclassrecord scr ON cs.id = scr.classId AND cs.courseId = scr.courseId
        LEFT JOIN base_user_teacherattendance e ON cs.id = e.classId AND cs.teacherUid = e.teacherUid AND e.courseId = cs.courseId
        LEFT JOIN base_user_student s ON scr.studId = s.studentUid
        WHERE cs.teacherUid IN (${teacherUids.map(() => '?').join(',')})
          AND cs.classBtime >= ? AND cs.classBtime <= ?
        ORDER BY cs.teacherName, cs.classBtime
      `, [...teacherUids, startTimestamp, endTimestamp]);

      // 鎸夋暀甯堝垎缁勮绠楄繜鍒?鏃疯
      const attendanceByTeacher = {};

      for (const session of sessions) {
        const teacherName = session.teacherName;
        if (!attendanceByTeacher[teacherName]) {
          attendanceByTeacher[teacherName] = { lateRecords: [], absentRecords: [], unsignedRecords: [] };
        }

        // 瑙勫垯锛氬鐢熸湭杩涘叆鏁欏鍒欎笉鍒ゅ畾
        if (!session.studentEnterTime) continue;

        const studentName = session.studentName || '鏈煡瀛︾敓';
        const canonicalTeacherName = teacherAliasToMainMap[normalizeText(teacherName)] || normalizeText(teacherName);
        const canonicalStudentName = studentAliasToMainMap[normalizeText(studentName)] || normalizeText(studentName);
        const rawClassStartMs = session.classBtime * 1000;
        const teacherEntryMs = parseShanghaiDateTimeToMs(session.teacherjongTime);
        const studentEntryMs = parseShanghaiDateTimeToMs(session.studentEnterTime);
        let resolvedStartTimestamp = session.classBtime;

        const candidateDates = new Set([
          extractShanghaiDateStr(session.teacherjongTime),
          extractShanghaiDateStr(session.studentEnterTime),
          formatShanghaiDateStr(rawClassStartMs)
        ].filter(Boolean));

        if (canonicalTeacherName && canonicalStudentName && candidateDates.size > 0) {
          const matchedCandidates = [];
          for (const candidateDate of candidateDates) {
            const candidateKey = `${canonicalTeacherName}||${canonicalStudentName}||${candidateDate}`;
            const rows = yuekebaoClassesByTeacherStudentDate[candidateKey] || [];
            matchedCandidates.push(...rows);
          }

          if (matchedCandidates.length > 0) {
            matchedCandidates.sort((a, b) => {
              const aStartMs = Number(a.startTimestamp) * 1000;
              const bStartMs = Number(b.startTimestamp) * 1000;
              const aTeacherDiff = Number.isFinite(teacherEntryMs) ? Math.abs(teacherEntryMs - aStartMs) : Number.MAX_SAFE_INTEGER;
              const bTeacherDiff = Number.isFinite(teacherEntryMs) ? Math.abs(teacherEntryMs - bStartMs) : Number.MAX_SAFE_INTEGER;
              const aStudentDiff = Number.isFinite(studentEntryMs) ? Math.abs(studentEntryMs - aStartMs) : Number.MAX_SAFE_INTEGER;
              const bStudentDiff = Number.isFinite(studentEntryMs) ? Math.abs(studentEntryMs - bStartMs) : Number.MAX_SAFE_INTEGER;
              const aRawDiff = Math.abs(rawClassStartMs - aStartMs);
              const bRawDiff = Math.abs(rawClassStartMs - bStartMs);
              return aTeacherDiff - bTeacherDiff
                || aStudentDiff - bStudentDiff
                || aRawDiff - bRawDiff
                || a.startTimestamp - b.startTimestamp;
            });

            resolvedStartTimestamp = matchedCandidates[0].startTimestamp;
          }
        }

        const classStartMs = resolvedStartTimestamp * 1000;
        const classTimeStr = formatShanghaiClassTime(classStartMs);

        // 鍏滃簳锛氳嫢鏈兘鎸夎€佸笀+瀛︾敓+鏃ユ湡鍖归厤锛屽啀閫€鍥炲師鏈夌殑鑰佸笀+鏃堕棿鏍￠獙
        if (resolvedStartTimestamp === session.classBtime) {
          const allowedClassTimes = yuekebaoClassKeysByTeacher[teacherName];
          const hasDirectTimeMatch = Boolean(allowedClassTimes && allowedClassTimes.has(classTimeStr));
          // 閮ㄥ垎鐪熷疄缂哄嫟璇捐妭浼氬嚭鐜板湪 ClassIn锛屼絾娌℃湁鍚屾鍒扮害璇惧疂璇捐〃銆?
          // 瀵硅繖绫烩€滃凡绛惧埌涓旀寜鍘熷寮€璇炬椂闂村垽瀹氫负鏃疯鈥濈殑璁板綍锛屼粛绾冲叆宸ヨ祫鍑哄嫟鎵ｇ綒銆?
          const shouldKeepSignedAbsentFallback = Number(session.isPresent) === 1
            && isAbsentByStartTime(classStartMs, teacherEntryMs, session.teacherjongTime);
          if (!hasDirectTimeMatch && !shouldKeepSignedAbsentFallback) {
            continue;
          }
        }

        // 鏈鍒拌褰曪紙涓庤繜鍒?鏃疯骞跺垪灞曠ず锛?
        if (Number(session.isPresent) !== 1) {
          attendanceByTeacher[teacherName].unsignedRecords.push({
            classTime: classTimeStr,
            studentName,
            reason: '未签到'
          });
        }

        if (!session.teacherjongTime) {
          // 鑰佸笀鏈繘鍏?鈫?鏃疯
          attendanceByTeacher[teacherName].absentRecords.push({
            classTime: classTimeStr,
            studentName: studentName,
            reason: '老师未进入教室'
          });
          continue;
        }

        if (!Number.isFinite(teacherEntryMs)) {
          continue;
        }
        // 鈥滄彁鍓?鍒嗛挓鈥濇寜鍒嗛挓绮掑害鍒ゅ畾锛岄伩鍏?classBtime 鍚瀵艰嚧 09:59 琚鍒や负鏈彁鍓?鍒嗛挓
        const classStartMinuteMs = Math.floor(classStartMs / 60000) * 60000;
        const teacherEntryMinuteMs = Math.floor(teacherEntryMs / 60000) * 60000;
        const oneMinBefore = classStartMinuteMs - 60 * 1000;
        const fiveMinAfter = classStartMs + 5 * 60 * 1000;
        const sameMinuteAsClassStart = teacherEntryMinuteMs === classStartMinuteMs;

        if (teacherEntryMs > fiveMinAfter) {
          // 瓒呰繃5鍒嗛挓 鈫?鏃疯
          const lateMinutes = Math.round((teacherEntryMs - classStartMs) / 60000);
          const entryTimeStr = formatShanghaiHourMinute(teacherEntryMs);
          attendanceByTeacher[teacherName].absentRecords.push({
            classTime: classTimeStr,
            studentName: studentName,
            reason: `老师${entryTimeStr}进入（迟到 ${lateMinutes} 分钟）`
          });
        } else if (teacherEntryMinuteMs > oneMinBefore) {
          // 鏈彁鍓?鍒嗛挓 鈫?杩熷埌
          const lateSeconds = Math.round((teacherEntryMs - classStartMs) / 1000);
          const entryTimeStr = formatShanghaiHourMinute(teacherEntryMs);
          let reasonDetail;
          if (lateSeconds > 0) {
            reasonDetail = `老师${entryTimeStr}进入（迟到 ${Math.ceil(lateSeconds / 60)} 分钟）`;
          } else {
            reasonDetail = `老师${entryTimeStr}进入（未提前1分钟）`;
          }
          attendanceByTeacher[teacherName].lateRecords.push({
            classTime: classTimeStr,
            studentName: studentName,
            reason: reasonDetail,
            salaryDeductible: !sameMinuteAsClassStart
          });
        }
      }

      return attendanceByTeacher;
    };

    // 猸?鏅鸿兘鍒ゅ畾璇曡鎴愬姛/澶辫触鐨勮緟鍔╁嚱鏁?
    const determineTrialClassSuccess = async (connection, teacher, startDate, endDate) => {
      console.log(`馃攳 寮€濮嬪垽瀹?${teacher} 鐨勮瘯璇炬垚鍔?澶辫触...`);

      // 鏌ヨ璇ヨ€佸笀鍦ㄦ棩鏈熻寖鍥村唴鐨勬墍鏈夎瘯璇?
      const [trialClasses] = await connection.execute(`
        SELECT
          student,
          class_date,
          class_start_time
        FROM yuekebao_classtime
        WHERE teacher = ?
          AND course_type = '璇曡'
          AND class_date >= ?
          AND class_date <= ?
        ORDER BY class_date ASC
      `, [teacher, startDate, endDate]);

      let successfulCount = 0;
      let failedCount = 0;
      const trialDetails = [];

      for (const trial of trialClasses) {
        // 鏌ヨ璇ュ鐢熶笌璇ヨ€佸笀鏄惁鏈夊悗缁寮忚绋?
        const [followUpClasses] = await connection.execute(`
          SELECT COUNT(*) as count
          FROM yuekebao_classtime
          WHERE teacher = ?
            AND student = ?
            AND course_type != '璇曡'
            AND course_type IS NOT NULL
            AND class_date > ?
        `, [teacher, trial.student, trial.class_date]);

        const hasFollowUp = followUpClasses[0].count > 0;

        if (hasFollowUp) {
          successfulCount++;
          trialDetails.push({
            student: trial.student,
            date: trial.class_date,
            result: 'success',
            reason: `鍚庣画鏈?{followUpClasses[0].count}鑺傛寮忚`
          });
        } else {
          failedCount++;
          trialDetails.push({
            student: trial.student,
            date: trial.class_date,
            result: 'failed',
            reason: '鏃犲悗缁寮忚'
          });
        }
      }

      console.log(`试课判定完成: ${teacher}，成功 ${successfulCount} 节，失败 ${failedCount} 节`);

      return {
        successful: successfulCount,
        failed: failedCount,
        details: trialDetails
      };
    };

    // API鎺ュ彛锛氬伐璧勮绠?
    this.app.post('/api/salary-calculate', async (req, res) => {
      let connection;
      let feifeiConnection;

      try {
        const { startDate, endDate, baseRate, teacherAdjustments = {}, trialData = {}, rewardsData = {} } = req.body;

        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: '缺少必要参数：开始日期、结束日期'
          });
        }

        connection = await getDbConnection();
        console.log(`馃挵 寮€濮嬭绠楀伐璧勬暟鎹?(${startDate} ~ ${endDate})...`);

        // 鏌ヨ鎸囧畾鏃ユ湡鑼冨洿鍐呯殑璇剧▼鏁版嵁锛屾寜鑰佸笀鍜岃绋嬬被鍨嬪垎缁勭粺璁★紝鍖呭惈鑰佸笀钖祫淇℃伅
        const [classData] = await connection.execute(`
          SELECT
            c.teacher,
            c.course_type as course_type_from_class,
            COALESCE(s.type, '鏈煡') as teacher_type,
            COALESCE(s.salary_per_class_time, 0) as salary_per_class,
            COALESCE(s.salary_unit, 'rmb') as salary_unit,
            s.salary_account,
            SUM(
              CASE
                WHEN c.course_type LIKE '%50鍒嗛挓%' THEN 2
                WHEN TIME_TO_SEC(TIMEDIFF(c.class_end_time, c.class_start_time)) / 60 >= 40 THEN 2
                ELSE 1
              END
            ) as total_classes,
            GROUP_CONCAT(
              CONCAT(c.student, ' (', DATE_FORMAT(c.class_date, '%m-%d'), ' ',
              TIME_FORMAT(c.class_start_time, '%H:%i'), '-',
              TIME_FORMAT(c.class_end_time, '%H:%i'), ')')
              ORDER BY c.class_date, c.class_start_time
              SEPARATOR '; '
            ) as class_details
          FROM yuekebao_classtime c
          LEFT JOIN yuekebao_teacher_salary s ON c.teacher = s.teacher_name
          WHERE c.class_date >= ? AND c.class_date <= ?
          GROUP BY c.teacher, c.course_type, s.type, s.salary_per_class_time, s.salary_unit, s.salary_account
          ORDER BY c.teacher, c.course_type
        `, [startDate, endDate]);

        const normalizeText = (value) => String(value || '').trim();
        const SHANGHAI_OFFSET_HOURS = 8;
        const parseYuekebaoClassDateTimeToUnix = (classDate, classStartTime) => {
          const dateMatch = String(classDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
          const timeMatch = String(classStartTime || '').trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
          if (!dateMatch || !timeMatch) return NaN;

          const year = Number(dateMatch[1]);
          const month = Number(dateMatch[2]);
          const day = Number(dateMatch[3]);
          const hour = Number(timeMatch[1]);
          const minute = Number(timeMatch[2]);
          const second = Number(timeMatch[3] || '0');
          const utcMs = Date.UTC(year, month - 1, day, hour - SHANGHAI_OFFSET_HOURS, minute, second);
          return Math.floor(utcMs / 1000);
        };

        // 鏋勫缓绾﹁瀹濊鑺傞敭锛堣€佸笀 + MM-DD HH:mm锛夛紝鐢ㄤ簬绾︽潫鍑哄嫟缁熻鍙ｅ緞
        const [yuekebaoClassRows] = await connection.execute(`
          SELECT
            teacher,
            student,
            DATE_FORMAT(class_date, '%Y-%m-%d') AS fullClassDate,
            DATE_FORMAT(class_date, '%m-%d') AS classDate,
            TIME_FORMAT(class_start_time, '%H:%i') AS classStartTime
          FROM yuekebao_classtime
          WHERE class_date >= ? AND class_date <= ?
        `, [startDate, endDate]);

        const yuekebaoClassKeysByTeacher = {};
        for (const row of yuekebaoClassRows) {
          const teacherName = row.teacher;
          if (!teacherName) continue;
          if (!yuekebaoClassKeysByTeacher[teacherName]) {
            yuekebaoClassKeysByTeacher[teacherName] = new Set();
          }
          yuekebaoClassKeysByTeacher[teacherName].add(`${row.classDate} ${row.classStartTime}`);
        }

        // 鏋勫缓鑰佸笀鍒悕鏄犲皠锛堢敤浜庡伐璧勫嚭鍕ょ粺璁℃椂鍖归厤 ClassIn / 绾﹁瀹?鑰佸笀鍚嶅樊寮傦級
        const [salaryTeacherAliasRows] = await connection.execute(`
          SELECT teacher_name, aliases
          FROM yuekebao_teacher_salary
          WHERE aliases IS NOT NULL AND aliases != ''
        `);

        const teacherAliasToMainMap = {};
        salaryTeacherAliasRows.forEach(row => {
          const mainName = normalizeText(row.teacher_name);
          if (!mainName) return;
          teacherAliasToMainMap[mainName] = mainName;
          try {
            const aliases = JSON.parse(row.aliases);
            if (Array.isArray(aliases)) {
              aliases.forEach(alias => {
                const aliasName = normalizeText(alias);
                if (aliasName) {
                  teacherAliasToMainMap[aliasName] = mainName;
                }
              });
            }
          } catch (e) {}
        });

        // 灏嗙害璇惧疂璇捐妭閿墿灞曞埌鑰佸笀鍒悕锛堝 Anna Rose -> Anna锛?
        const expandedYuekebaoClassKeysByTeacher = { ...yuekebaoClassKeysByTeacher };
        Object.entries(teacherAliasToMainMap).forEach(([aliasName, mainName]) => {
          if (!aliasName || !mainName) return;
          const mainSet = yuekebaoClassKeysByTeacher[mainName];
          if (!mainSet) return;
          if (!expandedYuekebaoClassKeysByTeacher[aliasName]) {
            expandedYuekebaoClassKeysByTeacher[aliasName] = new Set(mainSet);
          } else {
            mainSet.forEach(key => expandedYuekebaoClassKeysByTeacher[aliasName].add(key));
          }
        });

        // 鏋勫缓瀛︾敓鍒悕鏄犲皠锛堢敤浜庡伐璧勫嚭鍕ゆ槑缁嗘樉绀虹粺涓€瀛︾敓鍚嶏級
        const [salaryStudentAliasRows] = await connection.execute(`
          SELECT student_name, aliases
          FROM yuekebao_student_aliases
          WHERE aliases IS NOT NULL AND aliases != ''
        `);

        const studentAliasToMainMap = {};
        salaryStudentAliasRows.forEach(row => {
          const mainName = normalizeText(row.student_name);
          if (!mainName) return;
          studentAliasToMainMap[mainName] = mainName;
          try {
            const aliases = JSON.parse(row.aliases);
            if (Array.isArray(aliases)) {
              aliases.forEach(alias => {
                const aliasName = normalizeText(alias);
                if (aliasName) {
                  studentAliasToMainMap[aliasName] = mainName;
                }
              });
            }
          } catch (e) {}
        });

        const yuekebaoClassesByTeacherStudentDate = {};
        for (const row of yuekebaoClassRows) {
          const teacherName = normalizeText(row.teacher);
          const studentName = normalizeText(row.student);
          const classDate = normalizeText(row.fullClassDate);
          if (!teacherName || !studentName || !classDate) continue;

          const canonicalTeacherName = teacherAliasToMainMap[teacherName] || teacherName;
          const canonicalStudentName = studentAliasToMainMap[studentName] || studentName;
          const startTimestamp = parseYuekebaoClassDateTimeToUnix(row.fullClassDate, row.classStartTime);
          if (!Number.isFinite(startTimestamp)) continue;

          const key = `${canonicalTeacherName}||${canonicalStudentName}||${classDate}`;
          if (!yuekebaoClassesByTeacherStudentDate[key]) {
            yuekebaoClassesByTeacherStudentDate[key] = [];
          }
          yuekebaoClassesByTeacherStudentDate[key].push({
            startTimestamp,
            classDate,
            classStartTime: row.classStartTime
          });
        }

        // 鎸夎€佸笀姹囨€绘暟鎹紝鍖哄垎鏅€氳鍜岃瘯璇?
        const teacherSummary = {};
        let totalClasses = 0;

        for (const record of classData) {
          const { teacher, course_type_from_class, teacher_type, salary_per_class, salary_unit, salary_account, total_classes, class_details } = record;

          if (!teacherSummary[teacher]) {
            teacherSummary[teacher] = {
              teacher,
              normalClasses: 0,     // 鏅€氳璇炬椂
              trialClasses: 0,      // 璇曡璇炬椂
              courseTypes: {},
              totalSalary: 0,
              salaryPerClass: parseFloat(salary_per_class) || 0,
              salaryUnit: salary_unit || 'rmb',
              salaryAccount: salary_account || '',
              teacherType: teacher_type || '鏈煡'
            };
          }

          // 鏍规嵁 course_type 鍒嗙被绱
          const courseType = course_type_from_class || '鏈煡';
          if (courseType === '璇曡') {
            teacherSummary[teacher].trialClasses += parseInt(total_classes);
          } else {
            teacherSummary[teacher].normalClasses += parseInt(total_classes);
          }

          teacherSummary[teacher].courseTypes[courseType] = {
            classes: parseInt(total_classes),
            details: class_details
          };
          totalClasses += parseInt(total_classes);
        }

        // 猸?瀵规瘡涓湁璇曡鐨勮€佸笀鎵ц鏅鸿兘鍒ゅ畾
        console.log('馃攳 寮€濮嬫墽琛屾櫤鑳藉垽瀹?..');
        const autoTrialResults = {};
        for (const teacher of Object.keys(teacherSummary)) {
          if (teacherSummary[teacher].trialClasses > 0) {
            const trialResult = await determineTrialClassSuccess(
              connection, teacher, startDate, endDate
            );
            autoTrialResults[teacher] = trialResult;
      console.log(`自动判定完成: ${teacher}，成功 ${trialResult.successful} 节，失败 ${trialResult.failed} 节`);
          }
        }

        // 涓烘瘡涓€佸笀璁＄畻宸ヨ祫锛堜娇鐢ㄦ暟鎹簱涓殑涓汉璇炬椂璐癸級
        let totalSalary = 0;
        let totalAdjustmentAmount = 0;
        let totalTrialCommission = 0;
        let totalRewardsAmount = 0;

        // 涓烘瘡涓€佸笀璁＄畻宸ヨ祫
        for (const teacher in teacherSummary) {
          const data = teacherSummary[teacher];
          const dbSalaryPerClass = data.salaryPerClass; // 浠庢暟鎹簱鑾峰彇鐨勮鏃惰垂

          // 浣跨敤鏁版嵁搴撲腑鐨勮鏃惰垂浣滀负鍩虹璐圭巼
          data.baseRate = dbSalaryPerClass;

          // 妫€鏌ヨ鑰佸笀鏄惁鏈変釜浜鸿皟鏁?
          let adjustmentAmount = 0;
          let finalRate = dbSalaryPerClass;

          if (teacherAdjustments[teacher]) {
            const adjustment = teacherAdjustments[teacher];
            if (adjustment.type === 'percentage') {
              adjustmentAmount = (adjustment.value / 100) * dbSalaryPerClass;
            } else if (adjustment.type === 'fixed') {
              adjustmentAmount = adjustment.value;
            }
            finalRate = dbSalaryPerClass + adjustmentAmount;
          }

          data.adjustmentAmount = adjustmentAmount;
          data.finalRate = finalRate;
          data.hasAdjustment = adjustmentAmount !== 0;
          data.adjustmentType = teacherAdjustments[teacher]?.type || 'none';

          // 猸?璁＄畻鏅€氳宸ヨ祫
          const normalSalary = data.normalClasses * finalRate;
          data.normalSalary = normalSalary;

          // 猸?璁＄畻璇曡浣ｉ噾 - 涓夌骇浼樺厛绾?
          let trialCommission = 0;
          let trialSource = 'none'; // 'manual', 'auto', 'default', 'none'
          let successfulTrials = 0;
          let failedTrials = 0;

          if (trialData[teacher] && (trialData[teacher].successful > 0 || trialData[teacher].failed > 0)) {
            // 浼樺厛绾?: 鎵嬪姩杈撳叆鐨勮瘯璇炬暟鎹紙瑕嗙洊鑷姩鍒ゅ畾锛?
            successfulTrials = trialData[teacher].successful || 0;
            failedTrials = trialData[teacher].failed || 0;
            trialCommission = (successfulTrials * finalRate) + (failedTrials * finalRate * 0.5);
            trialSource = 'manual';
            console.log(`${teacher} 璇曡浣ｉ噾 [鎵嬪姩]: 鎴愬姛${successfulTrials}鑺偯?{finalRate} + 澶辫触${failedTrials}鑺偯?{finalRate}脳0.5 = ${trialCommission.toFixed(2)}`);
          } else if (autoTrialResults[teacher]) {
            // 浼樺厛绾?: 鑷姩鍒ゅ畾鐨勮瘯璇炬暟鎹?
            successfulTrials = autoTrialResults[teacher].successful;
            failedTrials = autoTrialResults[teacher].failed;
            trialCommission = (successfulTrials * finalRate) + (failedTrials * finalRate * 0.5);
            trialSource = 'auto';
            console.log(`${teacher} 璇曡浣ｉ噾 [鑷姩]: 鎴愬姛${successfulTrials}鑺偯?{finalRate} + 澶辫触${failedTrials}鑺偯?{finalRate}脳0.5 = ${trialCommission.toFixed(2)}`);
          } else if (data.trialClasses > 0) {
            // 浼樺厛绾?: 濡傛灉鏃㈡病鏈夋墜鍔ㄨ緭鍏ヤ篃娌℃湁鑷姩鍒ゅ畾锛岄粯璁ゆ墍鏈夎瘯璇炬寜澶辫触璁＄畻
            failedTrials = data.trialClasses;
            trialCommission = data.trialClasses * finalRate * 0.5;
            trialSource = 'default';
            console.log(`${teacher} 璇曡浣ｉ噾 [榛樿澶辫触]: ${failedTrials}鑺偯?{finalRate}脳0.5 = ${trialCommission.toFixed(2)}`);
          }

          data.trialCommission = trialCommission;
          data.trialSource = trialSource;
          data.successfulTrials = successfulTrials;
          data.failedTrials = failedTrials;
          data.autoTrialData = autoTrialResults[teacher] || null;

          // 猸?鎬昏鏃跺伐璧?= 鏅€氳宸ヨ祫 + 璇曡浣ｉ噾
          data.totalSalary = normalSalary + trialCommission;

          // 璁＄畻濂栨儵閲戦
          let rewardsAmount = 0;
          if (rewardsData[teacher] && Array.isArray(rewardsData[teacher])) {
            for (const reward of rewardsData[teacher]) {
              if (reward.type === 'percentage') {
                // 鐧惧垎姣旓細鍩轰簬鍩虹宸ヨ祫璁＄畻
                rewardsAmount += data.totalSalary * (reward.value / 100);
              } else if (reward.type === 'absolute') {
                // 缁濆鍊硷細鐩存帴鍔犲噺
                rewardsAmount += reward.value;
              }
            }
            console.log(`${teacher} 濂栨儵閲戦: ${rewardsAmount.toFixed(2)} (${rewardsData[teacher].length}椤?`);
          }
          data.rewardsAmount = rewardsAmount;

          // 鑰佸笀鐨勬渶缁堟€诲伐璧?= 璇炬椂宸ヨ祫 + 濂栨儵閲戦
          data.finalTotalSalary = data.totalSalary + rewardsAmount;

          totalSalary += normalSalary;
          totalAdjustmentAmount += adjustmentAmount * (data.normalClasses + data.trialClasses);
          totalTrialCommission += trialCommission;
          totalRewardsAmount += rewardsAmount;
        }

        console.log(`馃挵 宸ヨ祫璁＄畻瀹屾垚: 鎬昏鏃?{totalClasses}, 鍩虹宸ヨ祫楼${totalSalary.toFixed(2)}, 璇曡浣ｉ噾楼${totalTrialCommission.toFixed(2)}, 濂栨儵閲戦楼${totalRewardsAmount.toFixed(2)}`);

        // 鑾峰彇鎵€鏈夎€佸笀鐨勫嚭鍕ょ姸鎬侊紙杩熷埌/鏃疯锛?
        const teacherNameList = Object.keys(teacherSummary);
        let attendanceData = {};
        try {
          feifeiConnection = await getFeifeiDbConnection();
          attendanceData = await getTeacherAttendanceInfo(
            feifeiConnection,
            teacherNameList,
            startDate,
            endDate,
            {
              yuekebaoClassKeysByTeacher: expandedYuekebaoClassKeysByTeacher,
              yuekebaoClassesByTeacherStudentDate,
              teacherAliasToMainMap,
              studentAliasToMainMap
            }
          );
        console.log(`出勤数据获取完成: ${Object.keys(attendanceData).length} 位老师有记录`);
        } catch (err) {
          console.error('鈿狅笍 鑾峰彇鍑哄嫟鏁版嵁澶辫触锛堜笉褰卞搷宸ヨ祫璁＄畻锛?', err.message);
        }

        // 灏?ClassIn 鑰佸笀鍚嶏紙鍙兘鏄埆鍚嶏級褰掑苟鍒扮害璇惧疂鑰佸笀涓诲悕锛岄伩鍏嶅伐璧勯〉鏄剧ず鈥滃叏閮ㄧ鍒扳€?
        const mergeAttendanceRecords = (target = [], source = []) => {
          const seen = new Set(target.map(r => `${r.classTime}|${r.studentName}|${r.reason}`));
          for (const item of source || []) {
            const normalizedStudentName = studentAliasToMainMap[String(item?.studentName || '').trim()] || item?.studentName || '';
            const normalizedItem = {
              ...item,
              studentName: normalizedStudentName
            };
            const key = `${normalizedItem?.classTime || ''}|${normalizedItem?.studentName || ''}|${normalizedItem?.reason || ''}`;
            if (seen.has(key)) continue;
            seen.add(key);
            target.push(normalizedItem);
          }
          return target;
        };

        const normalizedAttendanceData = {};
        Object.entries(attendanceData || {}).forEach(([rawTeacherName, info]) => {
          const teacherName = String(rawTeacherName || '').trim();
          const canonicalTeacherName = teacherAliasToMainMap[teacherName] || teacherName;
          if (!canonicalTeacherName) return;

          if (!normalizedAttendanceData[canonicalTeacherName]) {
            normalizedAttendanceData[canonicalTeacherName] = {
              lateRecords: [],
              absentRecords: [],
              unsignedRecords: []
            };
          }

          mergeAttendanceRecords(normalizedAttendanceData[canonicalTeacherName].lateRecords, info?.lateRecords || []);
          mergeAttendanceRecords(normalizedAttendanceData[canonicalTeacherName].absentRecords, info?.absentRecords || []);
          mergeAttendanceRecords(normalizedAttendanceData[canonicalTeacherName].unsignedRecords, info?.unsignedRecords || []);
        });

        // 灏嗗嚭鍕ゆ暟鎹檮鍔犲埌姣忎綅鑰佸笀鐨勬暟鎹腑
        const teachersResult = Object.values(teacherSummary).map(t => ({
          ...t,
          attendanceInfo: normalizedAttendanceData[t.teacher] || attendanceData[t.teacher] || { lateRecords: [], absentRecords: [], unsignedRecords: [] }
        }));

        res.json({
          success: true,
          period: { startDate, endDate },
          summary: {
            totalClasses,
            totalTeachers: Object.keys(teacherSummary).length,
            totalAdjustmentAmount,
            totalSalary: totalSalary + totalTrialCommission + totalRewardsAmount, // 鍖呭惈鎵€鏈夐噾棰濈殑鎬诲伐璧?
            baseSalary: totalSalary, // 鍩虹璇炬椂宸ヨ祫
            totalTrialCommission, // 璇曡浣ｉ噾鎬昏
            totalRewardsAmount, // 濂栨儵閲戦鎬昏
            hasIndividualAdjustments: Object.keys(teacherAdjustments).length > 0,
            hasTrialData: Object.keys(trialData).length > 0,
            hasRewardsData: Object.keys(rewardsData).length > 0,
            usesIndividualRates: true // 鏍囪瘑浣跨敤鏁版嵁搴撲腑鐨勪釜浜鸿鏃惰垂
          },
          teachers: teachersResult
        });

      } catch (error) {
        console.error('鉂?宸ヨ祫璁＄畻API閿欒:', error);
        res.status(500).json({
          success: false,
          message: `宸ヨ祫璁＄畻澶辫触: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
        if (feifeiConnection) {
          await feifeiConnection.end();
        }
      }
    });

    // API鎺ュ彛锛氭暟鎹埛鏂?
    this.app.post('/api/refresh-data', async (req, res) => {
      try {
        console.log('馃攧 寮€濮嬫暟鎹埛鏂?..');

        // 璋冪敤鐜版湁鐨勬暟鎹姄鍙栧嚱鏁?
        const result = await this.scrapeYuekebaoCourses({
          email: "3kkg7a7k4d66@qq.com",
          password: "flyegg",
          headless: true,
          timeout: 30000
        });

        if (result.isError) {
          throw new Error(result.content[0].text);
        }

        console.log('鉁?鏁版嵁鍒锋柊瀹屾垚');
        res.json({
          success: true,
          message: '鏁版嵁鍒锋柊鎴愬姛',
          timestamp: formatShanghaiTimestampString()
        });

      } catch (error) {
        console.error('鉂?鏁版嵁鍒锋柊澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `鏁版嵁鍒锋柊澶辫触: ${error.message}`,
          timestamp: formatShanghaiTimestampString()
        });
      }
    });

    // API鎺ュ彛锛氳幏鍙栨渶鍚庡埛鏂版椂闂?
    this.app.get('/api/last-refresh-time', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('馃搳 鏌ヨ鏈€鍚庡埛鏂版椂闂?..');

        // 鏌ヨ鏈€鏂扮殑 create_time 浣滀负鏈€鍚庡埛鏂版椂闂?
        const [result] = await connection.execute(`
          SELECT MAX(create_time) as last_refresh
          FROM yuekebao_classtime
          WHERE create_time IS NOT NULL
        `);

        // 鏌ヨ鏁版嵁鐨勬棩鏈熻寖鍥?
        const [dateRange] = await connection.execute(`
          SELECT MIN(class_date) as min_date, MAX(class_date) as max_date
          FROM yuekebao_classtime
        `);

        const lastRefresh = result[0]?.last_refresh;
        const minDate = dateRange[0]?.min_date;
        const maxDate = dateRange[0]?.max_date;

        const formatDate = (d) => formatShanghaiMonthDay(d);
        const lastRefreshTime = formatShanghaiTimestampString(lastRefresh);

        if (!lastRefresh) {
          return res.json({
            success: true,
            lastRefreshTime: null,
            dateRange: null,
            message: '鏆傛棤鏁版嵁'
          });
        }

        console.log(`鉁?鏈€鍚庡埛鏂版椂闂? ${lastRefresh}, 鏁版嵁鑼冨洿: ${minDate} ~ ${maxDate}`);
        res.json({
          success: true,
          lastRefreshTime,
          dateRange: minDate && maxDate ? `${formatDate(minDate)} ~ ${formatDate(maxDate)}` : null,
          message: '鑾峰彇鎴愬姛'
        });

      } catch (error) {
        console.error('鉂?鑾峰彇鏈€鍚庡埛鏂版椂闂村け璐?', error.message);
        res.status(500).json({
          success: false,
          message: `鑾峰彇鏈€鍚庡埛鏂版椂闂村け璐? ${error.message}`,
          lastRefreshTime: null,
          dateRange: null
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氳幏鍙栨眹鐜囬厤缃?
    this.app.get('/api/config', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('馃搳 寮€濮嬭幏鍙栨眹鐜囬厤缃?..');

        // 鏌ヨyuekebao_config琛?
        const [configRows] = await connection.execute(
          'SELECT config FROM yuekebao_config WHERE id = 1'
        );

        if (configRows.length === 0) {
          // 濡傛灉娌℃湁閰嶇疆璁板綍锛屽垱寤洪粯璁ら厤缃?
          const defaultConfig = JSON.stringify({
            cny_to_pesos: null,
            dollars_exchange: 7.12,
            excluded_students: [], // 榛樿涓嶆帓闄や换浣曞鐢?
            hide_remaining_students: [], // 榛樿涓嶉殣钘忎换浣曞鐢熺殑鍓╀綑璇炬椂
            auto_feedback_prompt: defaultAutoFeedbackPrompt,
            material_key_content_prompt_template: defaultMaterialKeyContentPromptTemplate,
            material_keyword_explain_prompt_template: defaultMaterialKeywordExplainPromptTemplate,
            thumbnail_companion_language_prompt_template: defaultThumbnailCompanionLanguagePromptTemplate,
            thumbnail_companion_textless_prompt_template: defaultThumbnailCompanionTextlessPromptTemplate,
            thumbnail_companion_background_prompt_template: defaultThumbnailCompanionBackgroundPromptTemplate,
            thumbnail_annotation_prompt_template: defaultThumbnailAnnotationPromptTemplate,
            thumbnail_video_prompt_template: defaultThumbnailVideoPromptTemplate,
            summary_image_prompt_template: defaultSummaryImagePromptTemplate
          });

          await connection.execute(
            'INSERT INTO yuekebao_config (id, config) VALUES (1, ?)',
            [defaultConfig]
          );

          console.log('鉁?鍒涘缓榛樿姹囩巼閰嶇疆鎴愬姛');
          res.json({
            success: true,
            config: {
              cny_to_pesos: null,
              dollars_exchange: 7.12,
              excluded_students: [],
              hide_remaining_students: [],
              auto_feedback_prompt: defaultAutoFeedbackPrompt,
              material_key_content_prompt_template: defaultMaterialKeyContentPromptTemplate,
              material_keyword_explain_prompt_template: defaultMaterialKeywordExplainPromptTemplate,
              thumbnail_companion_language_prompt_template: defaultThumbnailCompanionLanguagePromptTemplate,
              thumbnail_companion_textless_prompt_template: defaultThumbnailCompanionTextlessPromptTemplate,
              thumbnail_companion_background_prompt_template: defaultThumbnailCompanionBackgroundPromptTemplate,
              thumbnail_annotation_prompt_template: defaultThumbnailAnnotationPromptTemplate,
              thumbnail_video_prompt_template: defaultThumbnailVideoPromptTemplate,
              summary_image_prompt_template: defaultSummaryImagePromptTemplate
            },
            message: '鑾峰彇鎴愬姛锛堜娇鐢ㄩ粯璁ら厤缃級'
          });
        } else {
          const config = JSON.parse(configRows[0].config);
          let shouldPersistConfig = false;
          // 纭繚瀛楁瀛樺湪
          if (!config.excluded_students) {
            config.excluded_students = [];
          }
          if (!config.hide_remaining_students) {
            config.hide_remaining_students = [];
          }
          if (!config.auto_feedback_prompt) {
            config.auto_feedback_prompt = defaultAutoFeedbackPrompt;
          }
          const resolvedMaterialKeyContentPromptTemplate = resolveMaterialKeyContentPromptTemplate(
            config.material_key_content_prompt_template
          );
          if (config.material_key_content_prompt_template !== resolvedMaterialKeyContentPromptTemplate) {
            config.material_key_content_prompt_template = resolvedMaterialKeyContentPromptTemplate;
            shouldPersistConfig = true;
          }
          const resolvedMaterialKeywordExplainPromptTemplate = resolveMaterialKeywordExplainPromptTemplate(
            config.material_keyword_explain_prompt_template
          );
          if (config.material_keyword_explain_prompt_template !== resolvedMaterialKeywordExplainPromptTemplate) {
            config.material_keyword_explain_prompt_template = resolvedMaterialKeywordExplainPromptTemplate;
            shouldPersistConfig = true;
          }
          if (!config.thumbnail_companion_language_prompt_template) {
            config.thumbnail_companion_language_prompt_template = defaultThumbnailCompanionLanguagePromptTemplate;
          }
          if (!config.thumbnail_companion_textless_prompt_template) {
            config.thumbnail_companion_textless_prompt_template = defaultThumbnailCompanionTextlessPromptTemplate;
          }
          if (!config.thumbnail_companion_background_prompt_template) {
            config.thumbnail_companion_background_prompt_template = defaultThumbnailCompanionBackgroundPromptTemplate;
          }
          if (!config.thumbnail_annotation_prompt_template) {
            config.thumbnail_annotation_prompt_template = defaultThumbnailAnnotationPromptTemplate;
          }
          if (!config.thumbnail_video_prompt_template) {
            config.thumbnail_video_prompt_template = defaultThumbnailVideoPromptTemplate;
          }
          if (!config.summary_image_prompt_template) {
            config.summary_image_prompt_template = defaultSummaryImagePromptTemplate;
          }
          if (shouldPersistConfig) {
            await connection.execute(
              'UPDATE yuekebao_config SET config = ? WHERE id = 1',
              [JSON.stringify(config)]
            );
          }
          console.log('鉁?姹囩巼閰嶇疆鑾峰彇鎴愬姛:', config);
          res.json({
            success: true,
            config: config,
            message: '鑾峰彇鎴愬姛'
          });
        }

      } catch (error) {
        console.error('鉂?鑾峰彇姹囩巼閰嶇疆澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `鑾峰彇姹囩巼閰嶇疆澶辫触: ${error.message}`,
          config: null
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氳幏鍙栬€佸笀璇炬椂缁熻
    this.app.get('/api/teacher-stats', async (req, res) => {
      let connection;

      try {
        const { startDate, endDate, groupBy } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: '璇锋彁渚涘紑濮嬪拰缁撴潫鏃ユ湡'
          });
        }

        connection = await getDbConnection();
        console.log(`馃搳 鏌ヨ鑰佸笀璇炬椂缁熻: ${startDate} 鑷?${endDate}, 鍒嗙粍鏂瑰紡: ${groupBy}`);

        // 鏌ヨ璇炬椂鏁版嵁
        const [rows] = await connection.execute(`
          SELECT teacher, class_date, SUM(time_num) as class_count
          FROM yuekebao_classtime
          WHERE class_date >= ? AND class_date <= ?
          GROUP BY teacher, class_date
          ORDER BY ${groupBy === 'date' ? 'class_date, teacher' : 'teacher, class_date'}
        `, [startDate, endDate]);

        let data = [];

        // 杈呭姪鍑芥暟锛氭牸寮忓寲鏃ユ湡
        const formatDate = (dateValue) => {
          if (dateValue instanceof Date) {
            return formatShanghaiDateString(dateValue);
          }
          if (typeof dateValue === 'string') {
            return formatShanghaiDateString(dateValue);
          }
          return String(dateValue);
        };

        if (groupBy === 'teacher') {
          // 鎸夎€佸笀鍒嗙粍
          const teacherMap = {};
          rows.forEach(row => {
            if (!teacherMap[row.teacher]) {
              teacherMap[row.teacher] = {
                teacher: row.teacher,
                totalClasses: 0,
                details: []
              };
            }
            teacherMap[row.teacher].totalClasses += parseInt(row.class_count) || 0;
            teacherMap[row.teacher].details.push({
              date: formatDate(row.class_date),
              count: parseInt(row.class_count) || 0
            });
          });
          data = Object.values(teacherMap).sort((a, b) => b.totalClasses - a.totalClasses);
        } else {
          // 鎸夋棩鏈熷垎缁?
          const dateMap = {};
          rows.forEach(row => {
            const dateStr = formatDate(row.class_date);
            if (!dateMap[dateStr]) {
              dateMap[dateStr] = {
                date: dateStr,
                totalClasses: 0,
                details: []
              };
            }
            dateMap[dateStr].totalClasses += parseInt(row.class_count) || 0;
            dateMap[dateStr].details.push({
              teacher: row.teacher,
              count: parseInt(row.class_count) || 0
            });
          });
          data = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
        }

        console.log(`查询成功，返回 ${data.length} 条记录`);

        res.json({
          success: true,
          data: data
        });

      } catch (error) {
        console.error('鉂?鏌ヨ鑰佸笀璇炬椂缁熻澶辫触:', error);
        res.status(500).json({
          success: false,
          message: `鏌ヨ澶辫触: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氫繚瀛樻眹鐜囬厤缃?
    this.app.post('/api/config', async (req, res) => {
      let connection;

      try {
        const {
          cny_to_pesos,
          dollars_exchange,
          excluded_students,
          hide_remaining_students,
          auto_feedback_prompt,
          auto_feedback_schema,
          material_key_content_prompt_template,
          material_keyword_explain_prompt_template,
          thumbnail_companion_language_prompt_template,
          thumbnail_companion_textless_prompt_template,
          thumbnail_companion_background_prompt_template,
          thumbnail_annotation_prompt_template,
          thumbnail_video_prompt_template,
          summary_image_prompt_template
        } = req.body;

        // 楠岃瘉excluded_students鏄暟缁?
        if (excluded_students !== undefined && !Array.isArray(excluded_students)) {
          return res.status(400).json({
            success: false,
            message: '排除学生列表必须是数组'
          });
        }

        // 楠岃瘉hide_remaining_students鏄暟缁?
        if (hide_remaining_students !== undefined && !Array.isArray(hide_remaining_students)) {
          return res.status(400).json({
            success: false,
            message: '隐藏剩余课时学生列表必须是数组'
          });
        }

        if (
          material_key_content_prompt_template !== undefined
          && (
            !String(material_key_content_prompt_template).includes('{{material_title}}')
            || !String(material_key_content_prompt_template).includes('{{pdf_name}}')
            || !String(material_key_content_prompt_template).includes('{{page_source}}')
          )
        ) {
          return res.status(400).json({
            success: false,
            message: '鍏抽敭鍐呭鎻愮偧鎻愮ず璇嶆ā鏉垮繀椤讳繚鐣?{{material_title}}銆亄{pdf_name}} 鍜?{{page_source}}'
          });
        }

        if (
          material_keyword_explain_prompt_template !== undefined
          && !String(material_keyword_explain_prompt_template).includes('{{keywords}}')
        ) {
          return res.status(400).json({
            success: false,
            message: '鍏抽敭璇嶈В閲婃彁绀鸿瘝妯℃澘蹇呴』淇濈暀 {{keywords}}'
          });
        }

        if (
          thumbnail_companion_language_prompt_template !== undefined
          && !String(thumbnail_companion_language_prompt_template).includes('{{language}}')
        ) {
          return res.status(400).json({
            success: false,
            message: '閰嶅鍥捐瑷€鎻愮ず璇嶆ā鏉垮繀椤讳繚鐣?{{language}}'
          });
        }

        if (
          thumbnail_companion_background_prompt_template !== undefined
          && !String(thumbnail_companion_background_prompt_template).trim()
        ) {
          return res.status(400).json({
            success: false,
            message: '纯背景图提示词模板不能为空'
          });
        }

        if (
          thumbnail_annotation_prompt_template !== undefined
          && (
            !String(thumbnail_annotation_prompt_template).includes('{{title}}')
            || (
              !String(thumbnail_annotation_prompt_template).includes('{{segments}}')
              && !String(thumbnail_annotation_prompt_template).includes('{{body}}')
            )
          )
        ) {
          return res.status(400).json({
            success: false,
            message: '浣嶇疆鏍囧畾鎻愮ず璇嶆ā鏉垮繀椤讳繚鐣?{{title}}锛屽苟淇濈暀 {{segments}} 鎴?{{body}}'
          });
        }

        if (
          summary_image_prompt_template !== undefined
          && (
            !String(summary_image_prompt_template).includes('{{title}}')
            || !String(summary_image_prompt_template).includes('{{body}}')
          )
        ) {
          return res.status(400).json({
            success: false,
            message: '鎽樿鍥炬彁绀鸿瘝妯℃澘蹇呴』淇濈暀 {{title}} 鍜?{{body}}'
          });
        }

        connection = await getDbConnection();
        console.log('馃捑 寮€濮嬩繚瀛樻眹鐜囬厤缃?..', req.body);

        // 鍒涘缓yuekebao_config琛紙濡傛灉涓嶅瓨鍦級
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS yuekebao_config (
            id INT PRIMARY KEY,
            config JSON NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // 纭繚config鍒楀彲浠ュ瓨鍌ㄥぇ閲忔暟鎹紙鍏煎鏃ц〃缁撴瀯锛?
        await connection.execute(`
          ALTER TABLE yuekebao_config MODIFY COLUMN config LONGTEXT NOT NULL
        `);

        // 鍏堣鍙栫幇鏈夐厤缃紝鍚堝苟鏇存柊锛堥伩鍏嶄涪澶辨湭鍦ㄨ姹備腑鐨勫瓧娈碉級
        let existingConfig = {};
        const [existingRows] = await connection.execute(
          'SELECT config FROM yuekebao_config WHERE id = 1'
        );
        if (existingRows.length > 0) {
          try { existingConfig = JSON.parse(existingRows[0].config); } catch (e) { /* ignore */ }
        }

        const parsePositiveNumberOrNull = (value) => {
          if (value === undefined || value === null || value === '') {
            return null;
          }
          const parsed = parseFloat(value);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        };

        const hasIncomingCnyToPesos = !(cny_to_pesos === undefined || cny_to_pesos === null || cny_to_pesos === '');
        const incomingCnyToPesos = parsePositiveNumberOrNull(cny_to_pesos);
        const existingCnyToPesos = parsePositiveNumberOrNull(existingConfig.cny_to_pesos);
        const resolvedCnyToPesos = hasIncomingCnyToPesos ? incomingCnyToPesos : existingCnyToPesos;

        const incomingDollarsExchange = parsePositiveNumberOrNull(dollars_exchange);
        const existingDollarsExchange = parsePositiveNumberOrNull(existingConfig.dollars_exchange);
        const resolvedDollarsExchange = dollars_exchange !== undefined
          ? incomingDollarsExchange
          : (existingDollarsExchange ?? 7.12);

        if ((hasIncomingCnyToPesos && incomingCnyToPesos === null) || !resolvedDollarsExchange || resolvedDollarsExchange <= 0) {
          return res.status(400).json({
            success: false,
            message: '姹囩巼蹇呴』澶т簬0'
          });
        }

        // 鍚堝苟閰嶇疆锛氫繚鐣欑幇鏈夊瓧娈碉紝鐢ㄨ姹備腑鐨勫瓧娈佃鐩?
        const configData = JSON.stringify({
          ...existingConfig,
          cny_to_pesos: resolvedCnyToPesos,
          dollars_exchange: resolvedDollarsExchange,
          excluded_students: excluded_students !== undefined ? excluded_students : (existingConfig.excluded_students || []),
          hide_remaining_students: hide_remaining_students !== undefined ? hide_remaining_students : (existingConfig.hide_remaining_students || []),
          auto_feedback_prompt: auto_feedback_prompt || defaultAutoFeedbackPrompt,
          auto_feedback_schema: auto_feedback_schema !== undefined ? auto_feedback_schema : (existingConfig.auto_feedback_schema || null),
          material_key_content_prompt_template: material_key_content_prompt_template !== undefined
            ? String(material_key_content_prompt_template)
            : resolveMaterialKeyContentPromptTemplate(existingConfig.material_key_content_prompt_template),
          material_keyword_explain_prompt_template: material_keyword_explain_prompt_template !== undefined
            ? String(material_keyword_explain_prompt_template)
            : resolveMaterialKeywordExplainPromptTemplate(existingConfig.material_keyword_explain_prompt_template),
          thumbnail_companion_language_prompt_template: thumbnail_companion_language_prompt_template !== undefined
            ? String(thumbnail_companion_language_prompt_template)
            : (existingConfig.thumbnail_companion_language_prompt_template || defaultThumbnailCompanionLanguagePromptTemplate),
          thumbnail_companion_textless_prompt_template: thumbnail_companion_textless_prompt_template !== undefined
            ? String(thumbnail_companion_textless_prompt_template)
            : (existingConfig.thumbnail_companion_textless_prompt_template || defaultThumbnailCompanionTextlessPromptTemplate),
          thumbnail_companion_background_prompt_template: thumbnail_companion_background_prompt_template !== undefined
            ? String(thumbnail_companion_background_prompt_template)
            : (existingConfig.thumbnail_companion_background_prompt_template || defaultThumbnailCompanionBackgroundPromptTemplate),
          thumbnail_annotation_prompt_template: thumbnail_annotation_prompt_template !== undefined
            ? String(thumbnail_annotation_prompt_template)
            : (existingConfig.thumbnail_annotation_prompt_template || defaultThumbnailAnnotationPromptTemplate),
          thumbnail_video_prompt_template: thumbnail_video_prompt_template !== undefined
            ? String(thumbnail_video_prompt_template)
            : (existingConfig.thumbnail_video_prompt_template || defaultThumbnailVideoPromptTemplate),
          summary_image_prompt_template: summary_image_prompt_template !== undefined
            ? String(summary_image_prompt_template)
            : (existingConfig.summary_image_prompt_template || defaultSummaryImagePromptTemplate)
        });

        await connection.execute(
          'INSERT INTO yuekebao_config (id, config) VALUES (1, ?) ON DUPLICATE KEY UPDATE config = VALUES(config)',
          [configData]
        );

        console.log('鉁?姹囩巼閰嶇疆淇濆瓨鎴愬姛');
        res.json({
          success: true,
          message: '姹囩巼閰嶇疆淇濆瓨鎴愬姛'
        });

      } catch (error) {
        console.error('鉂?淇濆瓨姹囩巼閰嶇疆澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `淇濆瓨姹囩巼閰嶇疆澶辫触: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氳幏鍙栬€佸笀鍒楄〃
    this.app.get('/api/teachers', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('馃懆鈥嶐煆?寮€濮嬭幏鍙栬€佸笀鍒楄〃...');

        const [teachers] = await connection.execute(
          `SELECT teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases
           FROM yuekebao_teacher_salary
           ORDER BY type, teacher_name`
        );

        // 瑙ｆ瀽 aliases JSON
        teachers.forEach(t => {
          try {
            t.aliases = t.aliases ? JSON.parse(t.aliases) : [];
          } catch (e) {
            t.aliases = [];
          }
        });

        console.log(`鉁?鑾峰彇鑰佸笀鍒楄〃鎴愬姛: ${teachers.length} 浣嶈€佸笀`);
        res.json({
          success: true,
          teachers: teachers,
          count: teachers.length
        });

      } catch (error) {
        console.error('鉂?鑾峰彇鑰佸笀鍒楄〃澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `鑾峰彇鑰佸笀鍒楄〃澶辫触: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氭坊鍔犺€佸笀
    this.app.post('/api/teachers', async (req, res) => {
      let connection;

      try {
        const { teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases } = req.body;

        if (!teacher_name || !type) {
          return res.status(400).json({
            success: false,
            message: '老师名字和类型为必填项'
          });
        }

        connection = await getDbConnection();
        console.log('鉃?寮€濮嬫坊鍔犺€佸笀:', teacher_name);

        // 妫€鏌ユ槸鍚﹀凡瀛樺湪
        const [existing] = await connection.execute(
          'SELECT teacher_name FROM yuekebao_teacher_salary WHERE teacher_name = ?',
          [teacher_name]
        );

        if (existing.length > 0) {
          return res.status(400).json({
            success: false,
            message: '该老师已存在'
          });
        }

        const aliasesJson = aliases && aliases.length > 0 ? JSON.stringify(aliases) : null;
        await connection.execute(
          `INSERT INTO yuekebao_teacher_salary (teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [teacher_name, type, salary_per_class_time || 0, salary_unit || 'rmb', salary_account || '', aliasesJson]
        );

        console.log('鉁?娣诲姞鑰佸笀鎴愬姛:', teacher_name);
        res.json({
          success: true,
          message: '娣诲姞鑰佸笀鎴愬姛'
        });

      } catch (error) {
        console.error('鉂?娣诲姞鑰佸笀澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `娣诲姞鑰佸笀澶辫触: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氭洿鏂拌€佸笀锛堜娇鐢╰eacher_name浣滀负鏍囪瘑锛?
    this.app.put('/api/teachers/:name', async (req, res) => {
      let connection;

      try {
        const originalName = decodeURIComponent(req.params.name);
        const { teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases } = req.body;

        if (!teacher_name || !type) {
          return res.status(400).json({
            success: false,
            message: '老师名字和类型为必填项'
          });
        }

        connection = await getDbConnection();
        console.log('鉁忥笍 寮€濮嬫洿鏂拌€佸笀:', originalName, '->', teacher_name);

        // 妫€鏌ユ槸鍚﹀瓨鍦?
        const [existing] = await connection.execute(
          'SELECT teacher_name FROM yuekebao_teacher_salary WHERE teacher_name = ?',
          [originalName]
        );

        if (existing.length === 0) {
          return res.status(404).json({
            success: false,
            message: '老师不存在'
          });
        }

        // 濡傛灉鏀瑰悕锛屾鏌ユ柊鍚嶅瓧鏄惁宸茶浣跨敤
        if (teacher_name !== originalName) {
          const [duplicate] = await connection.execute(
            'SELECT teacher_name FROM yuekebao_teacher_salary WHERE teacher_name = ?',
            [teacher_name]
          );

          if (duplicate.length > 0) {
            return res.status(400).json({
              success: false,
              message: '璇ヨ€佸笀鍚嶅瓧宸茶浣跨敤'
            });
          }
        }

        const aliasesJson = aliases && aliases.length > 0 ? JSON.stringify(aliases) : null;
        await connection.execute(
          `UPDATE yuekebao_teacher_salary
           SET teacher_name = ?, type = ?, salary_per_class_time = ?, salary_unit = ?, salary_account = ?, aliases = ?
           WHERE teacher_name = ?`,
          [teacher_name, type, salary_per_class_time || 0, salary_unit || 'rmb', salary_account || '', aliasesJson, originalName]
        );

        console.log('鉁?鏇存柊鑰佸笀鎴愬姛:', teacher_name);
        res.json({
          success: true,
          message: '鏇存柊鑰佸笀鎴愬姛'
        });

      } catch (error) {
        console.error('鉂?鏇存柊鑰佸笀澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `鏇存柊鑰佸笀澶辫触: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氬垹闄よ€佸笀锛堜娇鐢╰eacher_name浣滀负鏍囪瘑锛?
    this.app.delete('/api/teachers/:name', async (req, res) => {
      let connection;

      try {
        const teacherName = decodeURIComponent(req.params.name);

        connection = await getDbConnection();
        console.log('馃棏锔?寮€濮嬪垹闄よ€佸笀:', teacherName);

        const [result] = await connection.execute(
          'DELETE FROM yuekebao_teacher_salary WHERE teacher_name = ?',
          [teacherName]
        );

        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            message: '老师不存在'
          });
        }

        console.log('鉁?鍒犻櫎鑰佸笀鎴愬姛');
        res.json({
          success: true,
          message: '鍒犻櫎鑰佸笀鎴愬姛'
        });

      } catch (error) {
        console.error('鉂?鍒犻櫎鑰佸笀澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `鍒犻櫎鑰佸笀澶辫触: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氳幏鍙栨墍鏈夊鐢熷悕鍗?
    this.app.get('/api/students', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('馃搵 寮€濮嬭幏鍙栨墍鏈夊鐢熷悕鍗?..');

        // 浠庝細鍛樺崱琛ㄨ幏鍙栨墍鏈変笉閲嶅鐨勫鐢熷悕
        const [students] = await connection.execute(
          `SELECT DISTINCT student FROM yuekebao_student_cardnum
           WHERE student IS NOT NULL AND student != ''
           ORDER BY student`
        );

        const studentNames = students.map(row => row.student);
        console.log(`获取学生名单成功: ${studentNames.length} 位学生`);

        res.json({
          success: true,
          students: studentNames,
          count: studentNames.length
        });

      } catch (error) {
        console.error('鉂?鑾峰彇瀛︾敓鍚嶅崟澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `鑾峰彇瀛︾敓鍚嶅崟澶辫触: ${error.message}`,
          students: []
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API鎺ュ彛锛氳幏鍙栧鐢熷埆鍚嶉厤缃垪琛?
    this.app.get('/api/student-aliases', async (req, res) => {
      let connection;
      try {
        connection = await getDbConnection();
        const [rows] = await connection.execute(
          `SELECT student_name, aliases, course_requirements, tags, notes FROM yuekebao_student_aliases ORDER BY student_name`
        );

        // 瑙ｆ瀽 JSON 瀛楁
        rows.forEach(r => {
          try {
            r.aliases = r.aliases ? JSON.parse(r.aliases) : [];
          } catch (e) {
            r.aliases = [];
          }
          try {
            r.tags = r.tags ? JSON.parse(r.tags) : [];
          } catch (e) {
            r.tags = [];
          }
          r.course_requirements = r.course_requirements || '';
          r.notes = r.notes || '';
        });

        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('鑾峰彇瀛︾敓鍒悕鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // API鎺ュ彛锛氭坊鍔犳垨鏇存柊瀛︾敓鍒悕
    this.app.post('/api/student-aliases', async (req, res) => {
      let connection;
      try {
        const { student_name, aliases, course_requirements, tags, notes } = req.body;

        if (!student_name) {
          return res.status(400).json({ success: false, error: '瀛︾敓鍚嶅瓧涓嶈兘涓虹┖' });
        }

        connection = await getDbConnection();
        const aliasesJson = aliases && aliases.length > 0 ? JSON.stringify(aliases) : null;
        const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : null;

        // 浣跨敤 INSERT ... ON DUPLICATE KEY UPDATE 瀹炵幇 upsert
        await connection.execute(
          `INSERT INTO yuekebao_student_aliases (student_name, aliases, course_requirements, tags, notes)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             aliases = VALUES(aliases),
             course_requirements = VALUES(course_requirements),
             tags = VALUES(tags),
             notes = VALUES(notes),
             update_time = CURRENT_TIMESTAMP`,
          [student_name, aliasesJson, course_requirements || null, tagsJson, notes || null]
        );

        res.json({ success: true, message: '淇濆瓨鎴愬姛' });
      } catch (error) {
        console.error('淇濆瓨瀛︾敓鍒悕澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // API鎺ュ彛锛氳幏鍙栧鐢熸帓璇炬暟鎹?
    this.app.get('/api/student-schedule/:studentName', async (req, res) => {
      let connection;

      try {
        const { studentName } = req.params;
        connection = await getDbConnection();
        console.log(`馃搮 寮€濮嬭幏鍙栧鐢熸帓璇炬暟鎹? ${studentName}`);

        // 鏌ヨ璇ュ鐢熺殑鎵€鏈夋帓璇捐褰曪紙褰撳墠鏃ユ湡寰€鍚?涓湀锛?
        const currentDate = new Date();
        const futureDate = new Date();
        futureDate.setMonth(currentDate.getMonth() + 2);

        const [scheduleData] = await connection.execute(
          `SELECT
             class_date,
             class_start_time,
             class_end_time,
             teacher,
             time_num
           FROM yuekebao_classtime
           WHERE student = ?
           AND class_date >= CURDATE()
           AND class_date <= ?
           ORDER BY class_date, class_start_time`,
          [studentName, formatShanghaiDateString(futureDate)]
        );

        console.log(`获取学生排课数据成功: ${scheduleData.length} 条记录`);
        res.json({
          success: true,
          studentName: studentName,
          schedules: scheduleData,
          message: '鑾峰彇鎴愬姛'
        });

      } catch (error) {
        console.error('鉂?鑾峰彇瀛︾敓鎺掕鏁版嵁澶辫触:', error.message);
        res.status(500).json({
          success: false,
          message: `鑾峰彇瀛︾敓鎺掕鏁版嵁澶辫触: ${error.message}`,
          schedules: []
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // 闈欐€佽祫婧愭湇鍔?- 浼樺厛绾ф渶楂?
    this.app.use('/css', express.static(path.resolve(this.__dirname, '..', 'public', 'css')));
    this.app.use('/js', express.static(path.resolve(this.__dirname, '..', 'public', 'js')));
    this.app.use('/checkin', express.static(path.resolve(this.__dirname, '..', 'public', 'checkin', 'dist')));

    // 浠ｇ悊绛惧埌 H5 浣跨敤鐨?/wechat 鎺ュ彛鍒?feifei-backend
    this.app.use('/wechat', forwardWechatRequest);

    // 鎻愪緵涓婚〉闈?- 閲嶅畾鍚戝埌瀛﹀憳鏁版嵁
    this.app.get('/', (req, res) => {
      res.redirect('/students');
    });

    // 鏁欏笀绛惧埌 H5锛堟湰鍦伴泦鎴愮増锛?
    const signinH5IndexFile = path.resolve(this.__dirname, '..', 'public', 'checkin', 'dist', 'index.html');
    const sendSigninH5Index = (_req, res) => {
      res.sendFile(signinH5IndexFile);
    };

    this.app.get('/teacher', (req, res) => {
      const teacherUid = String(req.query.teacherUid || '').trim();
      if (teacherUid) {
        const redirectUrl = `/courseDetail?teacherUid=${encodeURIComponent(teacherUid)}`;
        return res.redirect(302, redirectUrl);
      }
      return sendSigninH5Index(req, res);
    });
    this.app.get('/courseDetail', sendSigninH5Index);
    this.app.get('/courseDetailinfo/:id', sendSigninH5Index);
    this.app.get('/feedback/:id', sendSigninH5Index);

    // 淇濇寔鍘熺鍒伴摼鎺ヤ笉鍙橈細/signin/:uid
    this.app.get('/signin/:uid', (req, res) => {
      const uid = encodeURIComponent(req.params.uid || '');
      res.type('html').send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Teacher Sign-in</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; }
    iframe { border: 0; width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
      <iframe src="/courseDetail?teacherUid=${uid}" title="Teacher Sign-in"></iframe>
</body>
</html>`);
    });

    // 绾﹁瀹濋〉闈㈣矾鐢?
    this.app.get('/students', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'students.html'));
    });
    this.app.get('/teachers', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'teachers.html'));
    });
    this.app.get('/salary', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'salary.html'));
    });
    this.app.get('/settings', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'settings.html'));
    });
    this.app.get('/materials', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'materials.html'));
    });

    // FeiFei 椤甸潰璺敱
    this.app.get('/feifei/teachers', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'feifei-teachers.html'));
    });
    this.app.get('/feifei/sessions', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'feifei-sessions.html'));
    });
    this.app.get('/feifei/labels', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'feifei-labels.html'));
    });

    // 鍏煎鏃х殑 dashboard.html锛堜繚鐣欎綔涓哄浠斤級
    this.app.get('/dashboard', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'dashboard.html'));
    });

    // 鍋ュ悍妫€鏌ユ帴鍙?
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: formatShanghaiTimestampString() });
    });

    // 瑙﹀彂杩滅▼鎶撳彇鎺ュ彛锛堣皟鐢ㄦ湰鍦版姄鍙栨湇鍔★級
    this.app.post('/api/trigger-remote-scrape', async (req, res) => {
      const REMOTE_SCRAPER_URL = process.env.REMOTE_SCRAPER_URL || 'https://s4.s100.vip:3868/trigger-scrape';

      try {
        console.log(`馃攧 瑙﹀彂杩滅▼鎶撳彇: ${REMOTE_SCRAPER_URL}`);

        const response = await fetch(REMOTE_SCRAPER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // 蹇界暐 SSL 璇佷功楠岃瘉锛堝鏋滄槸鑷鍚嶈瘉涔︼級
          // Node.js fetch 涓嶆敮鎸佺洿鎺ヨ缃紝闇€瑕侀€氳繃鐜鍙橀噺 NODE_TLS_REJECT_UNAUTHORIZED=0
        });

        const data = await response.json();

        console.log(`鉁?杩滅▼鎶撳彇瑙﹀彂鎴愬姛:`, data);

        res.json({
          success: true,
            message: '远程抓取任务已触发',
          remoteResponse: data,
          timestamp: formatShanghaiTimestampString()
        });

      } catch (error) {
        console.error('鉂?瑙﹀彂杩滅▼鎶撳彇澶辫触:', error.message);

        res.status(500).json({
          success: false,
          error: '瑙﹀彂杩滅▼鎶撳彇澶辫触',
          message: error.message,
          timestamp: formatShanghaiTimestampString()
        });
      }
    });

    // GET 鏂瑰紡涔熸敮鎸佽Е鍙戯紙鏂逛究娴忚鍣ㄨ闂祴璇曪級
    this.app.get('/api/trigger-remote-scrape', async (req, res) => {
      const REMOTE_SCRAPER_URL = process.env.REMOTE_SCRAPER_URL || 'https://s4.s100.vip:3868/trigger-scrape';

      try {
        console.log(`馃攧 瑙﹀彂杩滅▼鎶撳彇 (GET): ${REMOTE_SCRAPER_URL}`);

        const response = await fetch(REMOTE_SCRAPER_URL, {
          method: 'GET'
        });

        const data = await response.json();

        console.log(`鉁?杩滅▼鎶撳彇瑙﹀彂鎴愬姛:`, data);

        res.json({
          success: true,
            message: '远程抓取任务已触发',
          remoteResponse: data,
          timestamp: formatShanghaiTimestampString()
        });

      } catch (error) {
        console.error('鉂?瑙﹀彂杩滅▼鎶撳彇澶辫触:', error.message);

        res.status(500).json({
          success: false,
          error: '瑙﹀彂杩滅▼鎶撳彇澶辫触',
          message: error.message,
          timestamp: formatShanghaiTimestampString()
        });
      }
    });

    // ========================================
    // === feifei 鏍囩绠＄悊 API ===
    // ========================================

    // 鑾峰彇鏍囩鍒楄〃
    this.app.get('/api/feifei/labels', async (req, res) => {
      let connection;
      try {
        connection = await getFeifeiDbConnection();
        const [rows] = await connection.execute(
          `SELECT id, name, parentId, orderNum, remark, createTime
           FROM base_user_label
           ORDER BY orderNum, id`
        );
        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('鑾峰彇鏍囩鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鏂板鏍囩
    this.app.post('/api/feifei/labels', async (req, res) => {
      let connection;
      try {
        const { name, parentId, orderNum, remark } = req.body;
        if (!name) {
          return res.status(400).json({ success: false, error: '鏍囩鍚嶇О涓嶈兘涓虹┖' });
        }
        connection = await getFeifeiDbConnection();
        const [result] = await connection.execute(
          'INSERT INTO base_user_label (name, parentId, orderNum, remark) VALUES (?, ?, ?, ?)',
          [name, parentId || null, orderNum || 0, remark || null]
        );
        res.json({ success: true, id: result.insertId });
      } catch (error) {
        console.error('鏂板鏍囩澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鏇存柊鏍囩
    this.app.put('/api/feifei/labels/:id', async (req, res) => {
      let connection;
      try {
        const { id } = req.params;
        const { name, parentId, orderNum, remark } = req.body;
        connection = await getFeifeiDbConnection();
        await connection.execute(
          'UPDATE base_user_label SET name = ?, parentId = ?, orderNum = ?, remark = ? WHERE id = ?',
          [name, parentId || null, orderNum || 0, remark || null, id]
        );
        res.json({ success: true });
      } catch (error) {
        console.error('鏇存柊鏍囩澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鍒犻櫎鏍囩
    this.app.delete('/api/feifei/labels/:id', async (req, res) => {
      let connection;
      try {
        const { id } = req.params;
        connection = await getFeifeiDbConnection();
        // 妫€鏌ユ槸鍚︽湁瀛愭爣绛?
        const [children] = await connection.execute(
          'SELECT COUNT(*) as count FROM base_user_label WHERE parentId = ?', [id]
        );
        if (children[0].count > 0) {
          return res.status(400).json({ success: false, error: '该标签下有子标签，无法删除' });
        }
        await connection.execute('DELETE FROM base_user_label WHERE id = ?', [id]);
        res.json({ success: true });
      } catch (error) {
        console.error('鍒犻櫎鏍囩澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // ========================================
    // === feifei 鏁欏笀绠＄悊 API ===
    // ========================================

    // 鑾峰彇鏁欏笀鍙€夋爣绛惧垪琛紙parentId = '6' 鐨勬爣绛撅級
    this.app.get('/api/feifei/teacher-label-options', async (req, res) => {
      let connection;
      try {
        connection = await getFeifeiDbConnection();
        const [rows] = await connection.execute(
          `SELECT id, name FROM base_user_label WHERE parentId = '6' ORDER BY orderNum, id`
        );
        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('鑾峰彇鏁欏笀鏍囩閫夐」澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鑾峰彇鏁欏笀鍒楄〃锛堝惈杩?0鏃ュ拰鏈潵30鏃ヨ鑺傛暟缁熻锛?
    this.app.get('/api/feifei/teachers', async (req, res) => {
      let connection;
      try {
        const { keyWord, hasClass, description, labelName } = req.query;
        connection = await getFeifeiDbConnection();

        // 璁＄畻鏃堕棿鑼冨洿
        const now = Math.floor(Date.now() / 1000);
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
        const thirtyDaysLater = now + 30 * 24 * 60 * 60;

        let sql = `
          SELECT
            t.id, t.uid, t.name, t.mobile, t.email, t.description,
            t.teacherLabels2, t.logo, t.createTime,
            COUNT(CASE WHEN c.classBtime >= ? AND c.classBtime <= ? THEN 1 END) as old30,
            COUNT(CASE WHEN c.classBtime > ? AND c.classBtime <= ? THEN 1 END) as new30
          FROM base_user_teacher t
          LEFT JOIN base_user_classsession c ON t.uid = c.teacherUid
          WHERE (t.isdel IS NULL OR t.isdel = 0)
        `;
        const params = [thirtyDaysAgo, now, now, thirtyDaysLater];

        if (keyWord) {
          sql += ' AND t.name LIKE ?';
          params.push(`%${keyWord}%`);
        }
        if (description) {
          sql += ' AND t.description LIKE ?';
          params.push(`%${description}%`);
        }
        if (labelName) {
          sql += ' AND JSON_CONTAINS(t.teacherLabels2, ?)';
          params.push(JSON.stringify(labelName));
        }

        sql += ' GROUP BY t.id ORDER BY t.createTime DESC';

        let [teachers] = await connection.execute(sql, params);

        // 濡傛灉绛涢€?鏈潵30鏃ユ湁璇?
        if (hasClass === '1') {
          teachers = teachers.filter(t => t.new30 > 0);
        }

        res.json({ success: true, data: teachers });
      } catch (error) {
        console.error('鑾峰彇鏁欏笀鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鏇存柊鏁欏笀
    this.app.put('/api/feifei/teachers/:uid', async (req, res) => {
      let connection;
      try {
        const { uid } = req.params;
        const { name, description, teacherLabels2 } = req.body;
        connection = await getFeifeiDbConnection();

        await connection.execute(
          'UPDATE base_user_teacher SET name = ?, description = ?, teacherLabels2 = ? WHERE uid = ?',
          [name, description || null, JSON.stringify(teacherLabels2 || []), uid]
        );

        res.json({ success: true });
      } catch (error) {
        console.error('鏇存柊鏁欏笀澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鑾峰彇鏁欏笀绛惧埌閰嶇疆
    this.app.get('/api/feifei/teachers/:uid/signin-config', async (req, res) => {
      let connection;
      try {
        const { uid } = req.params;
        connection = await getFeifeiDbConnection();
        const [rows] = await connection.execute(
          'SELECT id, signInStartTime, signInEndTime FROM base_user_signinconfig WHERE teacherUid = ?',
          [uid]
        );
        res.json({ success: true, data: rows[0] || { signInStartTime: 120, signInEndTime: 0 } });
      } catch (error) {
        console.error('鑾峰彇绛惧埌閰嶇疆澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 淇濆瓨鏁欏笀绛惧埌閰嶇疆
    this.app.post('/api/feifei/teachers/:uid/signin-config', async (req, res) => {
      let connection;
      try {
        const { uid } = req.params;
        const startInput = Number.parseInt(req.body?.signInStartTime, 10);
        const endInput = Number.parseInt(req.body?.signInEndTime, 10);
        const signInStartTime = Number.isFinite(startInput) ? Math.max(0, startInput) : 120;
        const signInEndTime = Number.isFinite(endInput) ? Math.max(0, endInput) : 0;
        if (signInEndTime > signInStartTime) {
          return res.status(400).json({ success: false, error: '绛惧埌缁撴潫鏃堕棿闇€灏忎簬绛変簬绛惧埌寮€濮嬫椂闂达紙鍧囦负璇惧墠鍒嗛挓鏁帮級' });
        }
        connection = await getFeifeiDbConnection();

        // 妫€鏌ユ槸鍚﹀凡瀛樺湪
        const [existing] = await connection.execute(
          'SELECT id FROM base_user_signinconfig WHERE teacherUid = ?', [uid]
        );

        if (existing.length > 0) {
          await connection.execute(
            'UPDATE base_user_signinconfig SET signInStartTime = ?, signInEndTime = ? WHERE teacherUid = ?',
            [signInStartTime, signInEndTime, uid]
          );
        } else {
          await connection.execute(
            'INSERT INTO base_user_signinconfig (teacherUid, signInStartTime, signInEndTime) VALUES (?, ?, ?)',
            [uid, signInStartTime, signInEndTime]
          );
        }

        res.json({ success: true });
      } catch (error) {
        console.error('淇濆瓨绛惧埌閰嶇疆澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // ========================================
    // === feifei 璇捐妭绠＄悊 API ===
    // ========================================

    // 鑾峰彇鏁欏笀鍒楄〃锛堢敤浜庤鑺傜鐞嗙殑涓嬫媺閫夋嫨锛?
    this.app.get('/api/feifei/class-sessions/teachers', async (req, res) => {
      let connection;
      try {
        connection = await getFeifeiDbConnection();

        // 鐩存帴浠庢暀甯堣〃鑾峰彇鎵€鏈夋湭鍒犻櫎鐨勬暀甯?
        const sql = `
          SELECT uid as teacherUid, name as teacherName
          FROM base_user_teacher
          WHERE (isdel IS NULL OR isdel = 0)
          ORDER BY createTime DESC
        `;

        const [rows] = await connection.execute(sql);
        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('鑾峰彇鏁欏笀鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鑾峰彇璇捐妭鍒楄〃锛堝惈瀛︾敓淇℃伅锛?
    this.app.get('/api/feifei/class-sessions', async (req, res) => {
      let connection;
      try {
        const { teacherUid, startTime, endTime } = req.query;
        connection = await getFeifeiDbConnection();

        const sql = `
          SELECT
            cs.id, cs.className, cs.classBtime, cs.classEtime,
            cs.teacherUid, cs.teacherName,
            scr.studId, scr.stId, s.studentName
          FROM base_user_classsession cs
          LEFT JOIN base_user_studentclassrecord scr ON cs.id = scr.classId
          LEFT JOIN base_user_student s ON scr.studId = s.studentUid
          WHERE cs.teacherUid = ? AND cs.classBtime >= ? AND cs.classBtime <= ?
          ORDER BY cs.classBtime
        `;

        const [rows] = await connection.execute(sql, [teacherUid, startTime, endTime]);
        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('鑾峰彇璇捐妭鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鑾峰彇璇捐妭鍒楄〃锛堝垎椤碉級- 鐢ㄤ簬璇捐妭绠＄悊鍒楄〃灞曠ず
    this.app.get('/api/feifei/class-session-list', async (req, res) => {
      let connection;
      try {
        const {
          page = 1,
          size = 20,
          teacherName,
          studentName,
          startTime,
          endTime,
          isPresent
        } = req.query;

        connection = await getFeifeiDbConnection();

        const SHANGHAI_OFFSET_HOURS = 8;
        const normalizeText = (value) => String(value || '').trim();
        const parseShanghaiDateTimeToMs = (rawValue) => {
          if (!rawValue) return NaN;

          if (rawValue instanceof Date) {
            return rawValue.getTime();
          }

          const raw = String(rawValue).trim();
          const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
          if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            const hour = Number(match[4]);
            const minute = Number(match[5]);
            const second = Number(match[6] || '0');
            return Date.UTC(year, month - 1, day, hour - SHANGHAI_OFFSET_HOURS, minute, second);
          }

          const ms = new Date(raw).getTime();
          return Number.isNaN(ms) ? NaN : ms;
        };

        const extractShanghaiDateStr = (rawValue) => {
          if (!rawValue) return '';
          const raw = String(rawValue).trim();
          const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
          return match ? match[1] : '';
        };

        const parseYuekebaoClassDateTimeToUnix = (classDate, classStartTime) => {
          const dateMatch = String(classDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
          const timeMatch = String(classStartTime || '').trim().match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
          if (!dateMatch || !timeMatch) return NaN;

          const year = Number(dateMatch[1]);
          const month = Number(dateMatch[2]);
          const day = Number(dateMatch[3]);
          const hour = Number(timeMatch[1]);
          const minute = Number(timeMatch[2]);
          const second = Number(timeMatch[3] || '0');
          const utcMs = Date.UTC(year, month - 1, day, hour - SHANGHAI_OFFSET_HOURS, minute, second);
          return Math.floor(utcMs / 1000);
        };

        const getAttendanceStatusByStart = (row, startTimestampSec) => {
          if (!row?.studentEnterTime) return 'skip';
          if (!row?.teacherjongTime) return 'absent';

          const classStartMs = Number(startTimestampSec) * 1000;
          const teacherEntryMs = parseShanghaiDateTimeToMs(row.teacherjongTime);
          if (!Number.isFinite(classStartMs) || !Number.isFinite(teacherEntryMs)) return 'skip';

          const classStartMinuteMs = Math.floor(classStartMs / 60000) * 60000;
          const teacherEntryMinuteMs = Math.floor(teacherEntryMs / 60000) * 60000;
          const oneMinBefore = classStartMinuteMs - 60 * 1000;
          const fiveMinAfter = classStartMs + 5 * 60 * 1000;

          if (teacherEntryMs > fiveMinAfter) return 'absent';
          if (teacherEntryMinuteMs > oneMinBefore) return 'late';
          return 'normal';
        };

        const parseAliasArray = (raw) => {
          if (!raw) return [];
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return Array.isArray(parsed) ? parsed.map(normalizeText).filter(Boolean) : [];
          } catch (e) {
            return [];
          }
        };

        const applyYuekebaoFallbackStartTimeForAbsentRows = async (sessionRows) => {
          if (!Array.isArray(sessionRows) || sessionRows.length === 0) return;

          const absentRows = sessionRows.filter(row => getAttendanceStatusByStart(row, row.startTimestamp) === 'absent');
          if (absentRows.length === 0) return;

          const candidateDates = new Set();
          const teacherNames = new Set();
          const studentNames = new Set();

          for (const row of absentRows) {
            const teacher = normalizeText(row.teacherName);
            const student = normalizeText(row.studentName);
            if (teacher) teacherNames.add(teacher);
            if (student) studentNames.add(student);

            const teacherDate = extractShanghaiDateStr(row.teacherjongTime);
            const studentDate = extractShanghaiDateStr(row.studentEnterTime);
            if (teacherDate) candidateDates.add(teacherDate);
            if (studentDate) candidateDates.add(studentDate);
          }

          if (teacherNames.size === 0 || candidateDates.size === 0) return;

          let teacherAliasToMain = {};
          let studentAliasToMain = {};

          try {
            const [teacherAliasRows] = await connection.execute(
              `SELECT teacher_name, aliases FROM yuekebao_teacher_salary WHERE aliases IS NOT NULL AND aliases != ''`
            );
            teacherAliasToMain = {};
            teacherAliasRows.forEach((row) => {
              const mainName = normalizeText(row.teacher_name);
              if (!mainName) return;
              teacherAliasToMain[mainName] = mainName;
              parseAliasArray(row.aliases).forEach(alias => {
                teacherAliasToMain[alias] = mainName;
              });
            });
          } catch (e) {
            console.warn('鍔犺浇鑰佸笀鍒悕澶辫触锛岃烦杩囧埆鍚嶅尮閰?', e.message);
          }

          try {
            const [studentAliasRows] = await connection.execute(
              `SELECT student_name, aliases FROM yuekebao_student_aliases WHERE aliases IS NOT NULL AND aliases != ''`
            );
            studentAliasToMain = {};
            studentAliasRows.forEach((row) => {
              const mainName = normalizeText(row.student_name);
              if (!mainName) return;
              studentAliasToMain[mainName] = mainName;
              parseAliasArray(row.aliases).forEach(alias => {
                studentAliasToMain[alias] = mainName;
              });
            });
          } catch (e) {
            console.warn('鍔犺浇瀛︾敓鍒悕澶辫触锛岃烦杩囧埆鍚嶅尮閰?', e.message);
          }

          const canonicalTeacherNames = [...teacherNames].map(name => teacherAliasToMain[name] || name);
          const canonicalStudentNames = [...studentNames].map(name => studentAliasToMain[name] || name);
          const queryTeacherNames = [...new Set([...teacherNames, ...canonicalTeacherNames].filter(Boolean))];
          const queryStudentNames = [...new Set([...studentNames, ...canonicalStudentNames].filter(Boolean))];
          const queryDates = [...candidateDates].filter(Boolean);

          if (queryTeacherNames.length === 0 || queryDates.length === 0) return;

          let yuekebaoSql = `
            SELECT
              teacher,
              student,
              DATE_FORMAT(class_date, '%Y-%m-%d') AS class_date,
              TIME_FORMAT(class_start_time, '%H:%i:%s') AS class_start_time
            FROM yuekebao_classtime
            WHERE teacher IN (${queryTeacherNames.map(() => '?').join(',')})
              AND class_date IN (${queryDates.map(() => '?').join(',')})
          `;
          const yuekebaoParams = [...queryTeacherNames, ...queryDates];

          if (queryStudentNames.length > 0) {
            yuekebaoSql += ` AND student IN (${queryStudentNames.map(() => '?').join(',')})`;
            yuekebaoParams.push(...queryStudentNames);
          }

          yuekebaoSql += ' ORDER BY class_date, class_start_time';

          const [yuekebaoRows] = await connection.execute(yuekebaoSql, yuekebaoParams);
          if (!Array.isArray(yuekebaoRows) || yuekebaoRows.length === 0) return;

          const yuekebaoIndex = new Map();
          for (const yRow of yuekebaoRows) {
            const teacher = normalizeText(yRow.teacher);
            const student = normalizeText(yRow.student);
            const classDate = normalizeText(yRow.class_date);
            if (!teacher || !student || !classDate) continue;

            const canonicalTeacher = teacherAliasToMain[teacher] || teacher;
            const canonicalStudent = studentAliasToMain[student] || student;
            const key = `${canonicalTeacher}||${canonicalStudent}||${classDate}`;
            if (!yuekebaoIndex.has(key)) yuekebaoIndex.set(key, []);
            yuekebaoIndex.get(key).push(yRow);
          }

          for (const row of absentRows) {
            const currentStatus = getAttendanceStatusByStart(row, row.startTimestamp);
            if (currentStatus !== 'absent') continue;

            const rowTeacher = normalizeText(row.teacherName);
            const rowStudent = normalizeText(row.studentName);
            if (!rowTeacher || !rowStudent) continue;

            const canonicalTeacher = teacherAliasToMain[rowTeacher] || rowTeacher;
            const canonicalStudent = studentAliasToMain[rowStudent] || rowStudent;
            const rowDates = [
              extractShanghaiDateStr(row.teacherjongTime),
              extractShanghaiDateStr(row.studentEnterTime)
            ].filter(Boolean);
            if (rowDates.length === 0) continue;

            const candidates = [];
            for (const d of [...new Set(rowDates)]) {
              const key = `${canonicalTeacher}||${canonicalStudent}||${d}`;
              const matched = yuekebaoIndex.get(key);
              if (matched && matched.length) candidates.push(...matched);
            }
            if (candidates.length === 0) continue;

            const teacherEntryMs = parseShanghaiDateTimeToMs(row.teacherjongTime);
            const studentEntryMs = parseShanghaiDateTimeToMs(row.studentEnterTime);

            const scored = [];
            for (const candidate of candidates) {
              const yuekebaoStartTimestamp = parseYuekebaoClassDateTimeToUnix(candidate.class_date, candidate.class_start_time);
              if (!Number.isFinite(yuekebaoStartTimestamp)) continue;

              const statusByYuekebao = getAttendanceStatusByStart(row, yuekebaoStartTimestamp);
              const yuekebaoStartMs = yuekebaoStartTimestamp * 1000;
              const teacherDiffMs = Number.isFinite(teacherEntryMs) ? Math.abs(teacherEntryMs - yuekebaoStartMs) : Number.MAX_SAFE_INTEGER;
              const studentDiffMs = Number.isFinite(studentEntryMs) ? Math.abs(studentEntryMs - yuekebaoStartMs) : Number.MAX_SAFE_INTEGER;

              scored.push({
                candidate,
                yuekebaoStartTimestamp,
                statusByYuekebao,
                teacherDiffMs,
                studentDiffMs
              });
            }

            const normalCandidates = scored
              .filter(item => item.statusByYuekebao === 'normal')
              .sort((a, b) => (
                a.teacherDiffMs - b.teacherDiffMs
                || a.studentDiffMs - b.studentDiffMs
                || a.yuekebaoStartTimestamp - b.yuekebaoStartTimestamp
              ));

            if (normalCandidates.length === 0) continue;

            const best = normalCandidates[0];
            row.classinStartTimestamp = row.startTimestamp;
            row.yuekebaoStartTimestamp = best.yuekebaoStartTimestamp;
            row.startTimestamp = best.yuekebaoStartTimestamp;
            row.startTimestampSource = 'yuekebao';
            row.yuekebaoClassDate = best.candidate.class_date;
            row.yuekebaoClassStartTime = best.candidate.class_start_time;
          }

          // 浜屾鍥為€€锛氱害璇惧疂涔熸棤娉曚慨姝ｆ椂锛屾鏌ヨ€佸笀鍜屽鐢熷疄闄呰繘鍏ユ椂闂?
          // 濡傛灉涓や汉閮借繘鍏ヤ簡鏁欏涓旇€佸笀鍦ㄥ鐢熻繘鍏ュ悗10鍒嗛挓鍐呭埌杈撅紝璇存槑璇惧疄闄呮甯歌繘琛?
          for (const row of absentRows) {
            if (getAttendanceStatusByStart(row, row.startTimestamp) !== 'absent') continue;
            if (!row.teacherjongTime || !row.studentEnterTime) continue;

            const teacherEntryMs = parseShanghaiDateTimeToMs(row.teacherjongTime);
            const studentEntryMs = parseShanghaiDateTimeToMs(row.studentEnterTime);
            if (!Number.isFinite(teacherEntryMs) || !Number.isFinite(studentEntryMs)) continue;

            const gapMs = teacherEntryMs - studentEntryMs;
            // 鑰佸笀鍦ㄥ鐢熶箣鍓嶈繘鍏ワ紝鎴栧湪瀛︾敓杩涘叆鍚?0鍒嗛挓鍐呭埌杈?
            if (gapMs <= 10 * 60 * 1000) {
              row.classinStartTimestamp = row.classinStartTimestamp || row.startTimestamp;
              // 璁剧疆寮€璇炬椂闂翠负鑰佸笀杩涘叆鍚?鍒嗛挓锛屼娇鍑哄嫟鍒ゅ畾涓烘甯?
              row.startTimestamp = Math.floor(teacherEntryMs / 1000) + 60;
              row.startTimestampSource = 'actualEntry';
            }
          }
        };

        // 鏋勫缓 WHERE 鏉′欢
        let whereClause = '1=1';
        const params = [];

        if (startTime && endTime) {
          whereClause += ' AND b.classBtime BETWEEN ? AND ?';
          params.push(parseInt(startTime), parseInt(endTime));
        }

        if (teacherName) {
          whereClause += ' AND b.teacherName LIKE ?';
          params.push(`%${teacherName}%`);
        }

        if (studentName) {
          whereClause += ' AND c.studentName LIKE ?';
          params.push(`%${studentName}%`);
        }

        if (isPresent !== undefined && isPresent !== '') {
          if (isPresent === '1') {
            whereClause += ' AND e.isPresent = 1';
          } else {
            whereClause += ' AND (e.isPresent IS NULL OR e.isPresent = 0)';
          }
        }

        // 鏌ヨ鎬绘暟
        const countSql = `
          SELECT COUNT(DISTINCT a.id) as total
          FROM base_user_studentclassrecord a
          LEFT JOIN base_user_classsession b ON a.classId = b.id AND a.courseId = b.courseId
          LEFT JOIN base_user_student c ON a.studId = c.studentUid
          LEFT JOIN base_user_teacherattendance e ON b.id = e.classId AND b.teacherUid = e.teacherUid AND e.courseId = b.courseId
          WHERE ${whereClause}
        `;
        const [countResult] = await connection.execute(countSql, params);
        const total = countResult[0].total;

        // 鏌ヨ鏁版嵁
        const offsetVal = (parseInt(page) - 1) * parseInt(size);
        const sizeVal = parseInt(size);
        const dataSql = `
          SELECT
            a.id,
            a.classId,
            a.courseId,
            a.studId,
            DATE_FORMAT(a.studentEnterTime, '%Y-%m-%d %H:%i:%s') as studentEnterTime,
            DATE_FORMAT(a.studentLeaveTime, '%Y-%m-%d %H:%i:%s') as studentLeaveTime,
            a.classFeedback,
            a.classFeedback2,
            DATE_FORMAT(b.teacherjongTime, '%Y-%m-%d %H:%i:%s') as teacherjongTime,
            DATE_FORMAT(b.teacherLeaveTime, '%Y-%m-%d %H:%i:%s') as teacherLeaveTime,
            b.blackboardImage,
            b.teacherName,
            b.courseName,
            CONCAT(SUBSTRING(c.mobile, 1, 3), '****', SUBSTRING(c.mobile, 8, 4)) as mobile,
            b.className,
            b.classRecord,
            c.studentName,
            b.classBtime as startTimestamp,
            b.classEtime as endTimestamp,
            DATE_FORMAT(e.signInTime, '%Y-%m-%d %H:%i:%s') as signInTime,
            COALESCE(e.isPresent, 0) as isPresent
          FROM base_user_studentclassrecord a
          LEFT JOIN base_user_classsession b ON a.classId = b.id AND a.courseId = b.courseId
          LEFT JOIN base_user_student c ON a.studId = c.studentUid
          LEFT JOIN base_user_teacherattendance e ON b.id = e.classId AND b.teacherUid = e.teacherUid AND e.courseId = b.courseId
          WHERE ${whereClause}
          ORDER BY b.classBtime DESC
          LIMIT ${offsetVal}, ${sizeVal}
        `;
        const [rows] = await connection.execute(dataSql, params);

        try {
          await applyYuekebaoFallbackStartTimeForAbsentRows(rows);
        } catch (fallbackError) {
          console.warn('璇捐妭鍒楄〃绾﹁瀹濇椂闂村洖閫€澶辫触锛岀户缁繑鍥炲師濮?ClassIn 鏃堕棿:', fallbackError.message);
        }

        res.json({
          success: true,
          data: {
            list: rows,
            pagination: {
              page: parseInt(page),
              size: parseInt(size),
              total
            }
          }
        });
      } catch (error) {
        console.error('鑾峰彇璇捐妭鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鎵嬪姩瑙﹀彂鑷姩鍙嶉鐢熸垚
    this.app.post('/api/feifei/auto-feedback', async (req, res) => {
      const { recordId, classId, studId } = req.body || {};

      if (!recordId && !classId) {
        return res.status(400).json({ success: false, message: '缂哄皯 recordId 鎴?classId' });
      }

      if (!feifeiBackendUrl) {
        return res.status(500).json({
          success: false,
          message: '未配置 FEIFEI_BACKEND_URL，无法触发自动反馈'
        });
      }

      const targetUrl = `${feifeiBackendUrl.replace(/\/$/, '')}/classin/auto-feedback`;

      try {
        const { status, body } = await postJson(targetUrl, { recordId, classId, studId });
        let data = null;
        try {
          data = JSON.parse(body || '');
        } catch (e) {
          data = body;
        }

        if (status < 200 || status >= 300) {
          return res.status(500).json({
            success: false,
            message: data?.message || '瑙﹀彂鑷姩鍙嶉澶辫触',
            data
          });
        }

        return res.json({
          success: true,
          data
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: `瑙﹀彂鑷姩鍙嶉澶辫触: ${error.message}`
        });
      }
    });

    // 鏌ヨ鑷姩鍙嶉鐢熸垚鐘舵€?
    this.app.get('/api/feifei/auto-feedback/status', async (req, res) => {
      const { recordId } = req.query;

      if (!recordId) {
        return res.status(400).json({ success: false, message: '缂哄皯 recordId' });
      }

      if (!feifeiBackendUrl) {
        return res.status(500).json({
          success: false,
          message: '鏈厤缃?FEIFEI_BACKEND_URL'
        });
      }

      const targetUrl = `${feifeiBackendUrl.replace(/\/$/, '')}/classin/auto-feedback/status?recordId=${recordId}`;

      try {
        const response = await fetch(targetUrl);
        const data = await response.json();
        return res.json(data);
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: `鏌ヨ鐘舵€佸け璐? ${error.message}`
        });
      }
    });

    // 鑾峰彇瀛︾敓杩?鑺傝璁板綍
    this.app.get('/api/feifei/student-recent-sessions', async (req, res) => {
      let connection;
      try {
        const { studId } = req.query;

        if (!studId) {
          return res.status(400).json({ success: false, error: '缂哄皯 studId 鍙傛暟' });
        }

        connection = await getFeifeiDbConnection();

        const sql = `
          SELECT
            a.id,
            a.classId,
            a.courseId,
            a.studId,
            DATE_FORMAT(a.studentEnterTime, '%Y-%m-%d %H:%i:%s') as studentEnterTime,
            DATE_FORMAT(a.studentLeaveTime, '%Y-%m-%d %H:%i:%s') as studentLeaveTime,
            a.classFeedback,
            a.classFeedback2,
            DATE_FORMAT(b.teacherjongTime, '%Y-%m-%d %H:%i:%s') as teacherjongTime,
            DATE_FORMAT(b.teacherLeaveTime, '%Y-%m-%d %H:%i:%s') as teacherLeaveTime,
            b.blackboardImage,
            b.teacherName,
            b.courseName,
            b.className,
            b.classRecord,
            b.classBtime as startTimestamp,
            b.classEtime as endTimestamp,
            c.studentName
          FROM base_user_studentclassrecord a
          LEFT JOIN base_user_classsession b ON a.classId = b.id AND a.courseId = b.courseId
          LEFT JOIN base_user_student c ON a.studId = c.studentUid
          WHERE a.studId = ?
            AND b.classBtime <= UNIX_TIMESTAMP()
          ORDER BY b.classBtime DESC
          LIMIT 7
        `;

        const [rows] = await connection.execute(sql, [studId]);

        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('鑾峰彇瀛︾敓杩戞湡璇捐妭澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鑾峰彇璇捐妭瀵瑰簲鐨勬暀鏉?
    this.app.get('/api/feifei/textbooks-by-class', async (req, res) => {
      let connection;
      try {
        const { classId, courseId } = req.query;

        if (!classId || !courseId) {
          return res.status(400).json({ success: false, error: '缂哄皯 classId 鎴?courseId 鍙傛暟' });
        }

        connection = await getFeifeiDbConnection();

        const sql = `
          SELECT id, title, author, isbn, publisher, createTime
          FROM base_user_textbook
          WHERE classId = ? AND courseId = ?
          ORDER BY createTime
        `;

        const [rows] = await connection.execute(sql, [classId, courseId]);

        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('鑾峰彇鏁欐潗鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // API鎺ュ彛锛氳幏鍙栬€佸笀璇剧▼瀹夋帓瀵规瘮鏁版嵁锛圕lassIn vs 绾﹁瀹濓級
    // 鏀寔澶氳€佸笀鏌ヨ锛歵eacherNames 鍙傛暟鍙紶鍏ラ€楀彿鍒嗛殧鐨勫涓€佸笀鍚嶏紝鎴栫暀绌鸿〃绀哄叏閮?
    this.app.get('/api/teacher-schedule-compare', async (req, res) => {
      let connection;
      let feifeiConnection;
      try {
        const { teacherNames, startTime, endTime } = req.query;

        connection = await getDbConnection();
        feifeiConnection = await getFeifeiDbConnection();

        // 1. 浠庣害璇惧疂鑾峰彇璇剧▼鏁版嵁
        const startDate = formatShanghaiDateString(new Date(startTime * 1000));
        const endDate = formatShanghaiDateString(new Date(endTime * 1000));

        let yuekebaoQuery = `
          SELECT
            teacher,
            student,
            class_date,
            class_start_time,
            class_end_time,
            time_num,
            course_type
          FROM yuekebao_classtime
          WHERE class_date >= ? AND class_date <= ?
        `;
        let yuekebaoParams = [startDate, endDate];

        // 濡傛灉鎸囧畾浜嗚€佸笀锛屾坊鍔犺繃婊ゆ潯浠?
        if (teacherNames && teacherNames.trim()) {
          const teachers = teacherNames.split(',').map(t => t.trim()).filter(t => t);
          if (teachers.length > 0) {
            yuekebaoQuery += ` AND teacher IN (${teachers.map(() => '?').join(',')})`;
            yuekebaoParams.push(...teachers);
          }
        }
        yuekebaoQuery += ' ORDER BY teacher, class_date, class_start_time';

        const [yuekebaoData] = await connection.execute(yuekebaoQuery, yuekebaoParams);

        // 2. 浠?ClassIn (feifei) 鑾峰彇璇剧▼鏁版嵁
        let classinData = [];

        // 鑾峰彇鐩稿叧鑰佸笀鐨?UID
        let teacherQuery = `SELECT uid, name FROM base_user_teacher WHERE (isdel IS NULL OR isdel = 0)`;
        let teacherParams = [];

        if (teacherNames && teacherNames.trim()) {
          const teachers = teacherNames.split(',').map(t => t.trim()).filter(t => t);
          if (teachers.length > 0) {
            teacherQuery += ` AND name IN (${teachers.map(() => '?').join(',')})`;
            teacherParams.push(...teachers);
          }
        }

        const [teacherInfo] = await feifeiConnection.execute(teacherQuery, teacherParams);

        if (teacherInfo.length > 0) {
          const teacherUids = teacherInfo.map(t => t.uid);
          const [rows] = await feifeiConnection.execute(`
            SELECT
              cs.id, cs.className, cs.classBtime, cs.classEtime,
              cs.teacherUid, cs.teacherName,
              scr.studId, scr.stId, s.studentName
            FROM base_user_classsession cs
            LEFT JOIN base_user_studentclassrecord scr ON cs.id = scr.classId
            LEFT JOIN base_user_student s ON scr.studId = s.studentUid
            WHERE cs.teacherUid IN (${teacherUids.map(() => '?').join(',')})
              AND cs.classBtime >= ? AND cs.classBtime <= ?
            ORDER BY cs.teacherName, cs.classBtime
          `, [...teacherUids, startTime, endTime]);
          classinData = rows;
        }

        // 3. 鑾峰彇鎵€鏈夎€佸笀鍒楄〃锛堢敤浜庝笅鎷夋锛?
        const [allTeachers] = await connection.execute(`
          SELECT DISTINCT teacher FROM yuekebao_classtime
          WHERE class_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
          ORDER BY teacher
        `);

        // 4. 鑾峰彇鑰佸笀鍒悕鏄犲皠
        const [teacherAliases] = await connection.execute(`
          SELECT teacher_name, aliases FROM yuekebao_teacher_salary WHERE aliases IS NOT NULL AND aliases != ''
        `);

        // 鏋勫缓鍒悕鏄犲皠琛細alias -> mainName
        const aliasMap = {};
        teacherAliases.forEach(t => {
          try {
            const aliases = JSON.parse(t.aliases);
            if (Array.isArray(aliases)) {
              aliases.forEach(alias => {
                aliasMap[alias] = t.teacher_name;
              });
            }
          } catch (e) {}
        });

        // 5. 鑾峰彇瀛︾敓鍒悕鏄犲皠
        const [studentAliases] = await connection.execute(`
          SELECT student_name, aliases FROM yuekebao_student_aliases WHERE aliases IS NOT NULL AND aliases != ''
        `);

        // 鏋勫缓瀛︾敓鍒悕鏄犲皠琛細alias -> mainName
        const studentAliasMap = {};
        studentAliases.forEach(s => {
          try {
            const aliases = JSON.parse(s.aliases);
            if (Array.isArray(aliases)) {
              aliases.forEach(alias => {
                studentAliasMap[alias] = s.student_name;
              });
            }
          } catch (e) {}
        });

        // 6. 杩斿洖鏁版嵁
        res.json({
          success: true,
          data: {
            yuekebao: yuekebaoData,
            classin: classinData,
            teachers: allTeachers.map(t => t.teacher),
            aliasMap: aliasMap,
            studentAliasMap: studentAliasMap
          }
        });

      } catch (error) {
        console.error('鑾峰彇鑰佸笀璇剧▼瀵规瘮鏁版嵁澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
        if (feifeiConnection) await feifeiConnection.end();
      }
    });

    // ========================================
    // === feifei 鏁欐潗绠＄悊 API ===
    // ========================================

    // 鑾峰彇鏁欐潗鍒楄〃
    this.app.get('/api/feifei/textbooks', async (req, res) => {
      let connection;
      try {
        const { keyWord, page = 1, size = 20 } = req.query;
        connection = await getFeifeiDbConnection();

        let sql = 'SELECT * FROM base_user_textbook WHERE 1=1';
        const params = [];

        if (keyWord) {
          sql += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
          params.push(`%${keyWord}%`, `%${keyWord}%`, `%${keyWord}%`);
        }

        // 鑾峰彇鎬绘暟
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await connection.execute(countSql, params);
        const total = countResult[0].total;

        // 鍒嗛〉 - 浣跨敤瀛楃涓叉嫾鎺ワ紝鍥犱负 mysql2 prepared statements 瀵?LIMIT 鍙傛暟鏈夐檺鍒?
        const pageNum = parseInt(page) || 1;
        const sizeNum = parseInt(size) || 20;
        const offset = (pageNum - 1) * sizeNum;
        sql += ` ORDER BY createTime DESC LIMIT ${sizeNum} OFFSET ${offset}`;

        const [rows] = await connection.execute(sql, params);

        res.json({
          success: true,
          data: rows,
          pagination: { page: pageNum, size: sizeNum, total }
        });
      } catch (error) {
        console.error('鑾峰彇鏁欐潗鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鏂板鏁欐潗
    this.app.post('/api/feifei/textbooks', async (req, res) => {
      let connection;
      try {
        const { title, author, isbn, publisher, yearPublished, description, isAvailable } = req.body;
        if (!title) {
          return res.status(400).json({ success: false, error: '鏁欐潗鏍囬涓嶈兘涓虹┖' });
        }
        connection = await getFeifeiDbConnection();
        const [result] = await connection.execute(
          `INSERT INTO base_user_textbook (title, author, isbn, publisher, yearPublished, description, isAvailable)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [title, author || null, isbn || null, publisher || null, yearPublished || null, description || null, isAvailable !== false ? 1 : 0]
        );
        res.json({ success: true, id: result.insertId });
      } catch (error) {
        console.error('鏂板鏁欐潗澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鏇存柊鏁欐潗
    this.app.put('/api/feifei/textbooks/:id', async (req, res) => {
      let connection;
      try {
        const { id } = req.params;
        const { title, author, isbn, publisher, yearPublished, description, isAvailable } = req.body;
        connection = await getFeifeiDbConnection();
        await connection.execute(
          `UPDATE base_user_textbook SET title = ?, author = ?, isbn = ?, publisher = ?,
           yearPublished = ?, description = ?, isAvailable = ? WHERE id = ?`,
          [title, author || null, isbn || null, publisher || null, yearPublished || null, description || null, isAvailable ? 1 : 0, id]
        );
        res.json({ success: true });
      } catch (error) {
        console.error('鏇存柊鏁欐潗澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鍒犻櫎鏁欐潗
    this.app.delete('/api/feifei/textbooks/:id', async (req, res) => {
      let connection;
      try {
        const { id } = req.params;
        connection = await getFeifeiDbConnection();
        await connection.execute('DELETE FROM base_user_textbook WHERE id = ?', [id]);
        res.json({ success: true });
      } catch (error) {
        console.error('鍒犻櫎鏁欐潗澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // ========================================
    // === 缁熶竴鏁欏笀绠＄悊 API ===
    // ========================================

    // 缁熶竴鏁欏笀鍒楄〃 - 浠?yuekebao_teacher_salary 涓轰富鏁版嵁婧?
    this.app.get('/api/unified-teachers', async (req, res) => {
      const { hasClass } = req.query;
      let connection;
      let feifeiConnection;
      try {
        connection = await getDbConnection();
        feifeiConnection = await getFeifeiDbConnection();

        // 1. 浠庝富鏁版嵁搴撹幏鍙栬€佸笀鍒楄〃
        const [teachers] = await connection.execute(
          `SELECT teacher_name, type, salary_per_class_time, salary_unit, salary_account
           FROM yuekebao_teacher_salary
           ORDER BY teacher_name`
        );

        // 2. 璁＄畻姣忎釜鑰佸笀鐨勮鏃舵暟锛堜粠 yuekebao_classtime锛?
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const [classStats] = await connection.execute(
          `SELECT teacher,
                  SUM(CASE WHEN class_date >= ? AND class_date <= ? THEN time_num ELSE 0 END) as old30,
                  SUM(CASE WHEN class_date > ? AND class_date <= ? THEN time_num ELSE 0 END) as new30
           FROM yuekebao_classtime
           GROUP BY teacher`,
          [formatShanghaiDateString(thirtyDaysAgo), formatShanghaiDateString(now),
           formatShanghaiDateString(now), formatShanghaiDateString(thirtyDaysLater)]
        );

        // 3. 浠?feifei 鑾峰彇鏁欏笀 uid锛堢敤浜庣鍒?URL锛?
        const teacherNames = teachers.map(t => t.teacher_name);
        let feifeiTeachers = [];
        if (teacherNames.length > 0) {
          const placeholders = teacherNames.map(() => '?').join(',');
          const [rows] = await feifeiConnection.execute(
            `SELECT uid, name FROM base_user_teacher
             WHERE name IN (${placeholders}) AND (isdel IS NULL OR isdel = 0)`,
            teacherNames
          );
          feifeiTeachers = rows;
        }

        // 4. 鍚堝苟鏁版嵁
        const statsMap = {};
        classStats.forEach(s => { statsMap[s.teacher] = s; });

        const uidMap = {};
        feifeiTeachers.forEach(t => { uidMap[t.name] = t.uid; });

        let result = teachers.map(t => ({
          teacher_name: t.teacher_name,
          type: t.type,
          salary_per_class_time: t.salary_per_class_time,
          salary_unit: t.salary_unit,
          salary_account: t.salary_account,
          old30: statsMap[t.teacher_name]?.old30 || 0,
          new30: statsMap[t.teacher_name]?.new30 || 0,
          uid: uidMap[t.teacher_name] || null,
          signinUrl: uidMap[t.teacher_name]
            ? `https://console.woowisland.com/teacher?teacherUid=${encodeURIComponent(uidMap[t.teacher_name])}#/courseDetail`
            : null
        }));

        // 5. 绛涢€夋湭鏉?0澶╂湁璇?
        if (hasClass === '1') {
          result = result.filter(t => t.new30 > 0);
        }

        res.json({ success: true, data: result });
      } catch (error) {
        console.error('鑾峰彇缁熶竴鏁欏笀鍒楄〃澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
        if (feifeiConnection) await feifeiConnection.end();
      }
    });

    // 鏌ヨ鏁欏笀绛惧埌鏄庣粏锛堢敤浜庣鍒扮鐞嗛〉闈㈢偣鍑昏鏌ョ湅锛?
    this.app.get('/api/feifei/teachers/:uid/signin-records', async (req, res) => {
      let connection;
      try {
        const { uid } = req.params;
        const size = Math.min(Math.max(parseInt(req.query.size, 10) || 50, 1), 500);

        if (!uid) {
          return res.status(400).json({ success: false, error: '缂哄皯鏁欏笀 uid' });
        }

        connection = await getFeifeiDbConnection();

        const sql = `
          SELECT
            e.id as attendanceId,
            e.teacherUid,
            e.classId,
            e.courseId,
            COALESCE(NULLIF(s.studentName, ''), '鏈煡瀛︾敓') as studentName,
            COALESCE(NULLIF(b.className, ''), NULLIF(b.courseName, ''), CONCAT('璇捐妭#', e.classId)) as className,
            b.classBtime,
            DATE_FORMAT(e.signInTime, '%Y-%m-%d %H:%i:%s') as signInTime
          FROM base_user_teacherattendance e
          LEFT JOIN base_user_classsession b
            ON b.id = e.classId AND b.courseId = e.courseId AND b.teacherUid = e.teacherUid
          LEFT JOIN (
            SELECT DISTINCT classId, courseId, studId
            FROM base_user_studentclassrecord
          ) r
            ON r.classId = e.classId AND r.courseId = e.courseId
          LEFT JOIN base_user_student s
            ON s.studentUid = r.studId
          WHERE e.teacherUid = ?
          ORDER BY e.signInTime DESC
          LIMIT ${size}
        `;

        const [rows] = await connection.execute(sql, [uid]);
        res.json({ success: true, data: rows || [] });
      } catch (error) {
        console.error('鑾峰彇鏁欏笀绛惧埌鏄庣粏澶辫触:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 鍚姩鏈嶅姟鍣?
    console.log(`馃殌 鍗冲皢鍚姩 ${useHttps ? 'HTTPS' : 'HTTP'} 鐩戝惉...`);
    return new Promise((resolve, reject) => {
      let serverUrl = '';

      if (useHttps) {
        const sslConfig = this.generateSelfSignedCert();

        if (sslConfig) {
          // 浣跨敤HTTPS
          const httpsOptions = {
            key: readFileSync(sslConfig.keyPath),
            cert: readFileSync(sslConfig.certPath)
          };

          this.webServer = https.createServer(httpsOptions, this.app);
          this.webServer.on('error', (error) => {
            console.error('鉂?浠〃鏉挎湇鍔″櫒鐩戝惉澶辫触:', error);
            reject(error);
          });
          this.webServer.listen(port, () => {
            serverUrl = `https://localhost:${port}`;
            console.log(`馃殌 浠〃鏉挎湇鍔″櫒鍚姩鎴愬姛锛?HTTPS)`);
            console.log(`馃寪 璁块棶鍦板潃: ${serverUrl}`);
            console.log(`馃搳 API鎺ュ彛: ${serverUrl}/api/dashboard-data`);
            console.log(`馃敀 浣跨敤鑷鍚嶈瘉涔︼紝娴忚鍣ㄥ彲鑳戒細鏄剧ず瀹夊叏璀﹀憡`);
            resolve();
          });
        } else {
          // 鍥為€€鍒癏TTP
          this.webServer = this.app.listen(port, () => {
            serverUrl = `http://localhost:${port}`;
            console.log(`馃殌 浠〃鏉挎湇鍔″櫒鍚姩鎴愬姛锛?HTTP鍥為€€)`);
            console.log(`馃寪 璁块棶鍦板潃: ${serverUrl}`);
            console.log(`馃搳 API鎺ュ彛: ${serverUrl}/api/dashboard-data`);
            resolve();
          });
          this.webServer.on('error', (error) => {
            console.error('鉂?浠〃鏉挎湇鍔″櫒鐩戝惉澶辫触:', error);
            reject(error);
          });
        }
      } else {
        // 浣跨敤HTTP
        this.webServer = this.app.listen(port, () => {
          serverUrl = `http://localhost:${port}`;
          console.log(`馃殌 浠〃鏉挎湇鍔″櫒鍚姩鎴愬姛锛?HTTP)`);
          console.log(`馃寪 璁块棶鍦板潃: ${serverUrl}`);
          console.log(`馃搳 API鎺ュ彛: ${serverUrl}/api/dashboard-data`);
          resolve();
        });
        this.webServer.on('error', (error) => {
          console.error('鉂?浠〃鏉挎湇鍔″櫒鐩戝惉澶辫触:', error);
          reject(error);
        });
      }
    });
  }

  // 杈呭姪鍑芥暟锛氭牸寮忓寲鏃ユ湡
  formatDate(dateStr) {
    if (!dateStr) return '';

    try {
      return formatShanghaiMonthDay(dateStr);
    } catch (error) {
      return dateStr;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Yuekebao Grabber MCP server running on stdio");
  }

  // 鍚姩鍖呭惈Web浠〃鏉跨殑瀹屾暣鏈嶅姟
  async runWithDashboard(port = 3000, useHttps = true) {
    await this.startDashboard(port, useHttps);

    // 淇濇寔杩涚▼杩愯锛岀瓑寰呮湇鍔″櫒鍏抽棴淇″彿
    process.on('SIGINT', () => {
      console.log('\n姝ｅ湪鍏抽棴鏈嶅姟鍣?..');
      if (this.webServer) {
        this.webServer.close(() => {
          console.log('鏈嶅姟鍣ㄥ凡鍏抽棴');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

    // 淇濇寔杩涚▼杩愯 - 浣跨敤鏇寸畝鍗曠殑鏂规硶
    return new Promise(() => {
      // 杩欎釜promise姘歌繙涓嶄細resolve锛屼繚鎸佽繘绋嬭繍琛?
    });
  }
}

const directRunEntry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (directRunEntry && import.meta.url === directRunEntry) {
  const server = new YuekebaoGrabberServer();
  server.run().catch(console.error);
}
