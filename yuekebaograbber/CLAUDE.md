# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a specialized Playwright-based MCP (Model Context Protocol) server designed to scrape course management data from yuekebao.cn, an online course booking platform. The project has evolved from simple homepage scraping to a sophisticated automated system that handles authentication, captcha solving, and course data extraction.

## Key Commands

- `npm start` - Run the MCP server
- `npm run dev` - Run with auto-reload during development
- `npm test` - Run the course scraping test (uses run-test.js)
- `node check-excel.js` - Analyze generated Excel files
- `node debug-table.js` - Debug table structure and data extraction
- `node debug-slider.js` - Debug slider captcha handling

## Architecture

### Core Components

**src/index.js** - Main MCP server implementing the `YuekebaoGrabberServer` class:
- Handles MCP protocol communication
- Implements `scrapeYuekebaoCourses` tool for automated course data extraction
- Contains complex browser automation logic including:
  - Login with email/password (3kkg7a7k4d66@qq.com / flyegg)
  - Slider captcha solving with human-like mouse movements
  - Layui framework dropdown navigation
  - Weekly course schedule extraction from HTML tables
  - Excel export using XLSX library
  - MySQL database integration for persistent storage

### Authentication Flow

The system performs automated login through multiple stages:
1. Navigate to login page (`https://www.yuekebao.cn/admin/login.php`)
2. Fill credentials and submit form
3. Detect and solve slider captcha (`.drag-btn` element) with realistic drag patterns
4. Navigate to weekly course management page (`course.php?dataName=course_week`)
5. Select "全部老师" (All Teachers) from layui dropdown

### Data Extraction Logic

**Table Header Processing**: Extracts dates from `th.nowrap.td_top` elements containing patterns like "09-22\n周一 28节"

**Course Data Parsing**: Processes table cells to identify:
- Time patterns (HH:MM format)
- Teacher names from predefined list (May, Angel, Jake, Jenny, Lou, Diana, Gel, etc.)
- Student information (names with ID numbers)
- Deduction counts ("扣X次" patterns)
- Handles special teacher status variations (e.g., Gel teacher uses different HTML structure)

**Time Filtering**: Only extracts courses within 1.5 months from current date to avoid processing historical data

### Data Export

**Excel Export**: Generates timestamped Excel files with columns: 日期(Date), 时间(Time), 老师(Teacher), 学生(Student), 扣课数(Deduction Count), 周期(Period)

**MySQL Database**: Saves course data to Aliyun RDS MySQL database with schema:
- `teacher` (VARCHAR): Teacher name
- `student` (VARCHAR): Student name
- `time_num` (INT): Deduction count
- `class_date` (DATE): Course date
- `class_start_time` (VARCHAR): Start time (HH:MM)
- `class_end_time` (VARCHAR): End time (HH:MM)
- `week_period` (VARCHAR): Weekly period identifier
- `create_time` (DATETIME): Record creation timestamp

**Data Deduplication**: Before inserting new data, the system automatically deletes existing records for the same date range to prevent duplicates and ensure data freshness

## Debug Tools

- **check-excel.js**: Excel file content inspection - use to verify export format and data quality
- **run-test.js**: Full end-to-end test runner with login credentials for testing the complete workflow

## Key Technical Considerations

**Captcha Handling**: Uses sophisticated human-like mouse movement simulation with randomized delays and trajectory variations to bypass slider captcha detection

**Layui Framework**: The target site uses Layui UI framework requiring specific DOM selectors and interaction patterns for dropdown menus

**Rate Limiting**: Includes deliberate delays between operations to avoid triggering anti-bot measures

**Error Recovery**: Implements fallback strategies for common failure points like captcha solving and dropdown selection

## Data Quality Patterns

The system expects course data in specific HTML table structures where:
- Date information is in table headers, not individual cells
- Course sessions contain time, teacher, and student info within single cells
- Teacher names must match the predefined list exactly
- Student entries typically include names followed by ID numbers

When debugging extraction issues, check:
1. Table structure changes on the target site
2. Teacher name variations not in the predefined list (especially special status teachers)
3. Time format changes
4. Login credential validity

## Recent Enhancements

**Multi-Selector Teacher Extraction**: The system now uses multiple CSS selectors to handle different teacher status variations:
- Standard teachers: `div.memberCon div.textEllipsis`
- Special status teachers (like Gel): `div.ft12.color_9.textEllipsis`
- Fallback: Generic `div[class*="textEllipsis"]`

**Database Management**: Implements smart data replacement by detecting date ranges in scraped data and removing existing records for those dates before inserting new ones, ensuring database consistency without full table truncation