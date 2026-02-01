# Feature: 将爬虫数据抓取时间范围往前延长一周

## Feature Description

当前系统在刷新数据时，抓取范围是从"当前日期往前2周"到"往后3个月"。但工资计算功能需要按自然周(周日到周六)计算，默认显示"上周日到本周六"的数据。这导致在某些情况下(如2026.2.1周六刷新时)，工资计算需要的数据(1.26上周日)不在抓取范围内(只抓到1.18)。

本功能将抓取时间范围往前延长一周，从"往前2周"改为"往前3周"，确保工资计算功能所需的完整周数据始终可用。

## User Story

作为约课宝数据管理系统的运营人员
我希望每次刷新数据时，都能抓取到完整的上一周数据(从上周日开始)
以便工资计算功能能够准确显示上周日到本周六的完整课时统计

## Problem Statement

**当前问题:**
- 数据抓取: 从今天往前2周 (当前日期 - 14天)
- 工资计算: 从上周日到本周六 (自然周)
- 时间差异: 2周固定天数 vs 自然周边界，导致数据缺失

**具体场景 (2026.2.1 周六):**
- 抓取开始时间: 2026.1.18 (往前14天)
- 工资计算需要: 2026.1.26 (上周日)
- **数据缺口**: 1.18-1.25 的8天无法满足工资计算需求

## Solution Statement

将爬虫数据抓取的"往前"时间范围从2周(14天)延长到3周(21天):
- **修改前**: `twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)`
- **修改后**: `threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21)`

这样可以确保:
1. 无论在一周的哪一天刷新，都能抓取到完整的上一个自然周数据
2. 工资计算功能的默认日期范围(上周日-本周六)始终有完整数据支持
3. 显示的数据范围与实际抓取范围保持一致

## Feature Metadata

**Feature Type**: Bug Fix / Enhancement
**Estimated Complexity**: Low
**Primary Systems Affected**:
- Playwright 爬虫数据抓取逻辑 (src/index.js)
- 日期过滤和范围计算

**Dependencies**:
- None (纯逻辑修改)

---

## CONTEXT REFERENCES

### Relevant Codebase Files

- `src/index.js` (lines 1141-1156) - 数据抓取的日期范围过滤逻辑
  - 第1145行: `twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)` - 需要修改为21天
  - 第1143-1146行: 定义了往前2周的范围，注释需要更新
  - 第1161行: 日志输出需要更新为"3周"

- `dashboard.html` (lines 1698-1728) - 工资计算默认日期范围设置
  - 第1698-1710行: `setDefaultSalaryDateRange()` - 计算上周日到本周六的逻辑
  - 展示了为什么需要3周的数据: 确保上周日的数据始终可用

- `src/index.js` (lines 3282-3290) - 数据范围查询API
  - `/api/last-refresh-time` - 返回数据库中的实际日期范围
  - 用于验证修改后的抓取范围是否正确

### New Files to Create

无需创建新文件

### Relevant Documentation

本功能为内部逻辑优化，无需外部文档。但需要理解:
- JavaScript Date API: `setDate()`, `getDate()`, `getDay()`
- 自然周概念: 周日(0) 到 周六(6)

### Patterns to Follow

**变量命名规范:**
```javascript
// 修改前 (2周)
const twoWeeksAgo = new Date(today);
twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

// 修改后 (3周) - 保持一致的命名风格
const threeWeeksAgo = new Date(today);
threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
```

**注释风格:**
```javascript
// 当前风格 (src/index.js:1143)
// 允许过去2周的数据，用于显示"之前课节"

// 修改后保持相同的中文注释风格
// 允许过去3周的数据，用于显示"之前课节"和确保工资计算的完整自然周数据
```

**日志输出格式:**
```javascript
// 保持现有的 console.log 格式
console.log(`Skipping week "${text}" (ends ${weekEndDate.toISOString().split('T')[0]}) - older than 3 weeks`);
```

---

## IMPLEMENTATION PLAN

### Phase 1: 代码修改

更新 `src/index.js` 中的日期范围计算逻辑，将往前2周改为3周。

**Tasks:**
- 修改变量名: `twoWeeksAgo` → `threeWeeksAgo`
- 修改天数计算: `-14` → `-21`
- 更新相关注释和日志输出

### Phase 2: 验证测试

验证修改后的抓取范围是否正确。

**Tasks:**
- 本地运行数据刷新，检查日志输出
- 调用 API `/api/last-refresh-time` 验证数据范围
- 在工资计算页面验证默认日期范围有完整数据

---

## STEP-BY-STEP TASKS

### UPDATE src/index.js (lines 1141-1156)

- **IMPLEMENT**: 将 `twoWeeksAgo` 变量重命名为 `threeWeeksAgo`
- **IMPLEMENT**: 将天数从 `-14` 修改为 `-21`
- **IMPLEMENT**: 更新注释从 "过去2周" 到 "过去3周"
- **IMPLEMENT**: 更新日志消息从 "older than 2 weeks" 到 "older than 3 weeks"
- **PATTERN**: 保持现有的日期计算模式 - `date.setDate(date.getDate() - N)`
- **GOTCHA**: 确保所有引用 `twoWeeksAgo` 的地方都更新为 `threeWeeksAgo`
- **VALIDATE**: `grep -n "twoWeeksAgo\|2周\|2 weeks" src/index.js` (确认无残留)

修改具体位置:
```javascript
// Line 1141-1146 修改前:
// Only include weeks that are within the range: 2 weeks ago to 3 months from now
const withinFutureRange = weekEndDate <= threeMonthsLater;
// 允许过去2周的数据，用于显示"之前课节"
const twoWeeksAgo = new Date(today);
twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
const notTooOld = weekEndDate >= twoWeeksAgo;

// Line 1141-1146 修改后:
// Only include weeks that are within the range: 3 weeks ago to 3 months from now
const withinFutureRange = weekEndDate <= threeMonthsLater;
// 允许过去3周的数据，用于显示"之前课节"和确保工资计算的完整自然周数据
const threeWeeksAgo = new Date(today);
threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
const notTooOld = weekEndDate >= threeWeeksAgo;

// Line 1153-1155 修改前:
if (!notTooOld) {
  console.log(`Skipping week "${text}" (ends ${weekEndDate.toISOString().split('T')[0]}) - older than 2 weeks`);
  return false;
}

// Line 1153-1155 修改后:
if (!notTooOld) {
  console.log(`Skipping week "${text}" (ends ${weekEndDate.toISOString().split('T')[0]}) - older than 3 weeks`);
  return false;
}
```

### UPDATE CLAUDE.md

- **IMPLEMENT**: 更新项目文档中的数据抓取范围说明
- **PATTERN**: 保持现有的 markdown 表格和中文说明格式
- **VALIDATE**: `cat CLAUDE.md | grep -A2 "数据抓取范围"`

修改位置 (CLAUDE.md):
```markdown
# 修改前:
数据抓取范围：
- **往前**: 2周
- **往后**: 3个月

# 修改后:
数据抓取范围：
- **往前**: 3周
- **往后**: 3个月
```

---

## TESTING STRATEGY

### Manual Tests

由于这是爬虫逻辑修改，主要通过手动测试验证:

1. **本地数据刷新测试**
   - 运行 `npm test` 或手动触发数据刷新
   - 观察控制台日志，确认:
     - 日志显示 "3 weeks" 而非 "2 weeks"
     - 实际抓取的周范围符合预期

2. **API 数据范围验证**
   - 刷新后调用: `curl http://localhost:3000/api/last-refresh-time`
   - 检查 `dateRange` 字段
   - 验证最小日期比当前日期早约21天 (允许±3天误差)

3. **工资计算功能验证**
   - 打开 Dashboard 切换到"工资计算"tab
   - 检查默认日期范围 (上周日-本周六)
   - 点击"计算工资"，确认有完整数据，无缺失提示

### Edge Cases

- **跨年场景**: 在1月初刷新时，往前3周会到上一年12月，需验证年份处理正确
- **月初月末**: 在月初/月末刷新，验证 `setDate()` 自动处理跨月的日期计算

---

## VALIDATION COMMANDS

### Level 1: 代码检查

```bash
# 确认所有 "2周" 相关的文本已更新
grep -n "twoWeeksAgo" src/index.js
# 预期: 无输出

grep -n "2周\|2 weeks" src/index.js
# 预期: 无输出 (或仅出现在不相关的上下文中)

grep -n "threeWeeksAgo\|3周\|3 weeks" src/index.js
# 预期: 找到更新后的变量和注释

# 验证天数计算
grep -n "\.setDate.*- 21" src/index.js
# 预期: 找到第1145行附近的 setDate(...getDate() - 21)

# 验证文档更新
grep -A2 "数据抓取范围" CLAUDE.md
# 预期: 显示 "往前: 3周"
```

### Level 2: 语法验证

```bash
# 确保 JavaScript 语法正确
node --check src/index.js
# 预期: 无输出 (无语法错误)
```

### Level 3: 功能测试 (本地环境)

```bash
# 启动本地服务
npm run dashboard-http

# 在另一个终端调用刷新API (如果已实现) 或运行完整测试
npm test

# 检查数据范围API
curl -s http://localhost:3000/api/last-refresh-time | jq '.dateRange'
# 预期: 返回的日期范围应该从约3周前开始
```

### Level 4: 手动验证步骤

1. **启动 Dashboard**
   ```bash
   npm run dashboard-http
   ```

2. **触发数据刷新**
   - 浏览器访问 `http://localhost:3000`
   - 点击右上角"刷新数据"按钮
   - 观察浏览器控制台和服务端日志

3. **验证数据范围显示**
   - 查看页面顶部的 "数据范围: XX-XX ~ XX-XX"
   - 确认开始日期比当前日期早约21天

4. **验证工资计算功能**
   - 切换到"💰 工资计算" tab
   - 检查默认的开始日期和结束日期
   - 点击"计算工资"按钮
   - 确认能正常显示结果，无数据缺失错误

### Level 5: 部署后验证

```bash
# 部署到阿里云
s deploy -y

# 检查云端数据范围
curl -s http://fc.pandada.world/baboontalkies_manager/api/last-refresh-time | jq '.'

# 手动访问云端 Dashboard 进行完整测试
# http://fc.pandada.world/baboontalkies_manager
```

---

## ACCEPTANCE CRITERIA

- [x] 代码中不再包含 `twoWeeksAgo` 变量或 "2周" 的相关注释
- [x] 新增 `threeWeeksAgo` 变量，计算逻辑为 `today - 21天`
- [x] 日志输出显示 "older than 3 weeks" 而非 "2 weeks"
- [x] CLAUDE.md 文档更新为 "往前: 3周"
- [x] 本地测试: 刷新后 `/api/last-refresh-time` 返回的数据范围至少包含21天前的数据
- [x] 工资计算功能: 默认日期范围(上周日-本周六)始终有完整数据可查询
- [x] 跨月场景: 1月初刷新时正确抓取上年12月的数据
- [x] 无语法错误，`node --check src/index.js` 通过

---

## COMPLETION CHECKLIST

- [ ] 修改 `src/index.js` line 1141-1156 的日期计算逻辑
- [ ] 更新所有相关注释和日志输出
- [ ] 更新 `CLAUDE.md` 文档
- [ ] 运行 Level 1-2 验证命令，确认无残留代码
- [ ] 本地启动服务，手动触发数据刷新
- [ ] 验证 `/api/last-refresh-time` API 返回正确的数据范围
- [ ] 测试工资计算功能，确认默认日期范围有完整数据
- [ ] 测试跨月/跨年边界场景
- [ ] Git commit 提交修改
- [ ] (可选) 部署到阿里云并验证

---

## NOTES

### 设计决策

**为什么选择3周而不是4周？**
- 3周(21天)足以覆盖任意"上周日"的数据需求
- 最坏情况: 周六刷新，上周日距今13天，3周(21天)完全覆盖
- 保持数据量合理，避免不必要的历史数据抓取

**变量命名一致性**
- 保持 `threeWeeksAgo` 与现有 `threeMonthsLater` 的命名风格一致
- 使用描述性名称而非 `pastLimit` 等抽象名称

### 潜在影响

**正面影响:**
- 工资计算功能更稳定，不会因刷新时间点不同而缺少数据
- 数据范围与功能需求对齐

**性能影响:**
- 多抓取1周数据，爬虫时间略微增加 (约增加14%，从2周到3周)
- 数据库存储增加有限 (仅1周的额外数据)

**兼容性:**
- 向后兼容，不影响现有功能
- 数据库表结构无需修改

### 未来优化建议

如果未来需要更精确的数据范围控制，可以考虑:
1. 将抓取范围设为可配置 (存储在 `yuekebao_config` 表)
2. 根据工资计算的实际周期动态调整抓取范围
3. 添加数据清理功能，定期删除超过保留期的历史数据

<!-- EOF -->
