# Feature: 老师签到状态/Student Note编辑/Feedback条件显示优化

## Feature Description

对老师端课程详情页面进行三项UI优化：
1. 签到成功后隐藏签到按钮，改为显示"Checked Success"文本状态
2. Feedback为空时隐藏"Feedback:"标题
3. Student Note增加"Edit"按钮，允许老师编辑课程笔记

## User Story

As a 老师
I want to 在课程详情页看到清晰的签到状态、可编辑的课程笔记、以及不显示空白Feedback
So that 页面信息更清晰实用，我可以直接编辑课程笔记

## Problem Statement

1. 签到成功后仍显示按钮样式的"Checked"，容易误认为可以再次点击
2. Feedback为空时仍显示"Feedback:"标题，界面显得空洞
3. Student Note只能查看不能编辑，老师需要修改时无法操作

## Solution Statement

1. 将签到成功状态从 `<button>` 改为 `<span>` 文本，显示"Checked Success"
2. 用 `v-if` 控制 Feedback 标题仅在有反馈数据时显示
3. 在 Student Note 标题旁添加"Edit"按钮，点击后显示内联编辑区域（textarea + Save/Cancel），调用 `/wechat/student/update` 保存

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Low
**Primary Systems Affected**: checkin Vue 前端（courseDetail.vue、courseDetailinfo.vue）
**Dependencies**: 无新增依赖，使用现有 Varlet UI 和 API

---

## CONTEXT REFERENCES

### Relevant Codebase Files

**前端 - 签到按钮**：
- `baboontalkies_manager/public/checkin/src/teacher/courseDetail.vue`
  - 第 27-44 行：签到状态按钮区域（`<template #extra>`）
  - 第 39-44 行：当前签到成功按钮（`v-else-if="i.attendance === 'success'"`）
  - 第 90-100 行：`attendance` 状态计算逻辑（`'success'` / `'primary'` / `'error'` / `''`）

**前端 - Student Note 和 Feedback**：
- `baboontalkies_manager/public/checkin/src/teacher/courseDetailinfo.vue`
  - 第 36-45 行：Student Note 区域（显示 `student?.courseRequire`）
  - 第 46-56 行：Feedback 区域（标题 + `<pre>` 内容）
  - 第 57-76 行：Feedback 按钮区域
  - 第 90-116 行：`<script setup>` 变量定义
  - 第 181-246 行：`start()` 数据加载函数
  - 第 202-211 行：获取学生数据（包含 `courseRequire` 字段）

**后端 - 学生更新 API**：
- `feifei-backend/src/modules/base/entity/user/student.ts`
  - `courseRequire` 字段定义：`@Column({ comment: '课程要求', nullable: true, type: 'text' })`
- 后端 Student Controller 已暴露 `/wechat/student/update` 端点（通过 Cool-Admin 自动 CRUD）

**API 模块**：
- `baboontalkies_manager/public/checkin/src/api/index.ts`
  - 通用 API 调用函数：`api<T>(url, data, method)`

**样式**：
- `baboontalkies_manager/public/checkin/src/index.css`
  - 第 283-299 行：`.border-my` 样式（绿色下划线装饰）

**路由**：
- `baboontalkies_manager/public/checkin/src/router.ts`
  - 第 23 行：`courseDetailinfo` 路由（`/courseDetailinfo/:id`）

### New Files to Create

无需创建新文件。

### Patterns to Follow

**Varlet UI 按钮模式**（参考 courseDetailinfo.vue 第 59-75 行）：
```vue
<var-button type="primary" @click="handler" class="mt-4 w-full">
  Button Text
</var-button>
```

**API 调用模式**（参考 feedback.vue 提交逻辑）：
```typescript
await api("/wechat/studentclassrecord/update", { id: xxx, field: value }, "POST");
```

**Tailwind CSS 样式**：项目使用 Tailwind CSS 进行样式设计。

**Vue 3 Composition API**：使用 `<script setup lang="ts">`、`ref()`、`computed()`。

---

## IMPLEMENTATION PLAN

### Phase 1: 签到按钮改为文本状态（courseDetail.vue）

将签到成功的 `<button>` 替换为 `<span>` 文本。

### Phase 2: Feedback 标题条件显示（courseDetailinfo.vue）

用 `v-if` 包裹 Feedback 标题，仅在有反馈数据时显示。

### Phase 3: Student Note 编辑功能（courseDetailinfo.vue）

添加 Edit 按钮和内联编辑区域，调用后端 API 保存。

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE courseDetail.vue — 签到成功状态改为文本

**文件**: `baboontalkies_manager/public/checkin/src/teacher/courseDetail.vue`
**位置**: 第 39-44 行

**IMPLEMENT**: 将签到成功的 `<button>` 替换为 `<span>` 文本显示。

**当前代码**（第 39-44 行）：
```vue
<button
  v-else-if="i.attendance === 'success'"
  class="text-gray-500 w-auto px-3 py-1 bg-red-100 rounded hover:bg-red-200 transition"
>
  Checked
</button>
```

**替换为**：
```vue
<span
  v-else-if="i.attendance === 'success'"
  class="text-green-600 w-auto px-3 py-1 bg-green-100 rounded text-sm font-medium"
>
  Checked Success
</span>
```

**变更说明**：
- `<button>` → `<span>`：不再是可点击按钮
- `text-gray-500 bg-red-100` → `text-green-600 bg-green-100`：从红灰色改为绿色，表示成功
- 文本从 "Checked" → "Checked Success"
- 移除 `hover:bg-red-200 transition`（非交互元素不需要 hover 效果）
- 添加 `text-sm font-medium` 保持视觉一致

**VALIDATE**: 构建项目后，在浏览器中查看已签到课程的显示效果

---

### Task 2: UPDATE courseDetailinfo.vue — Feedback 标题条件显示

**文件**: `baboontalkies_manager/public/checkin/src/teacher/courseDetailinfo.vue`
**位置**: 第 46-50 行

**IMPLEMENT**: 用 `v-if` 控制 "Feedback:" 标题仅在有反馈数据时显示。

**当前代码**（第 46-50 行）：
```vue
<div
  class="border-my section-title text-xl font-semibold text-gray-700 mb-2"
>
  Feedback:
</div>
```

**替换为**：
```vue
<div
  v-if="StudentClassRecord?.classFeedback"
  class="border-my section-title text-xl font-semibold text-gray-700 mb-2"
>
  Feedback:
</div>
```

**变更说明**：添加 `v-if="StudentClassRecord?.classFeedback"` 条件，与第 52 行 `<pre>` 元素的 `v-if` 条件一致。当 `classFeedback` 为空/null 时，标题和内容都不显示。

**VALIDATE**: 查看一个没有 Feedback 的课节详情页，确认 "Feedback:" 标题不显示

---

### Task 3: UPDATE courseDetailinfo.vue — Student Note 增加 Edit 按钮和编辑功能

**文件**: `baboontalkies_manager/public/checkin/src/teacher/courseDetailinfo.vue`
**位置**: 模板区域（第 36-45 行）和脚本区域（第 90-116 行）

**IMPLEMENT - 步骤 A**: 在 `<script setup>` 中添加编辑相关的响应式变量和保存函数。

在第 116 行（`const router = useRouter();`）之后添加：

```typescript
// Student Note 编辑功能
const isEditingNote = ref(false);
const editNoteText = ref('');

function startEditNote() {
  editNoteText.value = student.value?.courseRequire || '';
  isEditingNote.value = true;
}

function cancelEditNote() {
  isEditingNote.value = false;
  editNoteText.value = '';
}

async function saveNote() {
  if (!student.value?.id) return;
  try {
    await api(
      "/wechat/student/update",
      { id: student.value.id, courseRequire: editNoteText.value },
      "POST"
    );
    student.value.courseRequire = editNoteText.value;
    isEditingNote.value = false;
  } catch (e) {
    console.error('保存失败:', e);
  }
}
```

**IMPLEMENT - 步骤 B**: 修改模板中的 Student Note 区域，添加 Edit 按钮和内联编辑表单。

**当前代码**（第 37-45 行）：
```vue
<div class="section bg-white p-4 rounded-md shadow-sm">
  <div
    class="border-my section-title text-xl font-semibold text-gray-700 mb-2"
  >
    Student Note: {{ student?.courseRequire ? "" : "None" }}
  </div>
  <text class="text-blue-600">
    {{ student?.courseRequire }}
  </text>
```

**替换为**：
```vue
<div class="section bg-white p-4 rounded-md shadow-sm">
  <div
    class="border-my section-title text-xl font-semibold text-gray-700 mb-2"
    style="display: flex; align-items: center; justify-content: space-between;"
  >
    <span>Student Note: {{ student?.courseRequire ? "" : "None" }}</span>
    <button
      v-if="!isEditingNote && student"
      @click="startEditNote"
      style="background: white; color: #16a34a; border: 1px solid #16a34a; padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer;"
    >
      Edit
    </button>
  </div>
  <!-- 查看模式 -->
  <text v-if="!isEditingNote" class="text-blue-600">
    {{ student?.courseRequire }}
  </text>
  <!-- 编辑模式 -->
  <div v-if="isEditingNote" class="mt-2">
    <textarea
      v-model="editNoteText"
      rows="4"
      class="w-full p-2 border border-gray-300 rounded-md text-sm"
      placeholder="Enter class note..."
    ></textarea>
    <div class="flex gap-2 mt-2">
      <var-button
        type="primary"
        size="small"
        @click="saveNote"
      >
        Save
      </var-button>
      <var-button
        size="small"
        @click="cancelEditNote"
      >
        Cancel
      </var-button>
    </div>
  </div>
```

**变更说明**：
- Student Note 标题行改为 flex 布局，右侧放置 Edit 按钮
- Edit 按钮样式：白底（`background: white`）、绿字（`color: #16a34a`）、绿边框（`border: 1px solid #16a34a`）
- 点击 Edit 显示 `<textarea>` 编辑区域 + Save/Cancel 按钮
- 保存调用 `/wechat/student/update` API 更新 `courseRequire` 字段
- 保存成功后本地更新 `student.value.courseRequire`，退出编辑模式

**PATTERN**: Edit 按钮使用内联 style 而非 Tailwind 类，确保精确匹配"白底绿字绿边框"要求
**GOTCHA**:
- `student.value` 可能在数据加载完成前为 undefined，Edit 按钮需要 `v-if="student"` 保护
- `/wechat/student/update` 需要 `id` 字段（student 列表查询已返回 `id`）
- `courseRequire` 在数据库中是 `text` 类型，可存储长文本
**VALIDATE**: 打开课节详情页，点击 Edit 按钮，修改内容后点击 Save，刷新页面确认修改已保存

---

## TESTING STRATEGY

### 手动测试用例

**签到状态（courseDetail.vue）**：

| 测试场景 | 预期结果 |
|---------|---------|
| 已签到课程 | 显示绿色"Checked Success"文本（非按钮） |
| 未到签到时间 | 不显示任何状态 |
| 签到时间内未签到 | 显示蓝色"Click to Check in"按钮 |
| 过了签到时间未签到 | 显示红色"Not Checked"按钮 |

**Feedback 标题（courseDetailinfo.vue）**：

| 测试场景 | 预期结果 |
|---------|---------|
| 有 Feedback 数据 | 显示"Feedback:"标题 + 反馈内容 + "Edit Feedback"按钮 |
| 无 Feedback 数据 | 不显示"Feedback:"标题，只显示"+ Feedback"按钮 |

**Student Note 编辑（courseDetailinfo.vue）**：

| 测试场景 | 预期结果 |
|---------|---------|
| 有课程笔记 | 显示笔记内容 + Edit 按钮 |
| 无课程笔记 | 显示"Student Note: None" + Edit 按钮 |
| 点击 Edit | 显示 textarea（预填充现有内容）+ Save/Cancel 按钮，隐藏 Edit 按钮 |
| 编辑后点击 Save | textarea 消失，显示更新后的笔记，数据持久化 |
| 点击 Cancel | textarea 消失，恢复原始显示，不修改数据 |
| 刷新页面 | Save 后的修改仍然保留 |

### Edge Cases

- 学生数据未加载完成时，Edit 按钮不应显示
- courseRequire 为 null 时，编辑后保存空字符串
- 网络错误时保存失败的处理（console.error，不崩溃）
- 极长文本的 textarea 显示

---

## VALIDATION COMMANDS

### Level 1: 构建检查

```bash
cd baboontalkies_manager/public/checkin && npx vite build
```

### Level 2: 开发服务器

```bash
cd baboontalkies_manager && PORT=5001 npm run dashboard-http
# 访问 checkin 页面验证 UI
```

### Level 3: 手动验证

1. 打开老师端课程列表，检查已签到课程显示"Checked Success"文本
2. 打开课节详情（有 Feedback 的），确认 Feedback 标题和内容显示
3. 打开课节详情（无 Feedback 的），确认 Feedback 标题不显示
4. 点击 Student Note 的 Edit 按钮，编辑内容，保存
5. 刷新页面，确认修改已持久化

---

## ACCEPTANCE CRITERIA

- [ ] 签到成功后显示绿色"Checked Success"文本（非按钮），不可点击
- [ ] Feedback 为空时"Feedback:"标题不显示
- [ ] Student Note 旁有 Edit 按钮（白底绿字绿边框）
- [ ] 点击 Edit 后显示编辑区域（textarea + Save/Cancel）
- [ ] Save 成功后更新显示并退出编辑模式
- [ ] Cancel 后恢复原始显示
- [ ] 修改持久化到数据库（`/wechat/student/update`）
- [ ] 所有现有功能不受影响

---

## COMPLETION CHECKLIST

- [ ] Task 1: courseDetail.vue 签到状态改为文本
- [ ] Task 2: courseDetailinfo.vue Feedback 标题条件显示
- [ ] Task 3: courseDetailinfo.vue Student Note 编辑功能
- [ ] 构建通过无错误
- [ ] 手动 UI 验证通过

---

## NOTES

### 设计决策

1. **Edit 按钮样式**：使用内联 style 精确匹配"白底绿字绿边框"要求，而非 Tailwind 类（因为 Tailwind 的绿色值可能与设计不完全匹配）。绿色值使用 `#16a34a`（Tailwind green-600）。

2. **内联编辑 vs 新页面**：Student Note 是一个简单的文本字段，使用内联编辑（textarea 直接在原位展开）比跳转到新页面更符合用户体验。

3. **Save/Cancel 按钮**：使用 Varlet UI 的 `<var-button>` 保持与应用整体风格一致。

4. **数据更新方式**：保存成功后直接更新本地 `student.value.courseRequire`，无需重新请求 API，提升响应速度。

### Confidence Score: 9/10

这是一个低复杂度的纯前端 UI 修改任务，涉及的后端 API（`/wechat/student/update`）已经存在且无需修改。唯一的小风险是 `/wechat/student/update` API 是否需要额外的权限验证，但 Cool-Admin 框架的自动 CRUD 通常已处理。

<!-- EOF -->
