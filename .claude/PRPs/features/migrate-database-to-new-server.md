# Feature: 数据库迁移到新服务器

## Feature Description

将项目中所有数据库连接从阿里云 RDS（baboontalkies 和 feifei 两个数据库）统一迁移到新的数据库服务器（34.143.219.245），使用统一的 `baboon` 数据库。

## User Story

As a 系统管理员
I want to 将所有数据库连接迁移到新服务器
So that 可以统一数据库管理，简化运维

## Problem Statement

当前系统存在多个数据库配置分散在多个文件中：
1. **baboontalkies 主数据库**（阿里云 RDS）- 用于存储课程、学员、配置数据
2. **feifei 数据库**（阿里云 RDS）- 用于管理员账号管理
3. **多个测试/检查脚本**也硬编码了数据库连接信息

需要统一迁移到新的数据库服务器。

## Solution Statement

将所有文件中的数据库连接配置统一修改为新的数据库服务器信息：
- Host: `34.143.219.245`
- Port: `3306`
- User: `dev`
- Password: `3.@d?*|X|GLc;0%z`
- Database: `baboon`

## Feature Metadata

**Feature Type**: Refactor
**Estimated Complexity**: Low
**Primary Systems Affected**: 数据库连接层
**Dependencies**: 无新增依赖

---

## CONTEXT REFERENCES

### 当前系统中的数据库配置汇总

#### 1. baboontalkies 主数据库（共 3 处）
| 文件 | 行号 | Host |
|------|------|------|
| `src/index.js` | 2128-2134 | rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com |
| `src/index.js` | 2559-2565 | rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com |
| `src/index.js` | 2677-2683 | rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com |

#### 2. feifei 数据库（共 1 处）
| 文件 | 行号 | Host |
|------|------|------|
| `src/index.js` | 2691-2697 | htemysqlhahaha.mysql.rds.aliyuncs.com |

#### 3. 测试/检查脚本（共 8 处）
| 文件 | 行号 | Host | 备注 |
|------|------|------|------|
| `check_scarlett_full.js` | 4-9 | rm-bp1k2s5b10qh2rw679o... | baboontalkies |
| `check_scarlett_data.js` | 4-9 | rm-bp1k2s5b10qh2rw679o... | baboontalkies |
| `check_scarlett_duplicates.js` | 4-9 | rm-bp1k2s5b10qh2rw679o... | baboontalkies |
| `check_scarlett_schedule.js` | 4-9 | rm-bp1k2s5b10qh2rw679o... | baboontalkies |
| `check_hersel_data.mjs` | 3-8 | rm-bp1k2s5b10qh2rw679o... | baboontalkies |
| `check_hersel_correct.mjs` | 3-8 | rm-bp1k2s5b10qh2rw679o... | baboontalkies |
| `check_hersel_all.mjs` | 3-8 | rm-bp1k2s5b10qh2rw679o... | baboontalkies |
| `check_db_update.js` | 4-8 | rm-bp1bj556399482e86... | 旧数据库 |
| `check_db_update.mjs` | 4-8 | rm-bp1bj556399482e86... | 旧数据库 |

#### 4. 本地测试脚本（不在迁移范围内）
| 文件 | 行号 | Host | 备注 |
|------|------|------|------|
| `check_mysql_data.py` | 8-13 | localhost | 本地测试用，不需要修改 |

### 新数据库配置

```javascript
const dbConfig = {
  host: '34.143.219.245',
  port: 3306,
  user: 'dev',
  password: '3.@d?*|X|GLc;0%z',
  database: 'baboon'
};
```

### Relevant Codebase Files

- `src/index.js` (lines 2128-2134, 2559-2565, 2677-2683, 2691-2697) - 主要数据库配置
- `check_scarlett_full.js` (lines 4-9) - 测试脚本
- `check_scarlett_data.js` (lines 4-9) - 测试脚本
- `check_scarlett_duplicates.js` (lines 4-9) - 测试脚本
- `check_scarlett_schedule.js` (lines 4-9) - 测试脚本
- `check_hersel_data.mjs` (lines 3-8) - 测试脚本
- `check_hersel_correct.mjs` (lines 3-8) - 测试脚本
- `check_hersel_all.mjs` (lines 3-8) - 测试脚本
- `check_db_update.js` (lines 4-8) - 测试脚本
- `check_db_update.mjs` (lines 4-8) - 测试脚本

### New Files to Create

无需创建新文件。

---

## IMPLEMENTATION PLAN

### Phase 1: 主服务文件修改

修改 `src/index.js` 中的所有数据库配置（共 4 处）。

### Phase 2: 测试脚本修改

修改所有测试/检查脚本中的数据库配置（共 8 个文件）。

### Phase 3: 验证

连接新数据库验证配置正确性。

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE src/index.js - saveToDB 方法中的数据库配置

- **IMPLEMENT**: 修改第 2128-2134 行的 dbConfig
- **OLD CONFIG**:
  ```javascript
  const dbConfig = {
    host: 'rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com',
    port: 3306,
    user: 'baboontalkies',
    password: 'Kiki101422!',
    database: 'baboontalkies'
  };
  ```
- **NEW CONFIG**:
  ```javascript
  const dbConfig = {
    host: '34.143.219.245',
    port: 3306,
    user: 'dev',
    password: '3.@d?*|X|GLc;0%z',
    database: 'baboon'
  };
  ```

### Task 2: UPDATE src/index.js - saveCardDataToDB 方法中的数据库配置

- **IMPLEMENT**: 修改第 2559-2565 行的 dbConfig
- **PATTERN**: 同 Task 1

### Task 3: UPDATE src/index.js - setupApiServer 方法中的主数据库配置

- **IMPLEMENT**: 修改第 2677-2683 行的 dbConfig
- **PATTERN**: 同 Task 1

### Task 4: UPDATE src/index.js - setupApiServer 方法中的 feifei 数据库配置

- **IMPLEMENT**: 修改第 2691-2697 行的 feifeiDbConfig 为统一的新配置
- **OLD CONFIG**:
  ```javascript
  const feifeiDbConfig = {
    host: 'htemysqlhahaha.mysql.rds.aliyuncs.com',
    port: 3306,
    user: 'xidajian',
    password: 'Hte123456',
    database: 'feifei',
    charset: 'utf8mb4'
  };
  ```
- **NEW CONFIG**:
  ```javascript
  const feifeiDbConfig = {
    host: '34.143.219.245',
    port: 3306,
    user: 'dev',
    password: '3.@d?*|X|GLc;0%z',
    database: 'baboon',
    charset: 'utf8mb4'
  };
  ```

### Task 5-12: UPDATE 测试脚本

修改以下文件中的数据库配置：

| Task | 文件 | 行号 |
|------|------|------|
| 5 | check_scarlett_full.js | 4-9 |
| 6 | check_scarlett_data.js | 4-9 |
| 7 | check_scarlett_duplicates.js | 4-9 |
| 8 | check_scarlett_schedule.js | 4-9 |
| 9 | check_hersel_data.mjs | 3-8 |
| 10 | check_hersel_correct.mjs | 3-8 |
| 11 | check_hersel_all.mjs | 3-8 |
| 12a | check_db_update.js | 4-8 |
| 12b | check_db_update.mjs | 4-8 |

**新配置**:
```javascript
const connection = await mysql.createConnection({
  host: '34.143.219.245',
  port: 3306,
  user: 'dev',
  password: '3.@d?*|X|GLc;0%z',
  database: 'baboon'
});
```

---

## TESTING STRATEGY

### 连接测试

启动服务后访问 `/health` 端点验证数据库连接正常。

### 功能测试

1. 访问 `/api/dashboard-data` 验证主数据库查询正常
2. 访问 feifei 相关 API（如管理员接口）验证 feifei 数据库查询正常

---

## VALIDATION COMMANDS

### Level 1: 语法检查

```bash
node --check src/index.js
```

### Level 2: 启动测试

```bash
PORT=3000 npm run dashboard-http
# 然后访问 http://localhost:3000/health
```

### Level 3: API 测试

```bash
curl http://localhost:3000/api/dashboard-data
```

---

## ACCEPTANCE CRITERIA

- [ ] src/index.js 中的 4 处数据库配置已修改
- [ ] 8 个测试脚本中的数据库配置已修改
- [ ] 服务可以正常启动
- [ ] 健康检查端点返回正常
- [ ] 仪表板数据 API 返回正常

---

## COMPLETION CHECKLIST

- [ ] 所有 12 处数据库配置已更新
- [ ] 代码语法检查通过
- [ ] 本地服务启动正常（待数据库迁移完成后验证）

---

## NOTES

### 重要提醒

1. **密码中包含特殊字符**：新密码 `3.@d?*|X|GLc;0%z` 包含特殊字符，在 JavaScript 字符串中直接使用即可，无需转义。

2. **表结构迁移**：本 PRP 仅涉及代码中的数据库连接配置修改。数据库表结构和数据迁移需要在数据库层面单独处理，包括：
   - `yuekebao_classtime` 表
   - `yuekebao_student_cardnum` 表
   - `yuekebao_config` 表
   - feifei 数据库的 `sys_admin` 表

3. **check_mysql_data.py**：此文件是本地测试脚本，连接 localhost，不在本次迁移范围内。

4. **feifei 数据库合并**：原 feifei 数据库的表（如 `sys_admin`）需要迁移到新的 `baboon` 数据库中，确保管理员登录等功能正常。

### 旧数据库配置备份

| 数据库 | Host | User | Password | Database |
|--------|------|------|----------|----------|
| baboontalkies | rm-bp1k2s5b10qh2rw679o.mysql.rds.aliyuncs.com | baboontalkies | Kiki101422! | baboontalkies |
| feifei | htemysqlhahaha.mysql.rds.aliyuncs.com | xidajian | Hte123456 | feifei |
| 旧 baboontalkies | rm-bp1bj556399482e86.mysql.rds.aliyuncs.com | baboontalkies | Fegg8888 | baboontalkies |

<!-- EOF -->
