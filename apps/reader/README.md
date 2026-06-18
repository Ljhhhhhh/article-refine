# Link Processing Reader

React reader for Markdown articles published by `lpa` to OSS.

Markdown rendering uses `react-markdown` with `remark-gfm`. External links open in a new tab, and link/image URLs are restricted to safe protocols.

## Development

```bash
pnpm reader:dev
```

Open:

```text
http://127.0.0.1:5173/
```

The local dev server uses fixtures from `apps/reader/public/` when no OSS env vars are set.

To backfill articles that already exist in OSS:

```bash
pnpm dev -- reader sync-index
```

This rebuilds `public-index.json` from existing Markdown under `<OSS_PREFIX>/文章摘要/`.

## Build

```bash
pnpm reader:build
```

Output:

```text
dist/reader
```

Static hosting must serve `index.html` for `/articles/*` routes so direct article refreshes work.

## Runtime Config

```bash
VITE_OSS_BASE_URL=https://bucket.example.com
VITE_OSS_INDEX_PATH=notes/public-index.json
```

`VITE_OSS_BASE_URL` defaults to the current site origin. `VITE_OSS_INDEX_PATH` defaults to `public-index.json`.

## Data Contract

The reader expects:

```json
{
  "version": 1,
  "generatedAt": "2026-06-17T00:00:00.000Z",
  "articles": [
    {
      "slug": "2026-06-17-agent-engineering",
      "title": "Agent 工程文章",
      "path": "articles/2026-06-17-agent-engineering.md",
      "contentType": "综合",
      "created": "2026-06-17",
      "updatedAt": "2026-06-17T00:00:00.000Z",
      "tags": ["链接笔记", "综合"],
      "author": "Author",
      "sourceUrl": "https://example.dev/agent",
      "summary": "文章介绍了 Agent 工程文章的核心内容。",
      "excerpt": "文章介绍了 Agent 工程文章的核心内容。",
      "readingTime": 2,
      "sourceHost": "example.dev"
    }
  ]
}
```

Article Markdown may include YAML frontmatter. Frontmatter `title`, `summary`, `author`, `content_type`, `created`, `tags`, and `source_url` override or enrich the index values where applicable.

## OSS Checklist

- `public-index.json` is publicly readable.
- Article Markdown paths in `articles[].path` are publicly readable.
- CORS allows `GET` from the reader domain.
- `public-index.json` is served as `application/json`.
- Markdown is served as a readable text content type.
- CDN cache for `public-index.json` is short or purged after publishing.
- Static hosting falls back from `/articles/*` to `index.html`.
