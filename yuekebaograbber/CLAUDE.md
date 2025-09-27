# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a specialized Playwright-based MCP (Model Context Protocol) server designed to scrape comprehensive data from yuekebao.cn, an online course booking platform. The system performs dual data extraction: course management schedules and member card information, with advanced data cleaning, filtering, and database integration.

## Key Commands

- `npm start` - Run the MCP server
- `npm run dev` - Run with auto-reload during development
- `npm test` - Run the complete scraping test (courses + member cards via run-test.js)
- `npm run dashboard` - Start the integrated web dashboard server (http://localhost:3000 by default, use PORT env var to change)
- `npm run dashboard-dev` - Start dashboard with auto-reload during development
- `PORT=3001 node dashboard-start.js` - Start dashboard on specific port (e.g., 3001)
- `node check-excel.js` - Analyze generated course Excel files
- `node check-card-excel.js` - Analyze generated member card Excel files
- `node check-excluded-students.js` - Verify student filtering and data cleaning
- `node test-card-db.js` - Test member card database saving functionality
- `node test-db-connection.js` - Test database connectivity and table structure

## Architecture

### Core Components

**src/index.js** - Main MCP server implementing the `YuekebaoGrabberServer` class:
- Handles MCP protocol communication
- Implements `scrapeYuekebaoCourses` tool for comprehensive automated data extraction
- **Integrated Web Dashboard**: Express server functionality with RESTful API endpoints:
  - `/api/dashboard-data` - Main dashboard data aggregation
  - `/api/config` (GET/POST) - Exchange rate configuration management
  - `/api/last-refresh` - Last data refresh timestamp
  - `/api/student-schedule/:studentName` - Individual student schedule calendar data (2-month range)
  - `/health` - Server health check
- Contains complex browser automation logic including:
  - Login with email/password (3kkg7a7k4d66@qq.com / flyegg)
  - Slider captcha solving with human-like mouse movements
  - Layui framework dropdown navigation
  - **Dual Data Pipeline**: Course schedules + Member card information
  - Advanced data cleaning and filtering
  - Excel export using XLSX library
  - MySQL database integration with two separate tables

**dashboard.html** - Modern web interface for real-time student data monitoring:
- Combined data visualization from both database tables (yuekebao_classtime + yuekebao_student_cardnum)
- Course type breakdowns for statistics (菲教/欧教/一对多)
- Sortable student table with enhanced column layout:
  - **剩余课时**: Total remaining classes for each student
  - **已排课时数**: 90-day scheduled classes (narrow 100px column)
  - **未排课时数**: 90-day unscheduled classes = remaining - scheduled (narrow 100px column)
  - **课节类型**: Course type moved after numeric columns for better flow
- Search and filter functionality by student name and course type
- Risk student highlighting (red text for students with past 14-day classes but no future classes)
- **Interactive Student Schedule Calendar**: Click-based popup system displaying upcoming classes in traditional calendar format
  - Shows 2-month range of future classes with weekly grid layout (日一二三四五六) including weekday labels
  - Displays class times, teacher names directly in calendar cells
  - Smart positioning relative to scroll position and click location
  - Calendar table format with standard 7-column layout showing only dates with data
  - Enhanced calendar formatting with Chinese weekday indicators (星期日/一/二/三/四/五/六)

### Authentication Flow

The system performs automated login through multiple stages:
1. Navigate to login page (`https://www.yuekebao.cn/admin/login.php`)
2. Fill credentials and submit form
3. Detect and solve slider captcha (`.drag-btn` element) with realistic drag patterns
4. Navigate to weekly course management page (`course.php?dataName=course_week`)
5. Select "全部老师" (All Teachers) from layui dropdown
6. After course extraction, navigate to member card page (`card_once.php`)
7. Configure page size to 100 items and iterate through all pages

### Data Extraction Logic

#### Course Schedule Extraction
**Table Header Processing**: Extracts dates from `th.nowrap.td_top` elements containing patterns like "09-22\n周一 28节"

**Course Data Parsing**: Processes table cells to identify:
- Time patterns (HH:MM format)
- Teacher names from predefined list (May, Angel, Jake, Jenny, Lou, Diana, Gel, etc.)
- Student information (names with ID numbers)
- Deduction counts ("扣X次" patterns)
- Handles special teacher status variations (e.g., Gel teacher uses different HTML structure)

**Time Filtering**: Only extracts courses within 1.5 months from current date to avoid processing historical data

#### Member Card Extraction
**Data Fields**: Extracts from `tr[data-index]` table rows:
- Student name from `[data-field="member_name"]` or `data-content` attribute
- Phone number from `a[href^="tel:"]` links
- Course type from `span.ft15` elements
- Remaining classes from "余X次" patterns
- Scheduled classes from "未开课预扣X次" patterns

**Data Cleaning & Filtering**:
- **Course Type Standardization**: 菲教类 → "菲教", 欧教类 → "欧教", 一对X → "一对多"
- **Record Filtering**: Excludes "试课" (trial) records completely
- **Student Exclusion**: Filters out specific students: 李思敏, nala, 胖达, 沈沐兮 Scarlett
- **Data Merging**: Combines records with same course type + student name + phone number

### Dashboard System Architecture

The integrated web dashboard combines data from both database tables to provide comprehensive student management insights:

**Data Aggregation Logic**:
- Joins `yuekebao_classtime` and `yuekebao_student_cardnum` tables using student names
- Supports students with multiple course types (菲教/欧教/一对多) as separate table rows
- Uses composite keys (`${studentName}_${courseType}`) to ensure proper multi-type display
- Calculates upcoming classes within 30-day window from current date

**Statistical Calculations**:
- **未来90天已排课学员数**: Count of students with >0 scheduled classes in next 90 days (based on `next90DaysClasses` field)
- **未来90天课时**: Sum of upcoming classes within 90-day window
- **总剩余课时**: Sum of all remaining classes with breakdown by course type
- **总已排课时**: Sum of all scheduled classes with breakdown by course type

**Frontend Features**:
- Sortable table headers with visual indicators (white background, purple text)
- Real-time search filtering by student name
- Course type filtering dropdown (全部/菲教/欧教/一对多)
- Next class information display with teacher and datetime
- Course type badges with color coding
- Statistical breakdown display under each metric
- **Exchange Rate Configuration System**: Built-in settings panel for dynamic currency conversion

### Exchange Rate Configuration System

The system includes a dynamic exchange rate configuration feature accessible through the dashboard's "系统设置" (System Settings) tab. This allows real-time adjustment of currency conversion rates used in salary calculations.

**Database Schema**:
- Table: `yuekebao_config`
- Fields: `id` (INT PRIMARY KEY), `config` (JSON), `updated_at` (TIMESTAMP)
- Storage format: JSON object with `cny_to_pesos` and `dollars_exchange` fields

**API Endpoints**:
- **GET `/api/config`**: Retrieves current exchange rate configuration
- **POST `/api/config`**: Updates exchange rate configuration with validation
- Both endpoints require JSON format and include proper error handling

**Configuration Fields**:
- **欧教汇率 (Dollars Exchange)**: USD to CNY conversion rate (format: 1 Dollar = X CNY)
- **菲教汇率 (CNY to Pesos)**: CNY to Philippine Peso conversion rate (format: 1 CNY = X Pesos)

**Data Format Evolution**:
- **Legacy format**: `pesos_exchange` (1 Peso = X CNY)
- **Current format**: `cny_to_pesos` (1 CNY = X Pesos) - provides easier data entry
- System maintains backward compatibility with both formats

**Integration Points**:
- Salary calculation pages automatically load current exchange rates on tab switch
- All currency conversions in financial reports use database-stored rates instead of hardcoded values
- Real-time updates without requiring application restart

**Implementation Details**:
- Frontend uses `loadExchangeRates()` function called on tab activation
- Backend creates default configuration (7.65 CNY→Pesos, 7.12 USD→CNY) if none exists
- Validation ensures rates are positive numbers before saving
- Toast notifications provide user feedback for save operations

### Student Schedule Calendar System

The dashboard includes an interactive calendar popup system for viewing individual student schedules. This feature provides a visual calendar view of upcoming classes for any student.

**API Endpoint**: `/api/student-schedule/:studentName`
- Fetches student's upcoming classes for 2-month period from current date
- Returns class data including dates, times, teachers, and time deductions
- Uses prepared statements with parameterized queries for security

**Frontend Implementation**:
- **Click-based Interaction**: Click any student row to open their schedule calendar
- **Calendar Format**: Traditional 7-column weekly layout (日一二三四五六)
- **Data Display**: Shows only weeks containing scheduled classes
- **Class Information**: Each calendar cell displays:
  - Class times (e.g., "09:00", "14:30")
  - Teacher names directly visible (no hover required)
  - Multiple classes per day (up to 3 shown, "+N" for more)

**Technical Features**:
- **Smart Positioning**: Popup appears near click location, adjusts for screen boundaries
- **Scroll-aware**: Positioning accounts for current page scroll position
- **Outside Click Closing**: Click anywhere outside popup to close
- **Student Switching**: Click different student rows to change popup content
- **Today Highlighting**: Current date highlighted with blue styling

**CSS Implementation**:
- Uses CSS Grid for calendar layout (`grid-template-columns: repeat(7, 1fr)`)
- Responsive design with minimum cell height (80px)
- Color-coded styling for today's date and class information
- Font size optimization for readability (10px times, 9px teacher names)

### Data Export

#### Course Data
**Excel Export**: Generates timestamped Excel files: `约课宝周课程数据_TIMESTAMP.xlsx`
- Columns: 日期(Date), 时间(Time), 老师(Teacher), 学生(Student), 扣课数(Deduction Count), 周期(Period)

**MySQL Database**: Saves to `yuekebao_classtime` table with schema:
- `teacher` (VARCHAR): Teacher name
- `student` (VARCHAR): Student name
- `time_num` (INT): Deduction count
- `class_date` (DATE): Course date
- `class_start_time` (VARCHAR): Start time (HH:MM)
- `class_end_time` (VARCHAR): End time (HH:MM)
- `week_period` (VARCHAR): Weekly period identifier
- `create_time` (DATETIME): Record creation timestamp

#### Member Card Data
**Excel Export**: Generates timestamped Excel files: `约课宝会员卡数据_TIMESTAMP.xlsx`
- Columns: 学生姓名, 学生手机号, 课程类型, 剩余课时数, 剩余已排课数

**MySQL Database**: Saves to `yuekebao_student_cardnum` table with schema:
- `student` (VARCHAR): Student name
- `mobile` (VARCHAR): Student phone number
- `class_card_type` (VARCHAR): Course type (菲教/欧教/一对多)
- `card_times_left` (INT): Remaining class count
- `arranged_times` (INT): Scheduled class count
- `time_num` (INT): Fixed value (1)
- `create_time` (DATETIME): Record creation timestamp

**Data Management**:
- Course data: Smart replacement by date range
- Member card data: Complete table clearing before new insertion

## Debug Tools

- **check-excel.js**: Inspect course Excel files - verify format and data quality
- **check-card-excel.js**: Inspect member card Excel files - analyze cleaned data results
- **check-excluded-students.js**: Verify data filtering effectiveness
- **test-card-db.js**: Standalone member card database save test
- **test-db-connection.js**: Database connectivity and schema verification
- **run-test.js**: Complete end-to-end workflow test (courses + member cards)

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
1. **Course Data**: Table structure changes, teacher name variations, time format changes
2. **Member Card Data**: Pagination changes, data field selectors, filtering logic effectiveness
3. **Database**: Connection credentials, table schemas match expected format
4. **Login**: Credential validity, captcha solver effectiveness
5. **Dashboard Access**: Ensure you're accessing the correct port (check console output for "访问地址")
6. **Exchange Rate Issues**: If API returns HTML instead of JSON, verify server is running latest code
7. **Student Calendar Issues**:
   - If popup doesn't appear: Check event binding in `setupStudentHoverEvents()` and table selector `#dataTable tbody tr`
   - If calendar shows wrong dates: Verify date calculation logic in calendar generation functions
   - If positioning is wrong: Check `positionTooltip()` function and scroll position calculations
   - If only 6 columns instead of 7: Check date increment logic in calendar week generation
   - If calendar grid misalignment: Verify `.calendar-header`, `.calendar-week`, and `.schedule-calendar` all have matching `gap: 4px` CSS property
8. **Table Layout Issues**:
   - If columns appear too wide: Check `.narrow-column` CSS (should be 100px width for 已排课时数 and 未排课时数)
   - If column order is wrong: Verify table header sequence matches row data output sequence
   - If statistics show wrong numbers: Check calculation logic for `studentsWithUpcomingClasses` and ensure it uses `next90DaysClasses > 0` filter

## Architecture Patterns

**Multi-Selector Teacher Extraction**: Uses cascading CSS selectors to handle different teacher status variations:
- Standard: `div.memberCon div.textEllipsis`
- Special status (Gel): `div.ft12.color_9.textEllipsis`
- Fallback: `div[class*="textEllipsis"]`

**Dual Database Strategy**:
- Course data: Smart replacement by date range (preserves historical data outside extraction window)
- Member card data: Complete table refresh (ensures current snapshot consistency)

**Data Pipeline Architecture**: Sequential extraction with shared browser session:
1. Login authentication → 2. Course data extraction & DB save → 3. Member card extraction & DB save → 4. Dual Excel generation

## Critical Implementation Details

**Student Exclusion List**: Hard-coded filter for specific students (李思敏, nala, 胖达, 沈沐兮 Scarlett) - update in code when requirements change

**Course Type Mapping**: Standardization rules for member card course types:
- Any containing "菲教" → "菲教"
- Any containing "欧教" → "欧教"
- Any containing "一对" → "一对多"
- Exact match "试课" → Exclude completely

**Database Connection**: Uses `baboontalkies` database on Aliyun RDS with specific credentials in code