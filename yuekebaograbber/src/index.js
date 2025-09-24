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

      // Navigate to course management page
      console.log('Navigating to course management page...');
      await page.goto('https://www.yuekebao.cn/admin/course.php', {
        waitUntil: 'networkidle',
        timeout
      });

      console.log('Setting up query parameters...');

      // Wait for course content to load
      await page.waitForSelector('body', { timeout: 10000 });

      // Set time range from today to 1 month in the future
      const today = new Date();
      const futureDate = new Date();
      futureDate.setMonth(today.getMonth() + 1);

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const startDate = formatDate(today);
      const endDate = formatDate(futureDate);

      console.log(`Setting date range from ${startDate} to ${endDate}`);

      try {
        // Helper function to select date in the laydate picker
        const selectDateInPicker = async (targetDate) => {
          const [year, month, day] = targetDate.split('-');
          const targetYear = parseInt(year);
          const targetMonth = parseInt(month);
          const targetDay = parseInt(day);
          const targetYmd = `${year}-${targetMonth}-${targetDay}`;

          console.log(`Looking for date cell with lay-ymd="${targetYmd}"`);

          // Wait for date picker to appear
          await page.waitForSelector('.layui-laydate', { timeout: 5000 });

          // Get current year and month from the picker header
          let currentYearMonth = await page.evaluate(() => {
            const yearSpan = document.querySelector('.laydate-set-ym span[lay-type="year"]');
            const monthSpan = document.querySelector('.laydate-set-ym span[lay-type="month"]');

            if (yearSpan && monthSpan) {
              const yearText = yearSpan.textContent.replace('年', '');
              const monthText = monthSpan.textContent.replace('月', '');
              return {
                year: parseInt(yearText),
                month: parseInt(monthText)
              };
            }
            return null;
          });

          if (currentYearMonth) {
            console.log(`Current picker shows: ${currentYearMonth.year}-${currentYearMonth.month}, target: ${targetYear}-${targetMonth}`);

            // Navigate to target year/month
            let attempts = 0;
            while ((currentYearMonth.year !== targetYear || currentYearMonth.month !== targetMonth) && attempts < 12) {
              if (currentYearMonth.year < targetYear || (currentYearMonth.year === targetYear && currentYearMonth.month < targetMonth)) {
                // Need to go forward
                console.log('Clicking next month button...');
                const nextBtn = await page.$('.laydate-next-m');
                if (nextBtn) {
                  await nextBtn.click();
                  await page.waitForTimeout(300);
                }
              } else {
                // Need to go backward
                console.log('Clicking previous month button...');
                const prevBtn = await page.$('.laydate-prev-m');
                if (prevBtn) {
                  await prevBtn.click();
                  await page.waitForTimeout(300);
                }
              }

              // Update current year/month
              currentYearMonth = await page.evaluate(() => {
                const yearSpan = document.querySelector('.laydate-set-ym span[lay-type="year"]');
                const monthSpan = document.querySelector('.laydate-set-ym span[lay-type="month"]');

                if (yearSpan && monthSpan) {
                  const yearText = yearSpan.textContent.replace('年', '');
                  const monthText = monthSpan.textContent.replace('月', '');
                  return {
                    year: parseInt(yearText),
                    month: parseInt(monthText)
                  };
                }
                return null;
              });

              attempts++;
            }

            console.log(`After navigation: ${currentYearMonth.year}-${currentYearMonth.month}`);
          }

          // Now look for the target date in the current view
          const dateCell = await page.$(`td[lay-ymd="${targetYmd}"]`);
          if (dateCell) {
            await dateCell.click();
            console.log(`Clicked on date ${targetYmd}`);
          } else {
            console.log(`Date ${targetYmd} still not found, clicking fallback date...`);
            // Try to find any day in the target month
            const anyDateInMonth = await page.$(`td[lay-ymd^="${year}-${targetMonth}-"]`);
            if (anyDateInMonth) {
              await anyDateInMonth.click();
              console.log('Clicked on alternative date in target month');
            } else {
              // Last resort: click today
              const todayCell = await page.$('td.layui-this');
              if (todayCell) {
                await todayCell.click();
                console.log('Clicked on today as final fallback');
              }
            }
          }

          await page.waitForTimeout(500);

          // Click confirm button
          const confirmBtn = await page.$('.laydate-btns-confirm');
          if (confirmBtn) {
            await confirmBtn.click();
            console.log('Clicked confirm button');
            await page.waitForTimeout(1000);
          }
        };

        // Set start date
        const startDateInput = await page.$('#start_day_qw');
        if (startDateInput) {
          console.log('Found start date input, clicking to activate date picker...');
          await startDateInput.click();
          await page.waitForTimeout(1000);

          await selectDateInPicker(startDate);
          console.log('Start date set successfully');
        } else {
          console.log('Start date input #start_day_qw not found');
        }

        await page.waitForTimeout(1000);

        // Set end date
        const endDateInput = await page.$('#end_day_qw');
        if (endDateInput) {
          console.log('Found end date input, clicking to activate date picker...');
          await endDateInput.click();
          await page.waitForTimeout(1000);

          await selectDateInPicker(endDate);
          console.log('End date set successfully');
        } else {
          console.log('End date input #end_day_qw not found');
        }

        await page.waitForTimeout(1000);
      } catch (dateError) {
        console.log('Date setting failed:', dateError.message);
      }

      // Submit the date range query using the specific button
      try {
        const searchButton = await page.$('#search_duration_submit');
        if (searchButton) {
          // Make the button visible first
          await page.evaluate(() => {
            const btn = document.querySelector('#search_duration_submit');
            if (btn) {
              btn.style.display = 'block';
            }
          });

          await page.waitForTimeout(500);
          await searchButton.click();
          console.log('Date range query submitted via #search_duration_submit');
          await page.waitForTimeout(5000); // Wait longer for results to load
        } else {
          console.log('Date range search button #search_duration_submit not found');

          // Try alternative query buttons
          const alternativeButtons = await page.$$('button:has-text("查询"), .layui-btn-danger, button[class*="submit"]');
          if (alternativeButtons.length > 0) {
            await alternativeButtons[0].click();
            console.log('Query submitted via alternative button');
            await page.waitForTimeout(5000);
          }
        }
      } catch (searchError) {
        console.log('Search button click failed:', searchError.message);
      }

      // Set pagination to 100 items per page AFTER query
      console.log('Setting pagination to 100 items per page after query...');
      try {
        // Look for the pagination select dropdown in layui-laypage-limits
        const paginationSelect = await page.$('.layui-laypage-limits select');

        if (paginationSelect) {
          console.log('Found pagination select dropdown, selecting 100...');
          await paginationSelect.selectOption('100');
          console.log('Pagination set to 100 via layui select dropdown');

          // Wait for page to reload with new pagination
          await page.waitForTimeout(5000);
        } else {
          console.log('Pagination select dropdown not found, trying alternative selectors...');

          // Try alternative selectors
          const alternativeSelectors = [
            'select[lay-ignore]',
            '.layui-laypage select',
            'select option[value="100"]'
          ];

          let paginationSet = false;
          for (let selector of alternativeSelectors) {
            try {
              const element = await page.$(selector);
              if (element) {
                const tagName = await element.evaluate(el => el.tagName.toLowerCase());

                if (tagName === 'select') {
                  await element.selectOption('100');
                  console.log(`Pagination set to 100 via ${selector}`);
                  paginationSet = true;
                  await page.waitForTimeout(5000);
                  break;
                } else if (tagName === 'option') {
                  const parent = await element.evaluateHandle(el => el.parentElement);
                  await parent.selectOption('100');
                  console.log(`Pagination set to 100 via parent of ${selector}`);
                  paginationSet = true;
                  await page.waitForTimeout(5000);
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }

          if (!paginationSet) {
            console.log('Could not find pagination select dropdown');
          }
        }

      } catch (paginationError) {
        console.log('Pagination setting failed:', paginationError.message);
      }

      console.log('Extracting course data from all pages...');

      // Function to extract course data from current page
      const extractCurrentPageData = async () => {
        return await page.evaluate(() => {
          const courses = [];
          const courseRows = document.querySelectorAll('tr[data-id], .course-item, .course-row, tbody tr');

          courseRows.forEach((row, index) => {
            const cells = row.querySelectorAll('td, .course-cell');
            if (cells.length > 0) {
              const courseInfo = {
                data: Array.from(cells).map(cell => cell.innerText.trim()).filter(text => text)
              };
              if (courseInfo.data.length > 0) {
                courses.push(courseInfo);
              }
            }
          });

          return courses;
        });
      };

      // Extract data from all pages
      let allCourses = [];
      let pageNumber = 1;
      let hasNextPage = true;

      while (hasNextPage && pageNumber <= 50) { // Limit to 50 pages for safety
        console.log(`Extracting data from page ${pageNumber}...`);

        const currentPageCourses = await extractCurrentPageData();
        if (currentPageCourses.length > 0) {
          // Add page number to each course for tracking
          currentPageCourses.forEach((course, index) => {
            course.index = allCourses.length + index + 1;
            course.pageNumber = pageNumber;
          });

          allCourses = allCourses.concat(currentPageCourses);
          console.log(`Found ${currentPageCourses.length} courses on page ${pageNumber}`);
        }

        // Check if there's a next page
        const nextPageButton = await page.$('.layui-laypage-next');
        const isNextDisabled = await page.evaluate(() => {
          const nextBtn = document.querySelector('.layui-laypage-next');
          return nextBtn && nextBtn.classList.contains('layui-disabled');
        });

        if (nextPageButton && !isNextDisabled) {
          console.log('Navigating to next page...');
          await nextPageButton.click();
          await page.waitForTimeout(3000); // Wait for page to load
          pageNumber++;
        } else {
          console.log('No more pages available');
          hasNextPage = false;
        }
      }

      console.log(`Total courses extracted from ${pageNumber} pages: ${allCourses.length}`);

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
        totalPages: pageNumber
      };

      console.log(`Found ${courseData.totalCourses} courses`);

      // Save data to Excel
      let excelFilename = null;
      if (courseData.courses.length > 0) {
        try {
          console.log('Creating Excel file...');

          // Prepare data for Excel
          const excelData = courseData.courses.map(course => {
            const row = {};

            // Add page number and index
            row['索引'] = course.index || '';
            row['页码'] = course.pageNumber || '';

            // Map common fields based on typical course structure
            if (course.data.length >= 5) {
              row['序号'] = course.data[0] || '';
              row['课程日期时间'] = course.data[1] || '';
              row['课程类别名称'] = course.data[2] || '';
              row['预约会员'] = course.data[3] || '';
              row['其他信息'] = course.data[4] || '';

              // Add any additional fields
              for (let i = 5; i < course.data.length; i++) {
                row[`字段${i + 1}`] = course.data[i];
              }
            } else {
              // Fallback for courses with fewer fields
              course.data.forEach((item, i) => {
                row[`字段${i + 1}`] = item;
              });
            }

            return row;
          });

          // Create workbook and worksheet
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.json_to_sheet(excelData);

          // Set column widths for better readability
          const colWidths = [
            { wch: 8 },  // 索引
            { wch: 6 },  // 页码
            { wch: 8 },  // 序号
            { wch: 25 }, // 课程日期时间
            { wch: 20 }, // 课程类别名称
            { wch: 20 }, // 预约会员
            { wch: 35 }  // 其他信息
          ];

          ws['!cols'] = colWidths;

          // Add worksheet to workbook
          XLSX.utils.book_append_sheet(wb, ws, '课程数据');

          // Generate filename with timestamp
          const now = new Date();
          const dateStr = now.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
          excelFilename = `约课宝课程数据_${dateStr}.xlsx`;

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
- **查询时间范围**: ${startDate} 至 ${endDate} (未来1个月)
- **课程总数**: ${courseData.totalCourses}
- **抓取页数**: ${courseData.totalPages} 页 (每页100条)
${excelFilename ? `- **Excel文件**: ${excelFilename}` : ''}

## 课程数据概览 (前10条)
${courseData.courses.length > 0 ?
  courseData.courses.slice(0, 10).map(course =>
    `### 课程 ${course.index}\n${course.data.map((item, i) => `- **字段${i + 1}**: ${item}`).join('\n')}`
  ).join('\n\n')
  : '未找到课程数据表格'}

${courseData.courses.length > 10 ? `\n... 还有 ${courseData.courses.length - 10} 条课程数据已保存到Excel文件中\n` : ''}

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