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
      try {
        console.log('Looking for email input...');
        await page.waitForSelector('input[name="email"]', { timeout: 10000 });
        console.log('Email input found');
      } catch (emailError) {
        console.error('Email input not found:', emailError.message);
        // Try alternative selectors
        const alternativeEmailSelectors = ['#adminEmail', '#email', 'input[type="email"]', 'input[placeholder*="邮箱"]'];
        for (let selector of alternativeEmailSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2000 });
            console.log(`Found email input with alternative selector: ${selector}`);
            break;
          } catch (altError) {
            console.log(`Alternative email selector ${selector} not found`);
          }
        }
      }

      try {
        console.log('Looking for password input...');
        await page.waitForSelector('input[name="password"]', { timeout: 10000 });
        console.log('Password input found');
      } catch (passwordError) {
        console.error('Password input not found:', passwordError.message);
      }

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
        // Wait for the page to load and look for the layui form select (since native select is hidden)
        await page.waitForSelector('.layui-form-select', { timeout: 10000 });
        console.log('Found layui form select elements');
        await page.waitForTimeout(1000);

        // Skip native select since it's hidden, go directly to layui dropdown
        console.log('Skipping hidden native select, using layui dropdown directly...');

        // Look specifically for the teacher dropdown within the parent container
        const teacherContainer = await page.$('.layui-input-inline.layui-input-inline_9.select_list_2.border_1_c');
        if (teacherContainer) {
          console.log('Found teacher container, looking for layui dropdown...');

          // Find the layui select title within this container
          const layuiSelectTitle = await teacherContainer.$('.layui-select-title');
          if (layuiSelectTitle) {
            console.log('Found layui teacher select dropdown, clicking to open...');

            // Click to open the dropdown
            await layuiSelectTitle.click();
            await page.waitForTimeout(1500); // Wait longer for dropdown to fully open

            // Wait for dropdown options to appear and click "全部老师"
            const teacherSelected = await page.evaluate(() => {
              // Look for the dropdown options within the same container
              const dropdown = document.querySelector('.layui-input-inline.layui-input-inline_9.select_list_2.border_1_c .layui-form-select dl');
              if (!dropdown) {
                console.log('Teacher dropdown dl not found, trying alternative selector...');

                // Try broader search for any visible dropdown
                const anyDropdown = document.querySelector('.layui-form-select dl.layui-anim');
                if (anyDropdown) {
                  console.log('Found alternative dropdown');

                  // Find and click "全部老师" option (lay-value="0")
                  const allTeacherOption = anyDropdown.querySelector('dd[lay-value="0"]');
                  if (allTeacherOption && allTeacherOption.textContent.trim() === '全部老师') {
                    console.log('Found "全部老师" option in alternative dropdown, clicking...');
                    allTeacherOption.click();
                    return '全部老师';
                  }
                }
                return false;
              }

              console.log('Found teacher dropdown, looking for options...');
              const options = dropdown.querySelectorAll('dd');
              console.log(`Found ${options.length} teacher options`);

              // List all options for debugging
              options.forEach((option, i) => {
                const text = option.textContent.trim();
                const layValue = option.getAttribute('lay-value');
                console.log(`Teacher option ${i}: text="${text}" lay-value="${layValue}"`);
              });

              // Find and click "全部老师" option (lay-value="0")
              const allTeacherOption = dropdown.querySelector('dd[lay-value="0"]');
              if (allTeacherOption) {
                const optionText = allTeacherOption.textContent.trim();
                console.log(`Found target option: "${optionText}", clicking...`);
                allTeacherOption.click();
                return optionText;
              } else {
                console.log('全部老师 option (lay-value="0") not found');
                return false;
              }
            });

            if (teacherSelected) {
              console.log(`Successfully selected teacher option: "${teacherSelected}"`);
              await page.waitForTimeout(2000); // Wait for selection to take effect

              // Verify the selection was applied
              const currentValue = await page.evaluate(() => {
                const input = document.querySelector('.layui-input-inline.layui-input-inline_9.select_list_2.border_1_c .layui-select-title input');
                return input ? input.value : 'unknown';
              });
              console.log(`Current dropdown value after selection: "${currentValue}"`);

            } else {
              console.log('Failed to select teacher option');
            }
          } else {
            console.log('Layui select title not found in teacher container');
          }
        } else {
          console.log('Teacher container with specific classes not found, trying fallback selector...');

          // Fallback: try generic layui dropdown
          const anyLayuiSelect = await page.$('.layui-form-select .layui-select-title');
          if (anyLayuiSelect) {
            console.log('Found fallback layui dropdown, clicking...');
            await anyLayuiSelect.click();
            await page.waitForTimeout(1500);

            const fallbackSelected = await page.evaluate(() => {
              const dropdown = document.querySelector('.layui-form-select dl');
              if (dropdown) {
                const allTeacherOption = dropdown.querySelector('dd[lay-value="0"]');
                if (allTeacherOption) {
                  allTeacherOption.click();
                  return allTeacherOption.textContent.trim();
                }
              }
              return false;
            });

            if (fallbackSelected) {
              console.log(`Selected via fallback: "${fallbackSelected}"`);
            }
          }
        }

      } catch (teacherError) {
        console.log('Teacher selection failed:', teacherError.message);
      }

      console.log('Extracting course data from all weekly periods...');

      // Function to extract course data from current weekly view
      const extractWeeklyData = async (weekIndex) => {
        return await page.evaluate((weekIdx) => {
          const courses = [];

          console.log(`Extracting data for week ${weekIdx}...`);

          // Try multiple selector strategies to find course data
          const selectorStrategies = [
            'table td',
            '.course-cell',
            '.schedule-cell',
            'table tbody td',
            '.layui-table-body td',
            '.course-content',
            '[class*="course"]',
            '[class*="schedule"]'
          ];

          let courseCells = [];
          let usedStrategy = '';

          // Try each selector strategy
          for (let strategy of selectorStrategies) {
            courseCells = document.querySelectorAll(strategy);
            if (courseCells.length > 0) {
              console.log(`Found ${courseCells.length} cells using strategy: ${strategy}`);
              usedStrategy = strategy;
              break;
            }
          }

          if (courseCells.length === 0) {
            console.log('No course cells found with any strategy');
            // Log page structure for debugging
            console.log('Page structure sample:');
            const bodyText = document.body.innerText.substring(0, 1000);
            console.log('Body text:', bodyText);
            return courses;
          }

          console.log(`Processing ${courseCells.length} cells with strategy: ${usedStrategy}`);

          courseCells.forEach((cell, index) => {
            const cellText = cell.innerText.trim();

            // Skip empty cells, but be more inclusive to capture course data
            if (cellText && cellText.length > 3) {
              console.log(`Cell ${index}: "${cellText.substring(0, 100)}..."`);

              // Check if this might be course-related content
              if (cellText.includes('课程') || cellText.includes('老师') || cellText.includes('学员') ||
                  cellText.includes('时间') || cellText.includes(':') || cellText.includes('上课') ||
                  cellText.includes('May') || cellText.includes('Angel') || cellText.includes('Jake') ||
                  cellText.includes('Jenny') || cellText.includes('Lou') || cellText.includes('Diana') ||
                  cellText.match(/\d{1,2}:\d{2}/) || // Time pattern
                  cellText.match(/\d{4}-\d{2}-\d{2}/) || // Date pattern
                  cellText.match(/\d{2}-\d{2}/) // Short date pattern
                 ) {

              // Parse complex cell content that might contain multiple lines
              const lines = cellText.split('\n').map(line => line.trim()).filter(line => line);

              // Extract date and time information
              let dateInfo = '';
              let timeInfo = '';
              let teacherInfo = '';
              let studentInfo = '';
              let deductionInfo = '';

              // Parse each line to extract specific information
              lines.forEach(line => {
                // Extract date (format: YYYY-MM-DD or MM-DD or similar)
                const dateMatch = line.match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}日/);
                if (dateMatch) {
                  dateInfo = dateMatch[0];
                }

                // Extract time (format: HH:MM or HH:MM-HH:MM)
                const timeMatch = line.match(/\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?/);
                if (timeMatch) {
                  timeInfo = timeMatch[0];
                }

                // Extract teacher information
                if (line.includes('老师') || line.includes('教师') || line.includes('Teacher')) {
                  teacherInfo = line.replace(/.*?(老师|教师|Teacher):?\s*/, '').trim();
                }

                // Extract student information
                if (line.includes('学员') || line.includes('学生') || line.includes('Student')) {
                  studentInfo = line.replace(/.*?(学员|学生|Student):?\s*/, '').trim();
                }

                // Extract deduction/consumption information
                if (line.includes('扣课') || line.includes('消耗') || line.includes('课时') || line.includes('次数')) {
                  const deductMatch = line.match(/\d+/);
                  if (deductMatch) {
                    deductionInfo = deductMatch[0];
                  }
                }
              });

              // If no specific date found, try to extract from time context
              if (!dateInfo && timeInfo) {
                // Look for date in previous lines or cell context
                const timeLineIndex = lines.findIndex(line => line.includes(timeInfo));
                if (timeLineIndex > 0) {
                  const prevLine = lines[timeLineIndex - 1];
                  const dateMatch = prevLine.match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2}|\d{1,2}月\d{1,2}日/);
                  if (dateMatch) {
                    dateInfo = dateMatch[0];
                  }
                }
              }

              // If still no teacher found, look for names in the content
              if (!teacherInfo) {
                const possibleTeachers = ['May', 'Angel', 'Anna Rose', 'Diana', 'Jake', 'Jenny', 'Lou', 'Milena', 'Mumu', 'Pearly', 'Shai'];
                for (let teacher of possibleTeachers) {
                  if (cellText.includes(teacher)) {
                    teacherInfo = teacher;
                    break;
                  }
                }
              }

              const courseInfo = {
                weekIndex: weekIdx,
                cellIndex: index,
                fullText: cellText,
                lines: lines,
                // Structured data for Excel export
                date: dateInfo,
                time: timeInfo,
                teacher: teacherInfo,
                student: studentInfo,
                deduction: deductionInfo
              };

              // Only include if we have some meaningful data
              if (dateInfo || timeInfo || teacherInfo || studentInfo) {
                courses.push(courseInfo);
                console.log(`Added course from cell ${index}: date="${dateInfo}" time="${timeInfo}" teacher="${teacherInfo}"`);
              }

              } else {
                // Log non-matching cells for debugging
                if (cellText.length > 20) {
                  console.log(`Skipped cell ${index} (non-matching): "${cellText.substring(0, 50)}..."`);
                }
              }
            } else {
              // Log very short cells
              if (cellText && cellText.length > 0) {
                console.log(`Skipped cell ${index} (too short): "${cellText}"`);
              }
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
            console.log(`Clicked week button: ${weekButton.id}`);
            await page.waitForTimeout(3000); // Wait longer for data to load

            // Wait for table content to update
            try {
              await page.waitForSelector('table, .course-table, .schedule-table', { timeout: 5000 });
              console.log('Table found, extracting data...');
            } catch (tableError) {
              console.log(`No table found for week ${weekButton.index}, trying alternative selectors...`);
            }

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

          // Prepare data for Excel - required format: 日期、时间、老师、学生、扣课数
          const excelData = courseData.courses.map(course => {
            const row = {};

            // Required columns
            row['日期'] = course.date || '';
            row['时间'] = course.time || '';
            row['老师'] = course.teacher || '';
            row['学生'] = course.student || '';
            row['扣课数'] = course.deduction || '';

            // Additional reference info
            row['周期'] = course.weekText || '';
            row['完整内容'] = course.fullText || '';

            return row;
          });

          // Create workbook and worksheet
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet(excelData);

          // Set column widths for better readability - required format
          const colWidths = [
            { wch: 12 }, // 日期
            { wch: 15 }, // 时间
            { wch: 15 }, // 老师
            { wch: 25 }, // 学生
            { wch: 10 }, // 扣课数
            { wch: 15 }, // 周期
            { wch: 40 }  // 完整内容
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
          console.error('Excel error stack:', excelError.stack);
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
      console.error('Error stack:', error.stack);
      console.error('Error name:', error.name);

      // Add current page info for debugging
      let currentPageInfo = '';
      try {
        if (page) {
          const currentUrl = page.url();
          const title = await page.title().catch(() => 'Unable to get title');
          currentPageInfo = `\n- 当前页面URL: ${currentUrl}\n- 当前页面标题: ${title}`;
        }
      } catch (pageError) {
        currentPageInfo = '\n- 无法获取当前页面信息';
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