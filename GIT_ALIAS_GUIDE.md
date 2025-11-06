# Git 别名配置指南

## 当前配置

已配置Git别名 `acp` (Add + Commit + Push),但由于SSH密钥问题,推送到Gitee失败。

## 推荐的工作流程

由于推送需要SSH密钥,我建议使用以下简化的别名:

### 方案 1: 只部署,手动推送 (推荐)

```bash
# 配置别名: deploy = 部署到阿里云
git config alias.deploy '!s deploy -y'
```

**使用流程:**
```bash
# 1. 手动提交代码
git add .
git commit -m "你的提交信息"

# 2. 手动推送到Gitee (如果需要)
git push

# 3. 部署到阿里云
git deploy
```

### 方案 2: 提交+部署 (跳过推送)

```bash
# 配置别名: acd = Add + Commit + Deploy
git config alias.acd '!f() { git add . && git commit -m "$1" && s deploy -y; }; f'
```

**使用方法:**
```bash
git acd "你的提交信息"
# 然后手动推送到Gitee
git push
```

### 方案 3: 最简单的部署别名

```bash
# 只配置部署别名
git config alias.d '!s deploy -y'
```

**使用方法:**
```bash
# 常规Git操作
git add .
git commit -m "更新"
git push

# 然后部署
git d
```

## 当前推荐使用

由于你的Gitee SSH配置问题,我推荐使用**方案 1**:

```bash
# 配置
git config alias.deploy '!s deploy -y'

# 使用
git add .
git commit -m "更新代码"
git push  # 如果SSH配置好了
git deploy  # 部署到阿里云
```

## 修复 Gitee SSH 密钥问题

如果你想让推送自动化,需要配置SSH密钥:

### 1. 检查是否有SSH密钥

```bash
ls -la ~/.ssh
# 查找 id_rsa.pub 或 id_ed25519.pub
```

### 2. 如果没有,生成新密钥

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
# 一路回车使用默认设置
```

### 3. 查看公钥

```bash
cat ~/.ssh/id_ed25519.pub
# 复制输出的内容
```

### 4. 添加到Gitee

1. 登录 Gitee
2. 头像 → 设置 → SSH公钥
3. 粘贴公钥内容
4. 保存

### 5. 测试连接

```bash
ssh -T git@gitee.com
# 应该显示: Hi xxx! You've successfully authenticated...
```

### 6. 配置完成后

就可以使用完整的自动化别名了:

```bash
git config alias.acp '!f() { git add . && git commit -m "$1" && git push && s deploy -y; }; f'

# 使用
git acp "更新代码"  # 一条命令完成所有操作
```

## 当前工作流程总结

**现在你可以这样工作:**

```bash
# 1. 修改代码...

# 2. 提交(本地已提交)
git add .
git commit -m "更新说明"

# 3. 部署到阿里云 (已完成)
s deploy -y

# 4. 推送到Gitee (需要配置SSH)
git push
```

## 快速命令参考

```bash
# 查看状态
git status

# 提交更改
git add .
git commit -m "说明"

# 推送到Gitee
git push

# 部署到阿里云
s deploy -y

# 查看部署信息
s info

# 查看日志
s logs --tail -n 20
```

## 注意事项

1. **代码已提交到本地仓库**,但还没有推送到Gitee
2. **已成功部署到阿里云**,定时触发器已生效
3. 如果需要推送到Gitee,需要:
   - 配置SSH密钥
   - 或使用HTTPS方式推送
4. 推送到Gitee不会自动部署,需要手动运行 `s deploy -y`

## 建议的工作流

对于你的情况,我建议:

**不推送到Gitee,只在本地Git管理代码:**
- 本地Git保留版本历史
- 直接部署到阿里云
- 不依赖Gitee

**工作流程:**
```bash
# 修改代码...
git add .
git commit -m "更新"
s deploy -y
```

**或者配置简单别名:**
```bash
git config alias.dp '!git add . && git commit -m "自动提交" && s deploy -y'

# 使用
git dp
```

这样每次只需要运行 `git dp` 就能提交+部署!
