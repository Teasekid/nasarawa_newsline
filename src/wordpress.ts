export const WP_BASE = 'https://nasarawanewsline.com.ng/wp-json/wp/v2';

type WpMediaSize = { source_url?: string };
type WpEmbeddedMedia = {
  source_url?: string;
  alt_text?: string;
  media_details?: { sizes?: Record<string, WpMediaSize> };
};
type WpEmbeddedTerm = { id: number; name: string; slug: string };

export type WpPost = {
  id: number;
  date: string;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  categories: number[];
  _embedded?: {
    'wp:featuredmedia'?: WpEmbeddedMedia[];
    'wp:term'?: WpEmbeddedTerm[][];
    author?: Array<{ name: string }>;
  };
};

export type WpCategory = { id: number; name: string; count: number; slug: string };

export type PostsPage = { posts: WpPost[]; totalPages: number };

type FetchPostOptions = {
  category?: number;
  categories?: number[];
  search?: string;
  page?: number;
  perPage?: number;
  include?: number[];
};

const REQUEST_TIMEOUT_MS = 15_000;

async function requestJson<T>(url: string): Promise<{ data: T; totalPages: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`WordPress request failed (${response.status} ${response.statusText}).`);
    }
    return {
      data: (await response.json()) as T,
      totalPages: Number(response.headers.get('X-WP-TotalPages')) || 1,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The news request timed out. Please check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPostsPage(opts: FetchPostOptions = {}): Promise<PostsPage> {
  const params = new URLSearchParams({
    per_page: String(opts.perPage ?? 20),
    page: String(opts.page ?? 1),
    _embed: '1',
  });
  if (opts.category) params.set('categories', String(opts.category));
  else if (opts.categories?.length) params.set('categories', opts.categories.join(','));
  if (opts.search?.trim()) params.set('search', opts.search.trim());
  if (opts.include?.length) params.set('include', opts.include.join(','));
  const result = await requestJson<WpPost[]>(`${WP_BASE}/posts?${params.toString()}`);
  return { posts: result.data, totalPages: result.totalPages };
}

export async function fetchPosts(opts: FetchPostOptions = {}): Promise<WpPost[]> {
  const result = await fetchPostsPage(opts);
  return result.posts;
}

export async function fetchCategories(): Promise<WpCategory[]> {
  const result = await requestJson<WpCategory[]>(`${WP_BASE}/categories?per_page=100&hide_empty=true`);
  return result.data;
}

export function postImage(post: WpPost, dataSaver = false): string | undefined {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  if (dataSaver) {
    return (
      media?.media_details?.sizes?.medium?.source_url ||
      media?.media_details?.sizes?.thumbnail?.source_url ||
      media?.source_url
    );
  }
  return (
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.medium_large?.source_url ||
    media?.media_details?.sizes?.medium?.source_url ||
    media?.source_url
  );
}

export function postImageAlt(post: WpPost): string {
  return post._embedded?.['wp:featuredmedia']?.[0]?.alt_text || decodeHtmlEntities(post.title.rendered);
}

export function postCategory(post: WpPost): string {
  return post._embedded?.['wp:term']?.[0]?.[0]?.name || 'News';
}

export function postAuthor(post: WpPost): string {
  return post._embedded?.author?.[0]?.name || 'Nasarawa Newsline';
}

export function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    bull: '•',
    copy: '©',
    gt: '>',
    hellip: '…',
    ldquo: '“',
    lsquo: '‘',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    rdquo: '”',
    reg: '®',
    rsquo: '’',
    trade: '™',
    lt: '<',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1]?.toLowerCase() === 'x';
      const parsed = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return entity;
      }
    }
    return namedEntities[code.toLowerCase()] ?? entity;
  });
}

export function cleanHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(?:p|div|h[1-6]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

export function sanitizeArticleHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form|input|button)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:script|style|iframe|object|embed|form|input|button)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s+(href|src)\s*=\s*(["'])\s*(?:javascript|data):[\s\S]*?\2/gi,
      '',
    );
}
