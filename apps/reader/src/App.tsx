import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import YAML from "yaml";
import "./styles.css";

type ContentType = "技术深度" | "观点思考" | "教程学习" | "资讯动态" | "综合";

type PublicArticleEntry = {
  slug: string;
  title: string;
  path: string;
  contentType: ContentType;
  created: string;
  updatedAt: string;
  tags: string[];
  author?: string;
  sourceUrl: string;
  summary?: string;
  excerpt?: string;
  readingTime?: number;
  sourceHost?: string;
};

type PublicArticleIndex = {
  version: 1;
  generatedAt: string;
  articles: PublicArticleEntry[];
};

type Route =
  | { name: "home" }
  | { name: "article"; slug: string }
  | { name: "not-found" };

type LoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "failed"; message: string };

type MarkdownDocument = {
  frontmatter: Record<string, unknown>;
  body: string;
};

type Heading = {
  id: string;
  depth: 2 | 3;
  title: string;
};

const contentTypes: Array<ContentType | "全部文章"> = [
  "全部文章",
  "技术深度",
  "观点思考",
  "教程学习",
  "资讯动态",
  "综合"
];

const ossBaseUrl = trimTrailingSlash(import.meta.env.VITE_OSS_BASE_URL ?? window.location.origin);
const indexPath = trimLeadingSlash(import.meta.env.VITE_OSS_INDEX_PATH ?? "public-index.json");

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/g, "");
}

function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/${normalizedPath}`;
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^(\/(?!\/)|\.{1,2}\/|#)/.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function articleSourceHost(article: PublicArticleEntry): string {
  return article.sourceHost ?? sourceHost(article.sourceUrl);
}

function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/g, "") || "/";
  if (path === "/") return { name: "home" };
  const articleMatch = path.match(/^\/articles\/(.+)$/);
  if (articleMatch?.[1]) {
    return { name: "article", slug: decodeURIComponent(articleMatch[1]) };
  }
  return { name: "not-found" };
}

function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function parseMarkdownDocument(markdown: string): MarkdownDocument {
  if (!markdown.startsWith("---\n")) return { frontmatter: {}, body: markdown };

  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: markdown };

  const rawFrontmatter = markdown.slice(4, end);
  const body = markdown.slice(end + 4).trimStart();
  try {
    const parsed = YAML.parse(rawFrontmatter);
    return {
      frontmatter: parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {},
      body
    };
  } catch {
    return { frontmatter: {}, body };
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(article: PublicArticleEntry, query: string): boolean {
  if (!query) return true;
  const fields = [
    article.title,
    article.summary ?? "",
    article.excerpt ?? "",
    article.contentType,
    article.author ?? "",
    article.sourceUrl,
    articleSourceHost(article),
    ...article.tags
  ];
  return fields.some((field) => normalizeSearch(field).includes(query));
}

function uniqueTags(articles: PublicArticleEntry[]): string[] {
  return Array.from(new Set(articles.flatMap((article) => article.tags))).sort((a, b) => a.localeCompare(b));
}

function uniqueSources(articles: PublicArticleEntry[]): string[] {
  return Array.from(new Set(articles.map(articleSourceHost).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function articleSummary(article: PublicArticleEntry): string | undefined {
  return article.summary?.trim() || article.excerpt?.trim() || undefined;
}

function articleMeta(article: PublicArticleEntry): string {
  return [
    articleSourceHost(article),
    article.contentType,
    formatDate(article.updatedAt || article.created),
    article.readingTime ? `${article.readingTime} 分钟` : undefined
  ].filter(Boolean).join(" · ");
}

function stripMarkdownInline(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~#]/g, "")
    .trim();
}

function headingId(title: string, ordinal: number): string {
  const normalized = title
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${normalized || "section"}-${ordinal}`;
}

function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const pattern = /^(#{2,3})\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    const title = stripMarkdownInline(match[2] ?? "");
    if (!title) continue;
    headings.push({
      id: headingId(title, headings.length + 1),
      depth: match[1]?.length === 3 ? 3 : 2,
      title
    });
  }

  return headings;
}

function markdownNodeText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if ("value" in value && typeof value.value === "string") return value.value;
  if ("children" in value && Array.isArray(value.children)) {
    return value.children.map(markdownNodeText).join("");
  }
  return "";
}

function visitMarkdownTree(value: unknown, visitor: (node: Record<string, unknown>) => void): void {
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  visitor(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) visitMarkdownTree(child, visitor);
  }
}

function remarkHeadingIds() {
  return (tree: unknown) => {
    let ordinal = 0;
    visitMarkdownTree(tree, (node) => {
      if (node.type !== "heading" || (node.depth !== 2 && node.depth !== 3)) return;
      ordinal += 1;
      const title = stripMarkdownInline(markdownNodeText(node));
      const data = node.data && typeof node.data === "object"
        ? node.data as Record<string, unknown>
        : {};
      node.data = {
        ...data,
        hProperties: {
          ...(data.hProperties && typeof data.hProperties === "object" ? data.hProperties : {}),
          id: headingId(title, ordinal)
        }
      };
    });
  };
}

function App() {
  const [route, setRoute] = useState<Route>(() => currentRoute());
  const [indexState, setIndexState] = useState<LoadState<PublicArticleIndex>>({ status: "loading" });

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    fetch(joinUrl(ossBaseUrl, indexPath))
      .then((response) => {
        if (!response.ok) throw new Error(`Index request failed: ${response.status}`);
        return response.json() as Promise<PublicArticleIndex>;
      })
      .then((index) => setIndexState({ status: "loaded", data: index }))
      .catch((error) => {
        setIndexState({
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to load article index."
        });
      });
  }, []);

  if (indexState.status === "loading") {
    return <Shell><StatusMessage title="正在加载文章" /></Shell>;
  }
  if (indexState.status === "failed") {
    return <Shell><StatusMessage title="无法加载文章索引" detail={indexState.message} /></Shell>;
  }
  if (route.name === "not-found") {
    return <Shell><StatusMessage title="未找到页面" detail="请返回文章工作台重新选择内容。" /></Shell>;
  }

  return <Shell><ReaderWorkspace articles={indexState.data.articles} route={route} /></Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => navigate("/")}>
          <span className="brand-mark">L</span>
          <span>LPA Reader</span>
        </button>
        <span className="topbar-meta">Markdown knowledge library</span>
      </header>
      <main>{children}</main>
    </div>
  );
}

function ReaderWorkspace({ articles, route }: { articles: PublicArticleEntry[]; route: Route }) {
  const [selectedType, setSelectedType] = useState<ContentType | "全部文章">("全部文章");
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [selectedSource, setSelectedSource] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const tags = useMemo(() => uniqueTags(articles), [articles]);
  const sources = useMemo(() => uniqueSources(articles), [articles]);
  const query = normalizeSearch(search);
  const filteredArticles = useMemo(() => articles.filter((article) => {
    const typeMatches = selectedType === "全部文章" || article.contentType === selectedType;
    const tagMatches = !selectedTag || article.tags.includes(selectedTag);
    const sourceMatches = !selectedSource || articleSourceHost(article) === selectedSource;
    return typeMatches && tagMatches && sourceMatches && matchesSearch(article, query);
  }), [articles, query, selectedSource, selectedTag, selectedType]);

  const routedArticle = route.name === "article"
    ? articles.find((article) => article.slug === route.slug)
    : undefined;
  const selectedArticle = routedArticle ?? filteredArticles[0];

  if (articles.length === 0) {
    return (
      <div className="workspace workspace-empty">
        <StatusMessage title="暂无文章" detail="public-index.json 中还没有可展示的文章。" />
      </div>
    );
  }

  return (
    <div className={route.name === "article" ? "workspace route-article" : "workspace route-home"}>
      <ReaderSidebar
        articles={articles}
        search={search}
        selectedSource={selectedSource}
        selectedTag={selectedTag}
        selectedType={selectedType}
        sources={sources}
        tags={tags}
        onSearchChange={setSearch}
        onSelectSource={setSelectedSource}
        onSelectTag={setSelectedTag}
        onSelectType={(type) => {
          setSelectedType(type);
          navigate("/");
        }}
      />
      <MobileListTools
        articles={articles}
        filteredCount={filteredArticles.length}
        search={search}
        selectedSource={selectedSource}
        selectedTag={selectedTag}
        selectedType={selectedType}
        onOpenFilters={() => setIsFilterOpen(true)}
        onSearchChange={setSearch}
      />
      <ArticleInbox articles={filteredArticles} selectedSlug={selectedArticle?.slug} />
      <ArticlePane article={selectedArticle} route={route} />
      <MobileFilterSheet
        articles={articles}
        isOpen={isFilterOpen}
        selectedSource={selectedSource}
        selectedTag={selectedTag}
        selectedType={selectedType}
        sources={sources}
        tags={tags}
        onClose={() => setIsFilterOpen(false)}
        onClear={() => {
          setSelectedType("全部文章");
          setSelectedTag(undefined);
          setSelectedSource(undefined);
        }}
        onSelectSource={setSelectedSource}
        onSelectTag={setSelectedTag}
        onSelectType={(type) => {
          setSelectedType(type);
          navigate("/");
        }}
      />
    </div>
  );
}

function MobileListTools({
  articles,
  filteredCount,
  search,
  selectedSource,
  selectedTag,
  selectedType,
  onOpenFilters,
  onSearchChange
}: {
  articles: PublicArticleEntry[];
  filteredCount: number;
  search: string;
  selectedSource?: string;
  selectedTag?: string;
  selectedType: ContentType | "全部文章";
  onOpenFilters: () => void;
  onSearchChange: (value: string) => void;
}) {
  const activeFilters = [
    selectedType !== "全部文章" ? selectedType : undefined,
    selectedTag,
    selectedSource
  ].filter(Boolean);

  return (
    <section className="mobile-list-tools" aria-label="移动端文章筛选">
      <div className="mobile-list-bar">
        <div>
          <h1>全部文章</h1>
          <p>{filteredCount} / {articles.length} 篇</p>
        </div>
        <button className="mobile-tool-button" type="button" onClick={onOpenFilters}>
          筛选
        </button>
      </div>
      <label className="mobile-search">
        <span>搜索</span>
        <input
          type="search"
          value={search}
          placeholder="搜索标题、摘要、标签、来源"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </label>
      {activeFilters.length > 0 ? (
        <div className="active-filter-row">
          {activeFilters.map((filter) => <span className="active-filter" key={filter}>{filter}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function MobileFilterSheet({
  articles,
  isOpen,
  selectedSource,
  selectedTag,
  selectedType,
  sources,
  tags,
  onClose,
  onClear,
  onSelectSource,
  onSelectTag,
  onSelectType
}: {
  articles: PublicArticleEntry[];
  isOpen: boolean;
  selectedSource?: string;
  selectedTag?: string;
  selectedType: ContentType | "全部文章";
  sources: string[];
  tags: string[];
  onClose: () => void;
  onClear: () => void;
  onSelectSource: (source: string | undefined) => void;
  onSelectTag: (tag: string | undefined) => void;
  onSelectType: (type: ContentType | "全部文章") => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="mobile-sheet-layer" role="presentation">
      <button className="mobile-sheet-backdrop" type="button" aria-label="关闭筛选" onClick={onClose} />
      <section className="mobile-sheet" aria-label="筛选">
        <header className="mobile-sheet-header">
          <h2>筛选</h2>
          <button type="button" onClick={onClose}>完成</button>
        </header>
        <div className="mobile-sheet-content">
          <section className="mobile-sheet-section" aria-label="分类">
            <h3>分类</h3>
            <div className="mobile-choice-grid">
              {contentTypes.map((type) => {
                const count = type === "全部文章"
                  ? articles.length
                  : articles.filter((article) => article.contentType === type).length;
                return (
                  <button
                    className={type === selectedType ? "mobile-choice active" : "mobile-choice"}
                    key={type}
                    type="button"
                    onClick={() => onSelectType(type)}
                  >
                    <span>{type}</span>
                    <span>{count}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="mobile-sheet-section" aria-label="标签">
            <h3>标签</h3>
            <div className="mobile-chip-row">
              <button
                className={!selectedTag ? "mobile-chip active" : "mobile-chip"}
                type="button"
                onClick={() => onSelectTag(undefined)}
              >
                全部标签
              </button>
              {tags.map((tag) => (
                <button
                  className={tag === selectedTag ? "mobile-chip active" : "mobile-chip"}
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>
          {sources.length > 0 ? (
            <section className="mobile-sheet-section" aria-label="来源">
              <h3>来源</h3>
              <div className="mobile-chip-row">
                <button
                  className={!selectedSource ? "mobile-chip active" : "mobile-chip"}
                  type="button"
                  onClick={() => onSelectSource(undefined)}
                >
                  全部来源
                </button>
                {sources.slice(0, 12).map((source) => (
                  <button
                    className={source === selectedSource ? "mobile-chip active" : "mobile-chip"}
                    key={source}
                    type="button"
                    onClick={() => onSelectSource(source)}
                  >
                    {source}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <footer className="mobile-sheet-actions">
          <button className="mobile-clear-button" type="button" onClick={onClear}>清除筛选</button>
          <button className="mobile-done-button" type="button" onClick={onClose}>完成</button>
        </footer>
      </section>
    </div>
  );
}

function ReaderSidebar({
  articles,
  search,
  selectedTag,
  selectedSource,
  selectedType,
  sources,
  tags,
  onSearchChange,
  onSelectSource,
  onSelectTag,
  onSelectType
}: {
  articles: PublicArticleEntry[];
  search: string;
  selectedSource?: string;
  selectedTag?: string;
  selectedType: ContentType | "全部文章";
  sources: string[];
  tags: string[];
  onSearchChange: (value: string) => void;
  onSelectSource: (source: string | undefined) => void;
  onSelectTag: (tag: string | undefined) => void;
  onSelectType: (type: ContentType | "全部文章") => void;
}) {
  return (
    <aside className="sidebar" aria-label="文章导航">
      <label className="search-box">
        <span>搜索</span>
        <input
          type="search"
          value={search}
          placeholder="标题、摘要、标签、来源"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </label>

      <nav className="nav-section" aria-label="分类">
        <h2>视图</h2>
        {contentTypes.map((type) => {
          const count = type === "全部文章"
            ? articles.length
            : articles.filter((article) => article.contentType === type).length;
          return (
            <button
              className={type === selectedType ? "nav-item active" : "nav-item"}
              key={type}
              type="button"
              onClick={() => onSelectType(type)}
            >
              <span>{type}</span>
              <span>{count}</span>
            </button>
          );
        })}
      </nav>

      <section className="nav-section tag-filter" aria-label="标签">
        <h2>标签</h2>
        <button
          className={!selectedTag ? "nav-item active" : "nav-item"}
          type="button"
          onClick={() => onSelectTag(undefined)}
        >
          <span>全部标签</span>
          <span>{tags.length}</span>
        </button>
        <div className="tag-filter-list">
          {tags.map((tag) => (
            <button
              className={tag === selectedTag ? "tag-filter-button active" : "tag-filter-button"}
              key={tag}
              type="button"
              onClick={() => onSelectTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {sources.length > 0 ? (
        <section className="nav-section source-filter" aria-label="来源">
          <h2>来源</h2>
          <button
            className={!selectedSource ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => onSelectSource(undefined)}
          >
            <span>全部来源</span>
            <span>{sources.length}</span>
          </button>
          <div className="source-filter-list">
            {sources.slice(0, 12).map((source) => (
              <button
                className={source === selectedSource ? "source-filter-button active" : "source-filter-button"}
                key={source}
                type="button"
                onClick={() => onSelectSource(source)}
              >
                {source}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}

function ArticleInbox({ articles, selectedSlug }: { articles: PublicArticleEntry[]; selectedSlug?: string }) {
  return (
    <section className="inbox" aria-label="文章列表">
      <div className="inbox-header">
        <div>
          <h1>全部文章</h1>
          <p>{articles.length} 篇文章</p>
        </div>
      </div>
      {articles.length === 0 ? (
        <StatusMessage title="没有匹配文章" detail="调整搜索、分类、标签或来源后再试。" />
      ) : (
        <div className="article-list">
          {articles.map((article) => (
            <article className={article.slug === selectedSlug ? "article-row selected" : "article-row"} key={article.slug}>
              <button
                className="article-link"
                type="button"
                onClick={() => navigate(`/articles/${encodeURIComponent(article.slug)}`)}
              >
                <span className="article-title">{article.title}</span>
                <span className="article-meta-line">{articleMeta(article)}</span>
                {articleSummary(article) ? (
                  <span className="article-summary">{articleSummary(article)}</span>
                ) : null}
                {article.tags.length > 0 ? (
                  <span className="tag-row compact">
                    {article.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                  </span>
                ) : null}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ArticlePane({ article, route }: { article?: PublicArticleEntry; route: Route }) {
  if (route.name === "article" && !article) {
    return (
      <section className="reader-panel">
        <StatusMessage title="未找到文章" detail="请返回列表重新选择一篇文章。" />
      </section>
    );
  }
  if (!article) {
    return (
      <section className="reader-panel">
        <StatusMessage title="没有可阅读文章" detail="调整筛选条件后再试。" />
      </section>
    );
  }

  return <ArticlePage article={article} />;
}

function ArticlePage({ article }: { article: PublicArticleEntry }) {
  const [markdownState, setMarkdownState] = useState<LoadState<string>>({ status: "loading" });
  const [isTocOpen, setIsTocOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setMarkdownState({ status: "loading" });
    fetch(joinUrl(ossBaseUrl, article.path), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Article request failed: ${response.status}`);
        return response.text();
      })
      .then((markdown) => setMarkdownState({ status: "loaded", data: markdown }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMarkdownState({
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to load article."
        });
      });

    return () => controller.abort();
  }, [article.path]);

  const document = useMemo(
    () => markdownState.status === "loaded" ? parseMarkdownDocument(markdownState.data) : undefined,
    [markdownState]
  );
  const headings = useMemo(() => document ? extractHeadings(document.body) : [], [document]);

  const title = stringValue(document?.frontmatter.title) ?? article.title;
  const author = stringValue(document?.frontmatter.author) ?? article.author;
  const contentType = stringValue(document?.frontmatter.content_type) ?? article.contentType;
  const updatedAt = stringValue(document?.frontmatter.created) ?? article.updatedAt ?? article.created;
  const tags = stringArrayValue(document?.frontmatter.tags).length > 0
    ? stringArrayValue(document?.frontmatter.tags)
    : article.tags;
  const sourceUrl = stringValue(document?.frontmatter.source_url) ?? article.sourceUrl;
  const safeSourceUrl = safeUrl(sourceUrl);

  return (
    <article className="reader-panel">
      <MobileReaderToolbar
        hasToc={headings.length > 0}
        title={title}
        onOpenToc={() => setIsTocOpen(true)}
      />
      <div className="reader-scroll">
        <div className="reader-layout">
          <div className="reader-article">
            <button className="back-button" type="button" onClick={() => navigate("/")}>返回列表</button>
            <header className="reader-header">
              <div className="reader-kicker">{contentType}</div>
              <h1>{title}</h1>
              <div className="reader-meta">
                {author ? <span>{author}</span> : null}
                <span>{formatDate(updatedAt)}</span>
                <span>{article.sourceHost ?? sourceHost(sourceUrl)}</span>
              </div>
              {tags.length > 0 ? (
                <div className="tag-row">
                  {tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                </div>
              ) : null}
            </header>
            {markdownState.status === "loading" ? <StatusMessage title="正在加载正文" /> : null}
            {markdownState.status === "failed" ? (
              <StatusMessage title="无法加载正文" detail={markdownState.message} />
            ) : null}
            {document ? <MarkdownBody markdown={document.body} /> : null}
            {safeSourceUrl ? (
              <a className="source-link" href={safeSourceUrl} target="_blank" rel="noreferrer">
                查看原文
              </a>
            ) : null}
          </div>
          <TableOfContents headings={headings} />
        </div>
      </div>
      <MobileTocSheet
        headings={headings}
        isOpen={isTocOpen}
        onClose={() => setIsTocOpen(false)}
      />
    </article>
  );
}

function MobileReaderToolbar({
  hasToc,
  title,
  onOpenToc
}: {
  hasToc: boolean;
  title: string;
  onOpenToc: () => void;
}) {
  return (
    <div className="mobile-reader-toolbar">
      <button type="button" onClick={() => navigate("/")}>返回</button>
      <span>{title}</span>
      {hasToc ? (
        <button type="button" onClick={onOpenToc}>目录</button>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

function MobileTocSheet({
  headings,
  isOpen,
  onClose
}: {
  headings: Heading[];
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen || headings.length === 0) return null;

  return (
    <div className="mobile-sheet-layer" role="presentation">
      <button className="mobile-sheet-backdrop" type="button" aria-label="关闭目录" onClick={onClose} />
      <section className="mobile-sheet mobile-toc-sheet" aria-label="目录">
        <header className="mobile-sheet-header">
          <h2>目录</h2>
          <button type="button" onClick={onClose}>完成</button>
        </header>
        <nav className="mobile-toc-list">
          {headings.map((heading) => (
            <a
              className={`mobile-toc-link depth-${heading.depth}`}
              href={`#${heading.id}`}
              key={heading.id}
              onClick={onClose}
            >
              {heading.title}
            </a>
          ))}
        </nav>
      </section>
    </div>
  );
}

function TableOfContents({ headings }: { headings: Heading[] }) {
  if (headings.length === 0) return null;

  return (
    <aside className="toc" aria-label="目录">
      <h2>目录</h2>
      {headings.map((heading) => (
        <a className={`toc-link depth-${heading.depth}`} href={`#${heading.id}`} key={heading.id}>
          {heading.title}
        </a>
      ))}
    </aside>
  );
}

function MarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHeadingIds]}
        components={{
          a({ children, href }) {
            const safeHref = safeUrl(href);
            if (!safeHref) return <span>{children}</span>;
            const external = /^https?:\/\//.test(safeHref);
            return (
              <a href={safeHref} rel={external ? "noreferrer" : undefined} target={external ? "_blank" : undefined}>
                {children}
              </a>
            );
          },
          img({ alt, src }) {
            const safeSrc = safeUrl(src);
            if (!safeSrc) return null;
            return <img alt={alt ?? ""} loading="lazy" src={safeSrc} />;
          },
          pre({ children }) {
            return <pre className="code-block">{children}</pre>;
          },
          table({ children }) {
            return <div className="table-scroll"><table>{children}</table></div>;
          }
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function StatusMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <section className="status-panel">
      <h1>{title}</h1>
      {detail ? <p>{detail}</p> : null}
    </section>
  );
}

export default App;
