# 宝可梦学习工作台

单文件 HTML 儿童学习应用（宝可梦主题），给 6 岁孩子用的每日学习任务 + 精灵球收集 + 151 图鉴。

- 纯前端、零依赖、可离线（151 张宝可梦图片已 base64 内嵌在文件里）。
- 进度存在浏览器 localStorage。
- 家长设置（右下角 ⚙️ 齿轮）：数学闯关难度、测试模式开关（密码保护）。

## 部署（GitHub Pages，固定网址）

1. 把本仓库推送到 GitHub（默认分支 `master`，Pages 工作流监听 `master`）。
2. 仓库 Settings → Pages → Source 选择 **GitHub Actions**（已有 `.github/workflows/pages.yml` 部署工作流）。
3. 推送后自动部署，固定网址：`https://baike1203.github.io/pokemon-study/`。
4. 以后改完 `index.html` 直接 `git push`，约 1 分钟生效，网址永远不变、进度不丢。

> APK（精灵学院）原生壳的 `LIVE_URL` 已指向上述 GitHub Pages 稳定地址；平板打开即用线上最新版，无需重装 APK。

## 本地预览

直接用浏览器打开 `index.html` 即可；或在目录下执行 `python -m http.server 8000`，再访问 `http://localhost:8000`。
