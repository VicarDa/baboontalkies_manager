# Feature: 修复试课工资计算逻辑 - 自动区分普通课与试课

## Feature Description

当前工资计算系统无法自动区分普通课和试课，导致计算错误。系统将所有课程按相同课时费计算，然后要求管理员手动输入试课数据来调整佣金。这导致：

1. **重复计算问题**: 试课被计算了两次 - 一次在总课时中（按全价），一次在试课佣金中（按0.5或1倍）
2. **数据不一致**: 数据库中的课程总数包含试课，但试课应该单独计算
3. **手动操作负担**: 管理员需要手动统计试课数量并输入

**根本原因**: 爬虫在抓取数据时识别了课程类型（试课/菲教/欧教），但保存到数据库时**丢弃了课程类型字段**。

## User Story

作为系统管理员
我希望工资计算能自动区分普通课和试课
以便准确计算老师工资，避免重复计算和手动统计的错误

## Problem Statement

**示例场景 - Hersel 老师**:
- 实际课程: 2节普通课（菲教）+ 4节试课
- 课时费: 90 pesos/节
- 试课规则: 失败试课按50%计费（45 pesos）

**期望工资计算**:
```
普通课工资 = 2 × 90 = 180 pesos
试课佣金(失败) = 4 × 45 = 180 pesos
总工资 = 360 pesos
```

**当前系统计算**:
```
总课程数 = 6节（包含试课）
基础工资 = 6 × 90 = 540 pesos
手动输入试课: 4节失败试课
试课佣金 = 4 × 45 = 180 pesos
总工资 = 540 + 180 = 720 pesos ❌ 错误！试课被重复计算
```

**技术根因**:

1. **数据丢失**: 爬虫提取的 `courseType` 字段（src/index.js:819-828）在保存数据库时未存储
2. **表结构缺失**: `yuekebao_classtime` 表缺少 `course_type` 字段
3. **计算逻辑错误**: 所有课程按同一价格计算，试课另加佣金，造成双重计费

## Solution Statement

### 核心方案: 四步修复 + 智能判定

**Step 1: 数据库层 - 添加课程类型字段**
- 在 `yuekebao_classtime` 表添加 `course_type` 列
- 存储值: `'试课'`, `'菲'`, `'欧'`, `'未知'`

**Step 2: 爬虫层 - 保存课程类型**
- 修改数据插入逻辑，保存 `course_type` 字段
- 确保爬虫提取的课程类型不被丢弃

**Step 3: 智能判定层 - 自动判定试课成功/失败** ⭐ 新增
- 对每个试课记录，查询该学生与该老师是否有后续正式课程
- **判定规则**:
  ```sql
  如果存在: (同一老师 + 同一学生) AND (course_type != '试课') AND (日期 > 试课日期)
    → 试课成功 (successful trial)
  否则:
    → 试课失败 (failed trial)
  ```
- **实现方式**:
  - SQL子查询或JOIN关联查询
  - 按老师分组统计成功/失败试课数量
  - **自动填充**前端的 "Number of Successful Trial Class" 和 "Number of Failed Trial Class" 输入框

**Step 4: 工资计算层 - 自动区分计算**
- 修改SQL查询，按 `course_type` 分组统计
- 普通课: 按全价计算
- 试课成功: 按全价计佣（100%）
- 试课失败: 按半价计佣（50%）
- 前端显示: 分别展示普通课课时和试课课时（成功/失败）

### 向后兼容策略

**历史数据处理**:
- 对于已有数据（course_type 为 NULL）: 视为普通课
- 新抓取数据: 正确标记课程类型
- 历史试课: 由于无法判定成功/失败，默认视为失败（保守计算）

**UI兼容**:
- **自动填充**试课成功/失败数量（基于智能判定）
- 保留手动输入功能（作为覆盖调整机制）
- 显示自动判定的依据（如："基于后续3节正式课"）
- 允许管理员手动覆盖自动判定结果

## Feature Metadata

**Feature Type**: Bug Fix + Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**:
- 数据库表结构 (yuekebao_classtime)
- 爬虫数据保存逻辑 (src/index.js)
- 工资计算API (src/index.js)
- 前端工资显示 (dashboard.html)

**Dependencies**:
- MySQL 数据库
- Playwright 爬虫
- Express.js API

---

## CONTEXT REFERENCES

### Relevant Codebase Files

**爬虫数据抓取与保存**:
- `src/index.js` (lines 819-828) - 课程类型提取逻辑
  - 从课程详情中识别 "试课" 标记
  - 变量 `courseType` 被提取但未使用

- `src/index.js` (lines 2070-2180) - 数据库保存逻辑
  - 第2152-2154行: INSERT 语句缺少 course_type 字段
  - 需要添加 course_type 到插入语句

**工资计算API**:
- `src/index.js` (lines 3162-3331) - `/api/salary-calculate` 端点
  - 第3179-3199行: SQL查询逻辑（需修改）
  - 第3258-3291行: 工资计算公式（需增强）
  - 第3263-3272行: 试课佣金计算（需重构）

**前端显示**:
- `dashboard.html` (lines 2846-2867) - 试课数据收集
  - 手动输入试课数量的逻辑
  - 需要添加自动识别的试课数量显示

- `dashboard.html` (lines 2999-3012) - 工资显示UI
  - 需要分别显示普通课和试课课时

- `dashboard.html` (lines 3141-3195) - 实时更新函数
  - `updateTeacherSalaryDisplay` 需要重构

### New Files to Create

无需创建新文件，所有修改在现有文件中完成。

### Relevant Documentation

**MySQL ALTER TABLE**:
- [MySQL 8.0 ALTER TABLE Documentation](https://dev.mysql.com/doc/refman/8.0/en/alter-table.html)
  - 添加新列的语法
  - 默认值和 NULL 约束

**Node.js mysql2**:
- [mysql2 GitHub](https://github.com/sidorares/node-mysql2)
  - Prepared statements
  - Transaction support

### Patterns to Follow

**数据库迁移模式** (已有模式参考):
```javascript
// 参考 src/index.js 中的数据库连接和执行模式
const connection = await getDbConnection();
await connection.execute(`
  ALTER TABLE yuekebao_classtime
  ADD COLUMN course_type VARCHAR(20) DEFAULT '未知'
`);
```

**SQL INSERT 模式** (src/index.js:2152):
```javascript
// 当前模式
INSERT INTO yuekebao_classtime
  (teacher, student, time_num, class_date, ...)
VALUES ${placeholders}

// 需要修改为
INSERT INTO yuekebao_classtime
  (teacher, student, time_num, class_date, ..., course_type)
VALUES ${placeholders}
```

**前端数据显示模式** (dashboard.html):
```javascript
// 保持现有的格式化和显示风格
<div><strong>Label:</strong> <span class="value">${data}</span></div>
```

---

## IMPLEMENTATION PLAN

### Phase 1: 数据库结构修改

**Tasks:**
- 添加 `course_type` 列到 `yuekebao_classtime` 表
- 设置默认值为 '未知' 以兼容历史数据
- 验证表结构变更成功

### Phase 2: 爬虫数据保存增强

**Tasks:**
- 修改 INSERT 语句包含 `course_type` 字段
- 确保 `courseType` 变量正确传递
- 测试数据保存逻辑

### Phase 3: 智能判定逻辑实现

**Tasks:**
- 实现试课成功/失败的自动判定SQL查询
- 对每个试课查询是否有后续正式课程
- 自动统计成功/失败试课数量
- 自动填充前端输入框

### Phase 4: 工资计算逻辑重构

**Tasks:**
- 修改 SQL 查询按 `course_type` 分组
- 区分普通课和试课的计算逻辑
- 使用智能判定结果计算试课佣金
- 保留手动覆盖功能

### Phase 5: 前端显示优化

**Tasks:**
- 显示自动识别的试课数量
- 分别展示普通课和试课课时
- 优化工资详情显示
- 保留手动输入功能作为调整机制

---

## STEP-BY-STEP TASKS

### TASK 1: UPDATE 数据库表结构

**文件**: 通过 MySQL 客户端或添加迁移脚本

- **IMPLEMENT**: 添加 `course_type` 列
  ```sql
  ALTER TABLE yuekebao_classtime
  ADD COLUMN course_type VARCHAR(20) DEFAULT '未知' AFTER week_period;
  ```
- **GOTCHA**: 如果表有大量数据，ALTER TABLE 可能需要时间
- **GOTCHA**: 确保数据库连接有 ALTER 权限
- **VALIDATE**:
  ```bash
  mysql -u root -p -e "DESCRIBE yuekebao.yuekebao_classtime" | grep course_type
  ```

### TASK 2: UPDATE src/index.js - 修改数据保存逻辑

**目标行号**: 2152-2154

- **IMPLEMENT**: 在 INSERT 语句中添加 `course_type` 字段
  ```javascript
  // 修改前 (line 2152):
  INSERT INTO yuekebao_classtime
    (teacher, student, time_num, class_date, class_start_time, class_end_time, week_period, create_time)
  VALUES ${placeholders}

  // 修改后:
  INSERT INTO yuekebao_classtime
    (teacher, student, time_num, class_date, class_start_time, class_end_time, week_period, course_type, create_time)
  VALUES ${placeholders}
  ```

- **IMPLEMENT**: 在数据准备阶段包含 `courseType` (line 2100-2140)
  ```javascript
  // 查找类似这样的代码:
  insertData.push([
    course.teacher,
    course.student,
    course.timeNum,
    course.classDate,
    course.classStartTime,
    course.classEndTime,
    course.weekPeriod,
    course.courseType || '未知',  // 新增
    createTime
  ]);
  ```

- **PATTERN**: 保持与现有 INSERT 语句的格式一致
- **GOTCHA**: 确保数组元素顺序与字段顺序完全匹配
- **VALIDATE**: `node --check src/index.js`

### TASK 3: UPDATE src/index.js - 修改工资计算SQL查询

**目标行号**: 3179-3199

- **IMPLEMENT**: 在 SELECT 中添加 `course_type` 字段并分组
  ```javascript
  // 修改前:
  SELECT
    c.teacher,
    COALESCE(s.type, '未知') as course_type,  // 这个是老师类型，不是课程类型！
    ...
  GROUP BY c.teacher, s.type, ...

  // 修改后:
  SELECT
    c.teacher,
    c.course_type as course_type_from_class,  // 添加课程类型
    COALESCE(s.type, '未知') as teacher_type,  // 老师类型重命名避免混淆
    ...
  GROUP BY c.teacher, c.course_type, s.type, ...
  ```

- **PATTERN**: 按 `(teacher, course_type)` 分组以区分每个老师的不同课程类型
- **GOTCHA**: 注意区分 `course_type`（课程类型）和 `teacher_type`（老师类型）
- **VALIDATE**: 运行查询测试，确保返回正确分组

### TASK 3.5: ADD src/index.js - 实现智能判定试课成功/失败逻辑 ⭐ 核心新增

**目标**: 在工资计算API中添加自动判定逻辑

- **IMPLEMENT**: 创建试课成功判定SQL查询函数
  ```javascript
  // 在 src/index.js 中添加（约 line 3150 附近）
  async function determineTrialClassSuccess(connection, teacher, startDate, endDate) {
    console.log(`🔍 开始判定 ${teacher} 的试课成功/失败...`);

    // 查询该老师在日期范围内的所有试课
    const [trialClasses] = await connection.execute(`
      SELECT
        student,
        class_date,
        class_start_time
      FROM yuekebao_classtime
      WHERE teacher = ?
        AND course_type = '试课'
        AND class_date >= ?
        AND class_date <= ?
      ORDER BY class_date ASC
    `, [teacher, startDate, endDate]);

    let successfulCount = 0;
    let failedCount = 0;
    const trialDetails = [];

    for (const trial of trialClasses) {
      // 查询该学生与该老师是否有后续正式课程
      const [followUpClasses] = await connection.execute(`
        SELECT COUNT(*) as count
        FROM yuekebao_classtime
        WHERE teacher = ?
          AND student = ?
          AND course_type != '试课'
          AND course_type IS NOT NULL
          AND class_date > ?
      `, [teacher, trial.student, trial.class_date]);

      const hasFollowUp = followUpClasses[0].count > 0;

      if (hasFollowUp) {
        successfulCount++;
        trialDetails.push({
          student: trial.student,
          date: trial.class_date,
          result: 'success',
          reason: `后续有${followUpClasses[0].count}节正式课`
        });
      } else {
        failedCount++;
        trialDetails.push({
          student: trial.student,
          date: trial.class_date,
          result: 'failed',
          reason: '无后续正式课'
        });
      }
    }

    console.log(`✅ ${teacher} 试课判定完成: 成功${successfulCount}节, 失败${failedCount}节`);

    return {
      successful: successfulCount,
      failed: failedCount,
      details: trialDetails
    };
  }
  ```

- **IMPLEMENT**: 在工资计算API中调用判定函数 (约 line 3200)
  ```javascript
  // 在查询课程数据后，对每个老师进行试课判定
  const teacherTrialResults = {};

  for (const teacher of Object.keys(teacherData)) {
    if (teacherData[teacher].trialClasses > 0) {
      const trialResult = await determineTrialClassSuccess(
        connection,
        teacher,
        startDate,
        endDate
      );
      teacherTrialResults[teacher] = trialResult;

      // 如果前端没有手动输入，使用自动判定结果
      if (!trialData[teacher] || (trialData[teacher].successful === 0 && trialData[teacher].failed === 0)) {
        trialData[teacher] = {
          successful: trialResult.successful,
          failed: trialResult.failed,
          autoFilled: true  // 标记为自动填充
        };
      }
    }
  }
  ```

- **PATTERN**: 使用子查询判定后续课程存在性，避免N+1查询问题
- **GOTCHA**: 注意处理 course_type 为 NULL 的历史数据
- **GOTCHA**: 查询后续课程时排除试课本身（course_type != '试课'）
- **VALIDATE**: 使用测试数据验证判定逻辑，如 Hersel 的4节试课

### TASK 4: UPDATE src/index.js - 重构工资计算逻辑（整合智能判定）

**目标行号**: 3200-3291
**依赖**: TASK 3.5 的智能判定函数

- **IMPLEMENT**: 区分普通课和试课的计算，整合自动判定结果
  ```javascript
  // 在处理查询结果时 (约line 3220):
  const teacherData = {};

  for (const row of rows) {
    const teacher = row.teacher;
    if (!teacherData[teacher]) {
      teacherData[teacher] = {
        normalClasses: 0,
        trialClasses: 0,
        courseDetails: [],
        ...
      };
    }

    // 根据 course_type 分类累计
    if (row.course_type_from_class === '试课') {
      teacherData[teacher].trialClasses += row.total_classes;
    } else {
      teacherData[teacher].normalClasses += row.total_classes;
    }

    teacherData[teacher].courseDetails.push({
      type: row.course_type_from_class,
      count: row.total_classes,
      details: row.class_details
    });
  }

  // ⭐ 新增: 对每个有试课的老师执行智能判定 (TASK 3.5)
  const autoTrialResults = {};
  for (const teacher of Object.keys(teacherData)) {
    if (teacherData[teacher].trialClasses > 0) {
      const trialResult = await determineTrialClassSuccess(
        connection, teacher, startDate, endDate
      );
      autoTrialResults[teacher] = trialResult;
      console.log(`✅ ${teacher} 自动判定: 成功${trialResult.successful}节, 失败${trialResult.failed}节`);
    }
  }
  ```

- **IMPLEMENT**: 修改工资计算公式 - 优先使用手动输入，否则使用自动判定 (约line 3258-3270)
  ```javascript
  // 计算普通课工资
  const normalSalary = data.normalClasses * finalRate;

  // 计算试课佣金 - 三级优先级
  let trialCommission = 0;
  let trialSource = 'none'; // 'manual', 'auto', 'none'
  let successfulTrials = 0;
  let failedTrials = 0;

  if (trialData[teacher] && (trialData[teacher].successful > 0 || trialData[teacher].failed > 0)) {
    // 优先级1: 手动输入的试课数据（覆盖自动判定）
    successfulTrials = trialData[teacher].successful || 0;
    failedTrials = trialData[teacher].failed || 0;
    trialCommission = (successfulTrials * finalRate) + (failedTrials * finalRate * 0.5);
    trialSource = 'manual';
  } else if (autoTrialResults[teacher]) {
    // 优先级2: 自动判定的试课数据
    successfulTrials = autoTrialResults[teacher].successful;
    failedTrials = autoTrialResults[teacher].failed;
    trialCommission = (successfulTrials * finalRate) + (failedTrials * finalRate * 0.5);
    trialSource = 'auto';
  } else if (data.trialClasses > 0) {
    // 优先级3: 如果既没有手动输入也没有自动判定，默认所有试课按失败计算
    failedTrials = data.trialClasses;
    trialCommission = data.trialClasses * finalRate * 0.5;
    trialSource = 'default';
  }

  // 总工资 = 普通课工资 + 试课佣金 + 奖惩
  data.totalSalary = normalSalary + trialCommission + rewardsAmount;

  // ⭐ 新增: 将自动判定结果和来源信息返回给前端
  data.normalSalary = normalSalary;
  data.trialCommission = trialCommission;
  data.trialSource = trialSource; // 前端显示"自动填充"或"手动输入"标记
  data.autoTrialData = autoTrialResults[teacher] || null;
  data.successfulTrials = successfulTrials;
  data.failedTrials = failedTrials;
  ```

- **PATTERN**: 三级优先级 - 手动输入 > 自动判定 > 默认失败
- **GOTCHA**: 向后兼容 - 对于 `course_type` 为 NULL 或 '未知' 的历史数据，视为普通课
- **GOTCHA**: 自动判定结果需要传递给前端，用于显示和预填充输入框
- **VALIDATE**: 使用测试数据计算，验证三级优先级逻辑正确

### TASK 5: UPDATE dashboard.html - 前端显示优化（自动填充UI）

**目标行号**: 2999-3012

- **IMPLEMENT**: 在工资详情中添加课程类型分解显示和数据来源标记
  ```html
  <!-- 在 Total Salary 上方添加 -->
  <div><strong>Normal Class Salary:</strong>
    <span>${formatCurrency(teacher.normalSalary, teacher.salaryUnit)}</span>
    <span class="detail-text">(${teacher.normalClasses} classes × ${formatCurrency(teacher.finalRate, teacher.salaryUnit)})</span>
  </div>

  <div><strong>Trial Class Commission:</strong>
    <span>${formatCurrency(teacher.trialCommission, teacher.salaryUnit)}</span>
    ${teacher.trialSource === 'auto' ? '<span class="badge auto-filled">自动填充</span>' : ''}
    ${teacher.trialSource === 'manual' ? '<span class="badge manual">手动输入</span>' : ''}
  </div>
  ```

- **IMPLEMENT**: 更新试课输入区域 - 自动预填充 + 允许手动覆盖 (line 2846-2867)
  ```html
  <!-- ⭐ 新增: 自动判定结果显示区 -->
  ${teacher.autoTrialData ? `
    <div class="auto-trial-info">
      <strong>🤖 智能判定结果:</strong>
      <ul style="margin: 5px 0; padding-left: 20px;">
        <li>成功试课: ${teacher.autoTrialData.successful} 节 (学生有后续正式课)</li>
        <li>失败试课: ${teacher.autoTrialData.failed} 节 (学生无后续课程)</li>
      </ul>
      <details style="margin-top: 5px;">
        <summary style="cursor: pointer; color: #666;">查看详情</summary>
        <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
          ${teacher.autoTrialData.details.map(d =>
            `<li>${d.student} (${d.date}): ${d.result === 'success' ? '✅' : '❌'} ${d.reason}</li>`
          ).join('')}
        </ul>
      </details>
    </div>
  ` : ''}

  <!-- ⭐ 修改: 试课输入框 - 预填充自动判定值 -->
  <div style="margin-top: 10px;">
    <strong>📝 手动调整试课数量 (可选):</strong>
    <div style="margin: 5px 0;">
      <label>Number of Successful Trial Class:</label>
      <input type="number"
             id="successful_trial_${teacher.teacher}"
             value="${teacher.trialSource === 'manual' ? teacher.successfulTrials : (teacher.autoTrialData?.successful || 0)}"
             min="0"
             placeholder="${teacher.autoTrialData?.successful || 0}">
    </div>
    <div style="margin: 5px 0;">
      <label>Number of Failed Trial Class:</label>
      <input type="number"
             id="failed_trial_${teacher.teacher}"
             value="${teacher.trialSource === 'manual' ? teacher.failedTrials : (teacher.autoTrialData?.failed || 0)}"
             min="0"
             placeholder="${teacher.autoTrialData?.failed || 0}">
    </div>
    <button onclick="updateTrialData('${teacher.teacher}')" class="btn-update">
      更新试课数据
    </button>
    <small style="display: block; color: #666; margin-top: 5px;">
      💡 提示: 输入框已自动填充智能判定结果，如需调整请修改后点击"更新"
    </small>
  </div>
  ```

- **PATTERN**: 保持现有 UI 风格和 CSS 类名
- **PATTERN**: 使用明显的视觉标记（🤖图标、badge）区分自动填充和手动输入
- **GOTCHA**: 确保新字段与后端 API 返回的数据结构匹配（autoTrialData, trialSource等）
- **GOTCHA**: placeholder 显示自动判定值，value 根据 trialSource 决定显示内容
- **VALIDATE**: 浏览器中加载页面，检查 UI 渲染和交互

### TASK 6: UPDATE dashboard.html - 前端计算逻辑（整合自动判定）

**目标行号**: 3141-3195

- **IMPLEMENT**: 更新 `updateTrialData` 函数 - 接收手动输入并重新计算
  ```javascript
  function updateTrialData(teacherName) {
    const successfulInput = document.getElementById(`successful_trial_${teacherName}`);
    const failedInput = document.getElementById(`failed_trial_${teacherName}`);

    if (!successfulInput || !failedInput) {
      console.error('试课输入框未找到');
      return;
    }

    const successful = parseInt(successfulInput.value) || 0;
    const failed = parseInt(failedInput.value) || 0;

    // 将手动输入的值存储到 trialData
    if (!window.currentTrialData) {
      window.currentTrialData = {};
    }

    window.currentTrialData[teacherName] = {
      successful: successful,
      failed: failed
    };

    // 更新显示
    updateTeacherSalaryDisplay(teacherName);

    // 提示用户已更新
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = '✓ 已更新';
    setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  }
  ```

- **IMPLEMENT**: 更新 `updateTeacherSalaryDisplay` 函数 - 三级优先级计算
  ```javascript
  function updateTeacherSalaryDisplay(teacherName) {
    const teacher = window.lastSalaryData.teachers.find(t => t.teacher === teacherName);
    if (!teacher) return;

    // 计算普通课工资
    const normalSalary = teacher.normalClasses * teacher.finalRate;

    // 计算试课佣金 - 三级优先级（与后端逻辑一致）
    let trialCommission = 0;
    let successfulTrials = 0;
    let failedTrials = 0;
    let source = 'none';

    // 优先级1: 手动输入
    if (window.currentTrialData && window.currentTrialData[teacherName]) {
      const manual = window.currentTrialData[teacherName];
      successfulTrials = manual.successful || 0;
      failedTrials = manual.failed || 0;
      source = 'manual';
    }
    // 优先级2: 自动判定
    else if (teacher.autoTrialData) {
      successfulTrials = teacher.autoTrialData.successful || 0;
      failedTrials = teacher.autoTrialData.failed || 0;
      source = 'auto';
    }
    // 优先级3: 默认失败
    else if (teacher.trialClasses > 0) {
      failedTrials = teacher.trialClasses;
      source = 'default';
    }

    trialCommission = (successfulTrials * teacher.finalRate) + (failedTrials * teacher.finalRate * 0.5);

    // 计算最终总工资
    const finalTotalSalary = normalSalary + trialCommission + (teacher.rewardsAmount || 0);

    // 更新显示
    const teacherCard = document.querySelector(`#teacher_card_${teacherName.replace(/\s/g, '_')}`);
    if (teacherCard) {
      const normalSalaryEl = teacherCard.querySelector('.normal-salary');
      const trialCommissionEl = teacherCard.querySelector('.trial-commission');
      const totalSalaryEl = teacherCard.querySelector('.total-salary');
      const sourceEl = teacherCard.querySelector('.trial-source-badge');

      if (normalSalaryEl) normalSalaryEl.textContent = formatCurrency(normalSalary, teacher.salaryUnit);
      if (trialCommissionEl) trialCommissionEl.textContent = formatCurrency(trialCommission, teacher.salaryUnit);
      if (totalSalaryEl) totalSalaryEl.textContent = formatCurrency(finalTotalSalary, teacher.salaryUnit);

      // 更新数据来源标记
      if (sourceEl) {
        if (source === 'auto') {
          sourceEl.className = 'badge auto-filled';
          sourceEl.textContent = '自动填充';
        } else if (source === 'manual') {
          sourceEl.className = 'badge manual';
          sourceEl.textContent = '手动输入';
        }
      }
    }

    console.log(`✅ ${teacherName} 工资显示已更新: 普通课${normalSalary}, 试课${trialCommission}, 总计${finalTotalSalary} (来源: ${source})`);
  }
  ```

- **PATTERN**: 与后端计算逻辑保持一致（三级优先级）
- **GOTCHA**: 确保 DOM 选择器与 TASK 5 中的 HTML 结构匹配
- **GOTCHA**: 使用全局变量 `window.currentTrialData` 存储手动输入，避免丢失
- **VALIDATE**: 在浏览器控制台测试函数调用

---

## TESTING STRATEGY

### Unit Tests

**手动功能测试** (项目无自动化测试框架):

1. **数据库测试**:
   ```sql
   -- 验证 course_type 字段存在
   DESCRIBE yuekebao_classtime;

   -- 插入测试数据
   INSERT INTO yuekebao_classtime (..., course_type)
   VALUES (..., '试课');

   -- 查询验证
   SELECT teacher, course_type, COUNT(*)
   FROM yuekebao_classtime
   GROUP BY teacher, course_type;
   ```

2. **爬虫测试**:
   ```bash
   npm test
   # 验证新抓取的数据包含 course_type 字段
   ```

3. **API测试**:
   ```bash
   curl -X POST http://localhost:3000/api/salary-calculate \
     -H "Content-Type: application/json" \
     -d '{"startDate":"2026-01-26","endDate":"2026-02-01","baseRate":1,"teacherAdjustments":{},"trialData":{},"rewardsData":{}}'
   ```

### Integration Tests

**端到端测试流程**:

1. **数据刷新** → 检查数据库中 `course_type` 字段是否正确
2. **工资计算** → 验证 API 返回的 `normalClasses` 和 `trialClasses` 分离
3. **前端显示** → 验证 UI 正确显示普通课和试课数量

### Edge Cases

1. **历史数据兼容**: `course_type` 为 NULL 的旧数据
2. **未知课程类型**: 爬虫无法识别的课程类型
3. **全部试课**: 某老师只有试课，没有普通课
4. **手动覆盖**: 手动输入的试课数与自动识别不一致
5. **零课时**: 某老师在日期范围内无课程
6. **跨课程类型**: 同一老师既有菲教课又有试课

---

## VALIDATION COMMANDS

### Level 1: 数据库验证

```bash
# 检查表结构
mysql -u root -p -e "DESCRIBE yuekebao.yuekebao_classtime"

# 验证 course_type 字段
mysql -u root -p -e "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='yuekebao_classtime' AND COLUMN_NAME='course_type'"

# 查询课程类型分布
mysql -u root -p -e "SELECT course_type, COUNT(*) as count FROM yuekebao.yuekebao_classtime GROUP BY course_type"
```

### Level 2: 语法验证

```bash
# JavaScript 语法检查
node --check src/index.js

# HTML 语法验证（如有工具）
# npm run lint-html dashboard.html
```

### Level 3: 功能测试

```bash
# 启动本地服务
npm run dashboard-http

# 测试工资计算API（在另一终端）
curl -s http://localhost:3000/api/last-refresh-time | jq '.'

# ⭐ 测试1: 不带手动输入 - 应该使用自动判定结果
curl -s -X POST http://localhost:3000/api/salary-calculate \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2026-01-26","endDate":"2026-02-01","baseRate":1,"teacherAdjustments":{},"trialData":{},"rewardsData":{}}' \
  | jq '.teachers[] | select(.teacher=="Hersel") | {teacher, normalClasses, trialClasses, successfulTrials, failedTrials, trialSource, normalSalary, trialCommission, totalSalary}'

# ⭐ 测试2: 带手动输入 - 应该覆盖自动判定结果
curl -s -X POST http://localhost:3000/api/salary-calculate \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2026-01-26","endDate":"2026-02-01","baseRate":1,"teacherAdjustments":{},"trialData":{"Hersel":{"successful":2,"failed":2}},"rewardsData":{}}' \
  | jq '.teachers[] | select(.teacher=="Hersel") | {teacher, successfulTrials, failedTrials, trialSource, trialCommission, totalSalary}'

# ⭐ 测试3: 查询自动判定详情
curl -s -X POST http://localhost:3000/api/salary-calculate \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2026-01-26","endDate":"2026-02-01","baseRate":1,"teacherAdjustments":{},"trialData":{},"rewardsData":{}}' \
  | jq '.teachers[] | select(.teacher=="Hersel") | .autoTrialData.details'
```

**期望输出（Hersel 示例）**:

测试1 (自动判定):
```json
{
  "teacher": "Hersel",
  "normalClasses": 2,
  "trialClasses": 4,
  "successfulTrials": 0,
  "failedTrials": 4,
  "trialSource": "auto",
  "normalSalary": 180,
  "trialCommission": 180,
  "totalSalary": 360
}
```

测试2 (手动覆盖):
```json
{
  "teacher": "Hersel",
  "successfulTrials": 2,
  "failedTrials": 2,
  "trialSource": "manual",
  "trialCommission": 270,
  "totalSalary": 450
}
```

测试3 (判定详情):
```json
[
  {
    "student": "张三",
    "date": "2026-01-27",
    "result": "failed",
    "reason": "无后续正式课"
  },
  ...
]
```

### Level 4: UI验证

**手动测试步骤**:

1. 浏览器访问 `http://localhost:3000`
2. 切换到 "💰 工资计算" tab
3. 选择日期范围: 2026-01-26 到 2026-02-01
4. 点击"计算工资"
5. 找到 Hersel 老师的卡片
6. **⭐ 验证自动判定显示**:
   - 应该看到 "🤖 智能判定结果" 区域
   - 显示成功/失败试课数量和判定理由
   - 点击"查看详情"可以展开每个试课的判定依据
7. **⭐ 验证自动填充输入框**:
   - "Number of Successful Trial Class" 输入框应该预填充自动判定值
   - "Number of Failed Trial Class" 输入框应该预填充自动判定值
   - 输入框下方显示提示文字："💡 提示: 输入框已自动填充智能判定结果..."
8. **验证工资计算显示**:
   - Normal Class Salary: 180 pesos (2 classes × 90)
   - Trial Class Commission: 180 pesos
   - 显示 "自动填充" badge
   - Total Salary: 360 pesos
9. **⭐ 测试手动覆盖**:
   - 修改 "Number of Successful Trial Class" 为 2
   - 修改 "Number of Failed Trial Class" 为 2
   - 点击 "更新试课数据"
   - 验证显示变化:
     - Trial Class Commission 更新为 270 pesos
     - Total Salary 更新为 450 pesos
     - Badge 变为 "手动输入"
10. **测试重新计算**:
    - 清空输入框或重新选择日期
    - 验证自动重新填充判定结果

### Level 5: 回归测试

```bash
# 测试其他老师的工资计算是否正常
# 测试不同日期范围
# 测试手动调整功能
# 测试奖惩功能
```

---

## ACCEPTANCE CRITERIA

- [ ] 数据库 `yuekebao_classtime` 表新增 `course_type` 字段
- [ ] 爬虫保存数据时正确存储课程类型（试课/菲/欧）
- [ ] 工资计算API正确区分普通课和试课
- [ ] **⭐ 智能判定逻辑实现并正确工作**:
  - [ ] 对每个试课查询学生+老师是否有后续正式课程
  - [ ] 正确判定试课成功（有后续课）和失败（无后续课）
  - [ ] 自动统计成功/失败试课数量
- [ ] **⭐ 前端自动填充功能实现**:
  - [ ] 试课输入框自动预填充智能判定结果
  - [ ] 显示智能判定详情（学生名、判定依据等）
  - [ ] 显示数据来源标记（自动填充/手动输入 badge）
- [ ] **⭐ 三级优先级逻辑正确**:
  - [ ] 优先级1: 手动输入覆盖自动判定
  - [ ] 优先级2: 自动判定结果
  - [ ] 优先级3: 默认按失败计算
- [ ] Hersel 示例计算正确:
  - [ ] 自动模式: 2×90 + 4×45 = 360 pesos
  - [ ] 手动覆盖: 按输入值计算
- [ ] 前端显示分别展示普通课课时和试课课时
- [ ] 保留手动输入试课数据功能作为覆盖机制
- [ ] 历史数据（course_type 为 NULL）正确处理为普通课
- [ ] 所有语法检查通过
- [ ] 手动测试验证工资计算准确
- [ ] 其他老师的工资计算无回归问题

---

## COMPLETION CHECKLIST

- [ ] 数据库表结构修改完成并验证
- [ ] 爬虫数据保存逻辑更新并测试
- [ ] **⭐ 智能判定函数实现并测试 (TASK 3.5)**:
  - [ ] SQL查询逻辑正确
  - [ ] 判定规则正确（有后续课=成功，无后续课=失败）
  - [ ] 性能测试通过（处理多个老师和多个试课）
- [ ] 工资计算SQL查询重构并验证
- [ ] **⭐ 工资计算公式修改并测试三级优先级逻辑 (TASK 4)**
- [ ] **⭐ 前端自动填充UI实现 (TASK 5)**:
  - [ ] 智能判定结果显示区
  - [ ] 输入框自动预填充
  - [ ] 数据来源标记（badge）
- [ ] **⭐ 前端计算逻辑同步修改 (TASK 6)**:
  - [ ] 三级优先级逻辑
  - [ ] 手动更新功能
- [ ] 所有验证命令执行通过
- [ ] Hersel 示例手动测试通过（自动+手动两种模式）
- [ ] 回归测试确认无问题
- [ ] 代码审查确认逻辑正确

---

## NOTES

### 设计决策

**为什么添加 course_type 字段而不是新表？**
- 课程类型是课程的固有属性，应该存储在课程表中
- 避免额外的 JOIN 查询，提升性能
- 简化数据模型，便于维护

**⭐ 为什么实现智能判定逻辑而不是完全手动输入？**
- 减轻管理员手动统计的工作负担
- 提高准确性，避免人工统计错误
- 提供透明的判定依据（显示详情）
- 判定规则清晰：有后续课=试课成功，无后续课=试课失败
- 符合业务逻辑：试课学生如果继续上课，说明试课效果好

**⭐ 为什么保留手动输入功能？**
- 作为调整机制，处理自动识别错误的情况
- 允许管理员根据实际情况微调试课成功/失败数量
- 向后兼容现有操作流程
- 灵活处理特殊情况（如学生计划稍后报名但判定期未发生）

**⭐ 为什么采用三级优先级而不是二选一？**
- 提供灵活性：自动为主，手动为辅，默认兜底
- 保守策略：默认按失败计算，避免多发工资
- 用户友好：自动填充减少操作，手动覆盖保留控制权
- 透明性：清晰标记数据来源（自动/手动/默认）

**默认试课处理策略**
- 自动识别的试课，如未手动输入，按智能判定结果计算
- 无法判定的试课（course_type 为 NULL）默认按"失败"（半价）计算
- 理由: 保守计算，避免多发工资
- 管理员可以手动调整为"成功"（全价）

### 潜在风险

**数据一致性**:
- 历史数据的 `course_type` 为 NULL，需明确处理策略
- 建议: 视为普通课，避免重新抓取大量历史数据

**计算公式变化**:
- 修改后工资计算结果会与历史记录不一致
- 建议: 在系统中添加版本标识或说明

**UI 复杂度**:
- 新增字段可能使界面更复杂
- 建议: 保持简洁，只显示关键信息

### 未来优化方向

1. **自动识别优化**: 提升爬虫对试课的识别准确率
2. **批量调整**: 允许批量设置试课成功/失败比例
3. **历史数据迁移**: 提供工具重新分析历史课程类型
4. **报表功能**: 添加试课转化率统计报表
5. **⭐ 智能判定优化**:
   - 可配置判定时间窗口（如"后续30天内"而非所有时间）
   - 考虑后续课程数量（如至少2节课才算成功）
   - 支持多维度判定（如学生续费、评价等）
6. **⭐ 性能优化**:
   - 使用 JOIN 查询代替循环查询，避免 N+1 问题
   - 缓存判定结果，避免重复计算
7. **⭐ 审计日志**:
   - 记录手动覆盖操作的历史
   - 记录自动判定结果的变化
   - 支持查看历史工资计算记录

<!-- EOF -->
