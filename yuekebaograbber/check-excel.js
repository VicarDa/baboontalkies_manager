#!/usr/bin/env node

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Find the latest Excel file (ignore temporary files starting with .)
const files = fs.readdirSync('.')
  .filter(file => file.endsWith('.xlsx') && file.includes('约课宝') && !file.startsWith('.'))
  .map(file => ({
    name: file,
    stat: fs.statSync(file)
  }))
  .sort((a, b) => b.stat.mtime - a.stat.mtime);

if (files.length === 0) {
  console.log('No Excel files found');
  process.exit(1);
}

const latestFile = files[0].name;
console.log(`\n📊 检查最新Excel文件: ${latestFile}`);
console.log(`📁 文件大小: ${(files[0].stat.size / 1024).toFixed(2)} KB`);
console.log(`📅 修改时间: ${files[0].stat.mtime.toLocaleString()}\n`);

try {
  // Read the Excel file
  const workbook = XLSX.readFile(latestFile);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`📋 工作表名称: ${sheetName}`);
  console.log(`📊 总行数: ${data.length}`);

  if (data.length > 0) {
    console.log(`\n🔍 列名 (前5列):`);
    const columns = Object.keys(data[0]);
    columns.slice(0, 5).forEach((col, i) => {
      console.log(`  ${i + 1}. ${col}`);
    });

    console.log(`\n📄 前3行数据:`);
    data.slice(0, 3).forEach((row, i) => {
      console.log(`\n--- 第${i + 1}行 ---`);
      Object.entries(row).forEach(([key, value]) => {
        if (value && value.toString().trim()) {
          console.log(`  ${key}: ${value}`);
        } else {
          console.log(`  ${key}: [空]`);
        }
      });
    });

    // Check for empty data
    console.log(`\n🔍 数据质量检查:`);
    const emptyDateCount = data.filter(row => !row['日期'] || row['日期'].toString().trim() === '').length;
    const emptyTimeCount = data.filter(row => !row['时间'] || row['时间'].toString().trim() === '').length;
    const emptyTeacherCount = data.filter(row => !row['老师'] || row['老师'].toString().trim() === '').length;
    const emptyStudentCount = data.filter(row => !row['学生'] || row['学生'].toString().trim() === '').length;

    console.log(`  空日期: ${emptyDateCount}/${data.length}`);
    console.log(`  空时间: ${emptyTimeCount}/${data.length}`);
    console.log(`  空老师: ${emptyTeacherCount}/${data.length}`);
    console.log(`  空学生: ${emptyStudentCount}/${data.length}`);
  }

} catch (error) {
  console.error('读取Excel文件失败:', error.message);
}