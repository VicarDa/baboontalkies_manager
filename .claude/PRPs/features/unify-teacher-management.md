# Feature: 统一教师数据管理 - 以系统设置老师为准

## Feature Description

当前系统存在两套教师数据管理：
1. **系统设置中的老师**（`yuekebao_teacher_salary` 表）- 用于工资计算
2. **feifei 教师管理**（`base_user_teacher` 表）- 用于课程签到

需要统一教师数据管理，以"系统设置中的老师"（`yuekebao_teacher_salary`）为主数据源，老师名与 ClassIn 中的老师名保持一致。通过名字关联 feifei 数据库获取签到 URL 等信息。

## User Story

作为系统管理员
我希望有统一的教师管理入口，以系统设置中维护的老师为准
以便避免数据不一致，简化管理流程

## Problem Statement

当前问题：
1. 两套独立的教师数据源导致管理混乱
2. "教师管理" Tab 使用 feifei 数据库的教师，与"系统设置"中的老师不同步
3. 签到 URL 依赖 feifei 数据库的 `uid`，但工资计算依赖 `yuekebao_teacher_salary`

## Solution Statement

### 核心方案：以 `yuekebao_teacher_salary` 为主数据源

**改造"教师管理" Tab：**
1. 数据来源改为 `yuekebao_teacher_salary` 表
2. 通过教师名字关联 `base_user_teacher` 表获取 `uid`（用于生成签到 URL）
3. 保留签到配置功能（仍使用 feifei 数据库）
4. 展示字段调整为：教师姓名、类型、近30天课节、未来30天课节、签到URL、操作

**数据关联逻辑：**
```
yuekebao_teacher_salary.teacher_name
    ↔ (名字匹配)
base_user_teacher.name
    → 获取 uid → 生成签到 URL
```

## Feature Metadata

**Feature Type**: Refactor/Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**:
- 后端 API（src/index.js）
- 前端 UI（dashboard.html）

**Dependencies**:
- MySQL 数据库（baboontalkies + feifei）
- 现有的教师管理 API

---

## CONTEXT REFERENCES

### 现有数据库表结构

**1. yuekebao_teacher_salary (主数据源 - baboontalkies 数据库)**
```sql
- teacher_name (VARCHAR, 老师名字 - 主键标识)
- type (VARCHAR, '菲' 或 '欧')
- salary_per_class_time (DECIMAL, 每课时薪资)
- salary_unit (VARCHAR, 'rmb'/'pesos'/'dollars')
- salary_account (VARCHAR, 收款账号)
```

**2. base_user_teacher (feifei 数据库 - 用于获取 uid)**
```sql
- uid (BIGINT, 教师UID)
- name (VARCHAR, 姓名 - 用于关联)
- createTime (DATETIME)
- isdel (INT, 是否删除)
```

**3. base_user_signinconfig (feifei 数据库 - 签到配置)**
```sql
- teacherUid (BIGINT, 教师UID)
- signInStartTime (INT, 课前签到分钟数)
- signInEndTime (INT, 课后签到分钟数)
```

### 关联的代码文件

**后端 API (src/index.js):**
- 第 3893 行: `GET /api/teachers` - 获取系统设置老师列表
- 第 4377 行: `GET /api/feifei/teachers` - 获取 feifei 教师列表
- 第 4454 行: `GET /api/feifei/teachers/:uid/signin-config` - 签到配置

**前端 (dashboard.html):**
- 第 1558 行: 系统设置 Tab 中的老师配置管理
- 第 1616 行: feifei 教师管理 Tab
- 第 5209 行: `loadFeifeiTeachers()` 函数

---

## IMPLEMENTATION PLAN

### Phase 1: 后端 API 改造

**任务：创建统一教师列表 API**
- 从 `yuekebao_teacher_salary` 获取教师基本信息
- 关联 `base_user_teacher` 获取 uid（用于签到 URL）
- 关联 `yuekebao_classtime` 统计课节数

### Phase 2: 前端 Tab 改造

**任务：改造"教师管理" Tab**
- 数据源切换到新 API
- 表格列调整：姓名、类型、近30天课节、未来30天课节、签到URL、操作
- 移除原有的标签筛选（系统设置老师无标签）
- 保留签到配置功能

### Phase 3: 清理和优化

**任务：移除冗余代码**
- 移除原有的 `/api/feifei/teachers` API（或保留用于其他用途）
- 简化前端逻辑

---

## STEP-BY-STEP TASKS

### TASK 1: UPDATE src/index.js - 创建统一教师列表 API

**目标：** 创建新的 `/api/unified-teachers` API

- **IMPLEMENT**: 新增 API 端点
  ```javascript
  // 统一教师列表 API - 以 yuekebao_teacher_salary 为主数据源
  this.app.get('/api/unified-teachers', async (req, res) => {
    let connection;
    let feifeiConnection;
    try {
      const { hasClass } = req.query;
      connection = await getDbConnection();
      feifeiConnection = await getFeifeiDbConnection();

      // 1. 从主数据库获取老师列表
      const [teachers] = await connection.execute(
        `SELECT teacher_name, type, salary_per_class_time, salary_unit, salary_account
         FROM yuekebao_teacher_salary
         ORDER BY teacher_name`
      );

      // 2. 计算每个老师的课节数
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const [classStats] = await connection.execute(
        `SELECT teacher,
                SUM(CASE WHEN class_date >= ? AND class_date <= ? THEN time_num ELSE 0 END) as old30,
                SUM(CASE WHEN class_date > ? AND class_date <= ? THEN time_num ELSE 0 END) as new30
         FROM yuekebao_classtime
         GROUP BY teacher`,
        [thirtyDaysAgo.toISOString().split('T')[0], now.toISOString().split('T')[0],
         now.toISOString().split('T')[0], thirtyDaysLater.toISOString().split('T')[0]]
      );

      // 3. 从 feifei 获取教师 uid（用于签到 URL）
      const teacherNames = teachers.map(t => t.teacher_name);
      let feifeiTeachers = [];
      if (teacherNames.length > 0) {
        const placeholders = teacherNames.map(() => '?').join(',');
        const [rows] = await feifeiConnection.execute(
          `SELECT uid, name FROM base_user_teacher
           WHERE name IN (${placeholders}) AND (isdel IS NULL OR isdel = 0)`,
          teacherNames
        );
        feifeiTeachers = rows;
      }

      // 4. 合并数据
      const statsMap = {};
      classStats.forEach(s => { statsMap[s.teacher] = s; });

      const uidMap = {};
      feifeiTeachers.forEach(t => { uidMap[t.name] = t.uid; });

      let result = teachers.map(t => ({
        teacher_name: t.teacher_name,
        type: t.type,
        salary_per_class_time: t.salary_per_class_time,
        salary_unit: t.salary_unit,
        salary_account: t.salary_account,
        old30: statsMap[t.teacher_name]?.old30 || 0,
        new30: statsMap[t.teacher_name]?.new30 || 0,
        uid: uidMap[t.teacher_name] || null,
        signinUrl: uidMap[t.teacher_name]
          ? `https://feifei.baboontalkies.com/signin/${uidMap[t.teacher_name]}`
          : null
      }));

      // 5. 筛选未来30天有课
      if (hasClass === '1') {
        result = result.filter(t => t.new30 > 0);
      }

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('获取统一教师列表失败:', error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      if (connection) await connection.end();
      if (feifeiConnection) await feifeiConnection.end();
    }
  });
  ```

- **VALIDATE**: `node --check src/index.js`

### TASK 2: UPDATE dashboard.html - 改造教师管理 Tab 表格头

**目标行号**: 约 1636 行

- **IMPLEMENT**: 修改表格头
  ```html
  <table style="width: 100%; border-collapse: collapse;">
      <thead>
          <tr style="background: #f5f5f5;">
              <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">教师姓名</th>
              <th style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0;">类型</th>
              <th style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0;">近30天课时</th>
              <th style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0;">未来30天课时</th>
              <th style="padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0;">签到URL</th>
              <th style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0;">操作</th>
          </tr>
      </thead>
  ```

- **VALIDATE**: 浏览器刷新确认

### TASK 3: UPDATE dashboard.html - 简化筛选区域

**目标：** 移除标签筛选下拉框，简化搜索区

- **IMPLEMENT**: 修改筛选区域 HTML
  ```html
  <!-- 搜索筛选区 -->
  <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
      <input type="text" id="feifeiTeacherKeyword" placeholder="搜索教师姓名..."
             style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; width: 200px;">
      <label style="display: flex; align-items: center; gap: 5px;">
          <input type="checkbox" id="feifeiTeacherHasClass" checked>
          <span>仅显示未来30天有课</span>
      </label>
      <button onclick="loadFeifeiTeachers()" style="padding: 8px 16px; background: #4285f4; color: white; border: none; border-radius: 6px; cursor: pointer;">搜索</button>
  </div>
  ```

### TASK 4: UPDATE dashboard.html - 改造 loadFeifeiTeachers 函数

**目标：** 切换数据源到 `/api/unified-teachers`

- **IMPLEMENT**: 修改 JavaScript 函数
  ```javascript
  async function loadFeifeiTeachers() {
      const tbody = document.getElementById('feifeiTeacherTableBody');
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">加载中...</td></tr>';

      try {
          const keyWord = document.getElementById('feifeiTeacherKeyword').value.toLowerCase();
          const hasClass = document.getElementById('feifeiTeacherHasClass').checked ? '1' : '';

          const params = new URLSearchParams();
          if (hasClass) params.append('hasClass', hasClass);

          const response = await fetch(`${BASE_PATH}/api/unified-teachers?${params}`);
          const result = await response.json();

          if (result.success) {
              let teachers = result.data;

              // 前端姓名筛选
              if (keyWord) {
                  teachers = teachers.filter(t =>
                      t.teacher_name.toLowerCase().includes(keyWord)
                  );
              }

              if (teachers.length === 0) {
                  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #999;">暂无教师数据</td></tr>';
                  return;
              }

              tbody.innerHTML = teachers.map(teacher => `
                  <tr>
                      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">${teacher.teacher_name}</td>
                      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">
                          <span style="padding: 3px 10px; border-radius: 12px; font-size: 12px; ${teacher.type === '菲' ? 'background: #e3f2fd; color: #1976d2;' : 'background: #fff3e0; color: #e65100;'}">${teacher.type || '-'}</span>
                      </td>
                      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">${teacher.old30 || 0}</td>
                      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">${teacher.new30 || 0}</td>
                      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
                          ${teacher.signinUrl
                              ? `<a href="${teacher.signinUrl}" target="_blank" style="color: #1976d2; text-decoration: none; font-size: 12px; word-break: break-all;">${teacher.signinUrl}</a>
                                 <button onclick="copyToClipboard('${teacher.signinUrl}')" style="margin-left: 5px; padding: 2px 6px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 3px; cursor: pointer; font-size: 11px;">复制</button>`
                              : '<span style="color: #999;">未关联</span>'}
                      </td>
                      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">
                          ${teacher.uid
                              ? `<button onclick="openSigninConfigModal('${teacher.uid}', '${teacher.teacher_name}')"
                                        style="padding: 4px 10px; background: #ff9800; color: white; border: none; border-radius: 4px; cursor: pointer;">签到配置</button>`
                              : '<span style="color: #999; font-size: 12px;">未关联feifei</span>'}
                      </td>
                  </tr>
              `).join('');
          }
      } catch (error) {
          console.error('加载教师列表失败:', error);
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #d32f2f;">加载失败</td></tr>';
      }
  }
  ```

### TASK 5: UPDATE dashboard.html - 移除不再需要的代码

**目标：** 移除标签相关代码

- **IMPLEMENT**:
  - 移除 `loadFeifeiTeacherLabelOptions()` 的调用（在 Tab 切换逻辑中）
  - 移除 `feifeiTeacherLabelFilter` 下拉框
  - 可选：移除 `openTeacherEditModal()` 函数（不再需要编辑教师）

---

## TESTING STRATEGY

### API 测试

```bash
# 测试统一教师列表 API
curl http://localhost:3000/api/unified-teachers | jq '.'

# 测试筛选未来30天有课
curl "http://localhost:3000/api/unified-teachers?hasClass=1" | jq '.'
```

### UI 验证

1. 打开 http://localhost:3000
2. 点击"教师管理" Tab
3. 确认表格显示：教师姓名、类型、近30天课时、未来30天课时、签到URL、操作
4. 确认"仅显示未来30天有课"默认勾选
5. 测试签到配置功能（如果教师已关联 feifei）

---

## ACCEPTANCE CRITERIA

- [ ] "教师管理" Tab 数据来源为 `yuekebao_teacher_salary`
- [ ] 教师列表显示：姓名、类型、近30天课时、未来30天课时、签到URL
- [ ] 签到 URL 通过名字关联 feifei 数据库的 uid 生成
- [ ] 未关联 feifei 的教师显示"未关联"
- [ ] 筛选功能正常（姓名搜索、未来有课筛选）
- [ ] 签到配置功能正常（针对已关联的教师）
- [ ] 语法检查通过

---

## COMPLETION CHECKLIST

- [ ] 创建 `/api/unified-teachers` API
- [ ] 改造教师管理 Tab 表格结构
- [ ] 修改 `loadFeifeiTeachers()` 函数
- [ ] 移除标签筛选相关代码
- [ ] 语法验证通过
- [ ] UI 测试通过

---

## NOTES

### 设计决策

**为什么以 `yuekebao_teacher_salary` 为主数据源？**
- 用户明确指定以"系统设置中的老师"为准
- 工资计算依赖此表，是核心业务数据
- 老师名与 ClassIn 保持一致，便于管理

**关联方式：通过名字关联**
- 两个系统没有统一的 UID
- 名字是唯一的共同标识
- 如果名字不匹配，显示"未关联"状态

### 潜在风险

**名字不一致问题**
- 如果 `yuekebao_teacher_salary.teacher_name` 与 `base_user_teacher.name` 不一致，无法生成签到 URL
- 解决方案：管理员需确保名字一致，或后续增加手动关联功能

<!-- EOF -->
