#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium } from 'playwright';

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

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
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
                default: "flycatbbb@foxmail.com"
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
      email = "flycatbbb@foxmail.com",
      password = "flyegg",
      headless = false,
      timeout = 30000
    } = args;

    let browser;
    let context;
    let page;

    try {
      // Launch browser
      browser = await chromium.launch({
        headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      page = await context.newPage();
      page.setDefaultTimeout(timeout);

      console.log('Navigating to login page...');

      // Navigate to login page
      await page.goto('https://www.yuekebao.cn/admin/login.php', {
        waitUntil: 'networkidle',
        timeout
      });

      console.log('Filling in login form...');

      // Wait for login form elements
      await page.waitForSelector('input[name="email"]', { timeout: 10000 });
      await page.waitForSelector('input[name="password"]', { timeout: 10000 });

      // Fill in email and password
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);

      console.log('Submitting login form to trigger captcha...');

      // Submit the login form first to trigger captcha
      await page.click('#submit');

      console.log('Looking for slider captcha after submit...');

      // Wait for captcha modal to appear
      try {
        // Wait for the verification wrapper to appear
        await page.waitForSelector('#JQ_verify_wrap', { timeout: 8000 });
        console.log('Captcha triggered, looking for slider elements...');

        // Wait a bit more for captcha to fully load
        await page.waitForTimeout(2000);

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
              const slideDistance = baseDistance * 1.4; // 增加40%的距离
              console.log(`Base distance: ${baseDistance}px, Extended distance: ${slideDistance}px`);

              // Use human-like mouse movements instead of dragAndDrop
              const startX = btnBounds.x + btnBounds.width / 2;
              const startY = btnBounds.y + btnBounds.height / 2;
              const endX = btnBounds.x + slideDistance;
              const endY = startY;

              console.log(`Starting human-like drag from (${startX}, ${startY}) to (${endX}, ${endY})`);

              // Move to slider handle slowly
              await page.mouse.move(startX, startY, { steps: 10 });
              await page.waitForTimeout(300 + Math.random() * 200);

              // Start dragging
              await page.mouse.down();
              await page.waitForTimeout(100 + Math.random() * 100);

              // Drag with realistic human-like movement
              const totalSteps = 40 + Math.floor(Math.random() * 20);
              const deltaX = (endX - startX) / totalSteps;

              for (let i = 1; i <= totalSteps; i++) {
                const currentX = startX + deltaX * i;
                // Add slight random vertical movement to simulate human imperfection
                const currentY = startY + (Math.random() - 0.5) * 3;

                await page.mouse.move(currentX, currentY);

                // Add realistic delays - slower at start/end, faster in middle
                let delay;
                if (i <= 5 || i >= totalSteps - 5) {
                  delay = 60 + Math.random() * 40; // Slower at start/end
                } else {
                  delay = 30 + Math.random() * 20; // Faster in middle
                }

                await page.waitForTimeout(delay);
              }

              // Hold at end position briefly
              await page.waitForTimeout(200 + Math.random() * 150);

              // Release
              await page.mouse.up();

              console.log('Slider moved using human-like mouse movements, waiting for validation...');
              await page.waitForTimeout(3000);

              // Check if captcha was successful
              const successVisible = await page.isVisible('.sucMsg');
              if (successVisible) {
                console.log('Captcha solved successfully! ✓ 验证通过');
              } else {
                console.log('Captcha may still be processing...');
                await page.waitForTimeout(2000);

                // Check again
                const successVisible2 = await page.isVisible('.sucMsg');
                if (successVisible2) {
                  console.log('Captcha solved successfully! ✓ 验证通过');
                } else {
                  console.log('Captcha verification failed, may need manual intervention');
                }
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
      } catch (captchaError) {
        console.log('No captcha appeared or captcha handling failed:', captchaError.message);
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

      // Navigate to course management page
      console.log('Navigating to course management page...');
      await page.goto('https://www.yuekebao.cn/admin/course.php', {
        waitUntil: 'networkidle',
        timeout
      });

      console.log('Extracting course data...');

      // Wait for course content to load
      await page.waitForSelector('body', { timeout: 10000 });

      // Extract course data
      const courseData = await page.evaluate(() => {
        const title = document.title;
        const url = window.location.href;
        const timestamp = new Date().toISOString();

        // Get all course-related elements
        const courses = [];

        // Look for common course table/list selectors
        const courseRows = document.querySelectorAll('tr[data-id], .course-item, .course-row, tbody tr');

        courseRows.forEach((row, index) => {
          const cells = row.querySelectorAll('td, .course-cell');
          if (cells.length > 0) {
            const courseInfo = {
              index: index + 1,
              data: Array.from(cells).map(cell => cell.innerText.trim()).filter(text => text)
            };
            if (courseInfo.data.length > 0) {
              courses.push(courseInfo);
            }
          }
        });

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
          courses,
          jsonData,
          pageContent: pageContent.substring(0, 10000), // Limit content
          totalCourses: courses.length
        };
      });

      console.log(`Found ${courseData.totalCourses} courses`);

      return {
        content: [
          {
            type: "text",
            text: `# 约课宝课程管理数据抓取结果

## 基本信息
- **页面标题**: ${courseData.title}
- **页面URL**: ${courseData.url}
- **抓取时间**: ${courseData.timestamp}
- **课程总数**: ${courseData.totalCourses}

## 课程数据
${courseData.courses.length > 0 ?
  courseData.courses.map(course =>
    `### 课程 ${course.index}\n${course.data.map((item, i) => `- **字段${i + 1}**: ${item}`).join('\n')}`
  ).join('\n\n')
  : '未找到课程数据表格'}

## JSON数据
${courseData.jsonData ?
  '```json\n' + JSON.stringify(courseData.jsonData, null, 2) + '\n```'
  : '未找到JSON格式的课程数据'}

## 页面完整内容 (前10000字符)
\`\`\`
${courseData.pageContent}
\`\`\`
`
          }
        ]
      };

    } catch (error) {
      console.error('Error scraping yuekebao courses:', error);
      return {
        content: [
          {
            type: "text",
            text: `抓取约课宝课程数据时发生错误: ${error.message}

错误详情:
- 请确认登录凭据是否正确
- 请检查滑块验证码是否已正确完成
- 请确认课程管理页面是否可访问

建议设置 headless: false 来观察登录过程。`
          }
        ],
        isError: true
      };
    } finally {
      // Clean up - keep browser open for debugging if not headless
      if (headless) {
        if (page) await page.close();
        if (context) await context.close();
        if (browser) await browser.close();
      } else {
        console.log('Browser kept open for debugging (headless=false)');
      }
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Yuekebao Grabber MCP server running on stdio");
  }
}

const server = new YuekebaoGrabberServer();
server.run().catch(console.error);