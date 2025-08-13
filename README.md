# 99game (Vite + React)

## 本地运行
```bash
npm i
npm run dev
```

## 构建
```bash
npm run build
npm run preview
```

## GitHub Pages 发布
```bash
npm i -D gh-pages
# package.json 已内置 deploy 脚本。首次需要把仓库放在 GitHub 并设置 gh-pages 分支（gh-pages 包会自动创建）。
npm run deploy
```
> 如需部署在子路径，例如 https://USER.github.io/REPO/ ，建议在 `vite.config.js` 配置 `base: '/REPO/'`，或在 GitHub 设置里选择 Pages 的分支/目录。
