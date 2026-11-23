import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { cleanHtml, postAuthor, postCategory, postImage, type WpPost } from './wordpress';

export type OfflineArticle = {
  id: number; date: string; link: string; title: string; content: string; excerpt: string;
  categories: number[]; categoryName: string; author: string; imageUri: string | null;
  imageAlt: string; downloadedAt: number;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;
const downloadsInProgress = new Map<number, Promise<OfflineArticle>>();
async function database() {
  if (!databasePromise) databasePromise = SQLite.openDatabaseAsync('newsline_offline.db');
  const db = await databasePromise;
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion > 1) throw new Error('Offline article storage was created by a newer app version. Update the app to use it.');
  await db.execAsync(`CREATE TABLE IF NOT EXISTS offline_articles (
    id INTEGER PRIMARY KEY NOT NULL, date TEXT NOT NULL, link TEXT NOT NULL,
    title TEXT NOT NULL, content TEXT NOT NULL, excerpt TEXT NOT NULL,
    categories TEXT NOT NULL, category_name TEXT NOT NULL, author TEXT NOT NULL,
    image_uri TEXT, image_alt TEXT NOT NULL, downloaded_at INTEGER NOT NULL
  );`);
  if (currentVersion < 1) await db.execAsync('PRAGMA user_version = 1;');
  return db;
}
const imageDirectory = `${FileSystem.documentDirectory}offline-article-images/`;

export async function listOfflineArticles(): Promise<OfflineArticle[]> {
  const db = await database();
  const rows = await db.getAllAsync<any>('SELECT * FROM offline_articles ORDER BY downloaded_at DESC');
  const good: OfflineArticle[] = [];
  for (const row of rows) {
    if (row.image_uri && !(await FileSystem.getInfoAsync(row.image_uri)).exists) {
      row.image_uri = null;
      await db.runAsync('UPDATE offline_articles SET image_uri = NULL WHERE id = ?', row.id);
    }
    if (typeof row.content === 'string' && row.content.trim()) good.push({
      id: row.id, date: row.date, link: row.link, title: row.title, content: row.content,
      excerpt: row.excerpt, categories: JSON.parse(row.categories), categoryName: row.category_name,
      author: row.author, imageUri: row.image_uri, imageAlt: row.image_alt, downloadedAt: row.downloaded_at,
    });
  }
  return good;
}

export async function getOfflineArticle(id: number): Promise<OfflineArticle | null> {
  return (await listOfflineArticles()).find((article) => article.id === id) ?? null;
}

async function performDownload(post: WpPost, onProgress?: (status: string) => void, dataSaver = false): Promise<OfflineArticle> {
  const db = await database();
  const existing = await getOfflineArticle(post.id);
  if (existing) return existing;
  const html = post.content?.rendered?.trim();
  if (!html || !cleanHtml(html)) throw new Error('This story has no article content to save.');
  let imageUri: string | null = null;
  const imageUrl = postImage(post, dataSaver);
  if (imageUrl && /^https:\/\//i.test(imageUrl)) {
    try {
      onProgress?.('Downloading image…');
      await FileSystem.makeDirectoryAsync(imageDirectory, { intermediates: true });
      const extension = /\.(jpe?g|png|webp)(?:[?#]|$)/i.exec(imageUrl)?.[1]?.toLowerCase() || 'jpg';
      const destination = `${imageDirectory}${post.id}.${extension}`;
      const result = await FileSystem.downloadAsync(imageUrl, destination);
      if (result.status >= 200 && result.status < 300 && (await FileSystem.getInfoAsync(result.uri)).exists) imageUri = result.uri;
      else await FileSystem.deleteAsync(destination, { idempotent: true });
    } catch { imageUri = null; }
  }
  const article: OfflineArticle = {
    id: post.id, date: post.date, link: post.link, title: cleanHtml(post.title.rendered),
    content: html, excerpt: post.excerpt?.rendered || '', categories: post.categories || [],
    categoryName: postCategory(post), author: postAuthor(post), imageUri,
    imageAlt: post._embedded?.['wp:featuredmedia']?.[0]?.alt_text || cleanHtml(post.title.rendered),
    downloadedAt: Date.now(),
  };
  onProgress?.('Saving article…');
  try { await db.runAsync(`INSERT OR REPLACE INTO offline_articles
    (id,date,link,title,content,excerpt,categories,category_name,author,image_uri,image_alt,downloaded_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, article.id, article.date, article.link, article.title,
    article.content, article.excerpt, JSON.stringify(article.categories), article.categoryName,
    article.author, article.imageUri, article.imageAlt, article.downloadedAt); }
  catch (error) { if (imageUri?.startsWith(imageDirectory)) await FileSystem.deleteAsync(imageUri, { idempotent: true }); throw error; }
  return article;
}

export function downloadArticle(post: WpPost, onProgress?: (status: string) => void, dataSaver = false): Promise<OfflineArticle> {
  const existing = downloadsInProgress.get(post.id);
  if (existing) return existing;
  const pending = performDownload(post, onProgress, dataSaver).finally(() => downloadsInProgress.delete(post.id));
  downloadsInProgress.set(post.id, pending);
  return pending;
}

export async function deleteOfflineArticle(id: number): Promise<void> {
  const db = await database();
  const article = await getOfflineArticle(id);
  if (article?.imageUri && article.imageUri.startsWith(imageDirectory)) {
    await FileSystem.deleteAsync(article.imageUri, { idempotent: true });
  }
  await db.runAsync('DELETE FROM offline_articles WHERE id = ?', id);
}

export async function clearOfflineArticles(): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM offline_articles');
  await FileSystem.deleteAsync(imageDirectory, { idempotent: true });
}

export async function offlineStorageBytes(): Promise<number> {
  try {
    const names = await FileSystem.readDirectoryAsync(imageDirectory);
    const sizes = await Promise.all(names.map(async (name) => {
      const info = await FileSystem.getInfoAsync(`${imageDirectory}${name}`);
      return info.exists && !info.isDirectory ? info.size : 0;
    }));
    return sizes.reduce((total, size) => total + size, 0);
  } catch { return 0; }
}
