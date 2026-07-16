# Git 常用命令

## 提交代码

```bash
git status
git add <files>
git commit -m "描述本次修改"
git push origin master
```

## 部署 manager

代码确认无误后执行：

```bat
cmd /c npm run deploy:gcloud
```

部署完成后检查：

```bash
curl -s https://baboontalkies.pandada.world/health
```

不建议配置会自动提交全部工作区文件的 Git alias，以免把无关修改一起提交。
