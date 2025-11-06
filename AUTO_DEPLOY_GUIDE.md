# 自动部署配置指南

阿里云函数计算**不会**自动从 Gitee 拉取代码部署。你需要手动配置 CI/CD 流程。

## 当前情况说明

**问题:** 提交代码到 Gitee 后,阿里云函数计算不会自动更新。

**原因:** 阿里云函数计算默认不监听 Git 仓库的变化,需要手动触发部署或配置自动化流程。

---

## 解决方案对比

### 方案 1: 本地自动部署脚本 (推荐) ⭐⭐⭐⭐⭐

**优点:**
- ✅ 最简单,无需额外配置
- ✅ 完全控制部署时机
- ✅ 免费
- ✅ 可以在提交代码后立即部署

**缺点:**
- ❌ 需要在本地执行
- ❌ 不是真正的"自动"

**使用方法:**

我已经创建了 `deploy-after-commit.sh` 脚本,使用方式:

```bash
# 赋予执行权限
chmod +x deploy-after-commit.sh

# 执行脚本(会自动提交代码并部署)
./deploy-after-commit.sh
```

**脚本功能:**
1. 检查是否有未提交的更改
2. 询问是否提交(可输入提交信息)
3. 自动推送到 Gitee
4. 自动部署到阿里云
5. 测试健康检查
6. 显示部署结果

---

### 方案 2: Git 别名自动部署 (推荐) ⭐⭐⭐⭐

**配置 Git 别名,让 `git push` 后自动部署:**

```bash
# 添加 Git 别名
git config alias.deploy '!git push && s deploy -y'

# 使用
git add .
git commit -m "更新代码"
git deploy  # 会自动 push 并部署
```

**更高级的版本:**

在 `.git/hooks/post-commit` 中添加自动部署钩子:

```bash
#!/bin/bash
# .git/hooks/post-commit

echo "🚀 提交完成,准备部署..."

# 询问是否部署
read -p "是否立即部署到阿里云? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "📦 开始部署..."
    s deploy -y
    echo "✅ 部署完成"
fi
```

---

### 方案 3: 阿里云云效 (完全自动化) ⭐⭐⭐⭐

**优点:**
- ✅ 真正的 CI/CD 自动化
- ✅ 与阿里云原生集成
- ✅ 支持复杂的构建流程
- ✅ 可以配置多环境部署

**缺点:**
- ❌ 配置相对复杂
- ❌ 需要配置云效权限

**配置步骤:**

#### 1. 登录阿里云云效

访问: https://devops.aliyun.com/

#### 2. 创建代码库

1. 进入"代码管理" → "代码库"
2. 点击"导入外部代码库"
3. 选择 "Gitee"
4. 输入你的 Gitee 仓库地址: `https://gitee.com/flycatbbb/grabber.git`
5. 配置访问凭证(使用 Gitee 的用户名和密码)

#### 3. 创建流水线

1. 进入"流水线" → "新建流水线"
2. 选择"自定义流水线"
3. 配置源代码:
   - 代码源: 选择刚才导入的仓库
   - 分支: master
   - 触发方式: 代码提交时自动触发

#### 4. 配置构建步骤

在流水线中添加以下步骤:

**步骤 1: 安装依赖**
```yaml
- name: 安装依赖
  image: node:20
  script:
    - npm install -g @serverless-devs/s
    - npm install
```

**步骤 2: 配置 Serverless Devs**
```yaml
- name: 配置 Serverless
  image: node:20
  script:
    - s config add --AccessKeyID $ALIYUN_ACCESS_KEY_ID --AccessKeySecret $ALIYUN_ACCESS_KEY_SECRET --AccountID $ALIYUN_ACCOUNT_ID -a developer_flycatbbb
```

**步骤 3: 部署**
```yaml
- name: 部署到函数计算
  image: node:20
  script:
    - s deploy -y
```

#### 5. 配置环境变量

在流水线设置中添加环境变量:
- `ALIYUN_ACCESS_KEY_ID`: 你的阿里云 AccessKeyID
- `ALIYUN_ACCESS_KEY_SECRET`: 你的阿里云 AccessKeySecret
- `ALIYUN_ACCOUNT_ID`: 你的阿里云账号 ID

#### 6. 保存并运行

保存流水线配置,以后每次提交代码到 Gitee,云效会自动:
1. 拉取代码
2. 安装依赖
3. 部署到函数计算

---

### 方案 4: GitHub Actions (需迁移到 GitHub) ⭐⭐⭐

如果愿意迁移到 GitHub,可以使用免费的 GitHub Actions。

**配置文件:** `.github/workflows/deploy.yml`

```yaml
name: Deploy to Aliyun FC

on:
  push:
    branches:
      - master

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm install -g @serverless-devs/s
          npm install

      - name: Configure Serverless Devs
        run: |
          s config add --AccessKeyID ${{ secrets.ALIYUN_ACCESS_KEY_ID }} --AccessKeySecret ${{ secrets.ALIYUN_ACCESS_KEY_SECRET }} --AccountID ${{ secrets.ALIYUN_ACCOUNT_ID }} -a developer_flycatbbb

      - name: Deploy to FC
        run: s deploy -y
```

**配置 Secrets:**

在 GitHub 仓库设置中添加:
- `ALIYUN_ACCESS_KEY_ID`
- `ALIYUN_ACCESS_KEY_SECRET`
- `ALIYUN_ACCOUNT_ID`

---

### 方案 5: Gitee Webhook + 自建服务器 ⭐⭐

需要一个服务器来接收 Gitee 的 webhook 并触发部署。

**不推荐,因为:**
- 需要额外的服务器
- 配置复杂
- 维护成本高

---

## 推荐使用方案

### 对于个人项目: 方案 1 或 方案 2 ✅

**方案 1 使用方法:**

```bash
# 每次修改代码后
./deploy-after-commit.sh
```

**方案 2 使用方法:**

```bash
# 配置 Git 别名
git config alias.deploy '!git push && s deploy -y'

# 使用
git add .
git commit -m "更新代码"
git deploy
```

### 对于团队项目: 方案 3 (阿里云云效) ✅

完全自动化,支持多人协作。

---

## 快速开始 - 使用自动部署脚本

我已经为你创建了 `deploy-after-commit.sh` 脚本。

### 第一次使用:

```bash
# 1. 赋予执行权限
chmod +x deploy-after-commit.sh

# 2. 执行脚本
./deploy-after-commit.sh
```

### 以后每次修改代码:

```bash
# 直接执行脚本即可
./deploy-after-commit.sh
```

**脚本会:**
1. ✅ 检查未提交的更改
2. ✅ 询问提交信息
3. ✅ 自动提交到 Git
4. ✅ 自动推送到 Gitee
5. ✅ 自动部署到阿里云
6. ✅ 测试部署结果
7. ✅ 显示访问地址

---

## 创建 Git 别名 (推荐)

如果不想每次都运行脚本,可以创建 Git 别名:

### 方法 1: 简单的 push + deploy

```bash
git config alias.deploy '!git push && s deploy -y'
```

使用:
```bash
git add .
git commit -m "更新"
git deploy  # 会自动 push 并部署
```

### 方法 2: 完整的 add + commit + push + deploy

```bash
git config alias.acp '!f() { git add . && git commit -m "$1" && git push && s deploy -y; }; f'
```

使用:
```bash
git acp "更新代码"  # 一条命令完成所有操作
```

---

## 常见问题

### Q1: 为什么提交到 Gitee 后不自动部署?

A: 阿里云函数计算不会监听 Git 仓库。你需要:
- 使用本地脚本手动触发 (`./deploy-after-commit.sh`)
- 或配置云效 CI/CD 实现自动化

### Q2: 云效配置复杂吗?

A: 相对复杂,但配置一次后就可以自动化。如果是个人项目,推荐使用本地脚本。

### Q3: 可以只部署不推送到 Gitee 吗?

A: 可以,直接运行:
```bash
s deploy -y
```

### Q4: 部署失败怎么办?

A: 查看错误日志:
```bash
s logs --tail -n 50
```

常见原因:
- 权限不足: 检查 AccessKey 权限
- 代码错误: 检查函数日志
- 网络问题: 重试部署

### Q5: 如何回滚到上一个版本?

A: 使用 Git 回滚代码后重新部署:
```bash
git revert HEAD
git push
s deploy -y
```

---

## 总结

**最简单的方案:** 使用 `deploy-after-commit.sh` 脚本

**步骤:**
1. `chmod +x deploy-after-commit.sh`
2. `./deploy-after-commit.sh`
3. 完成!

这样虽然不是"自动",但是非常简单,而且你完全控制部署时机。

如果需要真正的自动化,建议配置阿里云云效。
