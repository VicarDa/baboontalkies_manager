# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a specialized Playwright-based MCP (Model Context Protocol) server designed to scrape comprehensive data from yuekebao.cn, an online course booking platform. The system performs dual data extraction: course management schedules and member card information, with advanced data cleaning, filtering, and database integration.

## Key Commands

- `npm start` - Run the MCP server
- `npm run dev` - Run with auto-reload during development
- `npm test` - Run the complete scraping test (courses + member cards via run-test.js)
- `npm run dashboard` - Start the integrated web dashboard server (HTTPS by default on port 3000)
- `npm run dashboard-https` - Explicitly start dashboard with HTTPS (default behavior)
- `npm run dashboard-http` - Start dashboard with HTTP only (bypasses HTTPS)
- `npm run dashboard-dev` - Start dashboard with auto-reload during development (HTTPS)
- `npm run serve` - Alternative command to start dashboard (same as npm run dashboard)
- `PORT=3001 npm run dashboard` - Start dashboard on specific port (e.g., 3001)
- `HTTPS=false npm run dashboard` - Start dashboard with HTTP only using environment variable
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
- **Interactive Student Schedule Calendar**: Click-based popup system displaying upcoming classes in calendar format
  - Shows 2-month range of future classes with weekly grid layout (日一二三四五六)
  - Displays dates without weekday labels (e.g., "10/8" instead of "10/8 星期三")
  - Shows class times and teacher names directly in calendar cells
  - Smart positioning relative to scroll position and click location
  - Calendar table format with standard 7-column layout showing only dates with data
  - Scaled up 30% using CSS transform for better visibility
  - Student name displayed in bold at top of calendar popup

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
- **Name Normalization**: Standardizes multiple consecutive spaces to single space using `.replace(/\s+/g, ' ')` to prevent matching issues (e.g., "Doris  6251" → "Doris 6251")
- **Course Type Standardization**: 菲教类 → "菲教", 欧教类 → "欧教", 一对X → "一对多"
- **Record Filtering**: Excludes "试课" (trial) records completely
- **Student Exclusion**: Filters out specific students: 李思敏, nala, 胖达, 沈沐兮 Scarlett
- **Conditional Card Filtering**: For students with multiple course types, only shows cards with `card_times_left > 0`; for students with single course type, shows all cards regardless of remaining classes
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
- **check_mysql_data.py**: Python script for MySQL data analysis and verification
- **test-card-db.js**: Standalone member card database save test (may not exist currently)
- **test-db-connection.js**: Database connectivity and schema verification (may not exist currently)
- **test-filtering.js**: Test conditional card filtering logic for students with multiple course types (may not exist currently)
- **run-test.js**: Complete end-to-end workflow test (courses + member cards)
- **manual_scrape_test.mjs**: Standalone manual scraping test for local debugging
- **watch_logs.sh**: Real-time log monitoring script that auto-detects timer trigger execution and DEBUG logs
- **check_monitor.sh**: Periodic checker that waits for 10-minute trigger intervals and captures logs
- **monitor_trigger.sh**: Alternative log monitoring script that refreshes display every 5 seconds

## Key Technical Considerations

**Captcha Handling**: Uses sophisticated human-like mouse movement simulation with randomized delays and trajectory variations to bypass slider captcha detection

**Layui Framework**: The target site uses Layui UI framework requiring specific DOM selectors and interaction patterns for dropdown menus

**Rate Limiting**: Includes deliberate delays between operations to avoid triggering anti-bot measures

**Error Recovery**: Implements fallback strategies for common failure points like captcha solving and dropdown selection

**Retry Mechanism**: Built-in automatic retry system with the following characteristics:
- **Universal Retry Function**: `retryWithDetection()` method for robust element detection
- **Retry Configuration**: Maximum 10 attempts with 1000ms intervals between retries
- **Intelligent Detection**: Validates element existence and data availability before proceeding
- **Comprehensive Logging**: Detailed status reporting for each retry attempt
- **Graceful Degradation**: Continues execution even after maximum retries exceeded

**Applied to Critical Operations**:
- Login form element detection (email/password inputs with alternative selectors)
- Teacher dropdown container and option selection
- Member card page button interactions ("所有" button, pagination settings)
- Table data loading verification with row count validation
- All operations automatically retry on failure, improving success rates significantly

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
9. **Card Filtering Issues**:
   - If students with 0 remaining classes still appear: Check conditional filtering logic in dashboard-data API endpoint
   - If single-course-type students disappear: Verify single-type students are exempt from card_times_left filtering
   - For debugging: Use `python check_mysql_data.py` or create custom test scripts to verify filtering logic
10. **Retry Mechanism Issues**:
   - If elements still fail after retries: Check if selectors have changed on target website
   - If retries are too slow: Adjust interval parameter in `retryWithDetection()` calls
   - If false positives occur: Verify return value validation logic in detection functions
   - Monitor retry logs for patterns: Look for consistent failure points that may need different approaches
11. **Timer Trigger Issues** (CRITICAL):
   - If trigger fires but no scraping: Check `src/index.js:startScheduledScraping()` executes `performScheduledScraping()` in cloud environment
   - If logs show `☁️  检测到云函数环境` but no scraping: Function is returning early without executing - apply the fix in "Timer Trigger Debugging" section
   - If database not updating: Verify logs show complete scraping workflow (login → captcha → data extraction → DB save)
   - Monitor timer triggers: Use `s logs --tail -n 100 | grep "RequestId: t-"` to see all timer executions
   - Test fix: Wait for next 10-minute interval and verify logs show `🚀 云函数启动 - 执行定时抓取任务...` followed by scraping logs

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

## Cloud Function Deployment (Alibaba Cloud)

This project is deployed to Alibaba Cloud Function Compute and does **NOT** auto-deploy from Gitee. Manual deployment is required.

### Deployment Architecture

**Entry Points:**
- `index.mjs` - Cloud function entry point that wraps the Express server
- `bootstrap` - Custom runtime startup script for FC
- `dashboard-start.js` - Local development entry point

**Key Configuration Files:**
- `s.yaml` - Serverless Devs deployment configuration for FC 3.0
- Environment variables: `NODE_ENV=production`, `PORT=9000`, `HTTPS=false`, `BASE_PATH=/baboontalkies_manager`

### Deployment Commands

```bash
# Deploy to Alibaba Cloud Function Compute
s deploy -y

# View deployment info
s info

# View logs
s logs --tail -n 20
s logs -t  # real-time

# Local shortcut: commit + deploy
git dp  # uses git alias configured as: git add . && git commit -m "自动提交" && s deploy -y
```

### Cloud Function Setup

**Runtime Configuration:**
- Runtime: `custom.debian10`
- Node.js Layer: `acs:fc:cn-hangzhou:official:layers/Nodejs20/versions/2`
- Memory: 2048 MB
- Timeout: 900 seconds (15 minutes)
- Instance Concurrency: 1 (prevents resource conflicts during scraping)

**Triggers:**
1. **HTTP Trigger** (`httpTrigger`) - For web access and manual operations
2. **Timer Trigger** (`autoScraper`) - Auto-scrapes data every 10 minutes
   - Cron: `0 0,10,20,30,40,50 * * * *` (executes at :00, :10, :20, :30, :40, :50 of every hour)
   - Payload: `{"action":"auto-scrape","interval":"10min"}`
   - Handler in `index.mjs` detects `req.triggerName === 'autoScraper'` and calls scraping function

**Path Handling:**
- `BASE_PATH` environment variable set to `/baboontalkies_manager` for custom domain routing
- Backend middleware in `src/index.js` strips path prefix before processing
- Frontend `dashboard.html` auto-detects BASE_PATH from `window.location.pathname`

### Access URLs

- **Custom Domain**: `http://fc.pandada.world/baboontalkies_manager`
- **System URL**: `https://baboontager-mcp-cpjvwkqddf.cn-hangzhou.fcapp.run`
- **Health Check**: `/health`
- **API Endpoints**: `/api/*` (all require BASE_PATH prefix when using custom domain)

### Deployment Workflow

**Important**: Gitee commits do NOT trigger automatic deployment. Manual deployment required.

1. Make code changes locally
2. Test locally: `npm run dashboard-http`
3. Deploy: `git dp` (commits + deploys) or `s deploy -y`
4. Verify: Check logs with `s logs --tail -n 50`

### Timer Trigger Behavior

The `autoScraper` timer trigger:
- Executes every 10 minutes (144 times per day)
- Calls `scrapeYuekebaoCourses()` with default credentials
- Updates both database tables (course schedules + member cards)
- Logs execution details viewable via `s logs`
- Can be disabled in `s.yaml` by setting `enable: false`

### Monitoring

```bash
# View function info (includes trigger status)
s info | grep -A 35 "triggers:"

# Check timer trigger executions in logs
s logs --tail -n 100 | grep "⏰ 定时触发器"

# Test health endpoint
curl http://fc.pandada.world/baboontalkies_manager/health

# Monitor timer trigger execution (automated)
./watch_logs.sh  # Real-time log monitoring with auto-detection
./check_monitor.sh  # Periodic checks at 10-minute intervals
```

### Timer Trigger Debugging (Critical)

**IMPORTANT**: Timer triggers in Alibaba Cloud FC cause container cold starts, which means they run the initialization code (including `initialize()` in `index.mjs`), but they do NOT directly invoke the handler function like HTTP triggers do.

#### Common Problem: Timer Trigger Fires But Doesn't Execute Scraping

**Symptoms:**
- Logs show `FC Invoke Start RequestId: t-xxx` (RequestId starting with `t-` indicates timer trigger)
- Logs show cloud environment detection message: `☁️  检测到云函数环境`
- But NO scraping activity logs appear
- Database remains unchanged with old data

**Root Cause:**
When timer trigger fires:
1. FC starts a new container instance (cold start)
2. Runs `bootstrap` script → executes `index.mjs`
3. Calls `initialize()` → creates server instance
4. Calls `serverInstance.runWithDashboard()`
5. Inside `runWithDashboard()`, calls `startScheduledScraping()`
6. `startScheduledScraping()` detects cloud environment
7. **Problem**: Function immediately returns without executing scraping!

**The Bug** (in `src/index.js:startScheduledScraping()`):
```javascript
if (isCloudFunction) {
  console.log('☁️  检测到云函数环境 - 使用阿里云定时触发器(每10分钟)');
  console.log('⏰ 定时触发器配置: 0 0,10,20,30,40,50 * * * *');
  // ...
  return; // ❌ This exits without doing anything!
}
```

**The Fix** (in `src/index.js:startScheduledScraping()`, around line 3187-3224):
```javascript
if (isCloudFunction) {
  console.log('☁️  检测到云函数环境 - 使用阿里云定时触发器(每10分钟)');
  console.log('⏰ 定时触发器配置: 0 0,10,20,30,40,50 * * * *');
  console.log('📅 每天执行次数: 144次');

  // Calculate next run time for logging...
  console.log('✅ 定时器配置完成 - 下次抓取时间:', nextRun.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  // 🔥 Critical fix: Execute scraping immediately in cloud function environment
  console.log('🚀 云函数启动 - 执行定时抓取任务...');
  try {
    await this.performScheduledScraping();
    console.log('✅ 云函数定时抓取完成');
  } catch (error) {
    console.error('❌ 云函数定时抓取失败:', error.message);
    console.error('📋 错误堆栈:', error.stack);
  }

  return; // Don't start local interval timer
}
```

**Verification Steps:**
1. Deploy the fix: `s deploy -y`
2. Wait for next timer trigger (at :00, :10, :20, :30, :40, :50 of any hour)
3. Check logs: `s logs --tail -n 50`
4. Expected log sequence:
   ```
   FC Invoke Start RequestId: t-xxxxx
   ☁️  检测到云函数环境 - 使用阿里云定时触发器(每10分钟)
   🚀 云函数启动 - 执行定时抓取任务...
   [scraping logs: login, captcha, data extraction...]
   ✅ 云函数定时抓取完成
   FC Invoke End RequestId: t-xxxxx
   ```
5. Verify database has new data with recent `create_time`

**Alternative Verification (using index.mjs handler):**
The `index.mjs` handler also has logging for timer triggers:
```javascript
if (req && req.triggerName === 'autoScraper') {
  console.log('='.repeat(60));
  console.log('⏰ 定时触发器触发 - 开始自动抓取数据');
  console.log('🕐 当前时间(北京时间):', timeString);
  // ... scraping execution ...
  console.log('✅ 定时抓取完成');
  console.log('='.repeat(60));
}
```

However, this handler approach was NOT being triggered. The actual execution happens through the initialization flow described above.

**Debugging Tools:**
- `watch_logs.sh` - Real-time log monitoring that auto-detects timer trigger execution
- `check_monitor.sh` - Periodic checker that waits for 10-minute intervals
- `manual_scrape_test.mjs` - Standalone test to verify scraping logic works locally

**Key Lessons:**
1. Timer triggers cause cold starts, not handler invocations
2. Cloud environment detection must execute scraping, not just log messages
3. Always verify logs show actual scraping activity, not just trigger firing
4. Test database updates to confirm scraping completed successfully
5. RequestId patterns: `t-xxx` = timer trigger, other patterns = HTTP trigger

- 输入"部署",就执行 `git add . && git commit -m "自动提交" && s deploy -y`