#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium } from 'playwright';
import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import path from 'path';

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

              // Move to slider handle quickly
              await page.mouse.move(startX, startY, { steps: 5 });
              await page.waitForTimeout(150 + Math.random() * 100);

              // Start dragging
              await page.mouse.down();
              await page.waitForTimeout(50 + Math.random() * 50);

              // Drag with faster human-like movement
              const totalSteps = 20 + Math.floor(Math.random() * 10);
              const deltaX = (endX - startX) / totalSteps;

              for (let i = 1; i <= totalSteps; i++) {
                const currentX = startX + deltaX * i;
                // Add slight random vertical movement to simulate human imperfection
                const currentY = startY + (Math.random() - 0.5) * 3;

                await page.mouse.move(currentX, currentY);

                // Add faster realistic delays
                let delay;
                if (i <= 3 || i >= totalSteps - 3) {
                  delay = 30 + Math.random() * 20; // Faster at start/end
                } else {
                  delay = 15 + Math.random() * 10; // Even faster in middle
                }

                await page.waitForTimeout(delay);
              }

              // Hold at end position briefly
              await page.waitForTimeout(100 + Math.random() * 75);

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

      // Navigate to weekly course management page
      console.log('Navigating to weekly course management page...');
      await page.goto('https://www.yuekebao.cn/admin/course.php?dataName=course_week', {
        waitUntil: 'networkidle',
        timeout
      });

      console.log('Setting up weekly course view...');

      // Wait for weekly course content to load
      await page.waitForSelector('body', { timeout: 10000 });
      await page.waitForTimeout(2000);

      // Select "全部老师" (All Teachers) from layui dropdown
      console.log('Selecting all teachers from layui dropdown...');
      try {
        // Wait for the teacher select form to load
        await page.waitForSelector('select[lay-filter="search_teacher_id"]', { timeout: 5000 });
        await page.waitForTimeout(1000);

        // First try to use the original select element (may work in some cases)
        const nativeSelect = await page.$('select[lay-filter="search_teacher_id"]');
        if (nativeSelect) {
          try {
            await nativeSelect.selectOption('0'); // Value "0" for "全部老师"
            console.log('Selected "全部老师" via native select (value="0")');
            await page.waitForTimeout(1000);
          } catch (selectError) {
            console.log('Native select failed, using layui custom dropdown...');
          }
        }

        // Use layui custom dropdown approach
        const layuiSelectTitle = await page.$('.layui-form-select .layui-select-title');
        if (layuiSelectTitle) {
          console.log('Found layui teacher select dropdown, clicking to open...');

          // Click to open the dropdown
          await layuiSelectTitle.click();
          await page.waitForTimeout(1000);

          // Wait for dropdown options to appear and click "全部老师"
          const teacherSelected = await page.evaluate(() => {
            // Look for the dropdown options
            const dropdown = document.querySelector('.layui-form-select dl');
            if (!dropdown) {
              console.log('Dropdown not found');
              return false;
            }

            // Find and click "全部老师" option (lay-value="0")
            const allTeacherOption = dropdown.querySelector('dd[lay-value="0"]');
            if (allTeacherOption) {
              console.log('Found "全部老师" option, clicking...');
              allTeacherOption.click();
              return true;
            } else {
              console.log('全部老师 option not found, listing available options:');
              const options = dropdown.querySelectorAll('dd');
              options.forEach((option, i) => {
                console.log(`Option ${i}: text="${option.textContent.trim()}" lay-value="${option.getAttribute('lay-value')}"`);
              });

              // Click first option as fallback
              if (options.length > 0) {
                console.log('Clicking first option as fallback');
                options[0].click();
                return true;
              }
            }
            return false;
          });

          if (teacherSelected) {
            console.log('Successfully selected teacher option via layui dropdown');
            await page.waitForTimeout(2000); // Wait for selection to take effect

            // Trigger form update if needed
            await page.evaluate(() => {
              // Trigger layui form update
              const select = document.querySelector('select[lay-filter="search_teacher_id"]');
              if (select && window.layui && layui.form) {
                layui.form.render('select');
              }
            });

          } else {
            console.log('Failed to select teacher option');
          }
        } else {
          console.log('Layui teacher select dropdown not found');
        }

      } catch (teacherError) {
        console.log('Teacher selection failed:', teacherError.message);
      }

      console.log('Extracting course data from all weekly periods...');

      // Function to extract course data from current weekly view
      const extractWeeklyData = async (weekIndex) => {
        return await page.evaluate((weekIdx) => {
          const courses = [];

          // Look for table cells containing course information
          const courseCells = document.querySelectorAll('table td, .course-cell, .schedule-cell');

          courseCells.forEach((cell, index) => {
            const cellText = cell.innerText.trim();

            // Skip empty cells or cells with just numbers/basic text
            if (cellText && cellText.length > 10 &&
                (cellText.includes('课程') || cellText.includes('老师') || cellText.includes('学员') ||
                 cellText.includes('时间') || cellText.includes(':') || cellText.includes('上课'))) {

              // Parse complex cell content that might contain multiple lines
              const lines = cellText.split('\n').map(line => line.trim()).filter(line => line);

              const courseInfo = {
                weekIndex: weekIdx,
                cellIndex: index,
                fullText: cellText,
                lines: lines,
                // Try to extract structured data
                time: lines.find(line => line.includes(':')) || '',
                teacher: lines.find(line => line.includes('老师')) || '',
                course: lines.find(line => line.includes('课程')) || lines[0] || '',
                students: lines.filter(line => line.includes('学员') || line.includes('人数')) || []
              };

              courses.push(courseInfo);
            }
          });

          return courses;
        }, weekIndex);
      };

      // Get all available weekly buttons
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

        // Also look for other weekly button patterns
        const weekButtons = document.querySelectorAll('[id*="week"], .week-btn, .weekly-nav');
        weekButtons.forEach((btn, idx) => {
          if (btn.id && !buttons.some(b => b.id === btn.id)) {
            buttons.push({
              id: btn.id,
              index: buttons.length,
              text: btn.textContent.trim()
            });
          }
        });

        return buttons;
      });

      console.log(`Found ${weeklyButtons.length} weekly periods to scrape:`, weeklyButtons.map(b => `${b.id}: ${b.text}`));

      // Extract data from all weekly periods
      let allCourses = [];
      let weekCount = 0;

      for (const weekButton of weeklyButtons.slice(0, 10)) { // Limit to 10 weeks for safety
        try {
          console.log(`Extracting data from week ${weekButton.index}: ${weekButton.text}`);

          // Click the weekly button
          const buttonElement = await page.$(`#${weekButton.id}`);
          if (buttonElement) {
            await buttonElement.click();
            await page.waitForTimeout(2000); // Wait for data to load

            const weekCourses = await extractWeeklyData(weekButton.index);
            if (weekCourses.length > 0) {
              // Add week information to each course
              weekCourses.forEach((course, index) => {
                course.globalIndex = allCourses.length + index + 1;
                course.weekText = weekButton.text;
                course.weekId = weekButton.id;
              });

              allCourses = allCourses.concat(weekCourses);
              console.log(`Found ${weekCourses.length} course sessions in week ${weekButton.index}`);
            } else {
              console.log(`No course data found for week ${weekButton.index}`);
            }

            weekCount++;
          } else {
            console.log(`Could not find button for week ${weekButton.index}`);
          }
        } catch (weekError) {
          console.log(`Error processing week ${weekButton.index}:`, weekError.message);
        }
      }

      console.log(`Total course sessions extracted from ${weekCount} weekly periods: ${allCourses.length}`);

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

      // Save data to Excel
      let excelFilename = null;
      if (courseData.courses.length > 0) {
        try {
          console.log('Creating Excel file...');

          // Prepare data for Excel - weekly course format
          const excelData = courseData.courses.map(course => {
            const row = {};

            // Add basic tracking info
            row['索引'] = course.globalIndex || '';
            row['周期'] = course.weekText || '';
            row['周期按钮ID'] = course.weekId || '';
            row['单元格索引'] = course.cellIndex || '';

            // Add structured course data
            row['课程时间'] = course.time || '';
            row['授课老师'] = course.teacher || '';
            row['课程名称'] = course.course || '';
            row['学员信息'] = course.students.join('; ') || '';

            // Add all parsed lines
            course.lines.forEach((line, i) => {
              if (i < 10) { // Limit to 10 lines
                row[`内容行${i + 1}`] = line;
              }
            });

            // Add full cell text for reference
            row['完整内容'] = course.fullText || '';

            return row;
          });

          // Create workbook and worksheet
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet(excelData);

          // Set column widths for better readability - weekly format
          const colWidths = [
            { wch: 8 },  // 索引
            { wch: 15 }, // 周期
            { wch: 15 }, // 周期按钮ID
            { wch: 10 }, // 单元格索引
            { wch: 20 }, // 课程时间
            { wch: 15 }, // 授课老师
            { wch: 25 }, // 课程名称
            { wch: 20 }, // 学员信息
            { wch: 15 }, // 内容行1
            { wch: 15 }, // 内容行2
            { wch: 15 }, // 内容行3
            { wch: 15 }, // 内容行4
            { wch: 15 }, // 内容行5
            { wch: 35 }  // 完整内容
          ];

          ws['!cols'] = colWidths;

          // Add worksheet to workbook
          XLSX.utils.book_append_sheet(wb, ws, '周课程数据');

          // Generate filename with timestamp
          const now = new Date();
          const dateStr = now.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
          excelFilename = `约课宝周课程数据_${dateStr}.xlsx`;

          // Save Excel file
          XLSX.writeFile(wb, excelFilename);
          console.log(`Excel file saved: ${excelFilename}`);

        } catch (excelError) {
          console.error('Excel export failed:', excelError.message);
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
${excelFilename ? `- **Excel文件**: ${excelFilename}` : ''}

## 课程会话数据概览 (前5条)
${courseData.courses.length > 0 ?
  courseData.courses.slice(0, 5).map(course =>
    `### 课程会话 ${course.globalIndex} (${course.weekText})\n- **课程时间**: ${course.time}\n- **授课老师**: ${course.teacher}\n- **课程名称**: ${course.course}\n- **学员信息**: ${course.students.join('; ')}\n- **完整内容**: ${course.fullText.substring(0, 200)}...`
  ).join('\n\n')
  : '未找到课程会话数据'}

${courseData.courses.length > 5 ? `\n... 还有 ${courseData.courses.length - 5} 条课程会话数据已保存到Excel文件中\n` : ''}

## JSON数据
${courseData.jsonData ?
  '```json\n' + JSON.stringify(courseData.jsonData, null, 2) + '\n```'
  : '未找到JSON格式的课程数据'}

## Excel导出
${excelFilename ?
  `✅ 所有课程数据已成功导出到Excel文件: **${excelFilename}**` :
  '❌ Excel导出失败'}
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