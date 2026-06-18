---
title: React 阅读器搜索设计
summary: 文章说明如何用公开索引字段实现快速搜索，并避免在列表页批量拉取 Markdown 正文。
source_url: https://reader.example.com/search
author: Reader Team
content_type: 技术深度
created: 2026-06-16
fetched: 2026-06-16 08:00
tags:
  - React
  - 搜索
  - 阅读器
clickbait_index: 3
---

# React 阅读器搜索设计

## 背景

阅读器首页需要在文章数量增长后保持快速筛选。列表页不应该批量下载每篇 Markdown 正文，否则首屏加载会变慢。

## 方案

- 搜索只使用 `public-index.json` 中的标题、摘要、标签、作者和来源域名。
- 摘要由处理链路生成，并随公开索引发布。
- 正文仍然只在用户打开文章时加载。

## 验收

搜索命中结果应立即更新，分类、标签和来源筛选可以组合使用。
