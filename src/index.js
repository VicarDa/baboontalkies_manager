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
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { execSync } from 'child_process';

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

  // 通用重试机制：检测元素或数据是否存在，最多重试10次，每次间隔10000ms
  async retryWithDetection(detectFunction, description, maxRetries = 10, interval = 10000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await detectFunction();
        if (result !== null && result !== undefined && result !== false) {
          if (attempt > 1) {
            console.log(`✅ ${description} - 第${attempt}次尝试成功`);
          }
          return result;
        }

        if (attempt < maxRetries) {
          console.log(`⏱️  ${description} - 第${attempt}次尝试失败，${interval}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      } catch (error) {
        if (attempt < maxRetries) {
          console.log(`⚠️  ${description} - 第${attempt}次尝试出错: ${error.message}，${interval}ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, interval));
        } else {
          console.log(`❌ ${description} - 第${attempt}次尝试最终失败: ${error.message}`);
        }
      }
    }

    console.log(`⏰ ${description} - 已重试${maxRetries}次，继续执行后续流程`);
    return null;
  }

  /**
   * 智能等待数据稳定 - 等待页面数据加载完成
   * @param {Page} page - Playwright page 对象
   * @param {Function} getDataCount - 获取数据数量的函数
   * @param {string} description - 描述信息
   * @param {number} maxWaitTime - 最大等待时间 (ms)
   * @param {number} stableTime - 数据稳定所需时间 (ms)
   * @returns {number} 最终数据数量
   */
  async waitForDataStable(page, getDataCount, description = '数据加载', maxWaitTime = 10000, stableTime = 1000) {
    const startTime = Date.now();
    let lastCount = -1;
    let stableStartTime = null;

    console.log(`⏳ ${description} - 开始智能等待数据稳定...`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const currentCount = await getDataCount();

        if (currentCount === lastCount && currentCount > 0) {
          // 数据数量没有变化
          if (!stableStartTime) {
            stableStartTime = Date.now();
          } else if (Date.now() - stableStartTime >= stableTime) {
            // 数据已稳定足够长时间
            console.log(`✅ ${description} - 数据已稳定，共 ${currentCount} 条记录 (等待 ${Date.now() - startTime}ms)`);
            return currentCount;
          }
        } else {
          // 数据数量变化了，重置稳定计时器
          if (currentCount !== lastCount) {
            console.log(`📊 ${description} - 数据加载中: ${lastCount} -> ${currentCount}`);
          }
          lastCount = currentCount;
          stableStartTime = null;
        }

        await page.waitForTimeout(200);
      } catch (error) {
        console.log(`⚠️ ${description} - 检测出错: ${error.message}`);
        await page.waitForTimeout(300);
      }
    }

    console.log(`⏰ ${description} - 等待超时，当前数据量: ${lastCount} (已等待 ${maxWaitTime}ms)`);
    return lastCount > 0 ? lastCount : 0;
  }

  /**
   * 等待表格行数稳定
   * @param {Page} page - Playwright page 对象
   * @param {string} rowSelector - 行选择器
   * @param {string} description - 描述信息
   * @param {number} maxWaitTime - 最大等待时间 (ms)
   * @returns {number} 稳定后的行数
   */
  async waitForTableRowsStable(page, rowSelector, description = '表格数据', maxWaitTime = 8000) {
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
      800 // 数据稳定 800ms 认为加载完成
    );
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
      // 设置 Playwright 浏览器路径（云函数环境）
      const playwrightBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ||
        process.env.HOME + '/.cache/ms-playwright';
      console.log(`📁 Playwright 浏览器路径: ${playwrightBrowsersPath}`);

      // Launch browser
      browser = await chromium.launch({
        headless, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: undefined, // 让 Playwright 自动查找
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

      // 添加页面导航重试辅助函数
      const gotoWithRetry = async (url, options = {}, maxRetries = 3) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`Navigating to ${url}... (尝试 ${attempt}/${maxRetries})`);
            await page.goto(url, options);
            console.log(`✅ 页面加载成功`);
            return;
          } catch (error) {
            console.log(`❌ 页面加载失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);
            if (attempt === maxRetries) {
              throw error;
            }
            console.log(`⏳ 等待3秒后重试...`);
            await page.waitForTimeout(3000);
          }
        }
      };

      console.log('Navigating to login page...');

      // Navigate to login page (使用 domcontentloaded 策略更稳定, 带重试)
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
      // 使用重试机制检测邮箱输入框
      const emailSelector = await this.retryWithDetection(
        async () => {
          try {
            await page.waitForSelector('input[name="email"]', { timeout: 2000 });
            return 'input[name="email"]';
          } catch (error) {
            // 尝试备用选择器
            const alternativeEmailSelectors = ['#adminEmail', '#email', 'input[type="email"]', 'input[placeholder*="邮箱"]'];
            for (let selector of alternativeEmailSelectors) {
              try {
                await page.waitForSelector(selector, { timeout: 1000 });
                return selector;
              } catch (altError) {
                // 继续尝试下一个选择器
              }
            }
            return null;
          }
        },
        '检测邮箱输入框'
      );

      if (emailSelector) {
        console.log(`✅ 邮箱输入框检测成功: ${emailSelector}`);
      } else {
        console.log('⚠️ 邮箱输入框检测失败，但继续执行');
      }

      // 使用重试机制检测密码输入框
      const passwordSelector = await this.retryWithDetection(
        async () => {
          try {
            await page.waitForSelector('input[name="password"]', { timeout: 2000 });
            return 'input[name="password"]';
          } catch (error) {
            // 尝试备用选择器
            const alternativePasswordSelectors = ['#adminPassword', '#password', 'input[type="password"]', 'input[placeholder*="密码"]'];
            for (let selector of alternativePasswordSelectors) {
              try {
                await page.waitForSelector(selector, { timeout: 1000 });
                return selector;
              } catch (altError) {
                // 继续尝试下一个选择器
              }
            }
            return null;
          }
        },
        '检测密码输入框'
      );

      if (passwordSelector) {
        console.log(`✅ 密码输入框检测成功: ${passwordSelector}`);
      } else {
        console.log('⚠️ 密码输入框检测失败，但继续执行');
      }

      // Fill in email and password using detected selectors
      if (emailSelector) {
        await page.fill(emailSelector, email);
        console.log('✅ 邮箱已填入');
      }
      if (passwordSelector) {
        await page.fill(passwordSelector, password);
        console.log('✅ 密码已填入');
      }

      console.log('Submitting login form to trigger captcha...');

      // Submit the login form first to trigger captcha
      await page.click('#submit');

      console.log('Looking for slider captcha after submit...');

      // Wait for captcha modal to appear (增加等待时间和重试)
      let captchaAppeared = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`🔍 尝试检测验证码弹窗... (第${attempt}/3次)`);
          // Wait for the verification wrapper to appear
          await page.waitForSelector('#JQ_verify_wrap', { timeout: 12000 });
          console.log('✅ 验证码弹窗已出现');
          captchaAppeared = true;
          break;
        } catch (waitError) {
          console.log(`⚠️  第${attempt}次检测失败: ${waitError.message}`);
          if (attempt < 3) {
            console.log('⏳ 等待2秒后重试...');
            await page.waitForTimeout(2000);
            // 尝试重新点击提交按钮
            try {
              await page.click('#submit');
              console.log('🔄 重新点击提交按钮以触发验证码');
              await page.waitForTimeout(1000);
            } catch (clickError) {
              console.log(`⚠️  重新点击失败: ${clickError.message}`);
            }
          }
        }
      }

      if (!captchaAppeared) {
        console.log('❌ 验证码弹窗未出现,尝试继续登录流程...');
        // 可能不需要验证码,继续执行
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
              // 使用更智能的距离计算：基础距离 + 随机偏移
              const randomOffset = (Math.random() - 0.5) * 20; // -10 到 +10 的随机偏移
              const slideDistance = baseDistance * (1.35 + Math.random() * 0.1) + randomOffset; // 1.35-1.45倍距离
              console.log(`Base distance: ${baseDistance}px, Slide distance: ${slideDistance.toFixed(2)}px (offset: ${randomOffset.toFixed(2)}px)`);

              // Use human-like mouse movements instead of dragAndDrop
              const startX = btnBounds.x + btnBounds.width / 2;
              const startY = btnBounds.y + btnBounds.height / 2;
              const endX = btnBounds.x + slideDistance;
              const endY = startY;

              console.log(`Starting human-like drag from (${startX.toFixed(2)}, ${startY.toFixed(2)}) to (${endX.toFixed(2)}, ${endY.toFixed(2)})`);

              // Move to slider handle with slight randomness
              const approachX = startX + (Math.random() - 0.5) * 5; // 接近时有小偏差
              const approachY = startY + (Math.random() - 0.5) * 5;
              await page.mouse.move(approachX, approachY, { steps: 8 });
              await page.waitForTimeout(100 + Math.random() * 150);

              // Start dragging
              await page.mouse.down();
              await page.waitForTimeout(80 + Math.random() * 80); // 按下后稍作停顿

              // 使用贝塞尔曲线模拟更真实的拖动轨迹
              const totalSteps = 25 + Math.floor(Math.random() * 15); // 25-40步

              for (let i = 1; i <= totalSteps; i++) {
                const progress = i / totalSteps;

                // 使用缓动函数：开始快，中间慢，结束更慢
                let easedProgress;
                if (progress < 0.7) {
                  // 前70%使用二次缓动
                  easedProgress = progress * progress;
                } else {
                  // 后30%减速
                  const t = (progress - 0.7) / 0.3;
                  easedProgress = 0.49 + 0.51 * (1 - Math.pow(1 - t, 3));
                }

                const currentX = startX + (endX - startX) * easedProgress;

                // 添加垂直方向的随机抖动，模拟人类不精确的移动
                const verticalShake = Math.sin(progress * Math.PI * 3) * 2 + (Math.random() - 0.5) * 4;
                const currentY = startY + verticalShake;

                await page.mouse.move(currentX, currentY);

                // 动态延迟：开始快，中间慢，结束最慢
                let delay;
                if (progress < 0.3) {
                  delay = 10 + Math.random() * 15; // 快速启动
                } else if (progress < 0.7) {
                  delay = 20 + Math.random() * 25; // 中间减速
                } else {
                  delay = 35 + Math.random() * 30; // 接近终点大幅减速
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

              // Check if captcha was successful (多次检查,增加成功率)
              let captchaSolved = false;
              for (let checkAttempt = 1; checkAttempt <= 5; checkAttempt++) {
                const successVisible = await page.isVisible('.sucMsg');
                if (successVisible) {
                  console.log(`✅ Captcha solved successfully! 验证通过 (检查第${checkAttempt}次)`);
                  captchaSolved = true;
                  break;
                }
                console.log(`⏳ 验证中... (第${checkAttempt}/5次检查)`);
                await page.waitForTimeout(500);
              }

              if (!captchaSolved) {
                console.log('⚠️  Captcha verification may have failed or still processing');
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

      // Navigate to weekly course management page (使用 domcontentloaded 策略更稳定, 带重试)
      console.log('Navigating to weekly course management page...');
      await gotoWithRetry('https://www.yuekebao.cn/admin/course.php?dataName=course_week', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      console.log('Setting up weekly course view...');

      // Wait for weekly course content to load
      await page.waitForSelector('body', { timeout: 10000 });
      await page.waitForTimeout(500);

      // 等待任何遮罩层消失
      console.log('⏱️  等待遮罩层消失...');
      try {
        await page.waitForFunction(() => {
          const shade = document.querySelector('.layui-layer-shade');
          return !shade || shade.style.display === 'none';
        }, { timeout: 5000 });
        console.log('✅ 遮罩层已消失');
      } catch (e) {
        console.log('⚠️  遮罩层等待超时，继续执行');
      }
      await page.waitForTimeout(500);

      // 使用JavaScript直接选择"全部老师"
      console.log('Selecting all teachers from layui dropdown...');
      const allTeacherSelected = await page.evaluate(() => {
        // 查找"选择老师"下拉框
        const selectContainers = document.querySelectorAll('.layui-form-select');
        console.log(`Found ${selectContainers.length} layui-form-select elements`);

        for (const container of selectContainers) {
          const input = container.querySelector('.layui-select-title input');
          if (!input) continue;

          const value = input.value || input.placeholder || '';
          console.log(`Checking dropdown with value: "${value}"`);

          // 查找包含老师选项的下拉框
          const dropdown = container.querySelector('dl');
          if (!dropdown) continue;

          const allTeacherOption = dropdown.querySelector('dd[lay-value="0"]');
          if (allTeacherOption) {
            const optionText = allTeacherOption.textContent.trim();
            console.log(`Found option: "${optionText}"`);

            if (optionText === '全部老师' || optionText.includes('全部')) {
              // 先展开下拉框
              container.classList.add('layui-form-selected');
              dropdown.style.display = 'block';

              // 点击"全部老师"选项
              allTeacherOption.click();
              console.log(`Clicked: ${optionText}`);

              // 更新input的值
              if (input) {
                input.value = optionText;
              }

              return optionText;
            }
          }
        }

        return null;
      });

      if (allTeacherSelected) {
        console.log(`✅ 成功选择: "${allTeacherSelected}"`);
        await page.waitForTimeout(1000); // 等待数据刷新
      } else {
        console.log('⚠️  未能选择"全部老师"，尝试备用方法...');

        // 备用方法：直接点击并选择
        try {
          // 点击打开下拉框
          await page.click('.layui-input-inline.select_list_2 .layui-select-title', { timeout: 3000 });
          await page.waitForTimeout(500);

          // 点击"全部老师"选项
          const clicked = await page.evaluate(() => {
            const option = document.querySelector('dd[lay-value="0"]');
            if (option && option.textContent.includes('全部')) {
              option.click();
              return option.textContent.trim();
            }
            return null;
          });

          if (clicked) {
            console.log(`✅ 备用方法成功选择: "${clicked}"`);
            await page.waitForTimeout(1000);
          }
        } catch (backupError) {
          console.log(`⚠️  备用方法也失败: ${backupError.message}`);
        }
      }

      console.log('Extracting course data from all weekly periods...');

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

              // Extract date from header like "09-22\n周一"
              const dateMatch = headerText.match(/(\d{2}-\d{2})/);
              if (dateMatch) {
                const dateStr = dateMatch[1];
                const currentYear = new Date().getFullYear();
                const [month, day] = dateStr.split('-');
                const fullDate = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

                dateHeaders[colIndex] = fullDate;
                console.log(`  → Date for column ${colIndex}: ${fullDate}`);
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

            // 诊断：保存第一个课程的HTML样本
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

              // 保存HTML诊断信息到第一个课程
              let courseHtmlSample = null;
              if (cellIndex === 0 && courseIndex === 0) {
                courseHtmlSample = htmlDiagnostic;
              }

              // Extract teacher from the teacher div
              let teacher = '';

              // 完整的老师列表（包括所有可能的老师名）
              const possibleTeachers = ['May', 'Angel', 'Anna Rose', 'Diana', 'Jake', 'Jenny', 'Lou', 'Milena', 'Mumu', 'Pearly', 'Shai', 'Gel', 'Hersel'];

              // 方法1: 从整个课程div的textContent中直接搜索老师名
              // 注意：使用textContent而不是innerText，因为老师名可能在隐藏的div中（display:none）
              const fullCourseText = courseDiv.textContent;
              for (let t of possibleTeachers) {
                if (fullCourseText.includes(t)) {
                  teacher = t;
                  console.log(`    → Teacher found in full text: ${teacher}`);
                  break;
                }
              }

              // 方法2: 如果方法1没找到，尝试特定选择器
              if (!teacher) {
                // Try multiple selectors to handle different teacher HTML structures
                // 注意: 排除学生div (textEllipsis_1)，只匹配精确的textEllipsis类
                let teacherDiv = courseDiv.querySelector('div.memberCon div.textEllipsis');
                if (!teacherDiv) {
                  // Alternative selector for special status teachers like Gel
                  teacherDiv = courseDiv.querySelector('div.ft12.color_9.textEllipsis');
                }
                if (!teacherDiv) {
                  // 更精确的选择器，排除学生信息div（class包含textEllipsis_1的）
                  const allTextEllipsis = courseDiv.querySelectorAll('div[class*="textEllipsis"]');
                  for (let div of allTextEllipsis) {
                    // 排除学生div（class包含textEllipsis_1）
                    if (!div.className.includes('textEllipsis_1')) {
                      teacherDiv = div;
                      break;
                    }
                  }
                }

                if (teacherDiv) {
                  const teacherText = teacherDiv.innerText.trim();
                  for (let t of possibleTeachers) {
                    if (teacherText.includes(t)) {
                      teacher = t;
                      break;
                    }
                  }
                  console.log(`    → Teacher from div: ${teacher || '未找到'} (text: "${teacherText}")`);
                }
              }

              // 如果仍然没找到老师，记录警告但不使用未知文本作为老师名
              if (!teacher) {
                console.log(`    → ⚠️ Warning: No teacher found for this course`);
              }

              // Extract student from the student div
              let student = '';
              const studentDiv = courseDiv.querySelector('div.clearfix div.textEllipsis_1.f_L.m_w_max');
              if (studentDiv) {
                // 标准化空格：将多个连续空格替换为单个空格
                student = studentDiv.innerText.trim().replace(/\s+/g, ' ');
                console.log(`    → Student: ${student}`);
              }

              // Extract deduction count from badge
              let deduction = '1'; // default
              const deductionSpan = courseDiv.querySelector('span.layui-badge-rim');
              if (deductionSpan) {
                const deductText = deductionSpan.innerText.trim();
                const deductMatch = deductText.match(/扣(\d+)次/);
                if (deductMatch) {
                  deduction = deductMatch[1];
                }
                console.log(`    → Deduction: ${deduction}`);
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
              console.log(`    → Time: ${time}`);

              // Extract course type by analyzing div.ft12 elements
              let courseType = '';

              // 首先直接查找包含课程类型的 ft12 div
              const ft12Divs = courseDiv.querySelectorAll('div.ft12');
              for (const div of ft12Divs) {
                const text = div.innerText.trim();
                // 检查是否是课程类型标记（不是时间）
                if (!text.match(/\d{2}:\d{2}-\d{2}:\d{2}/) && !text.match(/已约\d+人/) && text.length > 0 && text.length < 20) {
                  // 可能的课程类型: "试课", "菲教25分钟", "菲教50分钟", "欧教25分钟", "欧教50分钟"
                  if (text.includes('试课') || text.includes('trial') || text.includes('试听')) {
                    courseType = '试课';
                    break;
                  } else if (text.includes('菲教')) {
                    courseType = '菲教';
                    break;
                  } else if (text.includes('欧教')) {
                    courseType = '欧教';
                    break;
                  } else if (text.includes('一对多')) {
                    courseType = '一对多';
                    break;
                  }
                }
              }

              // 如果没有从 ft12 div 中找到，回退到检查整个文本
              if (!courseType) {
                const courseText = courseDiv.innerText.toLowerCase();

                // Check for trial class indicators (试课)
                if (courseText.includes('试课') || courseText.includes('trial') || courseText.includes('试听')) {
                  courseType = '试课';
                }
                // Check for other course type indicators
                else if (courseText.includes('菲教') || courseText.includes('filipino')) {
                  courseType = '菲教';
                }
                else if (courseText.includes('欧教') || courseText.includes('european')) {
                  courseType = '欧教';
                }
                else if (courseText.includes('一对多') || courseText.includes('group')) {
                  courseType = '一对多';
                }
                // Check teacher nationality as fallback
                else if (teacher) {
                  const filipinoTeachers = ['May', 'Angel', 'Diana', 'Jake', 'Jenny', 'Lou', 'Milena', 'Mumu', 'Pearly', 'Shai', 'Hersel'];
                  const europeanTeachers = ['Anna Rose', 'Gel'];

                  if (filipinoTeachers.includes(teacher)) {
                    courseType = '菲教';
                  } else if (europeanTeachers.includes(teacher)) {
                    courseType = '欧教';
                  } else {
                    courseType = '其他';
                  }
                }
              }

              console.log(`    → Course Type: ${courseType}`);

              // Include all courses including trial classes (试课)
              if (teacher || student || time) {
                const courseInfo = {
                  weekIndex: weekIdx,
                  cellIndex: `cell-${cellIndex}-course-${courseIndex}`,
                  date: dataDay,
                  time: time || '',
                  teacher: teacher || '',
                  student: student || '',
                  deduction: deduction,
                  courseType: courseType || '未知'
                };

                courses.push(courseInfo);

                // Output course info in requested format
                const courseOutput = `${dataDay} ${time || '未知时间'} ${teacher || '未知老师'} ${student || '未知学生'} ${deduction} [${courseType || '未知类型'}]`;
                console.log(`📅 课表信息: ${courseOutput}`);
              }
            });
          });

          return courses;
        }, weekIndex);
      };


      // First, try to access previous week data via dropdown
      console.log('🔍 尝试获取上周数据...');
      let previousWeekData = [];

      try {
        // Look for the layui-unselect dropdown first
        console.log('🔍 寻找 layui-unselect 下拉框...');

        const layuiUnselectDropdown = await page.$('.layui-unselect');
        if (layuiUnselectDropdown) {
          console.log('✅ 找到 layui-unselect 下拉框');

          // Click the layui-unselect dropdown to open it
          console.log('🖱️ 点击 layui-unselect 下拉框...');
          await layuiUnselectDropdown.click();
          await page.waitForTimeout(300);

          // Look for the first option with lay-value="-1"
          console.log('🔍 寻找 lay-value="-1" 的选项...');
          const pastWeekSelected = await page.evaluate(() => {
            // Look for dropdown options with lay-value="-1"
            const options = document.querySelectorAll('dd[lay-value]');
            console.log(`找到 ${options.length} 个下拉选项`);

            // List all options for debugging
            options.forEach((option, index) => {
              const text = option.textContent.trim();
              const layValue = option.getAttribute('lay-value');
              console.log(`选项 ${index}: "${text}" (lay-value="${layValue}")`);
            });

            // Look for the FIRST option with lay-value="-1" (most recent past week)
            const targetOption = document.querySelector('dd[lay-value="-1"]');
            if (targetOption) {
              const text = targetOption.textContent.trim();
              console.log(`✅ 找到第一个 lay-value="-1" 选项: ${text}`);
              targetOption.click();
              return text;
            }

            console.log('⚠️ 未找到 lay-value="-1" 的选项');
            return null;
          });

          if (pastWeekSelected) {
            console.log(`✅ 已选择上周: ${pastWeekSelected}`);
            await page.waitForTimeout(750);
            console.log('📊 开始抓取上周课表数据...');

            // Extract previous week data
            previousWeekData = await extractWeeklyData(-1);

            // 🔍 HTML诊断：获取第一个课程单元格的HTML结构
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
              console.log('\n🔍 ========== HTML诊断结果 ==========');
              console.log('日期:', htmlDiagnostic.dataDay);
              console.log('\n--- 课程div的HTML ---');
              console.log(htmlDiagnostic.courseDivHTML);
              console.log('\n--- 课程div的innerText ---');
              console.log(htmlDiagnostic.courseDivText);
              console.log('\n--- 所有子div ---');
              htmlDiagnostic.allChildDivs.forEach((div, i) => {
                console.log(`${i + 1}. class="${div.className}" text="${div.text}"`);
              });
              console.log('🔍 ========== HTML诊断结束 ==========\n');
            }

            if (previousWeekData.length > 0) {
              // Add week information to each course
              previousWeekData.forEach((course, index) => {
                course.globalIndex = index + 1;
                course.weekText = pastWeekSelected;
                course.weekId = 'previous_week';
                course.weekIndex = -1;
              });
              console.log(`✅ 成功获取上周数据 ${previousWeekData.length} 条记录`);
            } else {
              console.log('⚠️ 上周暂无课程数据');
            }
          } else {
            console.log('⚠️ 未找到上周数据选项');
          }
        } else {
          console.log('⚠️ 未找到 layui-unselect 下拉框');
        }
      } catch (prevWeekError) {
        console.log('⚠️ 获取上周数据失败:', prevWeekError.message);
      }

      // Reset to current/future weeks view
      console.log('🔄 切换回当前/未来周课表视图...');
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
              console.log(`切换回当前视图: ${text} (lay-value="0")`);
              currentOption.click();
              return true;
            }

            // Fallback: find the first option with positive or zero lay-value
            const options = document.querySelectorAll('dd[lay-value]');
            for (let option of options) {
              const layValue = option.getAttribute('lay-value');
              if (layValue && parseInt(layValue) >= 0) {
                const text = option.textContent.trim();
                console.log(`切换回当前视图: ${text} (lay-value="${layValue}")`);
                option.click();
                return true;
              }
            }

            console.log('未找到当前视图选项，保持当前状态');
            return false;
          });

          if (currentViewSelected) {
            await page.waitForTimeout(300);
            console.log('✅ 已切换回当前周课表视图');
          }
        }
      } catch (resetError) {
        console.log('⚠️ 切换回当前视图失败，继续抓取当前数据:', resetError.message);
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
            'set_course_week_btn_con', // Function buttons like "狒狒说"
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
                              /\d{4}年\s*\d{1,2}\.\d{1,2}-\d{1,2}\.\d{1,2}/.test(text);

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

        // Format: "MM.DD-MM.DD" or "YYYY年 MM.DD-MM.DD"
        const dateMatch = text.match(/(\d{4}年\s*)?(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
        if (dateMatch) {
          const [, yearPart, startMonth, startDay, endMonth, endDay] = dateMatch;

          let year = today.getFullYear();
          if (yearPart) {
            year = parseInt(yearPart.replace('年', ''));
          }

          // Use the end date of the week range
          weekEndDate = new Date(year, parseInt(endMonth) - 1, parseInt(endDay));

          // Handle year transition (if end month is smaller than start month, it's next year)
          if (parseInt(endMonth) < parseInt(startMonth) && !yearPart) {
            // Only adjust year if no explicit year was provided
            weekEndDate.setFullYear(year + 1);
          }

          console.log(`Parsed week "${text}": end date = ${weekEndDate.toISOString().split('T')[0]}`);
        }

        // If we couldn't parse the date, include it for safety (might be current weeks)
        if (!weekEndDate) {
          console.log(`Could not parse date from: "${text}", including for safety`);
          return true;
        }

        // Only include weeks that are within the range: 3 weeks ago to 3 months from now
        const withinFutureRange = weekEndDate <= threeMonthsLater;
        // 允许过去3周的数据，用于显示"之前课节"和确保工资计算的完整自然周数据
        const threeWeeksAgo = new Date(today);
        threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
        const notTooOld = weekEndDate >= threeWeeksAgo;

        if (!withinFutureRange) {
          console.log(`Skipping week "${text}" (ends ${weekEndDate.toISOString().split('T')[0]}) - beyond 3 month limit`);
          return false;
        }

        if (!notTooOld) {
          console.log(`Skipping week "${text}" (ends ${weekEndDate.toISOString().split('T')[0]}) - older than 3 weeks`);
          return false;
        }

        return true;
      });

      console.log(`Filtered to ${filteredWeeklyButtons.length} weeks within 3 months from today (${today.toISOString().split('T')[0]} to ${threeMonthsLater.toISOString().split('T')[0]})`);
      console.log(`Weeks to process:`, filteredWeeklyButtons.map(b => b.text));

      // Extract data from filtered weekly periods
      let allCourses = [];
      let weekCount = 0;
      let processedWeekIds = new Set(); // Track processed week IDs to avoid duplicates

      // Add previous week data first if available
      if (previousWeekData.length > 0) {
        console.log(`\n📊 添加上周数据: ${previousWeekData.length} 条记录`);
        allCourses = allCourses.concat(previousWeekData);
        weekCount++; // Count previous week as one of the processed weeks
      }

      for (const weekButton of filteredWeeklyButtons) {
        try {
          // Parse week date range for better feedback
          const weekText = weekButton.text;
          let weekDateRange = '';

          const dateMatch = weekText.match(/(\d{4}年\s*)?(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);
          if (dateMatch) {
            const [, yearPart, startMonth, startDay, endMonth, endDay] = dateMatch;
            let year = new Date().getFullYear();
            if (yearPart) {
              year = parseInt(yearPart.replace('年', ''));
            }
            weekDateRange = `${year}-${startMonth.padStart(2, '0')}-${startDay.padStart(2, '0')} 到 ${year}-${endMonth.padStart(2, '0')}-${endDay.padStart(2, '0')}`;
          }

          console.log(`\n🗓️  点击周期按钮: ${weekButton.text}`);
          if (weekDateRange) {
            console.log(`📅 日期范围: ${weekDateRange}`);
          }
          console.log(`🎯 开始提取第${weekButton.index + 1}个周期的数据...`);

          // Track if we successfully selected a historical week from dropdown
          let historicalWeekSelected = false;

          // If this is a historical week (negative index), select it from the dropdown
          if (weekButton.index < 0) {
            console.log(`📜 检测到历史周期 ${weekButton.id}，从下拉菜单中选择...`);
            try {
              // Click "查看已结束周课表" dropdown to reveal historical weeks
              const historicalDropdownClicked = await page.evaluate((weekText) => {
                // Find all layui-unselect dropdowns
                const dropdowns = document.querySelectorAll('.layui-unselect');

                for (const dropdown of dropdowns) {
                  const input = dropdown.querySelector('input');
                  if (!input) continue;

                  const value = input.value || input.placeholder || '';

                  // Look for dropdown containing "查看已结束周课表" or "已结束"
                  if (value.includes('查看已结束周课表') || value.includes('已结束')) {
                    console.log(`找到历史周期下拉菜单: ${value}`);
                    dropdown.click();
                    return true;
                  }
                }

                // Fallback: try to find by common text patterns
                const allElements = document.querySelectorAll('*');
                for (const elem of allElements) {
                  const text = elem.textContent;
                  if (text && (text.includes('查看已结束周课表') || text.includes('← 查看已结束'))) {
                    console.log(`通过文本找到历史周期元素`);
                    elem.click();
                    return true;
                  }
                }

                return false;
              }, weekButton.text);

              if (historicalDropdownClicked) {
                await page.waitForTimeout(500);
                console.log(`✅ 已点击历史周期下拉菜单`);

                // Select the specific historical week from the dropdown
                const weekSelected = await page.evaluate((weekText) => {
                  // Find dropdown options (dd elements with lay-value)
                  const options = document.querySelectorAll('dd[lay-value]');

                  for (const option of options) {
                    const optionText = option.textContent.trim();

                    // Match the week text (e.g., "2026年 01.19-01.25")
                    if (optionText === weekText || optionText.includes(weekText.replace(/\s+/g, ' '))) {
                      console.log(`找到匹配的历史周期选项: ${optionText}`);
                      option.click();
                      return true;
                    }
                  }

                  console.log(`未找到匹配的历史周期选项: ${weekText}`);
                  return false;
                }, weekButton.text);

                if (weekSelected) {
                  await page.waitForTimeout(1200); // Wait for page to load the selected historical week
                  console.log(`✅ 已选择历史周期: ${weekButton.text}`);
                  historicalWeekSelected = true; // Mark as successfully selected
                } else {
                  console.log(`⚠️ 未能从下拉菜单中选择历史周期: ${weekButton.text}`);
                }
              } else {
                console.log(`⚠️ 未找到历史周期下拉菜单`);
              }
            } catch (dropdownError) {
              console.log(`⚠️ 选择历史周期失败: ${dropdownError.message}`);
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

              await buttonElement.click();
              console.log(`✅ 成功点击按钮: ${weekButton.id}`);

              // 使用智能等待替代固定等待时间，等待表格数据加载完成
              const tableRowCount = await this.waitForDataStable(
                page,
                async () => {
                  try {
                    // 检测课程单元格数量作为数据加载指标
                    const cellCount = await page.$$eval('td.nowrap', cells => cells.length);
                    return cellCount;
                  } catch (e) {
                    return 0;
                  }
                },
                `周期 ${weekButton.text} 课表数据`,
                8000, // 最大等待 8 秒
                600   // 数据稳定 600ms
              );
              console.log(`📊 表格单元格数量: ${tableRowCount}`);
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
            console.log(`⏳ 等待历史周期数据加载...`);
            const tableRowCount = await this.waitForDataStable(
              page,
              async () => {
                try {
                  const cellCount = await page.$$eval('td.nowrap', cells => cells.length);
                  return cellCount;
                } catch (e) {
                  return 0;
                }
              },
              `历史周期 ${weekButton.text} 课表数据`,
              8000,
              600
            );
            console.log(`📊 表格单元格数量: ${tableRowCount}`);
          }

            // 验证表格是否存在
            try {
              await page.waitForSelector('table, .course-table, .schedule-table', { timeout: 3000 });
              console.log('Table found, extracting data...');
            } catch (tableError) {
              console.log(`No table found for week ${weekButton.index}, trying alternative selectors...`);
            }

            const weekCourses = await extractWeeklyData(weekButton.index);
            if (weekCourses.length > 0) {
              console.log(`\n=== 📊 周期 ${weekButton.text} 课表数据 ===`);

              // Add week information to each course
              weekCourses.forEach((course, index) => {
                course.globalIndex = allCourses.length + index + 1;
                course.weekText = weekButton.text;
                course.weekId = weekButton.id;
              });

              allCourses = allCourses.concat(weekCourses);
              console.log(`✅ 本周期共找到 ${weekCourses.length} 条课程记录\n`);
            } else {
              console.log(`No course data found for week ${weekButton.index}`);
            }

            weekCount++;
            processedWeekIds.add(weekButton.id); // Track this week as processed
        } catch (weekError) {
          console.log(`Error processing week ${weekButton.index}:`, weekError.message);
        }
      }

      // 📅 Additional scraping: Get future weeks from "查看未来周课表" dropdown
      console.log(`\n🔮 ===== 开始抓取未来周课表 =====`);
      console.log(`📝 通过"查看未来周课表"下拉框获取更多未来数据...`);

      try {
        console.log(`✅ 已完成常规周期抓取，现在通过"查看未来周课表"下拉框获取更多数据...`);

        console.log('🔍 查找"查看未来周课表"下拉框...');

        // Find the future weeks dropdown by looking for the specific placeholder text
        const futureWeekDropdownInfo = await page.evaluate(() => {
          // Look for the specific dropdown with "查看未来周课表" placeholder
          const allContainers = document.querySelectorAll('.layui-form-select');
          console.log(`🔍 查找包含"查看未来周课表"的下拉框，总共找到 ${allContainers.length} 个下拉框容器`);

          for (let i = 0; i < allContainers.length; i++) {
            const container = allContainers[i];
            const input = container.querySelector('input');
            const selectTitle = container.querySelector('.layui-select-title');

            if (input && selectTitle) {
              const placeholder = input.placeholder || '';
              const value = input.value || '';
              const containerClass = container.className;

              console.log(`下拉框 ${i}: placeholder="${placeholder}", value="${value}", class="${containerClass}"`);

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
          console.log(`✅ 找到"查看未来周课表"下拉框 (索引 ${futureWeekDropdownInfo.index})`);
          console.log(`📋 placeholder="${futureWeekDropdownInfo.placeholder}"`);
          console.log(`📋 当前状态: ${futureWeekDropdownInfo.isOpen ? '已展开' : '未展开'}`);

          // Get the dropdown container
          futureWeekDropdown = await page.$$('.layui-form-select');
          futureWeekDropdown = futureWeekDropdown[futureWeekDropdownInfo.index];
        }

        if (!futureWeekDropdown) {
          console.log('❌ 未找到"查看未来周课表"下拉框，跳过未来周数据抓取');
          throw new Error('未找到查看未来周课表下拉框');
        }
        if (futureWeekDropdown) {
          console.log('🎯 找到"查看未来周课表"下拉框，开始获取未来周数据...');

          // Click to open the dropdown
          try {
            console.log('📋 开始点击"查看未来周课表"下拉框...');

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

            console.log(`初始状态: ${initialState.isOpen ? '已展开' : '未展开'} (class: ${initialState.className})`);

            if (!initialState.isOpen) {
              // Scroll into view first
              await futureWeekDropdown.scrollIntoViewIfNeeded();
              await page.waitForTimeout(300);

              console.log('🎯 点击下拉框标题以展开选项...');

              // Try to click the select title specifically
              const clicked = await page.evaluate((dropdown) => {
                const selectTitle = dropdown.querySelector('.layui-select-title');
                if (selectTitle) {
                  console.log('点击 .layui-select-title 元素');
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

                console.log(`点击后状态: ${afterClickState.isOpen ? '已展开' : '仍未展开'} (class: ${afterClickState.className})`);

                if (!afterClickState.isOpen) {
                  console.log('🔄 尝试备用点击方法...');
                  // 重新通过选择器查找并点击，避免元素引用失效
                  const reopenClicked = await page.evaluate(() => {
                    const allContainers = document.querySelectorAll('.layui-form-select');
                    for (let container of allContainers) {
                      const input = container.querySelector('input');
                      if (input && (
                        input.placeholder && input.placeholder.includes('查看未来周课表') ||
                        input.value && input.value.includes('查看未来周课表')
                      )) {
                        console.log('通过页面脚本重新找到并点击下拉框');
                        container.click();
                        return true;
                      }
                    }
                    return false;
                  });

                  if (reopenClicked) {
                    console.log('✅ 备用方法点击成功');
                  } else {
                    console.log('⚠️  备用方法未能找到元素');
                  }
                  await page.waitForTimeout(700);
                }
              } else {
                console.log('🔄 直接点击下拉框容器...');
                // 使用页面脚本点击，避免元素引用问题
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
            const finalCheckResult = await page.evaluate(() => {
              // Check if dropdown is open by looking for visible options
              const options = document.querySelectorAll('dd[lay-value]');
              console.log(`最终检查: 找到 ${options.length} 个选项`);

              const validOptions = [];
              options.forEach((option, index) => {
                const layValue = option.getAttribute('lay-value');
                const text = option.textContent.trim();
                const style = window.getComputedStyle(option);
                const isVisible = style.display !== 'none' && style.visibility !== 'hidden';

                console.log(`选项 ${index}: lay-value="${layValue}" text="${text}" visible=${isVisible}`);

                // Only include numeric lay-value options that are visible
                if (layValue && layValue.trim() !== '' && !isNaN(parseInt(layValue)) && isVisible) {
                  validOptions.push({ layValue: parseInt(layValue), text: text.trim() });
                }
              });

              console.log(`有效选项数量: ${validOptions.length}`);
              validOptions.forEach(opt => {
                console.log(`✓ 有效选项: lay-value=${opt.layValue}, text="${opt.text}"`);
              });

              return {
                totalOptions: options.length,
                validOptions: validOptions,
                hasValidOptions: validOptions.length > 0
              };
            });

            if (!finalCheckResult.hasValidOptions) {
              console.log('❌ 未找到有效的下拉选项，可能下拉框未正确展开');
              throw new Error('未能成功展开下拉框或无有效选项');
            }

            console.log(`✅ 成功展开下拉框，找到 ${finalCheckResult.validOptions.length} 个有效选项`);

          } catch (clickError) {
            console.log('❌ 点击未来周下拉框失败:', clickError.message);
            throw clickError;
          }

          // Process future weeks one by one - get fresh options each time
          const targetLayValues = [8, 9, 10, 11, 12]; // Process lay-value 8 through 12
          let processedWeeks = 0;

          console.log(`\n📋 开始处理未来周选项循环`);
          console.log(`📊 目标 lay-value 列表: [${targetLayValues.join(', ')}]`);
          console.log(`📊 总共需要处理: ${targetLayValues.length} 个未来周\n`);

          for (let layValueIndex = 0; layValueIndex < targetLayValues.length; layValueIndex++) {
            const targetLayValue = targetLayValues[layValueIndex];

            try {
              console.log(`\n${'='.repeat(60)}`);
              console.log(`🗓️  处理未来周 [${layValueIndex + 1}/${targetLayValues.length}]: lay-value="${targetLayValue}"`);
              console.log(`${'='.repeat(60)}`);

              // Get fresh dropdown options each time
              console.log(`🔍 获取当前下拉框选项列表...`);
              const currentOptions = await page.evaluate(() => {
                const options = document.querySelectorAll('dd[lay-value]');
                const foundOptions = [];

                console.log(`📋 总共找到 ${options.length} 个 dd[lay-value] 元素`);

                options.forEach((option, index) => {
                  const layValue = option.getAttribute('lay-value');
                  const text = option.textContent.trim();
                  const style = window.getComputedStyle(option);
                  const isVisible = style.display !== 'none' && style.visibility !== 'hidden';

                  console.log(`  选项 ${index}: "${text}" (lay-value="${layValue}", visible=${isVisible})`);

                  // Only include options with non-empty lay-value and numeric values
                  if (layValue && layValue.trim() !== '' && !isNaN(parseInt(layValue))) {
                    foundOptions.push({ layValue, text, isVisible });
                  }
                });

                console.log(`✅ 过滤后的有效选项数量: ${foundOptions.length}`);
                foundOptions.forEach(opt => {
                  console.log(`  ✓ lay-value="${opt.layValue}": "${opt.text}" (visible=${opt.isVisible})`);
                });
                return foundOptions;
              });

              console.log(`📊 当前可用选项: ${currentOptions.length} 个`);
              if (currentOptions.length === 0) {
                console.log(`⚠️  警告: 未找到任何有效选项，下拉框可能未正确展开`);
              }

              // Find the target option in current list
              console.log(`🎯 在选项列表中查找 lay-value="${targetLayValue}"...`);
              const targetOption = currentOptions.find(opt => opt.layValue === targetLayValue.toString());

              if (targetOption) {
                console.log(`✅ 找到目标选项: ${targetOption.text} (lay-value="${targetOption.layValue}")`);

                // Click the option using page.evaluate to avoid visibility issues
                console.log(`🖱️  在页面上下文中点击选项: dd[lay-value="${targetOption.layValue}"]`);
                const clicked = await page.evaluate((layValue) => {
                  const option = document.querySelector(`dd[lay-value="${layValue}"]`);
                  if (option) {
                    console.log(`✅ 找到选项元素，执行点击`);
                    option.click();
                    return true;
                  }
                  return false;
                }, targetOption.layValue);

                if (clicked) {
                  console.log(`✅ 已点击选项: lay-value="${targetOption.layValue}"`);

                  // 使用智能等待替代固定等待时间，等待未来周表格数据加载完成
                  const futureTableCellCount = await this.waitForDataStable(
                    page,
                    async () => {
                      try {
                        const cellCount = await page.$$eval('td.nowrap', cells => cells.length);
                        return cellCount;
                      } catch (e) {
                        return 0;
                      }
                    },
                    `未来周 ${targetOption.text} 课表数据`,
                    10000, // 最大等待 10 秒
                    800    // 数据稳定 800ms
                  );
                  console.log(`📊 未来周表格单元格数量: ${futureTableCellCount}`);

                  // Extract data for this future week
                  console.log(`📊 提取未来周数据: future_${targetOption.layValue}`);
                  const futureWeekCourses = await extractWeeklyData(`future_${targetOption.layValue}`);
                  if (futureWeekCourses.length > 0) {
                    console.log(`✅ 成功提取数据: 未来周 ${targetOption.text} 找到 ${futureWeekCourses.length} 条课程记录`);

                    // Add future week information to each course
                    console.log(`📝 为每条课程添加未来周标识信息...`);
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

                    console.log(`✅ 已添加未来周课程数据 (${beforeCount} → ${allCourses.length}, +${futureWeekCourses.length})`);
                    console.log(`📈 已处理未来周数量: ${processedWeeks}/${targetLayValues.length}`);
                  } else {
                    console.log(`⚠️  未来周 ${targetOption.text} 没有找到课程数据 (可能该周没有课程安排)`);
                  }

                  // If not the last option, need to reopen dropdown for next selection
                  if (layValueIndex < targetLayValues.length - 1) {
                    console.log(`\n🔄 准备处理下一个未来周 (${layValueIndex + 1}/${targetLayValues.length - 1})...`);
                    console.log(`🔄 需要重新打开未来周下拉框...`);

                    // Wait for any layui shade/modal to disappear
                    console.log(`⏱️  检查是否有遮罩层需要等待消失...`);
                    try {
                      await page.waitForSelector('.layui-layer-shade', { state: 'hidden', timeout: 3000 });
                      console.log('✅ 遮罩层已消失');
                    } catch (e) {
                      // No shade present or already hidden - this is fine
                      console.log('ℹ️  无遮罩层或已经隐藏');
                    }

                    // Additional wait for page stability
                    console.log(`⏱️  等待 500ms 确保页面稳定...`);
                    await page.waitForTimeout(500);
                    console.log(`✅ 页面稳定，开始查找下拉框...`);

                    // Re-find the future week dropdown specifically (not other dropdowns)
                    let nextDropdown = null;

                    // Try to find the future week dropdown again
                    console.log(`🔍 方法1: 通过 input placeholder/value 查找未来周下拉框...`);
                    const nextFutureWeekContainer = await page.evaluate(() => {
                      const allContainers = document.querySelectorAll('.layui-input-inline');
                      console.log(`  找到 ${allContainers.length} 个 .layui-input-inline 容器`);

                      for (let i = 0; i < allContainers.length; i++) {
                        const container = allContainers[i];
                        const input = container.querySelector('input');
                        if (input) {
                          const placeholder = input.placeholder || '';
                          const value = input.value || '';
                          console.log(`  容器 ${i}: placeholder="${placeholder}", value="${value}"`);

                          if (placeholder.includes('未来周') || value.includes('未来周') ||
                              placeholder.includes('查看未来周课表') || value.includes('查看未来周课表')) {
                            console.log(`  ✅ 匹配成功!`);
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
                      console.log(`✅ 方法1成功: 找到未来周下拉框 "${nextFutureWeekContainer.inputText}"`);
                      nextDropdown = await page.$('.layui-input-inline input[placeholder*="未来周"], .layui-input-inline input[placeholder*="查看未来周课表"], .layui-input-inline input[value*="未来周"], .layui-input-inline input[value*="查看未来周课表"]');
                      if (nextDropdown) {
                        console.log(`✅ 已获取下拉框元素引用`);
                      } else {
                        console.log(`⚠️  虽然找到匹配但未能获取元素引用`);
                      }
                    } else {
                      console.log(`⚠️  方法1失败: 未找到匹配的容器`);
                    }

                    if (!nextDropdown) {
                      // Fallback: search by text content again
                      console.log(`🔍 方法2: 通过 .layui-select-title 查找...`);
                      const allDropdowns = await page.$$('.layui-select-title');
                      console.log(`  找到 ${allDropdowns.length} 个 .layui-select-title 元素`);

                      for (let i = 0; i < allDropdowns.length; i++) {
                        const dropdown = allDropdowns[i];
                        const text = await page.evaluate(el => {
                          const input = el.querySelector('input');
                          return input ? (input.placeholder || input.value || '') : '';
                        }, dropdown);

                        console.log(`  下拉框 ${i}: "${text}"`);

                        if (text.includes('未来周') || text.includes('查看未来周课表')) {
                          nextDropdown = dropdown;
                          console.log(`✅ 方法2成功: 找到未来周下拉框 "${text}"`);
                          break;
                        }
                      }

                      if (!nextDropdown) {
                        console.log(`⚠️  方法2失败: 未找到匹配的下拉框`);
                      }
                    }

                    if (nextDropdown) {
                      console.log(`🎯 已找到下拉框元素，准备点击...`);
                      // Wait for element to be visible and stable before clicking
                      try {
                        console.log(`⏱️  等待下拉框元素变为可见状态 (最多5秒)...`);
                        await nextDropdown.waitForElementState('visible', { timeout: 5000 });
                        console.log(`✅ 元素已可见`);
                        console.log(`⏱️  等待下拉框元素变为稳定状态 (最多3秒)...`);
                        await nextDropdown.waitForElementState('stable', { timeout: 3000 });
                        console.log('✅ 元素已稳定，准备点击');
                      } catch (e) {
                        console.log(`⚠️  元素状态等待超时 (${e.message})，尝试直接点击`);
                      }

                      console.log(`🖱️  点击下拉框...`);
                      await nextDropdown.click();
                      console.log('✅ 成功重新打开未来周下拉框');

                      // 使用智能等待：等待下拉框选项加载完成
                      const dropdownOptionsLoaded = await this.waitForDataStable(
                        page,
                        async () => {
                          try {
                            // 检查下拉框选项数量
                            const optionCount = await page.$$eval('.layui-form-select.layui-form-selected dd', opts => opts.length);
                            return optionCount;
                          } catch (e) {
                            return 0;
                          }
                        },
                        '下拉框选项',
                        5000, // 最大等待 5 秒
                        500   // 选项稳定 500ms
                      );
                      console.log(`📋 下拉框选项数量: ${dropdownOptionsLoaded}`);
                    } else {
                      console.log('❌ 无法重新找到未来周下拉框元素，可能界面发生了变化');
                      console.log(`⚠️  终止未来周抓取循环 (已处理 ${processedWeeks} 个未来周)`);
                      break; // Exit the loop if can't find dropdown
                    }
                  } else {
                    console.log(`\n✅ 这是最后一个未来周选项，无需重新打开下拉框`);
                  }

                } else {
                  console.log(`❌ 无法点击选项: lay-value="${targetOption.layValue}" (页面上下文中未找到元素)`);
                  console.log(`⚠️  跳过此选项，继续处理下一个...`);
                }

              } else {
                console.log(`⚠️  未找到 lay-value="${targetLayValue}" 的选项，可能已经到达可用范围的末尾`);
                console.log(`   继续尝试下一个 lay-value...`);
                // Continue to next lay-value in case this one just doesn't exist
              }

            } catch (futureWeekError) {
              console.log(`❌ 处理未来周 lay-value="${targetLayValue}" 时发生错误:`);
              console.log(`   错误信息: ${futureWeekError.message}`);
              console.log(`   错误堆栈: ${futureWeekError.stack}`);
              console.log(`   继续处理下一个未来周...`);
            }
          }

          console.log(`\n${'='.repeat(60)}`);
          console.log(`📊 未来周抓取循环结束`);
          console.log(`✅ 成功处理: ${processedWeeks}/${targetLayValues.length} 个未来周`);
          console.log(`📈 总课程数: ${allCourses.length}`);
          console.log(`${'='.repeat(60)}`);

          console.log(`\n✅ 未来周课表抓取完成，共处理 ${processedWeeks} 个未来周`);

        } else {
          console.log('⚠️  未找到"查看未来周课表"下拉框，跳过未来周数据抓取');
        }

      } catch (futureWeekError) {
        console.log('\n❌ 抓取未来周课表时发生异常错误:');
        console.log(`   错误类型: ${futureWeekError.name}`);
        console.log(`   错误信息: ${futureWeekError.message}`);
        console.log(`   错误堆栈:\n${futureWeekError.stack}`);
        console.log(`⚠️  将继续处理剩余流程...`);
      }

      console.log(`\n🔮 ===== 未来周课表抓取结束 =====`);
      console.log(`📊 当前总课程记录数: ${allCourses.length}`);
      console.log(`📊 当前总周期数: ${weekCount}\n`);

      console.log(`\n🎯 ===== 抓取完成统计 =====`);
      console.log(`📊 总共抓取周期数: ${weekCount}`);
      console.log(`📚 原始课程记录数: ${allCourses.length}`);

      // 去重处理 - 基于teacher, student, date, time的组合创建唯一标识
      console.log(`🔄 开始去重处理...`);
      const uniqueCourses = [];
      const seenKeys = new Set();

      for (const course of allCourses) {
        // 创建唯一标识键，基于关键字段组合
        const uniqueKey = `${course.teacher}-${course.student}-${course.date}-${course.time}`;

        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          uniqueCourses.push(course);
        } else {
          console.log(`🗑️ 去除重复课程: ${uniqueKey}`);
        }
      }

      console.log(`✅ 去重完成，原始记录: ${allCourses.length}，去重后: ${uniqueCourses.length}`);
      allCourses = uniqueCourses; // 使用去重后的数据

      console.log(`💾 准备保存数据到数据库...`);
      console.log(`============================\n`);

      // Get additional page data
      const pageData = await page.evaluate(() => {
        const title = document.title;
        const url = window.location.href;
        const timestamp = new Date().toISOString();

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

      const courseData = {
        ...pageData,
        courses: allCourses,
        totalCourses: allCourses.length,
        totalWeeks: weekCount,
        weeklyButtons: weeklyButtons
      };

      console.log(`Found ${courseData.totalCourses} courses`);

      // Save data to Database
      let dbResult = { success: false, message: '未执行数据库操作' };
      if (courseData.courses.length > 0) {
        try {
          console.log('Preparing data for database...');

          // Prepare data for database - required format: 日期、时间、老师、学生、扣课数、课程类型
          const excelData = courseData.courses.map(course => {
            const row = {};

            // Required columns
            row['日期'] = course.date || '';
            row['时间'] = course.time || '';
            row['老师'] = course.teacher || '';
            row['学生'] = course.student || '';
            row['扣课数'] = course.deduction || '';
            row['课程类型'] = course.courseType || '未知';

            // Additional reference info
            row['周期'] = course.weekText || '';

            return row;
          });

          // Save to database directly (Excel generation removed)
          console.log('💾 开始保存数据到数据库...');
          dbResult = await this.saveToDB(allCourses);
          console.log(dbResult.message);

          // After courses data, scrape member card data
          console.log('\n🎯 开始抓取会员卡数据...');
          const cardData = await this.scrapeMemberCards(page);
          console.log(`✅ 会员卡数据抓取完成，共获得 ${cardData.length} 条记录`);

          // Save member card data to database directly (Excel generation removed)
          if (cardData.length > 0) {
            console.log('💾 开始保存会员卡数据到数据库...');
            const cardDbResult = await this.saveCardDataToDB(cardData);
            console.log(cardDbResult.message);
          }

          // Final completion summary
          console.log('\n' + '='.repeat(70));
          console.log('🏁 全部抓取任务完成');
          console.log('📊 本次抓取汇总:');
          console.log(`   ✅ 课程数据: ${courseData.totalCourses} 条课程记录`);
          console.log(`   ✅ 会员卡数据: ${cardData.length} 条会员记录`);
          console.log(`   💾 数据已保存至数据库: yuekebao_classtime + yuekebao_student_cardnum`);
          console.log('='.repeat(70) + '\n');

        } catch (dataError) {
          console.error('Data processing failed:', dataError.message);
          console.error('Error stack:', dataError.stack);
          console.error('Course data structure:', JSON.stringify(courseData.courses.slice(0, 2), null, 2)); // Show first 2 courses for debugging
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `# 约课宝课程管理数据抓取结果

## 基本信息
- **页面标题**: ${courseData.title}
- **页面URL**: ${courseData.url}
- **抓取时间**: ${courseData.timestamp}
- **课程会话总数**: ${courseData.totalCourses}
- **抓取周期数**: ${courseData.totalWeeks} 个周期
- **可用周期**: ${courseData.weeklyButtons.map(b => b.text).join(', ')}

## 课程会话数据概览 (前5条)
${courseData.courses.length > 0 ?
  courseData.courses.slice(0, 5).map(course =>
    `### 课程会话 ${course.globalIndex || '未知'} (${course.weekText || '未知周期'})
- **日期**: ${course.date || '未知日期'}
- **时间**: ${course.time || '未知时间'}
- **老师**: ${course.teacher || '未知老师'}
- **学生**: ${course.student || '未知学生'}
- **扣课数**: ${course.deduction || '未知扣课数'}
`
  ).join('\n\n')
  : '未找到课程会话数据'}

${courseData.courses.length > 5 ? `\n... 还有 ${courseData.courses.length - 5} 条课程会话数据已保存到数据库中\n` : ''}

## JSON数据
${courseData.jsonData ?
  '```json\n' + JSON.stringify(courseData.jsonData, null, 2) + '\n```'
  : '未找到JSON格式的课程数据'}

## 数据库保存
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
          currentPageInfo = `\n- 当前页面URL: ${currentUrl}`;
        } catch (pageError) {
          currentPageInfo = '\n- 无法获取当前页面信息';
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `抓取约课宝课程数据时发生错误: ${error.message}

错误详情:
- 错误类型: ${error.name}
- 完整错误信息: ${error.stack}${currentPageInfo}

可能的解决方案:
- 请确认登录凭据是否正确
- 请检查滑块验证码是否已正确完成
- 请确认课程管理页面是否可访问
- 检查网页结构是否有变化
- 建议设置 headless: false 来观察登录过程

调试建议:
1. 打开浏览器手动访问 https://www.yuekebao.cn/admin/login.php
2. 检查登录表单的实际元素结构
3. 确认滑块验证码的工作状态`
          }
        ],
        isError: true
      };
    } finally {
      // Clean up - always close browser after scraping
      console.log('🔒 关闭浏览器...');
      try {
        if (page) await page.close();
        if (context) await context.close();
        if (browser) await browser.close();
        console.log('✅ 浏览器已关闭');
      } catch (closeError) {
        console.log('⚠️ 关闭浏览器时出错:', closeError.message);
      }
    }
  }

  async saveToDB(courses) {
    let connection;
    try {
      // Database connection configuration
      const dbConfig = {
        host: '34.143.219.245',
        port: 3306,
        user: 'dev',
        password: '3.@d?*|X|GLc;0%z',
        database: 'baboon'
      };

      console.log('🔗 连接数据库...');
      connection = await mysql.createConnection(dbConfig);
      console.log('✅ 数据库连接成功');

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
          course.courseType || '未知',    // course_type (新增)
          new Date()                      // create_time
        ];
      });

      // Get date range from courses to delete existing data for the same period
      if (courses.length > 0) {
        console.log(`🗑️ 清空整个yuekebao_classtime表...`);

        const deleteQuery = 'DELETE FROM yuekebao_classtime';
        const [deleteResult] = await connection.execute(deleteQuery);

        console.log(`✅ 已删除 ${deleteResult.affectedRows} 条旧记录`);
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

      console.log(`📝 开始插入 ${courses.length} 条记录...`);
      const [result] = await connection.execute(insertQuery, flatData);

      console.log(`✅ 成功插入 ${result.affectedRows} 条记录到数据库`);

      return {
        success: true,
        message: `✅ 数据库保存成功！插入了 ${result.affectedRows} 条课程记录`,
        insertedRows: result.affectedRows
      };

    } catch (error) {
      console.error('❌ 数据库操作失败:', error.message);
      return {
        success: false,
        message: `❌ 数据库保存失败: ${error.message}`,
        error: error.message
      };
    } finally {
      if (connection) {
        await connection.end();
        console.log('🔌 数据库连接已关闭');
      }
    }
  }

  async scrapeMemberCards(page) {
    try {
      console.log('📄 导航至会员卡页面...');
      await page.goto('https://www.yuekebao.cn/admin/card_once.php', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await page.waitForTimeout(300);

      // 使用重试机制点击"所有"按钮
      console.log('🔘 点击"所有"按钮筛选所有状态...');
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
            console.log(`"所有"按钮点击尝试失败: ${error.message}`);
            return null;
          }
        },
        '检测并点击"所有"按钮'
      );

      if (allButtonResult) {
        console.log('✅ 已成功点击"所有"按钮');
      } else {
        console.log('⚠️ 未找到或点击"所有"按钮失败，继续使用默认筛选');
      }

      // 使用重试机制设置每页显示100条数据
      console.log('⚙️ 设置每页显示100条数据...');
      const pageSizeResult = await this.retryWithDetection(
        async () => {
          try {
            const selectElement = await page.$('select[lay-ignore]');
            if (selectElement) {
              console.log('📝 选择每页显示100条...');
              await selectElement.selectOption('100');
              // 等待页面重新加载数据
              await page.waitForTimeout(2000);

              // 验证是否真的加载了更多数据
              const rowCount = await page.$$eval('tr[data-index]', rows => rows.length);
              console.log(`🔍 设置后当前页面有 ${rowCount} 行数据`);

              return rowCount > 50 ? rowCount : null; // 如果成功应该有接近100行
            }
            return null;
          } catch (error) {
            console.log(`分页选择器设置尝试失败: ${error.message}`);
            return null;
          }
        },
        '检测并设置分页选择器'
      );

      if (pageSizeResult) {
        console.log(`✅ 已成功设置每页显示100条，当前页有 ${pageSizeResult} 行数据`);
      } else {
        console.log('⚠️ 未找到分页选择器或设置失败，继续使用默认设置');
      }

      const allCardData = [];
      let currentPage = 1;

      while (true) {
        console.log(`📊 抓取第 ${currentPage} 页数据...`);

        // 使用重试机制等待表格加载
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
          `检测第${currentPage}页表格数据`
        );

        if (!tableLoaded) {
          console.log(`⚠️ 第${currentPage}页表格加载失败或无数据，可能已到最后一页`);
          break;
        }

        console.log(`✅ 第${currentPage}页找到 ${tableLoaded} 行数据`);

        // Extract data from current page
        const pageCardData = await page.evaluate(() => {
          const cards = [];
          const rows = document.querySelectorAll('tr[data-index]');

          rows.forEach(row => {
            try {
              // 1. 学生姓名 - 从data-content属性或者span元素获取
              let studentName = '';
              const nameCell = row.querySelector('[data-field="member_name"]');
              if (nameCell) {
                const dataContent = nameCell.getAttribute('data-content');
                if (dataContent) {
                  // 标准化空格：将多个连续空格替换为单个空格
                  studentName = dataContent.trim().replace(/\s+/g, ' ');
                } else {
                  const nameSpan = nameCell.querySelector('span.ft16');
                  if (nameSpan) {
                    // 标准化空格：将多个连续空格替换为单个空格
                    studentName = nameSpan.innerText.trim().replace(/\s+/g, ' ');
                  }
                }
              }

              // 2. 学生手机号 - 从href="tel:xxx"获取
              let studentPhone = '';
              const phoneLink = row.querySelector('a[href^="tel:"]');
              if (phoneLink) {
                const href = phoneLink.getAttribute('href');
                if (href && href.startsWith('tel:')) {
                  studentPhone = href.replace('tel:', '').trim();
                }
              }

              // 3. 课程类型 - 从课程信息单元格获取
              let courseType = '';
              const courseCell = row.querySelector('[data-field="num_yu"]');
              if (courseCell) {
                const courseSpan = courseCell.querySelector('span.ft15');
                if (courseSpan) {
                  courseType = courseSpan.innerText.trim();
                }
              }

              // 4. 剩余课时数 - 从"余XX次"中提取数字
              let remainingClasses = 0;
              const remainingSpan = courseCell ? courseCell.querySelector('span.layui-badge') : null;
              if (remainingSpan) {
                const remainingText = remainingSpan.innerText.trim();

                // 检查是否包含"已完成"或"已过期"字样，如果包含则跳过此记录
                if (remainingText.includes('已完成') || remainingText.includes('已过期')) {
                  console.log(`⚠️ 跳过已完成/已过期记录: ${studentName} | ${remainingText}`);
                  return; // 跳过此条记录
                }

                const remainingMatch = remainingText.match(/余(\d+)次/);
                if (remainingMatch) {
                  remainingClasses = parseInt(remainingMatch[1]) || 0;
                }
              }

              // 5. 剩余已排课数 - 从"未开课预扣XX次"中提取数字
              let scheduledClasses = 0;
              if (courseCell) {
                const courseText = courseCell.innerText;
                const scheduledMatch = courseText.match(/未开课预扣(\d+)次/);
                if (scheduledMatch) {
                  scheduledClasses = parseInt(scheduledMatch[1]) || 0;
                }
              }

              // 数据清洗：课程类型过滤
              let cleanedCourseType = '';
              if (courseType) {
                // 如果完全等于"试课"，则不统计这条记录
                if (courseType.trim() === '试课') {
                  console.log(`⚠️ 跳过试课记录: ${studentName} | ${courseType}`);
                  return; // 跳过此条记录
                }

                // 课程类型清洗
                if (courseType.includes('菲教')) {
                  cleanedCourseType = '菲教';
                } else if (courseType.includes('欧教')) {
                  cleanedCourseType = '欧教';
                } else if (courseType.includes('一对')) {
                  cleanedCourseType = '一对多';
                } else {
                  cleanedCourseType = courseType; // 保持原样
                }
              }

              // 只有当有有效数据时才添加记录
              if (studentName && cleanedCourseType) {
                cards.push({
                  studentName: studentName,
                  studentPhone: studentPhone,
                  courseType: cleanedCourseType,
                  remainingClasses: remainingClasses,
                  scheduledClasses: scheduledClasses
                });

                console.log(`📋 提取数据: ${studentName} | ${studentPhone} | ${cleanedCourseType} | 余${remainingClasses}次 | 已排${scheduledClasses}次`);
              }

            } catch (rowError) {
              console.log('⚠️ 解析行数据时出错:', rowError.message);
            }
          });

          return cards;
        });

        console.log(`✅ 第 ${currentPage} 页提取了 ${pageCardData.length} 条数据`);
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
          console.log('📄 已到达最后一页');
          console.log('📊 分页链接遍历完成情况:');
          console.log(`   - 总页码链接数: ${paginationInfo.totalLinks}`);
          console.log(`   - 当前已处理页数: ${currentPage}`);
          console.log(`   - 分页链接详情: ${JSON.stringify(paginationInfo.allPageLinks)}`);
          console.log('✅ 所有会员卡分页已遍历完成');
          break;
        }

        // Click next page
        try {
          // 记录翻页前的数据特征（第一行的学生名），用于验证翻页成功
          const beforePageFirstStudent = await page.evaluate(() => {
            const firstRow = document.querySelector('tr[data-index="0"]');
            if (firstRow) {
              const nameCell = firstRow.querySelector('[data-field="member_name"]');
              return nameCell ? nameCell.getAttribute('data-content') || nameCell.innerText : '';
            }
            return '';
          });

          await page.click('.layui-laypage-next');

          // 使用智能等待：等待数据变化并稳定
          const newPageLoaded = await this.waitForDataStable(
            page,
            async () => {
              try {
                // 检查第一行数据是否已变化
                const currentFirstStudent = await page.evaluate(() => {
                  const firstRow = document.querySelector('tr[data-index="0"]');
                  if (firstRow) {
                    const nameCell = firstRow.querySelector('[data-field="member_name"]');
                    return nameCell ? nameCell.getAttribute('data-content') || nameCell.innerText : '';
                  }
                  return '';
                });

                // 如果第一行学生名已变化，说明新页面数据已加载
                if (currentFirstStudent && currentFirstStudent !== beforePageFirstStudent) {
                  const rowCount = await page.$$eval('tr[data-index]', rows => rows.length);
                  return rowCount;
                }
                return 0; // 数据未变化，继续等待
              } catch (e) {
                return 0;
              }
            },
            `会员卡第 ${currentPage + 1} 页数据`,
            10000, // 最大等待 10 秒
            600    // 数据稳定 600ms
          );

          if (newPageLoaded > 0) {
            currentPage++;
            console.log(`📄 成功翻到第 ${currentPage} 页，数据行数: ${newPageLoaded}`);
          } else {
            console.log('⚠️ 翻页后数据未变化，可能已是最后一页');
            break;
          }
        } catch (nextError) {
          console.log('⚠️ 点击下一页失败:', nextError.message);
          break;
        }
      }

      // Merge data with same courseType + studentName + studentPhone
      console.log('🔄 开始合并相同学生的多条记录...');
      const mergedData = this.mergeCardData(allCardData);

      console.log('\n' + '='.repeat(60));
      console.log('🎉 会员卡数据抓取流程完成');
      console.log(`📊 总计处理页数: ${currentPage} 页`);
      console.log(`📋 原始数据记录: ${allCardData.length} 条`);
      console.log(`📋 合并后记录: ${mergedData.length} 条`);
      console.log('='.repeat(60) + '\n');

      return mergedData;

    } catch (error) {
      console.error('❌ 抓取会员卡数据失败:', error.message);
      return [];
    }
  }

  mergeCardData(cardData) {
    const merged = {};

    cardData.forEach(card => {
      const key = `${card.courseType}_${card.studentName}_${card.studentPhone}`;

      if (merged[key]) {
        // 合并数据：相加剩余课时数和已排课数
        merged[key].remainingClasses += card.remainingClasses;
        merged[key].scheduledClasses += card.scheduledClasses;
      } else {
        merged[key] = { ...card };
      }
    });

    const mergedArray = Object.values(merged);
    console.log(`✅ 数据合并完成，从 ${cardData.length} 条原始记录合并为 ${mergedArray.length} 条记录`);

    return mergedArray;
  }

  async saveCardDataToDB(cardData) {
    let connection;
    try {
      const mysql = await import('mysql2/promise');

      // Database connection configuration (same as course data)
      const dbConfig = {
        host: '34.143.219.245',
        port: 3306,
        user: 'dev',
        password: '3.@d?*|X|GLc;0%z',
        database: 'baboon'
      };

      console.log('🔗 连接数据库...');
      connection = await mysql.createConnection(dbConfig);
      console.log('✅ 数据库连接成功');

      // Clear existing data from yuekebao_student_cardnum table
      console.log('🗑️ 清理会员卡数据表...');
      const [deleteResult] = await connection.execute('DELETE FROM yuekebao_student_cardnum');
      console.log(`✅ 已清理 ${deleteResult.affectedRows} 条旧记录`);

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

      console.log(`📝 开始插入 ${cardData.length} 条会员卡记录...`);
      const [result] = await connection.execute(insertQuery, flatData);

      console.log(`✅ 成功插入 ${result.affectedRows} 条记录到数据库`);

      return {
        success: true,
        message: `✅ 会员卡数据库保存成功！插入了 ${result.affectedRows} 条记录`,
        insertedRows: result.affectedRows
      };

    } catch (error) {
      console.error('❌ 会员卡数据库操作失败:', error.message);
      return {
        success: false,
        message: `❌ 会员卡数据库保存失败: ${error.message}`,
        error: error.message
      };
    } finally {
      if (connection) {
        await connection.end();
        console.log('🔌 数据库连接已关闭');
      }
    }
  }

  // 生成自签名SSL证书
  generateSelfSignedCert() {
    const certDir = path.resolve(this.__dirname, '..', 'ssl');
    const keyPath = path.join(certDir, 'server.key');
    const certPath = path.join(certDir, 'server.crt');

    try {
      // 检查证书是否已存在
      readFileSync(keyPath);
      readFileSync(certPath);
      console.log('🔐 使用现有SSL证书');
      return { keyPath, certPath };
    } catch (error) {
      // 证书不存在，生成新的
      console.log('🔐 生成自签名SSL证书...');

      try {
        // 创建ssl目录
        execSync(`mkdir -p "${certDir}"`);

        // 生成私钥和证书
        const opensslCmd = `openssl req -x509 -nodes -days 365 -newkey rsa:2048 ` +
          `-keyout "${keyPath}" -out "${certPath}" ` +
          `-subj "/C=CN/ST=Beijing/L=Beijing/O=YuekebaoGrabber/CN=localhost"`;

        execSync(opensslCmd);
        console.log('✅ SSL证书生成成功');
        return { keyPath, certPath };
      } catch (opensslError) {
        console.warn('⚠️  OpenSSL不可用，将使用HTTP服务器');
        return null;
      }
    }
  }

  // 启动Web仪表板服务器
  async startDashboard(port = 3000, useHttps = true) {
    if (this.app) {
      console.log('Web服务器已经在运行中');
      return;
    }

    this.app = express();

    // 获取路径前缀(如果有自定义域名路径)
    const basePath = process.env.BASE_PATH || '';
    console.log(`📁 应用基础路径: ${basePath || '/'}`);

    const defaultAutoFeedbackPrompt = [
      '你是英语老师助理。请基于课堂截图生成课后反馈，要求：',
      '1) 本节课主要内容概述（2-3句）',
      '2) 学生表现亮点（1-3条）',
      '3) 需要改进点（1-3条）',
      '4) 下节课建议（1-2条）',
      '语言：中文，100-200字，条理清晰。',
      '课堂信息：老师{teacherName}，学生{studentName}，课程{courseName}，时间{classTime}。',
    ].join('\n');

    // 全局中间件
    this.app.use(cors());
    this.app.use(express.json());

    // 数据库配置
    const dbConfig = {
      host: '34.143.219.245',
      port: 3306,
      user: 'dev',
      password: '3.@d?*|X|GLc;0%z',
      database: 'baboon'
    };

    // 获取数据库连接
    const getDbConnection = async () => {
      return await mysql.createConnection(dbConfig);
    };

    // feifei 数据库配置（已迁移到新服务器）
    const feifeiDbConfig = {
      host: '34.143.219.245',
      port: 3306,
      user: 'dev',
      password: '3.@d?*|X|GLc;0%z',
      database: 'baboon',
      charset: 'utf8mb4'
    };

    // 获取 feifei 数据库连接
    const getFeifeiDbConnection = async () => {
      return await mysql.createConnection(feifeiDbConfig);
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
        console.error(`转发 WeChat API 失败: ${targetUrl}`, error);
        res.status(502).json({
          success: false,
          error: '转发 WeChat API 失败',
          detail: error.message
        });
      }
    };

    // 数据库迁移函数：添加 course_type 字段
    const runDatabaseMigrations = async () => {
      let connection;
      try {
        console.log('🔧 检查数据库迁移...');
        connection = await getDbConnection();

        // 检查 course_type 字段是否存在
        const [columns] = await connection.execute(
          `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'yuekebao_classtime' AND COLUMN_NAME = 'course_type'`,
          [dbConfig.database]
        );

        if (columns.length === 0) {
          console.log('📝 添加 course_type 字段到 yuekebao_classtime 表...');
          await connection.execute(
            `ALTER TABLE yuekebao_classtime
             ADD COLUMN course_type VARCHAR(20) DEFAULT '未知' AFTER week_period`
          );
          console.log('✅ course_type 字段添加成功');
        } else {
          console.log('✅ course_type 字段已存在');
        }

        // 检查 classFeedback2 字段是否存在
        const [feedbackColumns] = await connection.execute(
          `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'base_user_studentclassrecord' AND COLUMN_NAME = 'classFeedback2'`,
          [dbConfig.database]
        );

        if (feedbackColumns.length === 0) {
          console.log('📝 添加 classFeedback2 字段到 base_user_studentclassrecord 表...');
          await connection.execute(
            `ALTER TABLE base_user_studentclassrecord
             ADD COLUMN classFeedback2 LONGTEXT NULL AFTER classFeedback`
          );
          console.log('✅ classFeedback2 字段添加成功');
        } else {
          console.log('✅ classFeedback2 字段已存在');
        }
      } catch (error) {
        console.error('❌ 数据库迁移失败:', error.message);
        // 不抛出错误，允许服务器继续启动
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    };

    // 执行数据库迁移
    await runDatabaseMigrations();

    // 如果有 basePath,添加路径重写中间件
    if (basePath) {
      this.app.use((req, res, next) => {
        // 如果请求路径以 basePath 开头,去除前缀
        if (req.path.startsWith(basePath)) {
          req.url = req.url.substring(basePath.length) || '/';
          console.log(`📝 路径重写: ${basePath}${req.path} → ${req.url}`);
        }
        next();
      });
    }

    // 静态文件服务
    this.app.use(express.static(path.resolve(this.__dirname, '..')));

    // API接口：获取仪表板数据
    this.app.get('/api/dashboard-data', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('📊 开始获取仪表板数据...');

        // 1. 获取会员卡数据（学生基本信息）
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

        console.log(`📝 获取到 ${allCardData.length} 条原始会员卡记录`);

        // 2. 按学员分组，实现条件过滤逻辑
        const studentCardMap = new Map();
        allCardData.forEach(card => {
          const studentName = card.name;
          if (!studentCardMap.has(studentName)) {
            studentCardMap.set(studentName, []);
          }
          studentCardMap.get(studentName).push(card);
        });

        // 3. 应用过滤规则：多种类型时只显示剩余课时>0的，单种类型时全部显示
        const cardData = [];
        let multiTypeFilteredCount = 0;
        let singleTypeKeptCount = 0;

        studentCardMap.forEach((cards, studentName) => {

          if (cards.length === 1) {
            // 只有一种课程类型，不管剩余课时是否为0都显示
            cardData.push(cards[0]);
            singleTypeKeptCount++;
          } else {
            // 有多种课程类型，只显示剩余课时>0的
            const validCards = cards.filter(card => card.remainingClasses > 0);
            cardData.push(...validCards);
            multiTypeFilteredCount += (cards.length - validCards.length);
          }
        });

        console.log(`📝 过滤后获得 ${cardData.length} 条有效会员卡记录`);

        // 4. 获取未来课程数据（用于计算之后课节和90天内课程数）
        const currentDate = new Date();
        const futureDate = new Date();
        futureDate.setDate(currentDate.getDate() + 90);

        // 获取未来90天的课程数据（排除今天已经上过的课）
        // 逻辑：明天及以后的课程 OR 今天但上课时间还没到的课程
        const [futureCourseData] = await connection.execute(`
          SELECT
            yc.student,
            yc.teacher,
            yc.class_date,
            yc.class_start_time,
            yc.class_end_time,
            yc.time_num,
            COALESCE(yts.type, '未知') as teacher_type
          FROM yuekebao_classtime yc
          LEFT JOIN yuekebao_teacher_salary yts ON yc.teacher = yts.teacher_name
          WHERE (
            (yc.class_date > CURDATE())
            OR (yc.class_date = CURDATE() AND yc.class_start_time > CURTIME())
          )
          AND yc.class_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)
          ORDER BY yc.class_date, yc.class_start_time
        `);

        // 5. 获取历史课程数据（用于计算之前课节）
        // 包括：昨天及之前的课程 + 今天已经上过的课程
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

        console.log(`📅 获取到 ${futureCourseData.length} 条未来90天课程记录`);
        console.log(`📅 获取到 ${pastCourseData.length} 条历史课程记录`);

        // 调试：显示未来课程数据的前几条记录
        if (futureCourseData.length > 0) {
          console.log(`📋 未来课程数据示例 (前3条):`);
          futureCourseData.slice(0, 3).forEach((course, index) => {
            console.log(`   ${index + 1}. ${course.student} - ${course.teacher} - ${course.class_date} ${course.class_start_time}`);
          });
        } else {
          console.log(`⚠️  未来90天课程数据为空，可能yuekebao_classtime表中没有未来的课程数据`);
        }

        // 6. 合并数据并计算派生字段
        const studentsMap = new Map();

        // 首先处理会员卡数据 - 每种课程类型单独一行
        cardData.forEach(card => {
          const studentName = card.name;
          const courseType = card.courseType;
          // 使用学员名称+课程类型作为复合key，确保每种课程类型都单独显示
          const key = `${studentName}_${courseType}`;

          if (studentName && courseType) {
            studentsMap.set(key, {
              name: studentName,
              mobile: card.mobile,
              courseType: courseType,
              remainingClasses: card.remainingClasses || 0,
              scheduledClasses: card.scheduledClasses || 0,
              unscheduledClasses: 0, // 将在后面根据未来90天课程数计算
              prevClass: null,
              nextClass: null,
              next90DaysClasses: 0,
              upcomingCourses: []
            });
          }
        });

        // 添加课程表中存在但会员卡数据中没有（或剩余课时为0）的学员
        // 收集所有课程数据中的学员名称及其老师类型
        const studentTeacherTypes = new Map(); // 学员名 -> 老师类型集合
        [...futureCourseData, ...pastCourseData].forEach(course => {
          if (course.student) {
            if (!studentTeacherTypes.has(course.student)) {
              studentTeacherTypes.set(course.student, new Set());
            }
            if (course.teacher_type && course.teacher_type !== '未知') {
              studentTeacherTypes.get(course.student).add(course.teacher_type);
            }
          }
        });

        // 为课程表中存在但studentsMap中没有的学员创建记录
        studentTeacherTypes.forEach((teacherTypes, studentName) => {
          // 检查该学员是否已经在studentsMap中有任何课程类型的记录
          const hasAnyRecord = Array.from(studentsMap.keys()).some(key => key.startsWith(`${studentName}_`));

          if (!hasAnyRecord) {
            // 该学员在课程表中有记录，但在会员卡数据中没有记录
            // 根据老师类型推断课程类型
            let inferredCourseType = '未知';
            if (teacherTypes.has('菲')) {
              inferredCourseType = '菲教';
            } else if (teacherTypes.has('欧')) {
              inferredCourseType = '欧教';
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

        console.log(`📝 添加课程表中的学员后，总记录数: ${studentsMap.size}`);

        // 然后处理未来课程数据
        futureCourseData.forEach(course => {
          const studentName = course.student;

          if (studentName) {
            // 查找该学员的所有课程类型记录，将课程信息添加到每一种类型中
            for (const [key, student] of studentsMap.entries()) {
              // 如果该记录的学员姓名匹配
              if (student.name === studentName) {
                // 记录该学生的所有未来课程
                student.upcomingCourses.push({
                  teacher: course.teacher,
                  date: course.class_date,
                  startTime: course.class_start_time,
                  endTime: course.class_end_time
                });

                // 90天内课程总数
                student.next90DaysClasses++;

                // 最近一节未来课（如果还没有设置的话）
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

        // 然后处理历史课程数据
        pastCourseData.forEach(course => {
          const studentName = course.student;

          if (studentName) {
            // 查找该学员的所有课程类型记录，将历史课程信息添加到每一种类型中
            for (const [key, student] of studentsMap.entries()) {
              // 如果该记录的学员姓名匹配
              if (student.name === studentName) {
                // 最近一节历史课（如果还没有设置的话）- 由于数据已按日期倒序排列，第一个就是最近的
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

        // 4. 计算每个学员的总计数据（用于排序）
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

        // 5. 转换为数组，添加总计信息并排序
        const students = Array.from(studentsMap.values())
          .filter(student => student.name) // 过滤掉没有姓名的记录
          .map(student => {
            // 为每个学员记录添加总计信息（用于排序）
            const totals = studentTotalsMap.get(student.name);
            return {
              ...student,
              // 重新计算未来90天未排课时数 = 剩余课时 - 未来90天上课次数
              unscheduledClasses: Math.max(0, (student.remainingClasses || 0) - (student.next90DaysClasses || 0)),
              _totalRemainingClasses: totals.totalRemainingClasses,
              _totalScheduledClasses: totals.totalScheduledClasses,
              _totalNext30DaysClasses: totals.totalNext30DaysClasses
            };
          })
          .sort((a, b) => {
            // 按总剩余课时从少到多排序（优先显示课时不足的学生）
            if (a._totalRemainingClasses !== b._totalRemainingClasses) {
              return a._totalRemainingClasses - b._totalRemainingClasses;
            }
            return (a.name || '').localeCompare(b.name || '', 'zh-CN');
          });

        // 6. 计算分类统计数据
        // 计算未来90天已排课学员数（已排课时数>0的学员数）- 按学员名称去重
        const studentsWithUpcomingClassesSet = new Set();
        students.forEach(student => {
          if ((student.next90DaysClasses || 0) > 0 && student.name) {
            studentsWithUpcomingClassesSet.add(student.name);
          }
        });
        const studentsWithUpcomingClasses = studentsWithUpcomingClassesSet.size;

        // 计算未来90天上课次数为0的学员数 - 按学员名称去重
        const studentsWithZeroUpcomingClassesSet = new Set();
        students.forEach(student => {
          if ((student.remainingClasses || 0) > 0 && // 有剩余课时
              student.name && // 有姓名
              (student.next90DaysClasses || 0) === 0) { // 未来90天已排课时数为0
            studentsWithZeroUpcomingClassesSet.add(student.name);
          }
        });
        const studentsWithZeroUpcomingClasses = studentsWithZeroUpcomingClassesSet.size;

        // 删除了未来14天未排课学生统计

        // 计算排课数<=4的学员数：统一按未来90天已排课时数统计，仅统计菲教学员
        const studentsWithLowBookings = new Set();
        students.forEach(student => {
          if (student.courseType === '菲教' &&
              (student.remainingClasses || 0) > 0 &&
              student.name) {
            const next90DaysClasses = student.next90DaysClasses || 0;
            if (next90DaysClasses <= 4) {
              studentsWithLowBookings.add(student.name);
            }
          }
        });

        const lowBookingStudents = studentsWithLowBookings.size;

        // 调试日志
        console.log(`📊 排课数统计调试:`);
        console.log(`   - 排课数<=4的学员数: ${lowBookingStudents}`);
        // 显示前几个排课数<=4学员的详细信息
        const lowBookingStudentsList = Array.from(studentsWithLowBookings).slice(0, 3);
        lowBookingStudentsList.forEach(studentName => {
          const studentInfo = students.find(s => s.name === studentName);
          if (studentInfo) {
            console.log(`     ${studentName}: 剩余${studentInfo.remainingClasses}课时, 未来90天已排${studentInfo.next90DaysClasses}课时`);
          }
        });
        console.log(`📊 总剩余课时统计调试:`);
        console.log(`   - 原始数据条数: ${allCardData.length}`);
        console.log(`   - 菲教剩余课时: ${allCardData.filter(card => card.courseType === '菲教').reduce((sum, card) => sum + (card.remainingClasses || 0), 0)}`);
        console.log(`   - 欧教剩余课时: ${allCardData.filter(card => card.courseType === '欧教').reduce((sum, card) => sum + (card.remainingClasses || 0), 0)}`);
        console.log(`   - 一对多剩余课时: ${allCardData.filter(card => card.courseType === '一对多').reduce((sum, card) => sum + (card.remainingClasses || 0), 0)}`);
        console.log(`📊 未来90天课时统计调试:`);
        console.log(`   - 菲教课时数: ${futureCourseData.filter(course => course.teacher_type === '菲').reduce((sum, course) => sum + (course.time_num || 0), 0)}`);
        console.log(`   - 欧教课时数: ${futureCourseData.filter(course => course.teacher_type === '欧').reduce((sum, course) => sum + (course.time_num || 0), 0)}`);
        console.log(`   - 未知类型课时数: ${futureCourseData.filter(course => course.teacher_type === '未知').reduce((sum, course) => sum + (course.time_num || 0), 0)}`);
        console.log(`   - 总课时数: ${futureCourseData.reduce((sum, course) => sum + (course.time_num || 0), 0)}`);

        const stats = {
          totalStudents: studentsWithUpcomingClasses,
          // 总剩余课时数：直接从数据库原始数据统计，不受过滤影响
          totalClasses: allCardData.reduce((sum, card) => sum + (card.remainingClasses || 0), 0),
          scheduledClasses: students.reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
          // 未来90天课时数：time_num字段之和
          upcomingClasses: futureCourseData.reduce((sum, course) => sum + (course.time_num || 0), 0),
          lowBookingStudents: Math.max(0, lowBookingStudents),
          // 按课程类型分组统计
          byType: {
            菲教: {
              // 菲教总剩余课时：从原始数据统计
              totalClasses: allCardData.filter(card => card.courseType === '菲教').reduce((sum, card) => sum + (card.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '菲教').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              // 菲教未来90天课时数：根据teacher_type='菲'统计time_num
              upcomingClasses: futureCourseData
                .filter(course => course.teacher_type === '菲')
                .reduce((sum, course) => sum + (course.time_num || 0), 0)
            },
            欧教: {
              // 欧教总剩余课时：从原始数据统计
              totalClasses: allCardData.filter(card => card.courseType === '欧教').reduce((sum, card) => sum + (card.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '欧教').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              // 欧教未来90天课时数：根据teacher_type='欧'统计time_num
              upcomingClasses: futureCourseData
                .filter(course => course.teacher_type === '欧')
                .reduce((sum, course) => sum + (course.time_num || 0), 0)
            },
            一对多: {
              // 一对多总剩余课时：从原始数据统计
              totalClasses: allCardData.filter(card => card.courseType === '一对多').reduce((sum, card) => sum + (card.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '一对多').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              // 一对多未来90天课时数：通过学员课程类型匹配统计time_num
              upcomingClasses: futureCourseData
                .filter(course => students.some(s => s.name === course.student && s.courseType === '一对多'))
                .reduce((sum, course) => sum + (course.time_num || 0), 0)
            }
          }
        };

        console.log(`📊 统计数据: 学员${stats.totalStudents}人, 总课时${stats.totalClasses}, 已排${stats.scheduledClasses}, 90天内${stats.upcomingClasses}`);

        // 6.5. 识别有剩余课时但未来没有排课的学员（标红警告）
        // 获取未来有课的学员集合
        const studentsWithFutureClasses = new Set();
        futureCourseData.forEach(course => {
          if (course.student) {
            studentsWithFutureClasses.add(course.student);
          }
        });

        // 遍历所有学员，标记风险学员：有剩余课时但未来没有排课
        let riskStudentCount = 0;
        students.forEach(student => {
          const hasRemainingClasses = (student.remainingClasses || 0) > 0;
          const hasNoFutureClasses = !studentsWithFutureClasses.has(student.name);

          if (hasRemainingClasses && hasNoFutureClasses) {
            student.isRiskStudent = true;
            riskStudentCount++;
          }
        });

        console.log(`🚨 风险学员统计: 有剩余课时但未来无排课的学员 ${riskStudentCount} 人`);

        // 7. 清理临时数据
        students.forEach(student => {
          delete student.upcomingCourses; // 移除临时数组
          delete student._totalRemainingClasses; // 移除排序用的临时总计
          delete student._totalScheduledClasses;
          delete student._totalNext30DaysClasses;
        });

        res.json({
          success: true,
          stats,
          students
        });

      } catch (error) {
        console.error('❌ API错误:', error);
        res.status(500).json({
          success: false,
          message: `数据获取失败: ${error.message}`,
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

    // API接口：获取老师列表
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
        console.log(`👨‍🏫 获取老师列表 (${startDate} ~ ${endDate})...`);

        // 查询指定日期范围内的所有老师
        const [teachersData] = await connection.execute(`
          SELECT DISTINCT teacher
          FROM yuekebao_classtime
          WHERE class_date >= ? AND class_date <= ?
            AND teacher IS NOT NULL AND teacher != ''
          ORDER BY teacher
        `, [startDate, endDate]);

        const teachers = teachersData.map(row => row.teacher);

        console.log(`👨‍🏫 找到 ${teachers.length} 位老师: ${teachers.join(', ')}`);

        res.json({
          success: true,
          teachers
        });

      } catch (error) {
        console.error('❌ 获取老师列表API错误:', error);
        res.status(500).json({
          success: false,
          message: `获取老师列表失败: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // ⭐ 获取老师出勤状态（迟到/旷课）辅助函数
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
        throw new Error(`日期格式无效：startDate=${startDate}, endDate=${endDate}`);
      }

      if (!teacherNames || teacherNames.length === 0) return {};

      // 通过教师名查找UID
      const [teacherInfo] = await feifeiConnection.execute(
        `SELECT uid, name FROM base_user_teacher
         WHERE (isdel IS NULL OR isdel = 0) AND name IN (${teacherNames.map(() => '?').join(',')})`,
        teacherNames
      );

      if (teacherInfo.length === 0) return {};

      const teacherUids = teacherInfo.map(t => t.uid);

      // 查询feifei课节数据（包含老师进入时间、学生进入时间、签到状态）
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

      // 按教师分组计算迟到/旷课
      const attendanceByTeacher = {};

      for (const session of sessions) {
        const teacherName = session.teacherName;
        if (!attendanceByTeacher[teacherName]) {
          attendanceByTeacher[teacherName] = { lateRecords: [], absentRecords: [], unsignedRecords: [] };
        }

        // 规则：学生未进入教室则不判定
        if (!session.studentEnterTime) continue;

        const studentName = session.studentName || '未知学生';
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

        // 兜底：若未能按老师+学生+日期匹配，再退回原有的老师+时间校验
        if (resolvedStartTimestamp === session.classBtime) {
          const allowedClassTimes = yuekebaoClassKeysByTeacher[teacherName];
          if (!allowedClassTimes || !allowedClassTimes.has(classTimeStr)) {
            continue;
          }
        }

        // 未签到记录（与迟到/旷课并列展示）
        if (Number(session.isPresent) !== 1) {
          attendanceByTeacher[teacherName].unsignedRecords.push({
            classTime: classTimeStr,
            studentName,
            reason: '未签到'
          });
        }

        if (!session.teacherjongTime) {
          // 老师未进入 → 旷课
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
        // “提前1分钟”按分钟粒度判定，避免 classBtime 含秒导致 09:59 被误判为未提前1分钟
        const classStartMinuteMs = Math.floor(classStartMs / 60000) * 60000;
        const teacherEntryMinuteMs = Math.floor(teacherEntryMs / 60000) * 60000;
        const oneMinBefore = classStartMinuteMs - 60 * 1000;
        const fiveMinAfter = classStartMs + 5 * 60 * 1000;
        const sameMinuteAsClassStart = teacherEntryMinuteMs === classStartMinuteMs;

        if (teacherEntryMs > fiveMinAfter) {
          // 超过5分钟 → 旷课
          const lateMinutes = Math.round((teacherEntryMs - classStartMs) / 60000);
          const entryTimeStr = formatShanghaiHourMinute(teacherEntryMs);
          attendanceByTeacher[teacherName].absentRecords.push({
            classTime: classTimeStr,
            studentName: studentName,
            reason: `老师${entryTimeStr}进入（迟到${lateMinutes}分钟）`
          });
        } else if (teacherEntryMinuteMs > oneMinBefore) {
          // 未提前1分钟 → 迟到
          const lateSeconds = Math.round((teacherEntryMs - classStartMs) / 1000);
          const entryTimeStr = formatShanghaiHourMinute(teacherEntryMs);
          let reasonDetail;
          if (lateSeconds > 0) {
            reasonDetail = `老师${entryTimeStr}进入（迟到${Math.ceil(lateSeconds / 60)}分钟）`;
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

    // ⭐ 智能判定试课成功/失败的辅助函数
    const determineTrialClassSuccess = async (connection, teacher, startDate, endDate) => {
      console.log(`🔍 开始判定 ${teacher} 的试课成功/失败...`);

      // 查询该老师在日期范围内的所有试课
      const [trialClasses] = await connection.execute(`
        SELECT
          student,
          class_date,
          class_start_time
        FROM yuekebao_classtime
        WHERE teacher = ?
          AND course_type = '试课'
          AND class_date >= ?
          AND class_date <= ?
        ORDER BY class_date ASC
      `, [teacher, startDate, endDate]);

      let successfulCount = 0;
      let failedCount = 0;
      const trialDetails = [];

      for (const trial of trialClasses) {
        // 查询该学生与该老师是否有后续正式课程
        const [followUpClasses] = await connection.execute(`
          SELECT COUNT(*) as count
          FROM yuekebao_classtime
          WHERE teacher = ?
            AND student = ?
            AND course_type != '试课'
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
            reason: `后续有${followUpClasses[0].count}节正式课`
          });
        } else {
          failedCount++;
          trialDetails.push({
            student: trial.student,
            date: trial.class_date,
            result: 'failed',
            reason: '无后续正式课'
          });
        }
      }

      console.log(`✅ ${teacher} 试课判定完成: 成功${successfulCount}节, 失败${failedCount}节`);

      return {
        successful: successfulCount,
        failed: failedCount,
        details: trialDetails
      };
    };

    // API接口：工资计算
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
        console.log(`💰 开始计算工资数据 (${startDate} ~ ${endDate})...`);

        // 查询指定日期范围内的课程数据，按老师和课程类型分组统计，包含老师薪资信息
        const [classData] = await connection.execute(`
          SELECT
            c.teacher,
            c.course_type as course_type_from_class,
            COALESCE(s.type, '未知') as teacher_type,
            COALESCE(s.salary_per_class_time, 0) as salary_per_class,
            COALESCE(s.salary_unit, 'rmb') as salary_unit,
            s.salary_account,
            SUM(
              CASE
                WHEN c.course_type LIKE '%50分钟%' THEN 2
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

        // 构建约课宝课节键（老师 + MM-DD HH:mm），用于约束出勤统计口径
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

        // 构建老师别名映射（用于工资出勤统计时匹配 ClassIn / 约课宝 老师名差异）
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

        // 将约课宝课节键扩展到老师别名（如 Anna Rose -> Anna）
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

        // 构建学生别名映射（用于工资出勤明细显示统一学生名）
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

        // 按老师汇总数据，区分普通课和试课
        const teacherSummary = {};
        let totalClasses = 0;

        for (const record of classData) {
          const { teacher, course_type_from_class, teacher_type, salary_per_class, salary_unit, salary_account, total_classes, class_details } = record;

          if (!teacherSummary[teacher]) {
            teacherSummary[teacher] = {
              teacher,
              normalClasses: 0,     // 普通课课时
              trialClasses: 0,      // 试课课时
              courseTypes: {},
              totalSalary: 0,
              salaryPerClass: parseFloat(salary_per_class) || 0,
              salaryUnit: salary_unit || 'rmb',
              salaryAccount: salary_account || '',
              teacherType: teacher_type || '未知'
            };
          }

          // 根据 course_type 分类累计
          const courseType = course_type_from_class || '未知';
          if (courseType === '试课') {
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

        // ⭐ 对每个有试课的老师执行智能判定
        console.log('🔍 开始执行智能判定...');
        const autoTrialResults = {};
        for (const teacher of Object.keys(teacherSummary)) {
          if (teacherSummary[teacher].trialClasses > 0) {
            const trialResult = await determineTrialClassSuccess(
              connection, teacher, startDate, endDate
            );
            autoTrialResults[teacher] = trialResult;
            console.log(`✅ ${teacher} 自动判定: 成功${trialResult.successful}节, 失败${trialResult.failed}节`);
          }
        }

        // 为每个老师计算工资（使用数据库中的个人课时费）
        let totalSalary = 0;
        let totalAdjustmentAmount = 0;
        let totalTrialCommission = 0;
        let totalRewardsAmount = 0;

        // 为每个老师计算工资
        for (const teacher in teacherSummary) {
          const data = teacherSummary[teacher];
          const dbSalaryPerClass = data.salaryPerClass; // 从数据库获取的课时费

          // 使用数据库中的课时费作为基础费率
          data.baseRate = dbSalaryPerClass;

          // 检查该老师是否有个人调整
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

          // ⭐ 计算普通课工资
          const normalSalary = data.normalClasses * finalRate;
          data.normalSalary = normalSalary;

          // ⭐ 计算试课佣金 - 三级优先级
          let trialCommission = 0;
          let trialSource = 'none'; // 'manual', 'auto', 'default', 'none'
          let successfulTrials = 0;
          let failedTrials = 0;

          if (trialData[teacher] && (trialData[teacher].successful > 0 || trialData[teacher].failed > 0)) {
            // 优先级1: 手动输入的试课数据（覆盖自动判定）
            successfulTrials = trialData[teacher].successful || 0;
            failedTrials = trialData[teacher].failed || 0;
            trialCommission = (successfulTrials * finalRate) + (failedTrials * finalRate * 0.5);
            trialSource = 'manual';
            console.log(`${teacher} 试课佣金 [手动]: 成功${successfulTrials}节×${finalRate} + 失败${failedTrials}节×${finalRate}×0.5 = ${trialCommission.toFixed(2)}`);
          } else if (autoTrialResults[teacher]) {
            // 优先级2: 自动判定的试课数据
            successfulTrials = autoTrialResults[teacher].successful;
            failedTrials = autoTrialResults[teacher].failed;
            trialCommission = (successfulTrials * finalRate) + (failedTrials * finalRate * 0.5);
            trialSource = 'auto';
            console.log(`${teacher} 试课佣金 [自动]: 成功${successfulTrials}节×${finalRate} + 失败${failedTrials}节×${finalRate}×0.5 = ${trialCommission.toFixed(2)}`);
          } else if (data.trialClasses > 0) {
            // 优先级3: 如果既没有手动输入也没有自动判定，默认所有试课按失败计算
            failedTrials = data.trialClasses;
            trialCommission = data.trialClasses * finalRate * 0.5;
            trialSource = 'default';
            console.log(`${teacher} 试课佣金 [默认失败]: ${failedTrials}节×${finalRate}×0.5 = ${trialCommission.toFixed(2)}`);
          }

          data.trialCommission = trialCommission;
          data.trialSource = trialSource;
          data.successfulTrials = successfulTrials;
          data.failedTrials = failedTrials;
          data.autoTrialData = autoTrialResults[teacher] || null;

          // ⭐ 总课时工资 = 普通课工资 + 试课佣金
          data.totalSalary = normalSalary + trialCommission;

          // 计算奖惩金额
          let rewardsAmount = 0;
          if (rewardsData[teacher] && Array.isArray(rewardsData[teacher])) {
            for (const reward of rewardsData[teacher]) {
              if (reward.type === 'percentage') {
                // 百分比：基于基础工资计算
                rewardsAmount += data.totalSalary * (reward.value / 100);
              } else if (reward.type === 'absolute') {
                // 绝对值：直接加减
                rewardsAmount += reward.value;
              }
            }
            console.log(`${teacher} 奖惩金额: ${rewardsAmount.toFixed(2)} (${rewardsData[teacher].length}项)`);
          }
          data.rewardsAmount = rewardsAmount;

          // 老师的最终总工资 = 课时工资 + 奖惩金额
          data.finalTotalSalary = data.totalSalary + rewardsAmount;

          totalSalary += normalSalary;
          totalAdjustmentAmount += adjustmentAmount * (data.normalClasses + data.trialClasses);
          totalTrialCommission += trialCommission;
          totalRewardsAmount += rewardsAmount;
        }

        console.log(`💰 工资计算完成: 总课时${totalClasses}, 基础工资¥${totalSalary.toFixed(2)}, 试课佣金¥${totalTrialCommission.toFixed(2)}, 奖惩金额¥${totalRewardsAmount.toFixed(2)}`);

        // 获取所有老师的出勤状态（迟到/旷课）
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
          console.log(`📊 出勤数据获取完成: ${Object.keys(attendanceData).length} 位老师有记录`);
        } catch (err) {
          console.error('⚠️ 获取出勤数据失败（不影响工资计算）:', err.message);
        }

        // 将 ClassIn 老师名（可能是别名）归并到约课宝老师主名，避免工资页显示“全部签到”
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

        // 将出勤数据附加到每位老师的数据中
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
            totalSalary: totalSalary + totalTrialCommission + totalRewardsAmount, // 包含所有金额的总工资
            baseSalary: totalSalary, // 基础课时工资
            totalTrialCommission, // 试课佣金总计
            totalRewardsAmount, // 奖惩金额总计
            hasIndividualAdjustments: Object.keys(teacherAdjustments).length > 0,
            hasTrialData: Object.keys(trialData).length > 0,
            hasRewardsData: Object.keys(rewardsData).length > 0,
            usesIndividualRates: true // 标识使用数据库中的个人课时费
          },
          teachers: teachersResult
        });

      } catch (error) {
        console.error('❌ 工资计算API错误:', error);
        res.status(500).json({
          success: false,
          message: `工资计算失败: ${error.message}`
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

    // API接口：数据刷新
    this.app.post('/api/refresh-data', async (req, res) => {
      try {
        console.log('🔄 开始数据刷新...');

        // 调用现有的数据抓取函数
        const result = await this.scrapeYuekebaoCourses({
          email: "3kkg7a7k4d66@qq.com",
          password: "flyegg",
          headless: true,
          timeout: 30000
        });

        if (result.isError) {
          throw new Error(result.content[0].text);
        }

        console.log('✅ 数据刷新完成');
        res.json({
          success: true,
          message: '数据刷新成功',
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ 数据刷新失败:', error.message);
        res.status(500).json({
          success: false,
          message: `数据刷新失败: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    });

    // API接口：获取最后刷新时间
    this.app.get('/api/last-refresh-time', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('📊 查询最后刷新时间...');

        // 查询最小的 create_time 作为最后刷新时间
        const [result] = await connection.execute(`
          SELECT MIN(create_time) as last_refresh
          FROM yuekebao_classtime
          WHERE create_time IS NOT NULL
        `);

        // 查询数据的日期范围
        const [dateRange] = await connection.execute(`
          SELECT MIN(class_date) as min_date, MAX(class_date) as max_date
          FROM yuekebao_classtime
        `);

        const lastRefresh = result[0]?.last_refresh;
        const minDate = dateRange[0]?.min_date;
        const maxDate = dateRange[0]?.max_date;

        // 格式化日期
        const formatDate = (d) => {
          if (!d) return null;
          if (d instanceof Date) {
            return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
          }
          const dateStr = String(d).split('T')[0].split(' ')[0];
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            return `${parts[1]}-${parts[2]}`;
          }
          return dateStr;
        };

        if (!lastRefresh) {
          return res.json({
            success: true,
            lastRefreshTime: null,
            dateRange: null,
            message: '暂无数据'
          });
        }

        console.log(`✅ 最后刷新时间: ${lastRefresh}, 数据范围: ${minDate} ~ ${maxDate}`);
        res.json({
          success: true,
          lastRefreshTime: lastRefresh,
          dateRange: minDate && maxDate ? `${formatDate(minDate)} ~ ${formatDate(maxDate)}` : null,
          message: '获取成功'
        });

      } catch (error) {
        console.error('❌ 获取最后刷新时间失败:', error.message);
        res.status(500).json({
          success: false,
          message: `获取最后刷新时间失败: ${error.message}`,
          lastRefreshTime: null,
          dateRange: null
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：获取汇率配置
    this.app.get('/api/config', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('📊 开始获取汇率配置...');

        // 查询yuekebao_config表
        const [configRows] = await connection.execute(
          'SELECT config FROM yuekebao_config WHERE id = 1'
        );

        if (configRows.length === 0) {
          // 如果没有配置记录，创建默认配置
          const defaultConfig = JSON.stringify({
            cny_to_pesos: 7.65, // 1 CNY = 7.65 pesos
            dollars_exchange: 7.12,
            excluded_students: [], // 默认不排除任何学生
            hide_remaining_students: [], // 默认不隐藏任何学生的剩余课时
            auto_feedback_prompt: defaultAutoFeedbackPrompt
          });

          await connection.execute(
            'INSERT INTO yuekebao_config (id, config) VALUES (1, ?)',
            [defaultConfig]
          );

          console.log('✅ 创建默认汇率配置成功');
          res.json({
            success: true,
            config: {
              cny_to_pesos: 7.65,
              dollars_exchange: 7.12,
              excluded_students: [],
              hide_remaining_students: [],
              auto_feedback_prompt: defaultAutoFeedbackPrompt
            },
            message: '获取成功（使用默认配置）'
          });
        } else {
          const config = JSON.parse(configRows[0].config);
          // 确保字段存在
          if (!config.excluded_students) {
            config.excluded_students = [];
          }
          if (!config.hide_remaining_students) {
            config.hide_remaining_students = [];
          }
          if (!config.auto_feedback_prompt) {
            config.auto_feedback_prompt = defaultAutoFeedbackPrompt;
          }
          console.log('✅ 汇率配置获取成功:', config);
          res.json({
            success: true,
            config: config,
            message: '获取成功'
          });
        }

      } catch (error) {
        console.error('❌ 获取汇率配置失败:', error.message);
        res.status(500).json({
          success: false,
          message: `获取汇率配置失败: ${error.message}`,
          config: null
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：获取老师课时统计
    this.app.get('/api/teacher-stats', async (req, res) => {
      let connection;

      try {
        const { startDate, endDate, groupBy } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: '请提供开始和结束日期'
          });
        }

        connection = await getDbConnection();
        console.log(`📊 查询老师课时统计: ${startDate} 至 ${endDate}, 分组方式: ${groupBy}`);

        // 查询课时数据
        const [rows] = await connection.execute(`
          SELECT teacher, class_date, SUM(time_num) as class_count
          FROM yuekebao_classtime
          WHERE class_date >= ? AND class_date <= ?
          GROUP BY teacher, class_date
          ORDER BY ${groupBy === 'date' ? 'class_date, teacher' : 'teacher, class_date'}
        `, [startDate, endDate]);

        let data = [];

        // 辅助函数：格式化日期
        const formatDate = (dateValue) => {
          if (dateValue instanceof Date) {
            return dateValue.toISOString().split('T')[0];
          }
          if (typeof dateValue === 'string') {
            return dateValue.split('T')[0].split(' ')[0];
          }
          return String(dateValue);
        };

        if (groupBy === 'teacher') {
          // 按老师分组
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
          // 按日期分组
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

        console.log(`✅ 查询成功，返回 ${data.length} 条记录`);

        res.json({
          success: true,
          data: data
        });

      } catch (error) {
        console.error('❌ 查询老师课时统计失败:', error);
        res.status(500).json({
          success: false,
          message: `查询失败: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：保存汇率配置
    this.app.post('/api/config', async (req, res) => {
      let connection;

      try {
        const { cny_to_pesos, dollars_exchange, excluded_students, hide_remaining_students, auto_feedback_prompt, auto_feedback_schema } = req.body;

        // 验证参数
        if (!cny_to_pesos || !dollars_exchange) {
          return res.status(400).json({
            success: false,
            message: '请提供完整的汇率配置'
          });
        }

        if (cny_to_pesos <= 0 || dollars_exchange <= 0) {
          return res.status(400).json({
            success: false,
            message: '汇率必须大于0'
          });
        }

        // 验证excluded_students是数组
        if (excluded_students !== undefined && !Array.isArray(excluded_students)) {
          return res.status(400).json({
            success: false,
            message: '排除学生列表必须是数组'
          });
        }

        // 验证hide_remaining_students是数组
        if (hide_remaining_students !== undefined && !Array.isArray(hide_remaining_students)) {
          return res.status(400).json({
            success: false,
            message: '隐藏剩余课时学生列表必须是数组'
          });
        }

        connection = await getDbConnection();
        console.log('💾 开始保存汇率配置...', req.body);

        // 创建yuekebao_config表（如果不存在）
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS yuekebao_config (
            id INT PRIMARY KEY,
            config JSON NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // 确保config列可以存储大量数据（兼容旧表结构）
        await connection.execute(`
          ALTER TABLE yuekebao_config MODIFY COLUMN config LONGTEXT NOT NULL
        `);

        // 先读取现有配置，合并更新（避免丢失未在请求中的字段）
        let existingConfig = {};
        const [existingRows] = await connection.execute(
          'SELECT config FROM yuekebao_config WHERE id = 1'
        );
        if (existingRows.length > 0) {
          try { existingConfig = JSON.parse(existingRows[0].config); } catch (e) { /* ignore */ }
        }

        // 合并配置：保留现有字段，用请求中的字段覆盖
        const configData = JSON.stringify({
          ...existingConfig,
          cny_to_pesos: parseFloat(cny_to_pesos),
          dollars_exchange: parseFloat(dollars_exchange),
          excluded_students: excluded_students || [],
          hide_remaining_students: hide_remaining_students || [],
          auto_feedback_prompt: auto_feedback_prompt || defaultAutoFeedbackPrompt,
          auto_feedback_schema: auto_feedback_schema !== undefined ? auto_feedback_schema : (existingConfig.auto_feedback_schema || null)
        });

        await connection.execute(
          'INSERT INTO yuekebao_config (id, config) VALUES (1, ?) ON DUPLICATE KEY UPDATE config = VALUES(config)',
          [configData]
        );

        console.log('✅ 汇率配置保存成功');
        res.json({
          success: true,
          message: '汇率配置保存成功'
        });

      } catch (error) {
        console.error('❌ 保存汇率配置失败:', error.message);
        res.status(500).json({
          success: false,
          message: `保存汇率配置失败: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：获取老师列表
    this.app.get('/api/teachers', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('👨‍🏫 开始获取老师列表...');

        const [teachers] = await connection.execute(
          `SELECT teacher_name, type, salary_per_class_time, salary_unit, salary_account, aliases
           FROM yuekebao_teacher_salary
           ORDER BY type, teacher_name`
        );

        // 解析 aliases JSON
        teachers.forEach(t => {
          try {
            t.aliases = t.aliases ? JSON.parse(t.aliases) : [];
          } catch (e) {
            t.aliases = [];
          }
        });

        console.log(`✅ 获取老师列表成功: ${teachers.length} 位老师`);
        res.json({
          success: true,
          teachers: teachers,
          count: teachers.length
        });

      } catch (error) {
        console.error('❌ 获取老师列表失败:', error.message);
        res.status(500).json({
          success: false,
          message: `获取老师列表失败: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：添加老师
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
        console.log('➕ 开始添加老师:', teacher_name);

        // 检查是否已存在
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

        console.log('✅ 添加老师成功:', teacher_name);
        res.json({
          success: true,
          message: '添加老师成功'
        });

      } catch (error) {
        console.error('❌ 添加老师失败:', error.message);
        res.status(500).json({
          success: false,
          message: `添加老师失败: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：更新老师（使用teacher_name作为标识）
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
        console.log('✏️ 开始更新老师:', originalName, '->', teacher_name);

        // 检查是否存在
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

        // 如果改名，检查新名字是否已被使用
        if (teacher_name !== originalName) {
          const [duplicate] = await connection.execute(
            'SELECT teacher_name FROM yuekebao_teacher_salary WHERE teacher_name = ?',
            [teacher_name]
          );

          if (duplicate.length > 0) {
            return res.status(400).json({
              success: false,
              message: '该老师名字已被使用'
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

        console.log('✅ 更新老师成功:', teacher_name);
        res.json({
          success: true,
          message: '更新老师成功'
        });

      } catch (error) {
        console.error('❌ 更新老师失败:', error.message);
        res.status(500).json({
          success: false,
          message: `更新老师失败: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：删除老师（使用teacher_name作为标识）
    this.app.delete('/api/teachers/:name', async (req, res) => {
      let connection;

      try {
        const teacherName = decodeURIComponent(req.params.name);

        connection = await getDbConnection();
        console.log('🗑️ 开始删除老师:', teacherName);

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

        console.log('✅ 删除老师成功');
        res.json({
          success: true,
          message: '删除老师成功'
        });

      } catch (error) {
        console.error('❌ 删除老师失败:', error.message);
        res.status(500).json({
          success: false,
          message: `删除老师失败: ${error.message}`
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：获取所有学生名单
    this.app.get('/api/students', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('📋 开始获取所有学生名单...');

        // 从会员卡表获取所有不重复的学生名
        const [students] = await connection.execute(
          `SELECT DISTINCT student FROM yuekebao_student_cardnum
           WHERE student IS NOT NULL AND student != ''
           ORDER BY student`
        );

        const studentNames = students.map(row => row.student);
        console.log(`✅ 获取学生名单成功: ${studentNames.length} 位学生`);

        res.json({
          success: true,
          students: studentNames,
          count: studentNames.length
        });

      } catch (error) {
        console.error('❌ 获取学生名单失败:', error.message);
        res.status(500).json({
          success: false,
          message: `获取学生名单失败: ${error.message}`,
          students: []
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // API接口：获取学生别名配置列表
    this.app.get('/api/student-aliases', async (req, res) => {
      let connection;
      try {
        connection = await getDbConnection();
        const [rows] = await connection.execute(
          `SELECT student_name, aliases, course_requirements, tags, notes FROM yuekebao_student_aliases ORDER BY student_name`
        );

        // 解析 JSON 字段
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
        console.error('获取学生别名列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // API接口：添加或更新学生别名
    this.app.post('/api/student-aliases', async (req, res) => {
      let connection;
      try {
        const { student_name, aliases, course_requirements, tags, notes } = req.body;

        if (!student_name) {
          return res.status(400).json({ success: false, error: '学生名字不能为空' });
        }

        connection = await getDbConnection();
        const aliasesJson = aliases && aliases.length > 0 ? JSON.stringify(aliases) : null;
        const tagsJson = tags && tags.length > 0 ? JSON.stringify(tags) : null;

        // 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
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

        res.json({ success: true, message: '保存成功' });
      } catch (error) {
        console.error('保存学生别名失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // API接口：获取学生排课数据
    this.app.get('/api/student-schedule/:studentName', async (req, res) => {
      let connection;

      try {
        const { studentName } = req.params;
        connection = await getDbConnection();
        console.log(`📅 开始获取学生排课数据: ${studentName}`);

        // 查询该学生的所有排课记录（当前日期往后2个月）
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
          [studentName, futureDate.toISOString().split('T')[0]]
        );

        console.log(`✅ 获取学生排课数据成功: ${scheduleData.length} 条记录`);
        res.json({
          success: true,
          studentName: studentName,
          schedules: scheduleData,
          message: '获取成功'
        });

      } catch (error) {
        console.error('❌ 获取学生排课数据失败:', error.message);
        res.status(500).json({
          success: false,
          message: `获取学生排课数据失败: ${error.message}`,
          schedules: []
        });
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    // 静态资源服务 - 优先级最高
    this.app.use('/css', express.static(path.resolve(this.__dirname, '..', 'public', 'css')));
    this.app.use('/js', express.static(path.resolve(this.__dirname, '..', 'public', 'js')));
    this.app.use('/checkin', express.static(path.resolve(this.__dirname, '..', 'public', 'checkin', 'dist')));

    // 代理签到 H5 使用的 /wechat 接口到 feifei-backend
    this.app.use('/wechat', forwardWechatRequest);

    // 提供主页面 - 重定向到学员数据
    this.app.get('/', (req, res) => {
      res.redirect('/students');
    });

    // 教师签到 H5（本地集成版）
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

    // 保持原签到链接不变：/signin/:uid
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

    // 约课宝页面路由
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

    // FeiFei 页面路由
    this.app.get('/feifei/teachers', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'feifei-teachers.html'));
    });
    this.app.get('/feifei/sessions', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'feifei-sessions.html'));
    });
    this.app.get('/feifei/labels', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'public', 'pages', 'feifei-labels.html'));
    });

    // 兼容旧的 dashboard.html（保留作为备份）
    this.app.get('/dashboard', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'dashboard.html'));
    });

    // 健康检查接口
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // 触发远程抓取接口（调用本地抓取服务）
    this.app.post('/api/trigger-remote-scrape', async (req, res) => {
      const REMOTE_SCRAPER_URL = process.env.REMOTE_SCRAPER_URL || 'https://s4.s100.vip:3868/trigger-scrape';

      try {
        console.log(`🔄 触发远程抓取: ${REMOTE_SCRAPER_URL}`);

        const response = await fetch(REMOTE_SCRAPER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // 忽略 SSL 证书验证（如果是自签名证书）
          // Node.js fetch 不支持直接设置，需要通过环境变量 NODE_TLS_REJECT_UNAUTHORIZED=0
        });

        const data = await response.json();

        console.log(`✅ 远程抓取触发成功:`, data);

        res.json({
          success: true,
          message: '远程抓取任务已触发',
          remoteResponse: data,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ 触发远程抓取失败:', error.message);

        res.status(500).json({
          success: false,
          error: '触发远程抓取失败',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // GET 方式也支持触发（方便浏览器访问测试）
    this.app.get('/api/trigger-remote-scrape', async (req, res) => {
      const REMOTE_SCRAPER_URL = process.env.REMOTE_SCRAPER_URL || 'https://s4.s100.vip:3868/trigger-scrape';

      try {
        console.log(`🔄 触发远程抓取 (GET): ${REMOTE_SCRAPER_URL}`);

        const response = await fetch(REMOTE_SCRAPER_URL, {
          method: 'GET'
        });

        const data = await response.json();

        console.log(`✅ 远程抓取触发成功:`, data);

        res.json({
          success: true,
          message: '远程抓取任务已触发',
          remoteResponse: data,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('❌ 触发远程抓取失败:', error.message);

        res.status(500).json({
          success: false,
          error: '触发远程抓取失败',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // ========================================
    // === feifei 标签管理 API ===
    // ========================================

    // 获取标签列表
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
        console.error('获取标签列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 新增标签
    this.app.post('/api/feifei/labels', async (req, res) => {
      let connection;
      try {
        const { name, parentId, orderNum, remark } = req.body;
        if (!name) {
          return res.status(400).json({ success: false, error: '标签名称不能为空' });
        }
        connection = await getFeifeiDbConnection();
        const [result] = await connection.execute(
          'INSERT INTO base_user_label (name, parentId, orderNum, remark) VALUES (?, ?, ?, ?)',
          [name, parentId || null, orderNum || 0, remark || null]
        );
        res.json({ success: true, id: result.insertId });
      } catch (error) {
        console.error('新增标签失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 更新标签
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
        console.error('更新标签失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 删除标签
    this.app.delete('/api/feifei/labels/:id', async (req, res) => {
      let connection;
      try {
        const { id } = req.params;
        connection = await getFeifeiDbConnection();
        // 检查是否有子标签
        const [children] = await connection.execute(
          'SELECT COUNT(*) as count FROM base_user_label WHERE parentId = ?', [id]
        );
        if (children[0].count > 0) {
          return res.status(400).json({ success: false, error: '该标签下有子标签，无法删除' });
        }
        await connection.execute('DELETE FROM base_user_label WHERE id = ?', [id]);
        res.json({ success: true });
      } catch (error) {
        console.error('删除标签失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // ========================================
    // === feifei 教师管理 API ===
    // ========================================

    // 获取教师可选标签列表（parentId = '6' 的标签）
    this.app.get('/api/feifei/teacher-label-options', async (req, res) => {
      let connection;
      try {
        connection = await getFeifeiDbConnection();
        const [rows] = await connection.execute(
          `SELECT id, name FROM base_user_label WHERE parentId = '6' ORDER BY orderNum, id`
        );
        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('获取教师标签选项失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 获取教师列表（含近30日和未来30日课节数统计）
    this.app.get('/api/feifei/teachers', async (req, res) => {
      let connection;
      try {
        const { keyWord, hasClass, description, labelName } = req.query;
        connection = await getFeifeiDbConnection();

        // 计算时间范围
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

        // 如果筛选"未来30日有课"
        if (hasClass === '1') {
          teachers = teachers.filter(t => t.new30 > 0);
        }

        res.json({ success: true, data: teachers });
      } catch (error) {
        console.error('获取教师列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 更新教师
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
        console.error('更新教师失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 获取教师签到配置
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
        console.error('获取签到配置失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 保存教师签到配置
    this.app.post('/api/feifei/teachers/:uid/signin-config', async (req, res) => {
      let connection;
      try {
        const { uid } = req.params;
        const startInput = Number.parseInt(req.body?.signInStartTime, 10);
        const endInput = Number.parseInt(req.body?.signInEndTime, 10);
        const signInStartTime = Number.isFinite(startInput) ? Math.max(0, startInput) : 120;
        const signInEndTime = Number.isFinite(endInput) ? Math.max(0, endInput) : 0;
        if (signInEndTime > signInStartTime) {
          return res.status(400).json({ success: false, error: '签到结束时间需小于等于签到开始时间（均为课前分钟数）' });
        }
        connection = await getFeifeiDbConnection();

        // 检查是否已存在
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
        console.error('保存签到配置失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // ========================================
    // === feifei 课节管理 API ===
    // ========================================

    // 获取教师列表（用于课节管理的下拉选择）
    this.app.get('/api/feifei/class-sessions/teachers', async (req, res) => {
      let connection;
      try {
        connection = await getFeifeiDbConnection();

        // 直接从教师表获取所有未删除的教师
        const sql = `
          SELECT uid as teacherUid, name as teacherName
          FROM base_user_teacher
          WHERE (isdel IS NULL OR isdel = 0)
          ORDER BY createTime DESC
        `;

        const [rows] = await connection.execute(sql);
        res.json({ success: true, data: rows });
      } catch (error) {
        console.error('获取教师列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 获取课节列表（含学生信息）
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
        console.error('获取课节列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 获取课节列表（分页）- 用于课节管理列表展示
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
            console.warn('加载老师别名失败，跳过别名匹配:', e.message);
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
            console.warn('加载学生别名失败，跳过别名匹配:', e.message);
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

          // 二次回退：约课宝也无法修正时，检查老师和学生实际进入时间
          // 如果两人都进入了教室且老师在学生进入后10分钟内到达，说明课实际正常进行
          for (const row of absentRows) {
            if (getAttendanceStatusByStart(row, row.startTimestamp) !== 'absent') continue;
            if (!row.teacherjongTime || !row.studentEnterTime) continue;

            const teacherEntryMs = parseShanghaiDateTimeToMs(row.teacherjongTime);
            const studentEntryMs = parseShanghaiDateTimeToMs(row.studentEnterTime);
            if (!Number.isFinite(teacherEntryMs) || !Number.isFinite(studentEntryMs)) continue;

            const gapMs = teacherEntryMs - studentEntryMs;
            // 老师在学生之前进入，或在学生进入后10分钟内到达
            if (gapMs <= 10 * 60 * 1000) {
              row.classinStartTimestamp = row.classinStartTimestamp || row.startTimestamp;
              // 设置开课时间为老师进入后1分钟，使出勤判定为正常
              row.startTimestamp = Math.floor(teacherEntryMs / 1000) + 60;
              row.startTimestampSource = 'actualEntry';
            }
          }
        };

        // 构建 WHERE 条件
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

        // 查询总数
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

        // 查询数据
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
          console.warn('课节列表约课宝时间回退失败，继续返回原始 ClassIn 时间:', fallbackError.message);
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
        console.error('获取课节列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 手动触发自动反馈生成
    this.app.post('/api/feifei/auto-feedback', async (req, res) => {
      const { recordId, classId, studId } = req.body || {};

      if (!recordId && !classId) {
        return res.status(400).json({ success: false, message: '缺少 recordId 或 classId' });
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
            message: data?.message || '触发自动反馈失败',
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
          message: `触发自动反馈失败: ${error.message}`
        });
      }
    });

    // 查询自动反馈生成状态
    this.app.get('/api/feifei/auto-feedback/status', async (req, res) => {
      const { recordId } = req.query;

      if (!recordId) {
        return res.status(400).json({ success: false, message: '缺少 recordId' });
      }

      if (!feifeiBackendUrl) {
        return res.status(500).json({
          success: false,
          message: '未配置 FEIFEI_BACKEND_URL'
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
          message: `查询状态失败: ${error.message}`
        });
      }
    });

    // 获取学生近7节课记录
    this.app.get('/api/feifei/student-recent-sessions', async (req, res) => {
      let connection;
      try {
        const { studId } = req.query;

        if (!studId) {
          return res.status(400).json({ success: false, error: '缺少 studId 参数' });
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
        console.error('获取学生近期课节失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 获取课节对应的教材
    this.app.get('/api/feifei/textbooks-by-class', async (req, res) => {
      let connection;
      try {
        const { classId, courseId } = req.query;

        if (!classId || !courseId) {
          return res.status(400).json({ success: false, error: '缺少 classId 或 courseId 参数' });
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
        console.error('获取教材列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // API接口：获取老师课程安排对比数据（ClassIn vs 约课宝）
    // 支持多老师查询：teacherNames 参数可传入逗号分隔的多个老师名，或留空表示全部
    this.app.get('/api/teacher-schedule-compare', async (req, res) => {
      let connection;
      let feifeiConnection;
      try {
        const { teacherNames, startTime, endTime } = req.query;

        connection = await getDbConnection();
        feifeiConnection = await getFeifeiDbConnection();

        // 1. 从约课宝获取课程数据
        const startDate = new Date(startTime * 1000).toISOString().split('T')[0];
        const endDate = new Date(endTime * 1000).toISOString().split('T')[0];

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

        // 如果指定了老师，添加过滤条件
        if (teacherNames && teacherNames.trim()) {
          const teachers = teacherNames.split(',').map(t => t.trim()).filter(t => t);
          if (teachers.length > 0) {
            yuekebaoQuery += ` AND teacher IN (${teachers.map(() => '?').join(',')})`;
            yuekebaoParams.push(...teachers);
          }
        }
        yuekebaoQuery += ' ORDER BY teacher, class_date, class_start_time';

        const [yuekebaoData] = await connection.execute(yuekebaoQuery, yuekebaoParams);

        // 2. 从 ClassIn (feifei) 获取课程数据
        let classinData = [];

        // 获取相关老师的 UID
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

        // 3. 获取所有老师列表（用于下拉框）
        const [allTeachers] = await connection.execute(`
          SELECT DISTINCT teacher FROM yuekebao_classtime
          WHERE class_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
          ORDER BY teacher
        `);

        // 4. 获取老师别名映射
        const [teacherAliases] = await connection.execute(`
          SELECT teacher_name, aliases FROM yuekebao_teacher_salary WHERE aliases IS NOT NULL AND aliases != ''
        `);

        // 构建别名映射表：alias -> mainName
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

        // 5. 获取学生别名映射
        const [studentAliases] = await connection.execute(`
          SELECT student_name, aliases FROM yuekebao_student_aliases WHERE aliases IS NOT NULL AND aliases != ''
        `);

        // 构建学生别名映射表：alias -> mainName
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

        // 6. 返回数据
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
        console.error('获取老师课程对比数据失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
        if (feifeiConnection) await feifeiConnection.end();
      }
    });

    // ========================================
    // === feifei 教材管理 API ===
    // ========================================

    // 获取教材列表
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

        // 获取总数
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await connection.execute(countSql, params);
        const total = countResult[0].total;

        // 分页 - 使用字符串拼接，因为 mysql2 prepared statements 对 LIMIT 参数有限制
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
        console.error('获取教材列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 新增教材
    this.app.post('/api/feifei/textbooks', async (req, res) => {
      let connection;
      try {
        const { title, author, isbn, publisher, yearPublished, description, isAvailable } = req.body;
        if (!title) {
          return res.status(400).json({ success: false, error: '教材标题不能为空' });
        }
        connection = await getFeifeiDbConnection();
        const [result] = await connection.execute(
          `INSERT INTO base_user_textbook (title, author, isbn, publisher, yearPublished, description, isAvailable)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [title, author || null, isbn || null, publisher || null, yearPublished || null, description || null, isAvailable !== false ? 1 : 0]
        );
        res.json({ success: true, id: result.insertId });
      } catch (error) {
        console.error('新增教材失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 更新教材
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
        console.error('更新教材失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 删除教材
    this.app.delete('/api/feifei/textbooks/:id', async (req, res) => {
      let connection;
      try {
        const { id } = req.params;
        connection = await getFeifeiDbConnection();
        await connection.execute('DELETE FROM base_user_textbook WHERE id = ?', [id]);
        res.json({ success: true });
      } catch (error) {
        console.error('删除教材失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // ========================================
    // === 统一教师管理 API ===
    // ========================================

    // 统一教师列表 - 以 yuekebao_teacher_salary 为主数据源
    this.app.get('/api/unified-teachers', async (req, res) => {
      const { hasClass } = req.query;
      let connection;
      let feifeiConnection;
      try {
        connection = await getDbConnection();
        feifeiConnection = await getFeifeiDbConnection();

        // 1. 从主数据库获取老师列表
        const [teachers] = await connection.execute(
          `SELECT teacher_name, type, salary_per_class_time, salary_unit, salary_account
           FROM yuekebao_teacher_salary
           ORDER BY teacher_name`
        );

        // 2. 计算每个老师的课时数（从 yuekebao_classtime）
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const [classStats] = await connection.execute(
          `SELECT teacher,
                  SUM(CASE WHEN class_date >= ? AND class_date <= ? THEN time_num ELSE 0 END) as old30,
                  SUM(CASE WHEN class_date > ? AND class_date <= ? THEN time_num ELSE 0 END) as new30
           FROM yuekebao_classtime
           GROUP BY teacher`,
          [thirtyDaysAgo.toISOString().split('T')[0], now.toISOString().split('T')[0],
           now.toISOString().split('T')[0], thirtyDaysLater.toISOString().split('T')[0]]
        );

        // 3. 从 feifei 获取教师 uid（用于签到 URL）
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

        // 4. 合并数据
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

        // 5. 筛选未来30天有课
        if (hasClass === '1') {
          result = result.filter(t => t.new30 > 0);
        }

        res.json({ success: true, data: result });
      } catch (error) {
        console.error('获取统一教师列表失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
        if (feifeiConnection) await feifeiConnection.end();
      }
    });

    // 查询教师签到明细（用于签到管理页面点击行查看）
    this.app.get('/api/feifei/teachers/:uid/signin-records', async (req, res) => {
      let connection;
      try {
        const { uid } = req.params;
        const size = Math.min(Math.max(parseInt(req.query.size, 10) || 50, 1), 500);

        if (!uid) {
          return res.status(400).json({ success: false, error: '缺少教师 uid' });
        }

        connection = await getFeifeiDbConnection();

        const sql = `
          SELECT
            e.id as attendanceId,
            e.teacherUid,
            e.classId,
            e.courseId,
            COALESCE(NULLIF(s.studentName, ''), '未知学生') as studentName,
            COALESCE(NULLIF(b.className, ''), NULLIF(b.courseName, ''), CONCAT('课节#', e.classId)) as className,
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
        console.error('获取教师签到明细失败:', error);
        res.status(500).json({ success: false, error: error.message });
      } finally {
        if (connection) await connection.end();
      }
    });

    // 启动服务器
    return new Promise((resolve) => {
      let serverUrl = '';

      if (useHttps) {
        const sslConfig = this.generateSelfSignedCert();

        if (sslConfig) {
          // 使用HTTPS
          const httpsOptions = {
            key: readFileSync(sslConfig.keyPath),
            cert: readFileSync(sslConfig.certPath)
          };

          this.webServer = https.createServer(httpsOptions, this.app).listen(port, () => {
            serverUrl = `https://localhost:${port}`;
            console.log(`🚀 仪表板服务器启动成功！(HTTPS)`);
            console.log(`🌐 访问地址: ${serverUrl}`);
            console.log(`📊 API接口: ${serverUrl}/api/dashboard-data`);
            console.log(`🔒 使用自签名证书，浏览器可能会显示安全警告`);
            resolve();
          });
        } else {
          // 回退到HTTP
          this.webServer = this.app.listen(port, () => {
            serverUrl = `http://localhost:${port}`;
            console.log(`🚀 仪表板服务器启动成功！(HTTP回退)`);
            console.log(`🌐 访问地址: ${serverUrl}`);
            console.log(`📊 API接口: ${serverUrl}/api/dashboard-data`);
            resolve();
          });
        }
      } else {
        // 使用HTTP
        this.webServer = this.app.listen(port, () => {
          serverUrl = `http://localhost:${port}`;
          console.log(`🚀 仪表板服务器启动成功！(HTTP)`);
          console.log(`🌐 访问地址: ${serverUrl}`);
          console.log(`📊 API接口: ${serverUrl}/api/dashboard-data`);
          resolve();
        });
      }
    });
  }

  // 辅助函数：格式化日期
  formatDate(dateStr) {
    if (!dateStr) return '';

    try {
      const date = new Date(dateStr);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}-${day}`;
    } catch (error) {
      return dateStr;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Yuekebao Grabber MCP server running on stdio");
  }

  // 启动包含Web仪表板的完整服务
  async runWithDashboard(port = 3000, useHttps = true) {
    await this.startDashboard(port, useHttps);

    // 保持进程运行，等待服务器关闭信号
    process.on('SIGINT', () => {
      console.log('\n正在关闭服务器...');
      if (this.webServer) {
        this.webServer.close(() => {
          console.log('服务器已关闭');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

    // 保持进程运行 - 使用更简单的方法
    return new Promise(() => {
      // 这个promise永远不会resolve，保持进程运行
    });
  }
}

const server = new YuekebaoGrabberServer();
server.run().catch(console.error);
