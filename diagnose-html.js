#!/usr/bin/env node

import { chromium } from 'playwright';
import * as readline from 'readline';

function waitForEnter(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function diagnoseHtml() {
  console.log('开始诊断网页HTML结构...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 登录
    console.log('导航到登录页面...');
    await page.goto('https://www.yuekebao.cn/admin/login.php');
    await page.waitForTimeout(1000);

    // 填写登录表单
    await page.fill('input[name="email"]', '3kkg7a7k4d66@qq.com');
    await page.fill('input[name="password"]', 'flyegg');
    await page.click('button[type="submit"], input[type="submit"], .layui-btn');

    // 等待用户手动完成验证码
    await waitForEnter('\n请在浏览器中完成验证码，登录成功后按回车继续...');

    // 导航到课程页面
    console.log('导航到课程页面...');
    await page.goto('https://www.yuekebao.cn/admin/course.php?dataName=course_week');
    await page.waitForTimeout(3000);

    // 抓取HTML
    const htmlInfo = await page.evaluate(() => {
      const results = {};

      // 找到第一个有课程的单元格
      const courseCells = document.querySelectorAll('td[data-day]');
      for (let cell of courseCells) {
        const courseDivs = cell.querySelectorAll('div.ft12.position_r.nowrap');
        if (courseDivs.length > 0) {
          results.cellHTML = cell.outerHTML.substring(0, 5000);
          results.courseDivHTML = courseDivs[0].outerHTML;
          results.courseDivText = courseDivs[0].innerText;
          results.dataDay = cell.getAttribute('data-day');

          // 查找所有可能包含老师信息的元素
          const allDivs = courseDivs[0].querySelectorAll('div');
          results.allDivs = Array.from(allDivs).map(div => ({
            className: div.className,
            text: div.innerText.substring(0, 100)
          }));

          break;
        }
      }

      return results;
    });

    console.log('\n========== HTML诊断结果 ==========\n');
    console.log('日期:', htmlInfo.dataDay);
    console.log('\n--- 课程div的完整HTML ---');
    console.log(htmlInfo.courseDivHTML);
    console.log('\n--- 课程div的innerText ---');
    console.log(htmlInfo.courseDivText);
    console.log('\n--- 所有子div ---');
    htmlInfo.allDivs?.forEach((div, i) => {
      console.log(`${i + 1}. class="${div.className}" text="${div.text}"`);
    });

    await waitForEnter('\n按回车关闭浏览器...');

  } catch (error) {
    console.error('诊断失败:', error);
  } finally {
    await browser.close();
  }
}

diagnoseHtml();
