# Feature: Dashboard Dark Glassmorphism Redesign

## Feature Description

将当前的浅色主题Dashboard升级为现代化的暗色玻璃拟态(Dark Glassmorphism)风格，采用2025-2026年最流行的UI设计趋势，包括：深色背景、霓虹渐变光晕、毛玻璃卡片效果、发光按钮、流畅动画等，打造科技感十足的酷炫界面。

## User Story

As a **系统管理员/用户**
I want to **使用一个视觉效果酷炫、现代化的Dashboard界面**
So that **获得更好的视觉体验，减少眼睛疲劳，同时提升产品的专业感和科技感**

## Problem Statement

当前Dashboard使用传统的浅色主题设计，虽然功能完善，但视觉效果相对普通，缺乏现代感和吸引力。用户希望界面更加酷炫，符合2025年现代UI设计趋势。

## Solution Statement

采用Dark Glassmorphism设计方案，将整个界面升级为：
1. **深色背景** - 采用深蓝紫色渐变背景，配合动态渐变光晕
2. **玻璃拟态卡片** - 使用backdrop-filter实现毛玻璃效果
3. **霓虹发光效果** - 按钮和重要元素添加发光效果
4. **现代色彩方案** - 使用霓虹蓝、紫、青色系
5. **流畅动画** - 添加hover动画和微交互效果

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: dashboard.html (CSS样式部分)
**Dependencies**: 无外部依赖，纯CSS实现

---

## CONTEXT REFERENCES

### Relevant Codebase Files

- `dashboard.html` (lines 1-250) - CSS样式定义区域，需要全面重写
- `dashboard.html` (lines 1270-1310) - 统计卡片HTML结构，可能需要微调
- `dashboard.html` (lines 150-170) - `.stats`, `.stat-card` 核心样式定义

### Current Color Scheme (To Be Replaced)

```css
/* 当前主色调 */
Primary Purple: #667eea → #764ba2
Background: #f5f5f5, #f8f9ff (浅灰)
Cards: #ffffff (白色)
Text: #333 (深灰)
```

### New Color Scheme (Target)

```css
/* 新暗色主题色调 */
Background Dark: #0a0a1a → #1a1a2e → #16213e (深蓝紫渐变)
Card Glass: rgba(255, 255, 255, 0.05) → rgba(255, 255, 255, 0.1)
Accent Cyan: #00f5ff (霓虹青)
Accent Purple: #a855f7, #8b5cf6 (霓虹紫)
Accent Pink: #ec4899, #f472b6 (霓虹粉)
Accent Blue: #3b82f6, #60a5fa (霓虹蓝)
Text Primary: #ffffff
Text Secondary: rgba(255, 255, 255, 0.7)
Glow Cyan: 0 0 20px rgba(0, 245, 255, 0.5)
Glow Purple: 0 0 20px rgba(168, 85, 247, 0.5)
```

### Relevant Documentation

- [Dark Glassmorphism Medium Article](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f)
  - Key insight: Glass needs ambient gradients to distort, not solid black
- [Glassmorphism UI Best Practices](https://uxpilot.ai/blogs/glassmorphism-ui)
  - Implementation tips for SaaS dashboards
- [CSS backdrop-filter MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
  - Browser support and syntax

### Patterns to Follow

**Glassmorphism Card Pattern:**
```css
.glass-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
```

**Ambient Gradient Orbs Pattern:**
```css
.ambient-orb {
    position: fixed;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.6;
    pointer-events: none;
    animation: float 8s ease-in-out infinite;
}
```

**Neon Glow Button Pattern:**
```css
.neon-button {
    background: linear-gradient(135deg, #667eea, #764ba2);
    box-shadow: 0 0 20px rgba(102, 126, 234, 0.4);
    transition: all 0.3s ease;
}
.neon-button:hover {
    box-shadow: 0 0 30px rgba(102, 126, 234, 0.6),
                0 0 60px rgba(102, 126, 234, 0.3);
    transform: translateY(-2px);
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Background & Foundation

设置深色背景和动态渐变光晕效果

**Tasks:**
- 修改body和主容器背景为深色渐变
- 添加动态渐变光晕(ambient orbs)
- 设置全局文字颜色为白色/浅色

### Phase 2: Glass Card Components

将所有卡片改为玻璃拟态效果

**Tasks:**
- 重写 `.stat-card` 样式为玻璃效果
- 重写 `.controls` 区域样式
- 重写表格容器样式
- 重写Tab组件样式

### Phase 3: Interactive Elements

升级按钮、输入框等交互元素

**Tasks:**
- 添加霓虹发光按钮效果
- 升级输入框和下拉框样式
- 添加hover动画效果

### Phase 4: Typography & Details

完善文字和细节样式

**Tasks:**
- 调整文字颜色和对比度
- 更新课程类型徽章颜色
- 完善表格样式
- 添加微动画效果

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE Body & Container Background

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 修改body和.container背景

```css
body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin: 0;
    padding: 20px;
    min-height: 100vh;
    background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #16213e 100%);
    color: #ffffff;
    position: relative;
    overflow-x: hidden;
}

/* 添加动态渐变光晕背景 */
body::before {
    content: '';
    position: fixed;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background:
        radial-gradient(circle at 20% 80%, rgba(120, 0, 255, 0.3) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(0, 245, 255, 0.3) 0%, transparent 50%),
        radial-gradient(circle at 40% 40%, rgba(236, 72, 153, 0.2) 0%, transparent 40%);
    animation: backgroundShift 15s ease-in-out infinite;
    pointer-events: none;
    z-index: -1;
}

@keyframes backgroundShift {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    33% { transform: translate(2%, 2%) rotate(1deg); }
    66% { transform: translate(-1%, 1%) rotate(-1deg); }
}

.container {
    max-width: 1400px;
    margin: 0 auto;
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
}
```

**VALIDATE:** 刷新页面，确认深色渐变背景和动态光晕效果显示正常

---

### Task 2: UPDATE Header Styles

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 修改header样式为玻璃效果

```css
header {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: white;
    padding: 20px 30px;
    text-align: center;
    position: relative;
    overflow: hidden;
}

header::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
    animation: headerShimmer 3s ease-in-out infinite;
}

@keyframes headerShimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

header h1 {
    margin: 0;
    font-size: 2em;
    font-weight: 600;
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
    position: relative;
    z-index: 1;
}
```

**VALIDATE:** 确认header有流动光效动画

---

### Task 3: UPDATE Stats Cards (Glass Effect)

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 重写统计卡片为玻璃拟态

```css
.stats {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    padding: 30px;
    background: transparent;
}

.stat-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: 25px;
    border-radius: 16px;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}

.stat-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(0, 245, 255, 0.3);
    box-shadow: 0 8px 32px rgba(0, 245, 255, 0.15);
    transform: translateY(-5px);
}

.stat-value {
    font-size: 2.5em;
    font-weight: 700;
    color: #00f5ff;
    text-shadow: 0 0 20px rgba(0, 245, 255, 0.5);
    margin-bottom: 5px;
}

.stat-label {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9em;
}

.stat-breakdown {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.75em;
    margin-top: 8px;
}
```

**VALIDATE:** 确认统计卡片有毛玻璃效果和霓虹发光数字

---

### Task 4: UPDATE Tab Navigation

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 升级Tab导航样式

```css
.tabs {
    display: flex;
    background: rgba(0, 0, 0, 0.3);
    padding: 10px;
    gap: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tab {
    flex: 1;
    padding: 12px 24px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.tab:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
}

.tab.active {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.6), rgba(118, 75, 162, 0.6));
    border-color: rgba(102, 126, 234, 0.5);
    color: #ffffff;
    box-shadow: 0 0 20px rgba(102, 126, 234, 0.3);
}
```

**VALIDATE:** 确认Tab切换有发光效果

---

### Task 5: UPDATE Controls & Search Box

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 升级搜索框和筛选控件

```css
.controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 30px;
    gap: 15px;
    flex-wrap: wrap;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.search-box input {
    padding: 12px 20px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 25px;
    width: 300px;
    font-size: 14px;
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
    transition: all 0.3s ease;
}

.search-box input::placeholder {
    color: rgba(255, 255, 255, 0.5);
}

.search-box input:focus {
    outline: none;
    border-color: #00f5ff;
    box-shadow: 0 0 20px rgba(0, 245, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
}

.filter-select {
    padding: 12px 20px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    font-size: 14px;
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
    cursor: pointer;
    transition: all 0.3s ease;
}

.filter-select:focus {
    outline: none;
    border-color: #a855f7;
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.2);
}

.filter-select option {
    background: #1a1a2e;
    color: #ffffff;
}
```

**VALIDATE:** 确认搜索框聚焦时有青色发光效果

---

### Task 6: UPDATE Table Styles

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 升级数据表格样式

```css
.table-container {
    margin: 20px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

table {
    width: 100%;
    border-collapse: collapse;
}

th {
    background: rgba(102, 126, 234, 0.2);
    color: #ffffff;
    padding: 15px;
    text-align: left;
    font-weight: 600;
    border-bottom: 2px solid rgba(102, 126, 234, 0.5);
}

td {
    padding: 12px 15px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.9);
}

tr:hover td {
    background: rgba(255, 255, 255, 0.05);
}

tr.risk-student {
    background: rgba(239, 68, 68, 0.15);
}

tr.risk-student td {
    color: #f87171;
}
```

**VALIDATE:** 确认表格有透明背景和hover效果

---

### Task 7: UPDATE Buttons (Neon Glow)

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 升级所有按钮为霓虹发光效果

```css
/* 主要按钮 */
.primary-btn, .refresh-btn, button[type="submit"] {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 500;
    font-size: 14px;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.primary-btn:hover, .refresh-btn:hover, button[type="submit"]:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6),
                0 0 40px rgba(102, 126, 234, 0.3);
}

/* 成功按钮 */
.success-btn {
    background: linear-gradient(135deg, #10b981, #059669);
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
}

.success-btn:hover {
    box-shadow: 0 6px 25px rgba(16, 185, 129, 0.6),
                0 0 40px rgba(16, 185, 129, 0.3);
}

/* 危险按钮 */
.danger-btn {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
}

.danger-btn:hover {
    box-shadow: 0 6px 25px rgba(239, 68, 68, 0.6),
                0 0 40px rgba(239, 68, 68, 0.3);
}
```

**VALIDATE:** 确认按钮hover时有发光扩散效果

---

### Task 8: UPDATE Course Type Badges

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 升级课程类型徽章为霓虹风格

```css
.course-type-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
}

.course-type-badge.feijiao {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.4);
    text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}

.course-type-badge.oujiao {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.4);
    text-shadow: 0 0 10px rgba(168, 85, 247, 0.5);
}

.course-type-badge.yiduiduo {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.4);
    text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
}
```

**VALIDATE:** 确认课程类型徽章有发光效果

---

### Task 9: UPDATE Modal Styles

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 升级弹窗样式为玻璃效果

```css
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: rgba(26, 26, 46, 0.95);
    backdrop-filter: blur(20px);
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5),
                0 0 100px rgba(102, 126, 234, 0.1);
    max-width: 500px;
    width: 90%;
    overflow: hidden;
}

.modal-header {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8));
    padding: 20px;
    color: white;
    font-weight: 600;
}

.modal-body {
    padding: 25px;
    color: rgba(255, 255, 255, 0.9);
}

.modal-footer {
    padding: 15px 25px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
```

**VALIDATE:** 确认弹窗有毛玻璃背景效果

---

### Task 10: UPDATE Schedule Tooltip

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 升级日历弹窗样式

```css
.schedule-tooltip {
    position: absolute;
    z-index: 1000;
    background: rgba(26, 26, 46, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4),
                0 0 60px rgba(102, 126, 234, 0.1);
    padding: 20px;
    width: 580px;
    max-height: 85vh;
    overflow-y: auto;
    font-size: 13px;
    transform: scale(1.3);
    transform-origin: top left;
    color: #ffffff;
}

.tooltip-header {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8));
    color: white;
    padding: 15px 20px;
    border-radius: 12px 12px 0 0;
    font-weight: 600;
    text-align: center;
}

.calendar-day-header {
    background: rgba(102, 126, 234, 0.2);
    color: rgba(255, 255, 255, 0.9);
    padding: 10px;
    text-align: center;
    font-weight: 600;
}

.calendar-day {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    min-height: 80px;
    padding: 5px;
}

.calendar-day.today {
    background: rgba(0, 245, 255, 0.1);
    border-color: rgba(0, 245, 255, 0.3);
}

.calendar-day.has-class {
    background: rgba(168, 85, 247, 0.1);
}
```

**VALIDATE:** 确认日历弹窗有暗色玻璃效果

---

### Task 11: UPDATE Toast Notifications

**File:** `dashboard.html` - CSS section (JavaScript inline styles)

**IMPLEMENT:** 更新Toast通知样式（在showToast函数中）

```javascript
// 在showToast函数中更新样式
toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    border-radius: 12px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
`;

// 根据类型设置背景
const backgrounds = {
    success: 'linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.9))',
    error: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9))',
    info: 'linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(37, 99, 235, 0.9))'
};
toast.style.background = backgrounds[type] || backgrounds.info;
```

**VALIDATE:** 确认Toast通知有玻璃效果

---

### Task 12: ADD Loading Animation Enhancement

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 增强加载动画效果

```css
.loading-spinner {
    width: 50px;
    height: 50px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #00f5ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    box-shadow: 0 0 20px rgba(0, 245, 255, 0.3);
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

.loading-overlay {
    background: rgba(10, 10, 26, 0.9);
    backdrop-filter: blur(10px);
}

.loading-text {
    color: #00f5ff;
    text-shadow: 0 0 20px rgba(0, 245, 255, 0.5);
    animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
```

**VALIDATE:** 确认加载动画有发光效果

---

### Task 13: UPDATE Scrollbar Styles

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 自定义滚动条样式

```css
/* 自定义滚动条 */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #667eea, #764ba2);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #764ba2, #667eea);
}
```

**VALIDATE:** 确认滚动条为紫色渐变

---

### Task 14: ADD Hover Animations

**File:** `dashboard.html` - CSS section

**IMPLEMENT:** 添加全局hover动画增强

```css
/* 卡片悬浮动画 */
.stat-card, .table-container, .modal-content {
    transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
}

/* 表格行悬浮 */
tr {
    transition: background 0.2s ease;
}

/* 链接悬浮发光 */
a {
    color: #60a5fa;
    text-decoration: none;
    transition: all 0.3s ease;
}

a:hover {
    color: #00f5ff;
    text-shadow: 0 0 10px rgba(0, 245, 255, 0.5);
}

/* 输入框聚焦动画 */
input, select, textarea {
    transition: all 0.3s ease;
}
```

**VALIDATE:** 确认所有交互元素有平滑过渡

---

## TESTING STRATEGY

### Visual Testing

1. **暗色背景验证** - 确认背景为深蓝紫渐变，光晕动画流畅
2. **玻璃效果验证** - 确认卡片有毛玻璃透明效果
3. **发光效果验证** - 确认数字、按钮有霓虹发光效果
4. **动画流畅性** - 确认所有hover动画流畅无卡顿
5. **文字可读性** - 确认所有文字在暗色背景上清晰可读

### Browser Compatibility

- Chrome (主要测试)
- Safari (webkit前缀验证)
- Firefox (backdrop-filter支持)

### Responsive Testing

- 确认移动端适配正常
- 确认玻璃效果在小屏幕上性能良好

---

## VALIDATION COMMANDS

### Level 1: Syntax Check

```bash
# 检查HTML语法
npx htmlhint dashboard.html

# 如果没有htmlhint，直接在浏览器控制台检查错误
```

### Level 2: Visual Validation

1. 刷新页面 http://localhost:5001
2. 检查以下视觉效果：
   - [ ] 深色渐变背景显示正常
   - [ ] 动态光晕动画播放
   - [ ] 统计卡片有毛玻璃效果
   - [ ] 数字有青色发光效果
   - [ ] Tab切换有发光效果
   - [ ] 按钮hover有发光扩散
   - [ ] 表格有透明背景
   - [ ] 滚动条为紫色渐变

### Level 3: Performance Check

```javascript
// 在浏览器控制台运行，检查动画性能
const fps = [];
let lastTime = performance.now();
function checkFPS() {
    const now = performance.now();
    fps.push(1000 / (now - lastTime));
    lastTime = now;
    if (fps.length < 60) requestAnimationFrame(checkFPS);
    else console.log('Average FPS:', fps.reduce((a,b)=>a+b)/fps.length);
}
checkFPS();
// 期望: > 55 FPS
```

---

## ACCEPTANCE CRITERIA

- [ ] 整体界面为深色主题，背景有动态渐变光晕
- [ ] 所有卡片有玻璃拟态(毛玻璃)效果
- [ ] 统计数字有霓虹青色发光效果
- [ ] 按钮hover时有发光扩散动画
- [ ] Tab导航有发光active状态
- [ ] 搜索框聚焦时有发光边框
- [ ] 表格有透明背景，行hover有效果
- [ ] 弹窗有暗色玻璃效果
- [ ] 滚动条为紫色渐变样式
- [ ] 所有文字在暗色背景上清晰可读
- [ ] 动画流畅，无明显卡顿
- [ ] 移动端适配正常

---

## COMPLETION CHECKLIST

- [ ] 所有CSS样式按顺序更新完成
- [ ] 每个任务的视觉效果验证通过
- [ ] 浏览器兼容性测试通过
- [ ] 性能测试 FPS > 55
- [ ] 移动端响应式测试通过
- [ ] 文字可读性确认
- [ ] 无控制台错误

---

## NOTES

### Design Decisions

1. **选择Dark Glassmorphism** - 这是2025-2026最流行的UI趋势，结合了暗色模式的护眼优势和玻璃效果的现代感

2. **霓虹色彩选择** - 青色(#00f5ff)作为主要强调色，紫色作为辅助色，符合科技感审美

3. **动态光晕背景** - 使用CSS伪元素和动画实现，无需额外图片资源，性能良好

4. **渐进增强** - 玻璃效果使用backdrop-filter，不支持的浏览器会降级为纯色背景

### Performance Considerations

- backdrop-filter在老旧设备上可能有性能问题，但现代设备处理能力足够
- 动画使用transform和opacity，利用GPU加速
- 避免使用过多的box-shadow叠加，控制发光层数

### Accessibility

- 保持足够的文字对比度 (WCAG AA标准)
- 发光效果不影响文字可读性
- 动画尊重用户的prefers-reduced-motion设置

### Future Enhancements

- 可考虑添加明暗模式切换功能
- 可添加更多微交互动画
- 可考虑添加粒子背景效果

<!-- EOF -->
