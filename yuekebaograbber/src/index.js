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
import mysql from 'mysql2/promise';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';

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

            // Process each course div separately
            courseDivs.forEach((courseDiv, courseIndex) => {
              console.log(`  Course ${courseIndex + 1}/${courseDivs.length}:`);

              // Extract teacher from the teacher div
              let teacher = '';

              // Try multiple selectors to handle different teacher HTML structures
              let teacherDiv = courseDiv.querySelector('div.memberCon div.textEllipsis');
              if (!teacherDiv) {
                // Alternative selector for special status teachers like Gel
                teacherDiv = courseDiv.querySelector('div.ft12.color_9.textEllipsis');
              }
              if (!teacherDiv) {
                // Even more general selector
                teacherDiv = courseDiv.querySelector('div[class*="textEllipsis"]');
              }

              if (teacherDiv) {
                const teacherText = teacherDiv.innerText.trim();
                // Expanded list of possible teachers including Gel
                const possibleTeachers = ['May', 'Angel', 'Anna Rose', 'Diana', 'Jake', 'Jenny', 'Lou', 'Milena', 'Mumu', 'Pearly', 'Shai', 'Gel'];
                for (let t of possibleTeachers) {
                  if (teacherText.includes(t)) {
                    teacher = t;
                    break;
                  }
                }

                // If no teacher found from known list, try to extract any text (excluding icons)
                if (!teacher && teacherText) {
                  // Remove icon characters and extract text
                  const cleanText = teacherText.replace(/[\u{e000}-\u{f8ff}]/gu, '').trim();
                  if (cleanText && cleanText.length > 0 && cleanText !== '>' && cleanText !== '<') {
                    teacher = cleanText;
                  }
                }

                console.log(`    → Teacher: ${teacher} (from: "${teacherText}")`);
              }

              // Extract student from the student div
              let student = '';
              const studentDiv = courseDiv.querySelector('div.clearfix div.textEllipsis_1.f_L.m_w_max');
              if (studentDiv) {
                student = studentDiv.innerText.trim();
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

              // Extract course type by analyzing the entire course div content
              let courseType = '';
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
                const filipinoTeachers = ['May', 'Angel', 'Diana', 'Jake', 'Jenny', 'Lou', 'Milena', 'Mumu', 'Pearly', 'Shai'];
                const europeanTeachers = ['Anna Rose', 'Gel'];

                if (filipinoTeachers.includes(teacher)) {
                  courseType = '菲教';
                } else if (europeanTeachers.includes(teacher)) {
                  courseType = '欧教';
                } else {
                  courseType = '其他';
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
          await page.waitForTimeout(2000);

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
            await page.waitForTimeout(3000);
            console.log('📊 开始抓取上周课表数据...');

            // Extract previous week data
            previousWeekData = await extractWeeklyData(-1);
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
          await page.waitForTimeout(1500);

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
            await page.waitForTimeout(2000);
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

      // Filter weekly buttons to only include current time + 1.5 months
      const today = new Date();
      const oneAndHalfMonthsLater = new Date();
      oneAndHalfMonthsLater.setMonth(today.getMonth() + 1);
      oneAndHalfMonthsLater.setDate(oneAndHalfMonthsLater.getDate() + 15); // Add 15 days to make it 1.5 months

      const filteredWeeklyButtons = weeklyButtons.filter(weekButton => {
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

        // Only include weeks that are within the range: today to 1.5 months from now
        const withinFutureRange = weekEndDate <= oneAndHalfMonthsLater;
        const notTooOld = weekEndDate >= today; // Don't include past weeks

        if (!withinFutureRange) {
          console.log(`Skipping week "${text}" (ends ${weekEndDate.toISOString().split('T')[0]}) - beyond 1.5 month limit`);
          return false;
        }

        if (!notTooOld) {
          console.log(`Skipping week "${text}" (ends ${weekEndDate.toISOString().split('T')[0]}) - past date`);
          return false;
        }

        return true;
      });

      console.log(`Filtered to ${filteredWeeklyButtons.length} weeks within 1.5 months from today (${today.toISOString().split('T')[0]} to ${oneAndHalfMonthsLater.toISOString().split('T')[0]})`);
      console.log(`Weeks to process:`, filteredWeeklyButtons.map(b => b.text));

      // Extract data from filtered weekly periods
      let allCourses = [];
      let weekCount = 0;

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

          // Click the weekly button with improved reliability
          try {
            const buttonElement = await page.$(`#${weekButton.id}`);
            if (buttonElement) {
              // Check if button is visible and scroll into view if needed
              const isVisible = await buttonElement.isVisible();
              if (!isVisible) {
                console.log(`Button ${weekButton.id} not visible, scrolling into view...`);
                await buttonElement.scrollIntoViewIfNeeded();
                await page.waitForTimeout(1000);
              }

              await buttonElement.click();
              console.log(`✅ 成功点击按钮: ${weekButton.id}`);
              await page.waitForTimeout(3000); // Wait longer for data to load
            } else {
              console.log(`Button element not found: ${weekButton.id}`);
              continue;
            }
          } catch (clickError) {
            console.log(`Failed to click button ${weekButton.id}: ${clickError.message}`);
            continue;
          }

            // Wait for table content to update
            try {
              await page.waitForSelector('table, .course-table, .schedule-table', { timeout: 5000 });
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
        } catch (weekError) {
          console.log(`Error processing week ${weekButton.index}:`, weekError.message);
        }
      }

      console.log(`\n🎯 ===== 抓取完成统计 =====`);
      console.log(`📊 总共抓取周期数: ${weekCount}`);
      console.log(`📚 总共课程记录数: ${allCourses.length}`);
      console.log(`💾 即将导出Excel文件...`);
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

      // Save data to Excel and Database
      let excelFilename = null;
      let dbResult = { success: false, message: '未执行数据库操作' };
      if (courseData.courses.length > 0) {
        try {
          console.log('Creating Excel file...');

          // Prepare data for Excel - required format: 日期、时间、老师、学生、扣课数、课程类型
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
            { wch: 12 }, // 课程类型
            { wch: 15 }  // 周期
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

          // Save to database
          console.log('💾 开始保存数据到数据库...');
          dbResult = await this.saveToDB(allCourses);
          console.log(dbResult.message);

          // After courses data, scrape member card data
          console.log('\n🎯 开始抓取会员卡数据...');
          const cardData = await this.scrapeMemberCards(page);
          console.log(`✅ 会员卡数据抓取完成，共获得 ${cardData.length} 条记录`);

          // Generate member card Excel file and save to database
          if (cardData.length > 0) {
            const cardExcelFilename = this.generateCardExcel(cardData);
            console.log(`📊 会员卡Excel文件已生成: ${cardExcelFilename}`);

            // Save member card data to database
            console.log('💾 开始保存会员卡数据到数据库...');
            const cardDbResult = await this.saveCardDataToDB(cardData);
            console.log(cardDbResult.message);
          }

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
    `### 课程会话 ${course.globalIndex || '未知'} (${course.weekText || '未知周期'})
- **日期**: ${course.date || '未知日期'}
- **时间**: ${course.time || '未知时间'}
- **老师**: ${course.teacher || '未知老师'}
- **学生**: ${course.student || '未知学生'}
- **扣课数**: ${course.deduction || '未知扣课数'}
`
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

  async saveToDB(courses) {
    let connection;
    try {
      // Database connection configuration
      const dbConfig = {
        host: 'rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com',
        port: 3306,
        user: 'baboontalkies',
        password: 'Kiki101422!',
        database: 'baboontalkies'
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
          new Date()                      // create_time
        ];
      });

      // Get date range from courses to delete existing data for the same period
      if (courses.length > 0) {
        const courseDates = courses.map(course => course.date).filter(date => date);
        if (courseDates.length > 0) {
          const minDate = Math.min(...courseDates.map(date => new Date(date)));
          const maxDate = Math.max(...courseDates.map(date => new Date(date)));

          const startDate = new Date(minDate).toISOString().split('T')[0];
          const endDate = new Date(maxDate).toISOString().split('T')[0];

          console.log(`🗑️ 删除已存在的课程数据（日期范围: ${startDate} 到 ${endDate}）...`);

          const deleteQuery = 'DELETE FROM yuekebao_classtime WHERE class_date >= ? AND class_date <= ?';
          const [deleteResult] = await connection.execute(deleteQuery, [startDate, endDate]);

          console.log(`✅ 已删除 ${deleteResult.affectedRows} 条旧记录`);
        }
      }

      // Batch insert new data using multiple VALUES
      const placeholders = insertData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const insertQuery = `
        INSERT INTO yuekebao_classtime
        (teacher, student, time_num, class_date, class_start_time, class_end_time, week_period, create_time)
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
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      await page.waitForTimeout(2000);

      console.log('⚙️ 设置每页显示100条数据...');
      // Set page size to 100 items per page
      try {
        const selectElement = await page.$('select[lay-ignore]');
        if (selectElement) {
          await selectElement.selectOption('100');
          console.log('✅ 已设置每页显示100条');
          await page.waitForTimeout(2000);
        } else {
          console.log('⚠️ 未找到分页选择器，继续使用默认设置');
        }
      } catch (selectError) {
        console.log('⚠️ 设置分页失败，继续使用默认设置:', selectError.message);
      }

      const allCardData = [];
      let currentPage = 1;

      while (true) {
        console.log(`📊 抓取第 ${currentPage} 页数据...`);

        // Wait for table to load
        try {
          await page.waitForSelector('tr[data-index]', { timeout: 10000 });
        } catch (waitError) {
          console.log('⚠️ 等待表格加载超时，可能已到最后一页');
          break;
        }

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
                  studentName = dataContent.trim();
                } else {
                  const nameSpan = nameCell.querySelector('span.ft16');
                  if (nameSpan) {
                    studentName = nameSpan.innerText.trim();
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

              // 数据清洗：学生姓名和课程类型过滤
              // 排除指定学生
              const excludedStudents = ['李思敏', 'nala', '胖达', '沈沐兮 Scarlett'];
              if (studentName && excludedStudents.includes(studentName.trim())) {
                console.log(`⚠️ 跳过排除学生: ${studentName}`);
                return; // 跳过此条记录
              }

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

        // Check if there's a next page
        const hasNextPage = await page.evaluate(() => {
          const nextButton = document.querySelector('.layui-laypage-next');
          return nextButton && !nextButton.classList.contains('layui-disabled');
        });

        if (!hasNextPage) {
          console.log('📄 已到达最后一页');
          break;
        }

        // Click next page
        try {
          await page.click('.layui-laypage-next');
          await page.waitForTimeout(3000); // Wait for page to load
          currentPage++;
        } catch (nextError) {
          console.log('⚠️ 点击下一页失败:', nextError.message);
          break;
        }
      }

      // Merge data with same courseType + studentName + studentPhone
      console.log('🔄 开始合并相同学生的多条记录...');
      return this.mergeCardData(allCardData);

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

  generateCardExcel(cardData) {
    try {
      const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0].replace('T', '_');
      const excelFilename = `约课宝会员卡数据_${timestamp.replace(/[-:]/g, '').replace('T', '_').substring(0, 15)}.xlsx`;

      // Prepare data for Excel with required columns
      const excelData = cardData.map(card => ({
        '学生姓名': card.studentName || '',
        '学生手机号': card.studentPhone || '',
        '课程类型': card.courseType || '',
        '剩余课时数': card.remainingClasses || 0,
        '剩余已排课数': card.scheduledClasses || 0
      }));

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // Set column widths for better readability
      const colWidths = [
        { wch: 15 }, // 学生姓名
        { wch: 15 }, // 学生手机号
        { wch: 25 }, // 课程类型
        { wch: 12 }, // 剩余课时数
        { wch: 12 }  // 剩余已排课数
      ];
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, '会员卡数据');

      // Save Excel file
      XLSX.writeFile(wb, excelFilename);
      console.log(`📊 会员卡Excel文件保存成功: ${excelFilename}`);

      return excelFilename;

    } catch (error) {
      console.error('❌ 生成会员卡Excel文件失败:', error.message);
      return null;
    }
  }

  async saveCardDataToDB(cardData) {
    let connection;
    try {
      const mysql = await import('mysql2/promise');

      // Database connection configuration (same as course data)
      const dbConfig = {
        host: 'rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com',
        port: 3306,
        user: 'baboontalkies',
        password: 'Kiki101422!',
        database: 'baboontalkies'
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

  // 启动Web仪表板服务器
  async startDashboard(port = 3000) {
    if (this.app) {
      console.log('Web服务器已经在运行中');
      return;
    }

    this.app = express();

    // 中间件
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.resolve(this.__dirname, '..'))); // 提供静态文件服务

    // 数据库配置
    const dbConfig = {
      host: 'rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com',
      port: 3306,
      user: 'baboontalkies',
      password: 'Kiki101422!',
      database: 'baboontalkies'
    };

    // 获取数据库连接
    const getDbConnection = async () => {
      return await mysql.createConnection(dbConfig);
    };

    // API接口：获取仪表板数据
    this.app.get('/api/dashboard-data', async (req, res) => {
      let connection;

      try {
        connection = await getDbConnection();
        console.log('📊 开始获取仪表板数据...');

        // 1. 获取会员卡数据（学生基本信息）
        const [cardData] = await connection.execute(`
          SELECT
            student as name,
            mobile,
            class_card_type as courseType,
            card_times_left as remainingClasses,
            arranged_times as scheduledClasses
          FROM yuekebao_student_cardnum
          ORDER BY student
        `);

        console.log(`📝 获取到 ${cardData.length} 条会员卡记录`);

        // 2. 获取未来课程数据（用于计算之后课节和30天内课程数）
        const currentDate = new Date();
        const futureDate = new Date();
        futureDate.setDate(currentDate.getDate() + 30);

        const [futureCourseData] = await connection.execute(`
          SELECT
            student,
            teacher,
            class_date,
            class_start_time,
            class_end_time
          FROM yuekebao_classtime
          WHERE class_date >= CURDATE()
          AND class_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          ORDER BY class_date, class_start_time
        `);

        // 3. 获取历史课程数据（用于计算之前课节）
        const [pastCourseData] = await connection.execute(`
          SELECT
            student,
            teacher,
            class_date,
            class_start_time,
            class_end_time
          FROM yuekebao_classtime
          WHERE class_date < CURDATE()
          ORDER BY class_date DESC, class_start_time DESC
        `);

        console.log(`📅 获取到 ${futureCourseData.length} 条未来30天课程记录`);
        console.log(`📅 获取到 ${pastCourseData.length} 条历史课程记录`);

        // 3. 合并数据并计算派生字段
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
              unscheduledClasses: Math.max(0, (card.remainingClasses || 0) - (card.scheduledClasses || 0)),
              prevClass: null,
              nextClass: null,
              next30DaysClasses: 0,
              upcomingCourses: []
            });
          }
        });

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

                // 30天内课程总数
                student.next30DaysClasses++;

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
          totals.totalNext30DaysClasses += student.next30DaysClasses || 0;
        }

        // 5. 转换为数组，添加总计信息并排序
        const students = Array.from(studentsMap.values())
          .filter(student => student.name) // 过滤掉没有姓名的记录
          .map(student => {
            // 为每个学员记录添加总计信息（用于排序）
            const totals = studentTotalsMap.get(student.name);
            return {
              ...student,
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
        // 计算未来30天已排课学员数（按姓名去重）
        const studentsWithUpcomingClasses = new Set();
        futureCourseData.forEach(course => {
          if (course.student) {
            studentsWithUpcomingClasses.add(course.student);
          }
        });

        const stats = {
          totalStudents: studentsWithUpcomingClasses.size,
          totalClasses: students.reduce((sum, s) => sum + (s.remainingClasses || 0), 0),
          scheduledClasses: students.reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
          upcomingClasses: futureCourseData.length,
          // 按课程类型分组统计
          byType: {
            菲教: {
              totalClasses: students.filter(s => s.courseType === '菲教').reduce((sum, s) => sum + (s.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '菲教').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              upcomingClasses: futureCourseData.filter(course => {
                // 通过学员姓名找到对应的菲教记录
                return students.some(s => s.name === course.student && s.courseType === '菲教');
              }).length
            },
            欧教: {
              totalClasses: students.filter(s => s.courseType === '欧教').reduce((sum, s) => sum + (s.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '欧教').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              upcomingClasses: futureCourseData.filter(course => {
                // 通过学员姓名找到对应的欧教记录
                return students.some(s => s.name === course.student && s.courseType === '欧教');
              }).length
            },
            一对多: {
              totalClasses: students.filter(s => s.courseType === '一对多').reduce((sum, s) => sum + (s.remainingClasses || 0), 0),
              scheduledClasses: students.filter(s => s.courseType === '一对多').reduce((sum, s) => sum + (s.scheduledClasses || 0), 0),
              upcomingClasses: futureCourseData.filter(course => {
                // 通过学员姓名找到对应的一对多记录
                return students.some(s => s.name === course.student && s.courseType === '一对多');
              }).length
            }
          }
        };

        console.log(`📊 统计数据: 学员${stats.totalStudents}人, 总课时${stats.totalClasses}, 已排${stats.scheduledClasses}, 30天内${stats.upcomingClasses}`);

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

    // API接口：工资计算
    this.app.post('/api/salary-calculate', async (req, res) => {
      let connection;

      try {
        const { startDate, endDate, baseRate, teacherAdjustments = {} } = req.body;

        if (!startDate || !endDate || !baseRate) {
          return res.status(400).json({
            success: false,
            message: '缺少必要参数：开始日期、结束日期、基础课时费'
          });
        }

        connection = await getDbConnection();
        console.log(`💰 开始计算工资数据 (${startDate} ~ ${endDate})...`);

        // 查询指定日期范围内的课程数据，按老师和课程类型分组统计
        const [classData] = await connection.execute(`
          SELECT
            c.teacher,
            COALESCE(s.type, '未知') as course_type,
            COUNT(*) as total_classes,
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
          GROUP BY c.teacher, s.type
          ORDER BY c.teacher, s.type
        `, [startDate, endDate]);

        // 按老师汇总数据
        const teacherSummary = {};
        let totalClasses = 0;

        for (const record of classData) {
          const { teacher, course_type, total_classes, class_details } = record;

          if (!teacherSummary[teacher]) {
            teacherSummary[teacher] = {
              teacher,
              totalClasses: 0,
              courseTypes: {},
              totalSalary: 0
            };
          }

          teacherSummary[teacher].courseTypes[course_type] = {
            classes: parseInt(total_classes),
            details: class_details
          };
          teacherSummary[teacher].totalClasses += parseInt(total_classes);
          totalClasses += parseInt(total_classes);
        }

        // 为每个老师计算工资（支持个人调整）
        const baseRateNum = parseFloat(baseRate);
        let totalSalary = 0;
        let totalAdjustmentAmount = 0;

        // 为每个老师计算工资
        for (const teacher in teacherSummary) {
          const data = teacherSummary[teacher];
          data.baseRate = baseRateNum;

          // 检查该老师是否有个人调整
          let adjustmentAmount = 0;
          let finalRate = baseRateNum;

          if (teacherAdjustments[teacher]) {
            const adjustment = teacherAdjustments[teacher];
            if (adjustment.type === 'percentage') {
              adjustmentAmount = (adjustment.value / 100) * baseRateNum;
            } else if (adjustment.type === 'fixed') {
              adjustmentAmount = adjustment.value;
            }
            finalRate = baseRateNum + adjustmentAmount;
          }

          data.adjustmentAmount = adjustmentAmount;
          data.finalRate = finalRate;
          data.totalSalary = data.totalClasses * finalRate;
          data.hasAdjustment = adjustmentAmount !== 0;
          data.adjustmentType = teacherAdjustments[teacher]?.type || 'none';

          totalSalary += data.totalSalary;
          totalAdjustmentAmount += adjustmentAmount * data.totalClasses;
        }

        console.log(`💰 工资计算完成: 总课时${totalClasses}, 总工资¥${totalSalary.toFixed(2)}`);

        res.json({
          success: true,
          period: { startDate, endDate },
          summary: {
            totalClasses,
            totalTeachers: Object.keys(teacherSummary).length,
            baseRate: baseRateNum,
            totalAdjustmentAmount,
            totalSalary,
            hasIndividualAdjustments: Object.keys(teacherAdjustments).length > 0
          },
          teachers: Object.values(teacherSummary)
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
      }
    });

    // 提供主页面
    this.app.get('/', (req, res) => {
      res.sendFile(path.resolve(this.__dirname, '..', 'dashboard.html'));
    });

    // 健康检查接口
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // 启动服务器
    return new Promise((resolve) => {
      this.webServer = this.app.listen(port, () => {
        console.log(`🚀 仪表板服务器启动成功！`);
        console.log(`🌐 访问地址: http://localhost:${port}`);
        console.log(`📊 API接口: http://localhost:${port}/api/dashboard-data`);
        resolve();
      });
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
  async runWithDashboard(port = 3000) {
    await this.startDashboard(port);
    // 不启动stdio MCP服务器，只运行Web服务器
  }
}

const server = new YuekebaoGrabberServer();
server.run().catch(console.error);