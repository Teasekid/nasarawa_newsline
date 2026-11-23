import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Alert,
  Easing,
  FlatList,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import RenderHTML from 'react-native-render-html';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import appConfig from './app.json';
import SettingsScreen from './src/SettingsScreen';
import { SettingsProvider, useSettings } from './src/settings';
import OfflineReadingScreen from './src/OfflineReadingScreen';
import { clearOfflineArticles, deleteOfflineArticle, downloadArticle, listOfflineArticles, offlineStorageBytes, getOfflineArticle, type OfflineArticle } from './src/offline';
import { notificationArticleId, pushDeliveryConfigured, registerForPush, syncNotificationPreferences } from './src/push';
import * as Notifications from 'expo-notifications';
import {
  cleanHtml,
  fetchCategories,
  fetchPostsPage,
  postAuthor,
  postCategory,
  postImage,
  postImageAlt,
  sanitizeArticleHtml,
  type WpCategory,
  type WpPost,
} from './src/wordpress';

const RED = '#B82025';
const INK = '#171717';
const MUTED = '#777777';
const BG = '#F5F5F5';
type Tab = 'Home' | 'News' | 'Live' | 'Videos' | 'Offline';
const TABS: Array<{ name: Tab; icon: React.ComponentProps<typeof Feather>['name'] }> = [
  { name: 'Home', icon: 'home' },
  { name: 'News', icon: 'file-text' },
  { name: 'Live', icon: 'radio' },
  { name: 'Videos', icon: 'video' },
  { name: 'Offline', icon: 'download' },
];

function timeAgo(dateString: string): string {
  const timestamp = new Date(dateString).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return new Date(dateString).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Date unavailable';
}

function offlineArticleToPost(article: OfflineArticle): WpPost {
  return { id: article.id, date: article.date, link: article.link,
    title: { rendered: article.title }, excerpt: { rendered: article.excerpt },
    content: { rendered: article.content }, categories: article.categories,
    _embedded: { author: [{ name: article.author }], 'wp:term': [[{ id: article.categories[0] || 0, name: article.categoryName, slug: '' }]] } };
}

function Header({ onSearch, onSettings, onDownloads }: { onSearch: () => void; onSettings: () => void; onDownloads: () => void }) {
  const { colors } = useSettings();
  return (
    <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.divider }]}>
      <View style={styles.brandMark}>
        <Text style={styles.brandN}>N</Text>
      </View>
      <View style={styles.brandCopy}>
        <Text numberOfLines={1} style={[styles.brandTitle, { color: colors.text }]}>NASARAWA</Text>
        <Text numberOfLines={1} style={styles.brandSub}>NEWSLINE · NEWS FOR ALL</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable accessibilityLabel="Search news" accessibilityRole="button" hitSlop={5} onPress={onSearch} style={[styles.headerAction, { backgroundColor: colors.chip }]}>
          <Feather color={colors.text} name="search" size={19} />
        </Pressable>
        <Pressable accessibilityLabel="Offline reading downloads" accessibilityRole="button" hitSlop={5} onPress={onDownloads} style={[styles.headerAction, { backgroundColor: colors.chip }]}>
          <Feather color={colors.text} name="download" size={19} />
        </Pressable>
        <Pressable accessibilityLabel="Settings" accessibilityRole="button" hitSlop={5} onPress={onSettings} style={[styles.headerAction, { backgroundColor: colors.chip }]}>
          <Feather color={colors.text} name="settings" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

function BreakingNewsTicker({ posts, loading, onOpen }: { posts: WpPost[]; loading?: boolean; onOpen: (post: WpPost) => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [groupWidth, setGroupWidth] = useState(0);
  const visiblePosts = posts.slice(0, 5);
  const groupKey = visiblePosts.map((post) => post.id).join(',');

  useEffect(() => {
    if (!groupWidth || !visiblePosts.length) return;
    translateX.setValue(0);
    const loop = Animated.loop(Animated.timing(translateX, {
      toValue: -groupWidth,
      duration: Math.max(12000, groupWidth * 36),
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    loop.start();
    return () => loop.stop();
  }, [groupWidth, groupKey, translateX]);

  const headlines = (duplicate: number) => (
    <View
      key={duplicate}
      accessibilityElementsHidden={duplicate > 0}
      importantForAccessibility={duplicate > 0 ? 'no-hide-descendants' : 'auto'}
      onLayout={duplicate === 0 ? (event) => setGroupWidth(event.nativeEvent.layout.width) : undefined}
      style={styles.breakingTickerGroup}
    >
      {visiblePosts.map((post, index) => (
        <React.Fragment key={`${duplicate}-${post.id}`}>
          <Pressable accessibilityRole="button" onPress={() => onOpen(post)}>
            <Text numberOfLines={1} style={styles.breakingHeadline}>{cleanHtml(post.title.rendered)}</Text>
          </Pressable>
          {index < visiblePosts.length - 1 ? <Text style={styles.breakingTickerSeparator}>  •  </Text> : null}
        </React.Fragment>
      ))}
      <Text style={styles.breakingTickerSeparator}>     •     </Text>
    </View>
  );

  return (
    <View style={styles.breakingTicker}>
      <View style={styles.breakingLabel}>
        <View style={styles.breakingDot} />
        <Text style={styles.breakingLabelText}>BREAKING</Text>
      </View>
      <View style={styles.breakingTickerViewport}>
        {visiblePosts.length ? (
          <Animated.View style={[styles.breakingTickerTrack, { transform: [{ translateX }] }]}>
            {[0, 1, 2].map((index) => headlines(index))}
          </Animated.View>
        ) : (
          <Text numberOfLines={1} style={styles.breakingHeadline}>
            {loading ? 'Loading headlines…' : 'No breaking headlines right now'}
          </Text>
        )}
      </View>
    </View>
  );
}

function SectionHeading({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useSettings();
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CategoryChips({
  categories,
  selectedId,
  onSelect,
  includeAll = false,
}: {
  categories: WpCategory[];
  selectedId?: number;
  onSelect: (category?: WpCategory) => void;
  includeAll?: boolean;
}) {
  const { colors } = useSettings();
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.chipRow}
      decelerationRate="fast"
      showsHorizontalScrollIndicator={false}
    >
      {includeAll ? (
        <Pressable
          onPress={() => onSelect(undefined)}
          style={[
            styles.categoryChip,
            { backgroundColor: colors.surface, borderColor: colors.divider },
            !selectedId && styles.categoryChipActive,
          ]}
        >
          <Text style={[styles.categoryChipText, { color: colors.text }, !selectedId && styles.categoryChipTextActive]}>
            All
          </Text>
        </Pressable>
      ) : null}
      {categories.map((category) => (
        <Pressable
          key={category.id}
          onPress={() => onSelect(category)}
          style={[
            styles.categoryChip,
            { backgroundColor: colors.surface, borderColor: colors.divider },
            selectedId === category.id && styles.categoryChipActive,
          ]}
        >
          <Text
            style={[
              styles.categoryChipText,
              { color: colors.text },
              selectedId === category.id && styles.categoryChipTextActive,
            ]}
          >
            {cleanHtml(category.name)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function StoryCard({
  post,
  onPress,
  compact = false,
  downloaded,
  onDownload,
}: {
  post: WpPost;
  onPress: () => void;
  compact?: boolean;
  downloaded: boolean;
  onDownload: () => void;
}) {
  const { settings, colors } = useSettings();
  const image = postImage(post, settings.dataSaver);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        compact ? styles.storyCard : styles.featuredCard,
        { backgroundColor: colors.surface },
      ]}
    >
      {image ? (
        <Image
          accessibilityLabel={postImageAlt(post)}
          resizeMode="cover"
          source={{ uri: image }}
          style={compact ? styles.storyImage : styles.featuredImage}
        />
      ) : (
        <View style={[compact ? styles.storyImage : styles.featuredImage, styles.imageFallback]}>
          <Feather color="#C9C9C9" name="image" size={28} />
          <Text style={styles.imageFallbackText}>Nasarawa Newsline</Text>
        </View>
      )}
      <View style={compact ? styles.storyCopy : styles.featuredCopy}>
        <View style={styles.storyMetaRow}>
          <Text numberOfLines={1} style={styles.categoryLabel}>
            {cleanHtml(postCategory(post)).toUpperCase()}
          </Text>
      <Pressable accessibilityLabel={downloaded ? 'Remove story from offline reading' : 'Save story for offline reading'} accessibilityRole="button" hitSlop={10} onPress={(event) => { event.stopPropagation(); onDownload(); }} style={styles.cardDownload}>
            <Feather color={downloaded ? RED : colors.muted} name={downloaded ? 'check-circle' : 'download'} size={17} />
          </Pressable>
        </View>
        <Text style={[compact ? styles.storyTitle : styles.featuredTitle, { color: colors.text }]}>
          {cleanHtml(post.title.rendered)}
        </Text>
        {!compact && post.excerpt?.rendered ? (
          <Text numberOfLines={2} style={[styles.featuredExcerpt, { color: colors.muted }]}>
            {cleanHtml(post.excerpt.rendered)}
          </Text>
        ) : null}
        <Text style={[styles.storyDate, { color: colors.muted }]}>{timeAgo(post.date)}</Text>
      </View>
    </Pressable>
  );
}

function LoadingSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <View style={featured ? styles.skeletonFeatured : styles.skeletonStory}>
      <View style={featured ? styles.skeletonHero : styles.skeletonThumb} />
      <View style={styles.skeletonCopy}>
        <View style={styles.skeletonLabel} />
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, styles.skeletonShortLine]} />
      </View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  message,
  action,
  onAction,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useSettings();
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather color={RED} name={icon} size={25} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyMessage, { color: colors.muted }]}>{message}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ArticleReader({
  post,
  onClose,
  imageOverride,
  downloaded,
  downloadStatus,
  onDownload,
  onRemoveDownload,
  offline,
}: {
  post: WpPost;
  onClose: () => void;
  imageOverride?: string | null;
  downloaded: boolean;
  downloadStatus: string;
  onDownload: () => void;
  onRemoveDownload: () => void;
  offline: boolean;
}) {
  const { width } = useWindowDimensions();
  const { settings, colors } = useSettings();
  const fontScale = settings.textSize === 'small' ? 0.88 : settings.textSize === 'large' ? 1.18 : 1;
  const image = imageOverride === undefined ? postImage(post, settings.dataSaver) : imageOverride || undefined;
  const articleText = cleanHtml(post.content.rendered);
  const readMinutes = Math.max(1, Math.ceil(articleText.split(/\s+/).filter(Boolean).length / 200));
  const shareArticle = async () => {
    try {
      await Share.share({ message: `${cleanHtml(post.title.rendered)}\n${post.link}` });
    } catch {
      Alert.alert('Unable to share', 'Please try sharing this story again.');
    }
  };
  const openLink = (_event: unknown, href: string) => {
    if (offline || !/^https?:\/\//i.test(href)) return;
    Linking.openURL(href).catch(() => {
      Alert.alert('Unable to open link', 'Please try again later.');
    });
  };

  return (
    <View style={[styles.readerOverlay, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['bottom']} style={[styles.readerSafe, { backgroundColor: colors.background }]}>
        <View style={[styles.readerToolbar, { borderBottomColor: colors.divider }]}>
          <Pressable accessibilityLabel="Close article" onPress={onClose} style={styles.readerTool}>
            <Feather color={colors.text} name="arrow-left" size={21} />
          </Pressable>
          <View style={styles.readerToolbarActions}>
            <Pressable accessibilityLabel="Share article" onPress={shareArticle} style={styles.readerTool}>
              <Feather color={colors.text} name="share-2" size={19} />
            </Pressable>
            <Pressable accessibilityLabel={downloaded ? 'Remove saved offline article' : 'Save article for offline reading'} onPress={downloaded ? onRemoveDownload : onDownload} style={styles.readerTool}>
              <Feather color={downloaded ? RED : colors.text} name={downloaded ? 'check-circle' : 'download'} size={19} />
            </Pressable>
          </View>
        </View>
        {downloadStatus ? <Text accessibilityLiveRegion="polite" style={[styles.storyDate,{textAlign:'center',padding:7}]}>{downloadStatus}</Text> : null}
        <ScrollView contentContainerStyle={styles.readerContent}>
          {image ? (
            <Image
              accessibilityLabel={postImageAlt(post)}
              resizeMode="cover"
              source={{ uri: image }}
              style={styles.readerHero}
            />
          ) : (
            <View style={[styles.readerHero, styles.imageFallback]}>
              <Feather color="#C9C9C9" name="image" size={30} />
            </View>
          )}
          <Text style={styles.categoryLabel}>{cleanHtml(postCategory(post)).toUpperCase()}</Text>
          <Text style={[styles.readerTitle, { color: colors.text, fontSize: 27 * fontScale, lineHeight: 35 * fontScale }]}>
            {cleanHtml(post.title.rendered)}
          </Text>
          <Text style={[styles.readerByline, { color: colors.muted }]}>
            By {cleanHtml(postAuthor(post))} · {formatDate(post.date)}
          </Text>
          <View style={styles.readTime}>
            <Feather color={MUTED} name="clock" size={13} />
            <Text style={[styles.readTimeText, { color: colors.muted }]}>{readMinutes} min read</Text>
          </View>
          {post.content?.rendered ? (
            <RenderHTML
              contentWidth={width - 40}
              defaultTextProps={{ selectable: true }}
              renderersProps={{ a: { onPress: openLink } }}
              source={{ html: sanitizeArticleHtml(offline ? post.content.rendered.replace(/<img\b[^>]*>/gi, '') : post.content.rendered) }}
              tagsStyles={articleTagStyles(fontScale, colors.text, colors.muted)}
            />
          ) : (
            <Text style={[styles.articleEmpty, { color: colors.muted }]}>Full article content is not available.</Text>
          )}
          {!offline ? <Pressable
            accessibilityRole="link"
            onPress={() =>
              Linking.openURL(post.link).catch(() =>
                Alert.alert('Unable to open article', 'Please try again later.'),
              )
            }
            style={styles.websiteButton}
          >
            <Text style={styles.websiteButtonText}>Read on Nasarawa Newsline</Text>
            <Feather color="#FFFFFF" name="external-link" size={16} />
          </Pressable> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const { settings, colors, isDark, isLoading: settingsLoading } = useSettings();
  const [tab, setTab] = useState<Tab>('Home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [offlineArticles, setOfflineArticles] = useState<OfflineArticle[]>([]);
  const [offlineBytes, setOfflineBytes] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [selectedOffline, setSelectedOffline] = useState<OfflineArticle | null>(null);
  const [pushStatus, setPushStatus] = useState('');
  const [posts, setPosts] = useState<WpPost[]>([]);
  const [categories, setCategories] = useState<WpCategory[]>([]);
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [selectedPost, setSelectedPost] = useState<WpPost | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const requestId = useRef(0);
  const pageRef = useRef(1);

  const refreshOffline = useCallback(async () => { try { const [articles, bytes] = await Promise.all([listOfflineArticles(), offlineStorageBytes()]); setOfflineArticles(articles); setOfflineBytes(bytes); } catch { setOfflineArticles([]); setOfflineBytes(0); } }, []);
  useEffect(() => { void refreshOffline(); }, [refreshOffline]);
  useEffect(() => {
    if (!settingsLoading && settings.notificationsEnabled && pushDeliveryConfigured) {
      void registerForPush(settings).then(() => setPushStatus('')).catch((error: unknown) => setPushStatus(error instanceof Error ? error.message : 'Push registration failed.'));
    } else if (!pushDeliveryConfigured) setPushStatus('Push delivery is not configured.');
  }, [settingsLoading, settings.notificationsEnabled]);
  useEffect(() => {
    if (pushDeliveryConfigured) void syncNotificationPreferences(settings).catch((error: unknown) => setPushStatus(error instanceof Error ? error.message : 'Preference sync failed.'));
  }, [settings]);
  useEffect(() => {
    const openFromPush = async (response: Notifications.NotificationResponse) => {
      const id = notificationArticleId(response);
      if (!id) return;
      try {
        const offline = await getOfflineArticle(id);
        if (offline) { setSelectedOffline(offline); setSelectedPost(offlineArticleToPost(offline)); return; }
        const result = await fetchPostsPage({ include: [id], perPage: 1 });
        const post = result.posts.find((item) => item.id === id);
        if (post) { setSelectedOffline(null); setSelectedPost(post); }
      } catch { Alert.alert('Story unavailable', 'Connect to the internet and try opening this alert again.'); }
    };
    const listener = Notifications.addNotificationResponseReceivedListener((response) => { void openFromPush(response); });
    const last = Notifications.getLastNotificationResponse();
    if (last) void openFromPush(last);
    return () => listener.remove();
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { void refreshOffline(); if (settings.notificationsEnabled && pushDeliveryConfigured) void registerForPush(settings).catch((error: unknown) => setPushStatus(error instanceof Error ? error.message : 'Push registration failed.')); }
    });
    return () => subscription.remove();
  }, [refreshOffline, settings]);

  const saveOffline = useCallback(async (post: WpPost) => {
    setDownloadStatus('Preparing download…');
    try { const article = await downloadArticle(post, setDownloadStatus, settings.dataSaver); await refreshOffline(); setDownloadStatus(postImage(post, settings.dataSaver) && !article.imageUri ? 'Article saved; its image could not be downloaded.' : 'Available offline'); }
    catch (error) { setDownloadStatus(''); Alert.alert('Download failed', error instanceof Error ? error.message : 'Please try again when you have a connection.'); }
  }, [refreshOffline, settings.dataSaver]);
  const removeOffline = useCallback(async (id: number) => {
    try { await deleteOfflineArticle(id); if (selectedPost?.id === id) { setSelectedPost(null); setSelectedOffline(null); } await refreshOffline(); setDownloadStatus(''); }
    catch { Alert.alert('Could not remove download', 'Try again after checking available device storage.'); }
  }, [refreshOffline, selectedPost]);

  const loadCategories = useCallback(async () => {
    setCategoryError('');
    try {
      setCategories(await fetchCategories());
    } catch {
      setCategoryError('Categories could not be loaded.');
    }
  }, []);

  const loadNews = useCallback(
    async (options: { refresh?: boolean; nextPage?: boolean } = {}) => {
      const currentRequest = ++requestId.current;
      if (tab !== 'Home' && tab !== 'News') {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }
      const nextPage = options.nextPage ? pageRef.current + 1 : 1;
      if (options.nextPage) setLoadingMore(true);
      else if (options.refresh) setRefreshing(true);
      else setLoading(true);
      setFeedError('');
      try {
        const result = await fetchPostsPage({
          category: tab === 'News' ? categoryId : undefined,
          categories: tab === 'Home' ? settings.preferredCategories : undefined,
          search: tab === 'News' ? searchQuery || undefined : undefined,
          page: nextPage,
        });
        if (currentRequest !== requestId.current) return;
        setPosts((current) =>
          options.nextPage ? [...current, ...result.posts] : result.posts,
        );
        pageRef.current = nextPage;
        setPage(nextPage);
        setTotalPages(result.totalPages);
      } catch {
        if (currentRequest === requestId.current) {
          setFeedError('Unable to load news right now. Check your connection and try again.');
        }
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [categoryId, searchQuery, settings.preferredCategories, tab],
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchText.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    void loadNews();
  }, [loadNews]);

  const latestStories = posts.slice(1, 5);
  const featuredPost = posts[0];
  const showSearch = () => {
    setTab('News');
    setSearchOpen(true);
  };
  const showOffline = () => {
    setSearchOpen(false);
    setSearchText('');
    setCategoryId(undefined);
    setTab('Offline');
    void refreshOffline();
  };
  const selectCategory = (category?: WpCategory) => {
    setCategoryId(category?.id);
    setTab('News');
  };

  const renderStory = ({ item }: { item: WpPost }) => (
    <StoryCard
      compact
      onPress={() => { setSelectedOffline(null); setSelectedPost(item); }}
      downloaded={offlineArticles.some((article) => article.id === item.id)}
      onDownload={() => offlineArticles.some((article) => article.id === item.id) ? void removeOffline(item.id) : void saveOffline(item)}
      post={item}
    />
  );

  const renderHome = () => {
    if (loading) {
      return (
        <ScrollView
          contentContainerStyle={styles.homeContent}
          refreshControl={
            <RefreshControl
              onRefresh={() => void loadNews({ refresh: true })}
              refreshing={refreshing}
              tintColor={RED}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <BreakingNewsTicker posts={posts.slice(0, 5)} loading={loading} onOpen={(post) => setSelectedPost(post)} />
          <View style={styles.homeCategorySection}>
            <ScrollView
              contentContainerStyle={styles.homeCategoryRow}
              decelerationRate="fast"
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <View style={[styles.homeCategory, styles.homeCategoryActive]}>
                <Text style={[styles.homeCategoryText, styles.homeCategoryTextActive]}>All</Text>
              </View>
              {categories.map((category) => (
                <View key={category.id} style={styles.homeCategory}>
                  <Text style={styles.homeCategoryText}>{cleanHtml(category.name)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
          <SectionHeading title="Top story" />
          <LoadingSkeleton featured />
          <View style={styles.loadingMessage}>
            <ActivityIndicator color={RED} size="small" />
            <Text style={styles.loadingMessageText}>Loading the latest headlines</Text>
          </View>
          <SectionHeading title="Latest news" />
          <LoadingSkeleton />
          <LoadingSkeleton />
        </ScrollView>
      );
    }
    if (feedError && !posts.length) {
      return (
        <EmptyState
          action="Try again"
          icon="wifi-off"
          message={feedError}
          onAction={() => void loadNews()}
          title="Couldn't load today's news"
        />
      );
    }
    if (!posts.length) {
      return (
        <EmptyState
          icon="file-text"
          message="There are no published stories to show right now. Please check back soon."
          title="No stories available"
        />
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.homeContent}
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadNews({ refresh: true })}
            refreshing={refreshing}
            tintColor={RED}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <BreakingNewsTicker posts={posts.slice(0, 5)} onOpen={(post) => { setSelectedOffline(null); setSelectedPost(post); }} />

        <View style={styles.homeCategorySection}>
          <ScrollView
            contentContainerStyle={styles.homeCategoryRow}
            decelerationRate="fast"
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <Pressable onPress={() => setTab('News')} style={[styles.homeCategory, styles.homeCategoryActive]}>
              <Text style={[styles.homeCategoryText, styles.homeCategoryTextActive]}>All</Text>
            </Pressable>
            {categories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => selectCategory(category)}
                  style={styles.homeCategory}
                >
                  <Text style={styles.homeCategoryText}>{cleanHtml(category.name)}</Text>
                </Pressable>
              ))}
          </ScrollView>
        </View>

        <SectionHeading action="All news" onAction={() => setTab('News')} title="Top story" />
        {featuredPost ? (
          <StoryCard
            onPress={() => { setSelectedOffline(null); setSelectedPost(featuredPost); }}
            downloaded={offlineArticles.some((article) => article.id === featuredPost.id)}
            onDownload={() => offlineArticles.some((article) => article.id === featuredPost.id) ? void removeOffline(featuredPost.id) : void saveOffline(featuredPost)}
            post={featuredPost}
          />
        ) : null}

        <SectionHeading action="See all" onAction={() => setTab('News')} title="Latest news" />
        {latestStories.length ? (
          latestStories.map((post) => (
            <StoryCard
              compact
              key={post.id}
              onPress={() => { setSelectedOffline(null); setSelectedPost(post); }}
              downloaded={offlineArticles.some((article) => article.id === post.id)}
              onDownload={() => offlineArticles.some((article) => article.id === post.id) ? void removeOffline(post.id) : void saveOffline(post)}
              post={post}
            />
          ))
        ) : (
          <Text style={styles.sectionHint}>More stories will appear here as they are published.</Text>
        )}

        <SectionHeading action="Explore" onAction={() => setTab('News')} title="Top stories" />
        {posts.slice(5, 8).map((post) => (
          <StoryCard
            compact
            key={post.id}
            onPress={() => { setSelectedOffline(null); setSelectedPost(post); }}
            downloaded={offlineArticles.some((article) => article.id === post.id)}
            onDownload={() => offlineArticles.some((article) => article.id === post.id) ? void removeOffline(post.id) : void saveOffline(post)}
            post={post}
          />
        ))}

        <SectionHeading action="Explore" onAction={() => setTab('Videos')} title="News videos" />
        <Pressable onPress={() => setTab('Videos')} style={styles.videoTeaser}>
          <View style={styles.videoTeaserIcon}>
            <Feather color={RED} name="play-circle" size={26} />
          </View>
          <View style={styles.videoTeaserCopy}>
            <Text style={styles.videoTeaserTitle}>Watch Newsline</Text>
            <Text style={styles.videoTeaserDescription}>Video reports and interviews, coming soon</Text>
          </View>
          <Feather color={MUTED} name="chevron-right" size={19} />
        </Pressable>

        <SectionHeading title="Live TV" />
        <Pressable onPress={() => setTab('Live')} style={styles.liveTeaser}>
          <View style={styles.liveTeaserIcon}>
            <Feather color="#FFFFFF" name="radio" size={21} />
          </View>
          <View style={styles.liveTeaserCopy}>
            <View style={styles.liveTeaserTitleRow}>
              <Text style={styles.liveTeaserTitle}>Newsline Live</Text>
              <Text style={styles.comingSoon}>COMING SOON</Text>
            </View>
            <Text style={styles.liveTeaserDescription}>Live broadcast will be available here</Text>
          </View>
          <Feather color="#FFFFFF" name="chevron-right" size={19} />
        </Pressable>
        {feedError ? <Text style={styles.inlineError}>{feedError}</Text> : null}
      </ScrollView>
    );
  };

  const renderNews = () => {
    if (loading) {
      return (
        <ScrollView
          contentContainerStyle={styles.loadingList}
          refreshControl={
            <RefreshControl
              onRefresh={() => void loadNews({ refresh: true })}
              refreshing={refreshing}
              tintColor={RED}
            />
          }
        >
          <View style={styles.loadingMessage}>
            <ActivityIndicator color={RED} size="small" />
            <Text style={styles.loadingMessageText}>Loading the latest headlines</Text>
          </View>
          <LoadingSkeleton />
          <LoadingSkeleton />
          <LoadingSkeleton />
        </ScrollView>
      );
    }
    if (feedError && !posts.length) {
      return (
        <EmptyState
          action="Try again"
          icon="wifi-off"
          message={feedError}
          onAction={() => void loadNews()}
          title="Couldn't load news"
        />
      );
    }
    return (
      <FlatList
        contentContainerStyle={posts.length ? styles.newsList : styles.newsEmptyList}
        data={posts}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          <EmptyState
            icon="search"
            message="Try another search or choose a different category."
            title="No stories found"
          />
        }
        ListFooterComponent={
          <View style={styles.listFooter}>
            {feedError ? <Text style={styles.inlineError}>{feedError}</Text> : null}
            {page < totalPages ? (
              <Pressable
                disabled={loadingMore}
                onPress={() => void loadNews({ nextPage: true })}
                style={styles.loadMoreButton}
              >
                {loadingMore ? (
                  <ActivityIndicator color={RED} />
                ) : (
                  <Text style={styles.loadMoreText}>Load more stories</Text>
                )}
              </Pressable>
            ) : posts.length ? (
              <Text style={styles.listEnd}>YOU'RE ALL CAUGHT UP</Text>
            ) : null}
          </View>
        }
        ListHeaderComponent={
          <View>
            {categoryError ? (
              <Pressable onPress={() => void loadCategories()} style={styles.categoryError}>
                <Text style={styles.inlineError}>{categoryError} Tap to retry.</Text>
              </Pressable>
            ) : null}
          </View>
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => void loadNews({ refresh: true })}
            refreshing={refreshing}
            tintColor={RED}
          />
        }
        renderItem={renderStory}
      />
    );
  };

  const renderOffline = () => (
    <OfflineReadingScreen
      articles={offlineArticles}
      storageBytes={offlineBytes}
      onRemove={(id) => void removeOffline(id)}
      onOpen={(article) => { setSelectedOffline(article); setSelectedPost(offlineArticleToPost(article)); }}
    />
  );

  const renderLive = () => (
    <ScrollView contentContainerStyle={styles.specialContent}>
      <View style={styles.livePlayer}>
        <Feather color="#FFFFFF" name="radio" size={45} />
        <View style={styles.liveBadge}>
          <View style={styles.breakingDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <Text style={styles.livePlayerText}>NASARAWA NEWSLINE</Text>
      </View>
      <Text style={styles.specialTitle}>Live News</Text>
      <Text style={styles.specialCopy}>
        Stay connected to breaking stories and special coverage from across Nasarawa State.
      </Text>
      <View style={styles.noticeCard}>
        <View style={styles.noticeIcon}>
          <Feather color={RED} name="radio" size={19} />
        </View>
        <Text style={styles.noticeTitle}>Broadcast not yet configured</Text>
        <Text style={styles.noticeText}>
          Newsline Live is not streaming yet. The broadcast player will be available here when an
          official stream is configured.
        </Text>
      </View>
      <Text style={styles.broadcastFootnote}>No live stream is currently available.</Text>
    </ScrollView>
  );

  const renderVideos = () => (
    <ScrollView contentContainerStyle={styles.specialContent}>
      <View style={styles.videoFeature}>
        <View style={styles.videoFeaturePlay}>
          <Feather color="#FFFFFF" name="play" size={24} />
        </View>
        <Text style={styles.videoFeatureTitle}>Newsline Video</Text>
        <Text style={styles.videoFeatureCopy}>Reports, interviews and special coverage</Text>
      </View>
      <SectionHeading title="Video categories" />
      <CategoryChips
        categories={[
          { id: -1, name: 'All videos', count: 0, slug: 'all' },
          { id: -2, name: 'Reports', count: 0, slug: 'reports' },
          { id: -3, name: 'Interviews', count: 0, slug: 'interviews' },
          { id: -4, name: 'Special coverage', count: 0, slug: 'special' },
        ]}
        onSelect={() => undefined}
      />
      <EmptyState
        icon="video"
        message="Video reports and live coverage will be added to the library when video sources are available."
        title="Videos are coming soon"
      />
    </ScrollView>
  );

  const currentContent =
    tab === 'Home'
      ? renderHome()
      : tab === 'News'
        ? renderNews()
        : tab === 'Offline'
          ? renderOffline()
          : tab === 'Live'
            ? renderLive()
            : renderVideos();

  if (settingsLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.startupLoading}>
          <ActivityIndicator color={RED} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <Header onSearch={showSearch} onSettings={() => setSettingsOpen(true)} onDownloads={showOffline} />
      {searchOpen ? (
        <View style={[styles.searchBox, { backgroundColor: colors.background, borderBottomColor: colors.divider }]}>
          <Feather color={MUTED} name="search" size={17} />
          <TextInput
            accessibilityLabel="Search news"
            autoFocus
            onChangeText={setSearchText}
            placeholder="Search news, people or places"
            placeholderTextColor="#8B8B8B"
            returnKeyType="search"
            style={[styles.searchInput, { color: colors.text }]}
            value={searchText}
          />
          {searchText ? (
            <Pressable accessibilityLabel="Clear search" onPress={() => setSearchText('')} hitSlop={8}>
              <Feather color={MUTED} name="x-circle" size={18} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSearchText('');
              setSearchOpen(false);
              setCategoryId(undefined);
            }}
          >
            <Text style={styles.searchCancel}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.screenHeading, { backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.screenTitle, { color: colors.text }]}>
            {tab === 'Home'
              ? 'Top Stories'
              : tab === 'News'
                ? 'Latest News'
                : tab === 'Offline'
                  ? 'Offline Reading'
                  : tab === 'Live'
                    ? 'Live News'
                    : 'News Videos'}
          </Text>
          <Text style={[styles.screenSubtitle, { color: colors.muted }]}>
            {tab === 'Home'
              ? 'What is happening around you'
              : tab === 'News'
                ? 'The latest updates from our newsroom'
                : tab === 'Offline'
                  ? 'Articles saved on this device'
                  : tab === 'Live'
                    ? 'Broadcast updates from Newsline'
                    : 'Watch reports and interviews'}
          </Text>
        </View>
        {tab === 'News' ? (
          <Pressable
            accessibilityLabel="Refresh news"
            hitSlop={5}
            onPress={() => void loadNews({ refresh: true })}
            style={styles.refreshButton}
          >
            {refreshing ? (
              <ActivityIndicator color={RED} size="small" />
            ) : (
              <Feather color={RED} name="refresh-cw" size={16} />
            )}
          </Pressable>
        ) : null}
      </View>
      {tab === 'News' ? (
        <View style={[styles.filterBar, { backgroundColor: colors.background }]}>
          <CategoryChips
            categories={categories}
            includeAll
            onSelect={(category) => setCategoryId(category?.id)}
            selectedId={categoryId}
          />
        </View>
      ) : null}

      {downloadStatus && !selectedPost ? <Text accessibilityLiveRegion="polite" style={[styles.storyDate,{textAlign:'center',paddingVertical:5}]}>{downloadStatus}</Text> : null}
      <View style={[styles.contentArea, { backgroundColor: colors.canvas }]}>{currentContent}</View>
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom, backgroundColor: colors.background, borderTopColor: colors.divider }]}>
        {TABS.map((item) => {
          const active = tab === item.name;
          return (
            <Pressable
              accessibilityLabel={item.name}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={item.name}
              onPress={() => {
                setTab(item.name);
                if (item.name !== 'News') {
                  setSearchOpen(false);
                  setSearchText('');
                  setCategoryId(undefined);
                }
              }}
              style={styles.navItem}
            >
              <Feather color={active ? RED : colors.muted} name={item.icon} size={20} />
              <Text style={[styles.navLabel, { color: active ? RED : colors.muted }, active && styles.navLabelActive]}>{item.name}</Text>
              {active ? <View style={styles.navIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>
      {selectedPost ? (
        <ArticleReader
          onClose={() => { setSelectedPost(null); setSelectedOffline(null); setDownloadStatus(''); }}
          imageOverride={selectedOffline ? selectedOffline.imageUri : undefined}
          downloaded={offlineArticles.some((article) => article.id === selectedPost.id)}
          downloadStatus={downloadStatus}
          onDownload={() => void saveOffline(selectedPost)}
          onRemoveDownload={() => void removeOffline(selectedPost.id)}
          offline={Boolean(selectedOffline)}
          post={selectedPost}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsScreen
          appVersion={appConfig.expo.version}
          categories={categories}
          onClose={() => setSettingsOpen(false)}
          onOpenOffline={() => { setSettingsOpen(false); setOfflineOpen(true); void refreshOffline(); }}
          pushStatus={pushStatus}
        />
      ) : null}
      {offlineOpen ? <View style={[styles.readerOverlay,{backgroundColor:colors.background}]}><SafeAreaView edges={['top','bottom']} style={{flex:1}}>
        <View style={[styles.readerToolbar,{borderBottomColor:colors.divider}]}><Pressable accessibilityLabel="Close offline reading" onPress={() => setOfflineOpen(false)} style={styles.readerTool}><Feather color={colors.text} name="arrow-left" size={21}/></Pressable><Text style={[styles.screenTitle,{color:colors.text,flex:1}]}>Offline Reading</Text><Pressable accessibilityLabel="Clear all downloads" onPress={() => Alert.alert('Remove all downloads?', 'This deletes downloaded articles and their images.',[{text:'Cancel',style:'cancel'},{text:'Remove all',style:'destructive',onPress:()=>void clearOfflineArticles().then(refreshOffline)}])} style={styles.readerTool}><Feather color={RED} name="trash-2" size={19}/></Pressable></View>
        <OfflineReadingScreen articles={offlineArticles} storageBytes={offlineBytes} onRemove={(id)=>void removeOffline(id)} onOpen={(article)=>{setOfflineOpen(false);setSelectedOffline(article);setSelectedPost(offlineArticleToPost(article));}} />
      </SafeAreaView></View> : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const articleTagStyles = (scale: number, text: string, muted: string) => ({
  body: { color: text, fontSize: 16 * scale, lineHeight: 27 * scale },
  p: { marginBottom: 15 },
  h1: { color: text, fontSize: 25 * scale, fontWeight: '800' as const, lineHeight: 33 * scale, marginBottom: 12 },
  h2: { color: text, fontSize: 21 * scale, fontWeight: '800' as const, lineHeight: 29 * scale, marginBottom: 10 },
  h3: { color: text, fontSize: 18 * scale, fontWeight: '800' as const, lineHeight: 26 * scale, marginBottom: 8 },
  a: { color: RED, textDecorationLine: 'underline' as const },
  blockquote: {
    borderLeftColor: RED,
    borderLeftWidth: 3,
    color: muted,
    marginLeft: 0,
    paddingLeft: 14,
  },
  li: { marginBottom: 6 },
});

const styles = StyleSheet.create({
  safe: { backgroundColor: '#FFFFFF', flex: 1 },
  startupLoading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#F0F0F0',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: RED,
    borderRadius: 9,
    height: 37,
    justifyContent: 'center',
    width: 37,
  },
  brandN: { color: '#FFFFFF', fontSize: 27, fontWeight: '900' },
  brandCopy: { flex: 1, minWidth: 0 },
  brandTitle: { color: INK, fontSize: 16, fontWeight: '900', letterSpacing: 1.4 },
  brandSub: { color: MUTED, fontSize: 9, fontWeight: '700', letterSpacing: 1.15, marginTop: 2 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  headerAction: {
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 20,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#EEEEEE',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  searchInput: { color: INK, flex: 1, fontSize: 14, minHeight: 38 },
  searchCancel: { color: RED, fontSize: 12, fontWeight: '700' },
  screenHeading: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 17,
    paddingVertical: 10,
  },
  screenTitle: { color: INK, fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },
  screenSubtitle: { color: MUTED, fontSize: 12, marginTop: 3 },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderRadius: 20,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  filterBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    height: 54,
    justifyContent: 'center',
  },
  chipRow: { alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 5 },
  categoryChip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E8E8',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  categoryChipActive: { backgroundColor: RED, borderColor: RED },
  categoryChipText: { color: INK, fontSize: 12, fontWeight: '600' },
  categoryChipTextActive: { color: '#FFFFFF' },
  contentArea: { backgroundColor: BG, flex: 1 },
  homeContent: { paddingBottom: 24 },
  breakingTicker: {
    alignItems: 'center',
    backgroundColor: RED,
    borderRadius: 7,
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  breakingLabel: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  breakingDot: { backgroundColor: '#FFFFFF', borderRadius: 5, height: 7, width: 7 },
  breakingLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  breakingTickerViewport: { flex: 1, overflow: 'hidden' },
  breakingTickerTrack: { alignItems: 'center', flexDirection: 'row' },
  breakingTickerGroup: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, flexWrap: 'nowrap' },
  breakingHeadline: { color: '#FFFFFF', flexShrink: 0, fontSize: 12, fontWeight: '600' },
  breakingTickerSeparator: { color: '#FFE1E2', fontSize: 12, fontWeight: '700' },
  homeCategorySection: {
    backgroundColor: '#FFFFFF',
    height: 56,
    justifyContent: 'center',
    marginTop: 10,
  },
  homeCategoryRow: { alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 4 },
  homeCategory: {
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  homeCategoryActive: { backgroundColor: INK },
  homeCategoryText: { color: INK, fontSize: 12, fontWeight: '700' },
  homeCategoryTextActive: { color: '#FFFFFF' },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: { color: INK, fontSize: 18, fontWeight: '900' },
  sectionAction: { color: RED, fontSize: 12, fontWeight: '700' },
  featuredCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 1,
    marginHorizontal: 14,
    marginBottom: 4,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
  },
  featuredImage: { aspectRatio: 1.65, backgroundColor: '#E7E7E7', width: '100%' },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  imageFallbackText: { color: '#9A9A9A', fontSize: 11, marginTop: 7 },
  featuredCopy: { padding: 14 },
  storyMetaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  categoryLabel: { color: RED, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  cardDownload: { alignItems: 'center', height: 36, justifyContent: 'center', marginLeft: 8, width: 36 },
  featuredTitle: { color: INK, fontSize: 21, fontWeight: '900', lineHeight: 27, marginTop: 5 },
  featuredExcerpt: { color: '#555555', fontSize: 13, lineHeight: 19, marginTop: 7 },
  storyDate: { color: MUTED, fontSize: 10, marginTop: 8 },
  storyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 11,
    marginHorizontal: 14,
    marginBottom: 9,
    padding: 10,
  },
  storyImage: { backgroundColor: '#E7E7E7', borderRadius: 7, height: 96, width: 108 },
  storyCopy: { flex: 1, justifyContent: 'center', minHeight: 78 },
  storyTitle: { color: INK, fontSize: 14, fontWeight: '800', lineHeight: 19, marginTop: 4 },
  sectionHint: { color: MUTED, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  videoTeaser: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 14,
    padding: 13,
  },
  videoTeaserIcon: {
    alignItems: 'center',
    backgroundColor: '#FFF1F1',
    borderRadius: 9,
    height: 43,
    justifyContent: 'center',
    width: 43,
  },
  videoTeaserCopy: { flex: 1 },
  videoTeaserTitle: { color: INK, fontSize: 14, fontWeight: '800' },
  videoTeaserDescription: { color: MUTED, fontSize: 11, marginTop: 4 },
  liveTeaser: {
    alignItems: 'center',
    backgroundColor: INK,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 14,
    padding: 14,
  },
  liveTeaserIcon: {
    alignItems: 'center',
    backgroundColor: RED,
    borderRadius: 9,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  liveTeaserCopy: { flex: 1 },
  liveTeaserTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  liveTeaserTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  comingSoon: { color: '#FFC6C8', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  liveTeaserDescription: { color: '#CCCCCC', fontSize: 11, marginTop: 4 },
  loadingList: { paddingTop: 5 },
  loadingMessage: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 17,
    paddingTop: 10,
  },
  loadingMessageText: { color: MUTED, fontSize: 12, fontWeight: '600' },
  newsList: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 18 },
  newsEmptyList: { flexGrow: 1, justifyContent: 'center' },
  listFooter: { alignItems: 'center', paddingVertical: 12 },
  listEnd: { color: '#AAAAAA', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  loadMoreButton: {
    alignItems: 'center',
    borderColor: '#E8C7C8',
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 150,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  loadMoreText: { color: RED, fontSize: 12, fontWeight: '800' },
  categoryError: { paddingHorizontal: 4, paddingVertical: 8 },
  inlineError: { color: RED, fontSize: 12, lineHeight: 18, paddingHorizontal: 14, paddingVertical: 8 },
  skeletonFeatured: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    margin: 14,
    overflow: 'hidden',
  },
  skeletonStory: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 11,
    marginHorizontal: 14,
    marginBottom: 10,
    padding: 10,
  },
  skeletonHero: { aspectRatio: 1.65, backgroundColor: '#EAEAEA', width: '100%' },
  skeletonThumb: { backgroundColor: '#EAEAEA', borderRadius: 7, height: 86, width: 104 },
  skeletonCopy: { flex: 1, padding: 12 },
  skeletonLabel: { backgroundColor: '#EEEEEE', borderRadius: 4, height: 9, marginBottom: 10, width: 70 },
  skeletonLine: { backgroundColor: '#EEEEEE', borderRadius: 5, height: 12, marginBottom: 8, width: '95%' },
  skeletonShortLine: { width: '65%' },
  emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  emptyTitle: { color: INK, fontSize: 17, fontWeight: '800', marginTop: 13, textAlign: 'center' },
  emptyMessage: { color: MUTED, fontSize: 13, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  primaryButton: { backgroundColor: RED, borderRadius: 8, marginTop: 15, paddingHorizontal: 19, paddingVertical: 10 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  bottomNav: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#EAEAEA',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 61,
    justifyContent: 'space-around',
    paddingTop: 5,
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 2,
  },
  navLabel: { color: '#858585', fontSize: 10, fontWeight: '600' },
  navLabelActive: { color: RED, fontWeight: '800' },
  navIndicator: { backgroundColor: RED, borderRadius: 2, height: 3, position: 'absolute', top: 0, width: 22 },
  readerOverlay: { backgroundColor: '#FFFFFF', bottom: 0, elevation: 10, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 10 },
  readerSafe: { backgroundColor: '#FFFFFF', flex: 1 },
  readerToolbar: {
    alignItems: 'center',
    borderBottomColor: '#EEEEEE',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    height: 49,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  readerToolbarActions: { flexDirection: 'row', gap: 14 },
  readerTool: { alignItems: 'center', height: 38, justifyContent: 'center', width: 38 },
  readerContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32 },
  readerHero: { backgroundColor: '#E7E7E7', borderRadius: 10, height: 225, marginBottom: 19, width: '100%' },
  readerTitle: { color: INK, fontSize: 27, fontWeight: '900', lineHeight: 35, marginTop: 8 },
  readerByline: { color: MUTED, fontSize: 12, lineHeight: 18, marginTop: 10 },
  readTime: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 8, marginBottom: 15 },
  readTimeText: { color: MUTED, fontSize: 11 },
  articleEmpty: { color: MUTED, fontSize: 14, lineHeight: 21 },
  websiteButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: RED,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 9,
    marginTop: 24,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  websiteButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  specialContent: { paddingBottom: 24, paddingHorizontal: 15, paddingTop: 16 },
  livePlayer: {
    alignItems: 'center',
    backgroundColor: '#171717',
    borderRadius: 13,
    height: 220,
    justifyContent: 'center',
    position: 'relative',
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: RED,
    borderRadius: 5,
    flexDirection: 'row',
    gap: 5,
    left: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: 'absolute',
    top: 12,
  },
  liveBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  livePlayerText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 10 },
  specialTitle: { color: INK, fontSize: 22, fontWeight: '900', marginTop: 18 },
  specialCopy: { color: MUTED, fontSize: 13, lineHeight: 20, marginTop: 6 },
  noticeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    marginTop: 18,
    padding: 16,
  },
  noticeIcon: {
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderRadius: 8,
    height: 37,
    justifyContent: 'center',
    marginBottom: 12,
    width: 37,
  },
  noticeTitle: { color: INK, fontSize: 14, fontWeight: '800' },
  noticeText: { color: MUTED, fontSize: 12, lineHeight: 19, marginTop: 5 },
  broadcastFootnote: { color: MUTED, fontSize: 11, marginTop: 15, textAlign: 'center' },
  videoFeature: {
    alignItems: 'center',
    backgroundColor: '#272727',
    borderRadius: 13,
    height: 190,
    justifyContent: 'center',
    marginBottom: 3,
  },
  videoFeaturePlay: {
    alignItems: 'center',
    backgroundColor: RED,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  videoFeatureTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 12 },
  videoFeatureCopy: { color: '#DDDDDD', fontSize: 11, marginTop: 5 },
});
