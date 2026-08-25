# TGO 文档网站

基于 [Fumadocs](https://fumadocs.dev) 构建的多语言文档网站，支持中文和英文。

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

访问 http://localhost:3000 查看网站。

## 项目结构

```
website/
├── content/docs/          # 文档内容 (MDX)
│   ├── zh/               # 中文文档
│   └── en/               # 英文文档
├── src/
│   ├── app/              # Next.js App Router 页面
│   │   ├── [lang]/       # 语言路由
│   │   └── api/          # API 路由
│   ├── lib/              # 工具库
│   │   ├── i18n.ts       # 国际化配置
│   │   └── source.ts     # 文档源配置
│   ├── components/       # React 组件
│   └── middleware.ts     # 国际化中间件
├── source.config.ts      # Fumadocs 配置
└── next.config.mjs       # Next.js 配置
```

## 主要功能

- **多语言支持**: 中文 (zh) / 英文 (en)，通过 middleware 自动重定向
- **MDX 文档**: 支持 MDX 格式编写文档
- **OpenAPI 集成**: 支持从 OpenAPI 规范生成 API 文档
- **全文搜索**: 基于 Orama 的本地搜索

## 可用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `pnpm build:docs` | 生成文档 |
| `pnpm lint` | 代码检查 |
| `pnpm format` | 代码格式化 |

## 添加新文档

1. 在 `content/docs/[lang]/` 下创建 `.md` 或 `.mdx` 文件
2. 添加必要的 frontmatter：

```mdx
---
title: 文档标题
description: 文档描述
---
```

## 了解更多

- [Fumadocs 文档](https://fumadocs.dev/docs/mdx)
- [Next.js 文档](https://nextjs.org/docs)
