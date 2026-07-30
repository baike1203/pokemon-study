# 宝可梦学习工作台

单文件 HTML 儿童学习应用（宝可梦主题），给 6 岁孩子用的每日学习任务 + 精灵球收集 + 151 图鉴。

- 纯前端、零依赖、可离线（151 张宝可梦图片已 base64 内嵌在文件里）。
- 进度存在浏览器 localStorage。
- 家长设置（右下角 ⚙️ 齿轮）：数学闯关难度、测试模式开关（密码保护）。

## 部署（Cloudflare Pages + GitHub 自动部署）

1. 把本仓库推送到 GitHub。
2. Cloudflare Dashboard → Pages → Create a project → Connect Git → 选择本仓库。
3. 设置：Framework preset 选 **None**；Build command 留空；Output directory 填 **`/`**（根目录，因为 index.html 在仓库根）。
4. 部署完成，得到一个固定的 `*.pages.dev` 网址，平板浏览器收藏即可。
5. 以后在本仓库改完 `index.html`，`git push` 即自动重新部署（约 1 分钟生效，网址不变）。

## 本地预览

直接用浏览器打开 `index.html` 即可；或在目录下执行 `python -m http.server 8000`，再访问 `http://localhost:8000`。
