---
title: Agent 工程文章
source_url: https://example.dev/agent
author: Author
content_type: 综合
created: 2026-06-17
fetched: 2026-06-17 00:00
tags:
  - 链接笔记
  - 综合
clickbait_index: 5
---

# Agent 工程文章

> 创建日期：2026-06-17
> 来源：https://example.dev/agent
> 作者：Author
> 抓取时间：2026-06-17 00:00
> 标签：#链接笔记 #综合
> 标题党指数：5/10

---

## 概述

这是一篇用于本地预览的 Markdown 文章。真实部署时，阅读站会从 OSS 读取 public-index.json，并根据文章 path 加载对应 Markdown。

## 要点

- 首页展示公开索引中的文章。
- 详情页根据 slug 加载正文。
- 使用 react-markdown 与 remark-gfm 渲染正文。

## 表格

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 文章列表 | 已完成 | 读取 public-index.json |
| 文章详情 | 已完成 | 根据 slug 加载 Markdown |
| GFM 渲染 | 已完成 | 支持表格、列表和代码块 |

## 代码

```ts
type PublicArticleEntry = {
  slug: string;
  title: string;
  path: string;
};
```

## 链接与图片

这是一个 [外部链接](https://example.dev/agent)，会在新窗口打开。

![示例图片](https://placehold.co/960x360/png?text=Guan+Reader)

---

## 知识连接

- [[链接笔记]]
- [[general]]
