import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WpCategory } from './wordpress';
import { useSettings } from './settings';
import { pushDeliveryConfigured } from './push';

const RED = '#B82025';
const WEBSITE = 'https://nasarawanewsline.com.ng';
const LGAS = [
  'All Nasarawa',
  'Akwanga',
  'Awe',
  'Doma',
  'Karu',
  'Keana',
  'Keffi',
  'Kokona',
  'Lafia',
  'Nasarawa',
  'Nasarawa Eggon',
  'Obi',
  'Toto',
  'Wamba',
];

type Props = {
  categories: WpCategory[];
  appVersion: string;
  onClose: () => void;
  onOpenOffline: () => void;
  pushStatus: string;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useSettings();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.muted }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  title,
  description,
  right,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { colors } = useSettings();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={styles.rowIcon}>
        <Feather color={RED} name={icon} size={18} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {description ? (
          <Text style={[styles.rowDescription, { color: colors.muted }]}>{description}</Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

function Divider() {
  const { colors } = useSettings();
  return <View style={[styles.divider, { backgroundColor: colors.divider }]} />;
}

export default function SettingsScreen({ categories, appVersion, onClose, onOpenOffline, pushStatus }: Props) {
  const { settings, saveError, updateSettings, resetSettings, colors } = useSettings();
  const insets = useSafeAreaInsets();
  const [lgaOpen, setLgaOpen] = useState(false);

  const update = (updates: Parameters<typeof updateSettings>[0]) => {
    void updateSettings(updates).catch(() => undefined);
  };
  const selectCategory = (categoryId: number) => {
    const selected = settings.preferredCategories;
    update({
      preferredCategories: selected.includes(categoryId)
        ? selected.filter((id) => id !== categoryId)
        : [...selected, categoryId],
    });
  };
  const confirmReset = () => {
    Alert.alert(
      'Reset settings?',
      'Your preferences will return to their defaults. Saved articles will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset settings',
          style: 'destructive',
          onPress: () => {
            void resetSettings()
              .then(() => Alert.alert('Settings reset', 'Your preferences are back to default.'))
              .catch(() =>
                Alert.alert('Reset incomplete', 'Settings could not be saved on this device.'),
              );
          },
        },
      ],
    );
  };
  const openWebsite = () => {
    void Linking.openURL(WEBSITE).catch(() =>
      Alert.alert('Unable to open website', 'Please try again later.'),
    );
  };
  const setDataSaver = (enabled: boolean) => {
    update({ dataSaver: enabled });
  };
  const setLga = (lga: string) => {
    update({ preferredLGA: lga === 'All Nasarawa' ? 'all' : lga });
    setLgaOpen(false);
  };
  const selectedLga =
    LGAS.find((lga) =>
      settings.preferredLGA === 'all' ? lga === 'All Nasarawa' : lga === settings.preferredLGA,
    ) ?? 'All Nasarawa';

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={styles.backButton}
        >
          <Feather color={colors.text} name="arrow-left" size={21} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.headerSubtitle, { color: colors.muted }]}>Make Newsline yours</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {saveError ? (
          <View style={styles.errorBanner}>
            <Feather color={RED} name="alert-circle" size={16} />
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        ) : null}

        <Section title="APPEARANCE">
          <View style={styles.optionBlock}>
            <View style={styles.optionHeading}>
              <View style={styles.rowIcon}>
                <Feather color={RED} name="moon" size={18} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Theme</Text>
                <Text style={[styles.rowDescription, { color: colors.muted }]}>
                  Choose how Newsline looks
                </Text>
              </View>
            </View>
            <View style={styles.segmentRow}>
              {(['light', 'dark', 'system'] as const).map((theme) => {
                const active = settings.theme === theme;
                const label = theme === 'system' ? 'System' : theme[0].toUpperCase() + theme.slice(1);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    key={theme}
                    onPress={() => update({ theme })}
                    style={[
                      styles.segment,
                      { borderColor: colors.divider },
                      active && styles.segmentActive,
                    ]}
                  >
                    <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : colors.text }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Divider />
          <View style={styles.optionBlock}>
            <View style={styles.optionHeading}>
              <View style={styles.rowIcon}>
                <Feather color={RED} name="type" size={18} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Reading text size</Text>
                <Text style={[styles.rowDescription, { color: colors.muted }]}>
                  Applied to the article reader
                </Text>
              </View>
            </View>
            <View style={styles.segmentRow}>
              {(['small', 'medium', 'large'] as const).map((size) => {
                const active = settings.textSize === size;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    key={size}
                    onPress={() => update({ textSize: size })}
                    style={[
                      styles.segment,
                      { borderColor: colors.divider },
                      active && styles.segmentActive,
                    ]}
                  >
                    <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : colors.text }]}>
                      {size[0].toUpperCase() + size.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Section>

        <Section title="NOTIFICATIONS">
          <Row
            description={pushDeliveryConfigured ? (pushStatus || 'Device permission and newsroom alert delivery are being synchronized.') : 'Not active yet. Deploy the Newsline push service and build the app to enable delivery.'}
            icon="bell"
            title="Enable Notifications"
            right={
              <Switch
                accessibilityLabel="Enable Notifications"
                onValueChange={(notificationsEnabled) => update({ notificationsEnabled })}
                trackColor={{ false: '#D5D5D5', true: '#E8A6A8' }}
                thumbColor={settings.notificationsEnabled ? RED : '#FFFFFF'}
                value={settings.notificationsEnabled}
              />
            }
          />
          <Divider />
          <Row
            description="Urgent and breaking headlines"
            disabled={!settings.notificationsEnabled}
            icon="alert-circle"
            title="Breaking News Alerts"
            right={
              <Switch
                disabled={!settings.notificationsEnabled}
                onValueChange={(breakingNews) => update({ breakingNews })}
                trackColor={{ false: '#D5D5D5', true: '#E8A6A8' }}
                thumbColor={settings.breakingNews ? RED : '#FFFFFF'}
                value={settings.breakingNews}
              />
            }
          />
          <Divider />
          <Row
            description="Important newsroom updates"
            disabled={!settings.notificationsEnabled}
            icon="file-text"
            title="Major News Updates"
            right={
              <Switch
                disabled={!settings.notificationsEnabled}
                onValueChange={(majorNews) => update({ majorNews })}
                trackColor={{ false: '#D5D5D5', true: '#E8A6A8' }}
                thumbColor={settings.majorNews ? RED : '#FFFFFF'}
                value={settings.majorNews}
              />
            }
          />
          <Divider />
          <Row
            description="News from your selected area"
            disabled={!settings.notificationsEnabled}
            icon="map-pin"
            title="Local News Alerts"
            right={
              <Switch
                disabled={!settings.notificationsEnabled}
                onValueChange={(localNews) => update({ localNews })}
                trackColor={{ false: '#D5D5D5', true: '#E8A6A8' }}
                thumbColor={settings.localNews ? RED : '#FFFFFF'}
                value={settings.localNews}
              />
            }
          />
        </Section>

        <Section title="NEWS PREFERENCES">
          <View style={styles.optionBlock}>
            <View style={styles.optionHeading}>
              <View style={styles.rowIcon}>
                <Feather color={RED} name="list" size={18} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Preferred categories</Text>
                <Text style={[styles.rowDescription, { color: colors.muted }]}>
                  {settings.preferredCategories.length
                    ? `${settings.preferredCategories.length} selected`
                    : 'All categories are included'}
                </Text>
              </View>
              {settings.preferredCategories.length ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => update({ preferredCategories: [] })}
                  hitSlop={8}
                >
                  <Text style={styles.resetLink}>Reset</Text>
                </Pressable>
              ) : null}
            </View>
            {categories.length ? (
              <View style={styles.chipWrap}>
                {categories.map((category) => {
                  const selected = settings.preferredCategories.includes(category.id);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={category.id}
                      onPress={() => selectCategory(category.id)}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: colors.chip, borderColor: colors.divider },
                        selected && styles.categoryChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          { color: colors.text },
                          selected && styles.categoryChipTextSelected,
                        ]}
                      >
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.helperText, { color: colors.muted }]}>
                Categories will appear here when the news feed is available.
              </Text>
            )}
          </View>
          <Divider />
          <Row
            description="Personalize local news for your area"
            icon="map-pin"
            onPress={() => setLgaOpen((open) => !open)}
            title="Preferred Local Government Area"
            right={
              <View style={styles.rowRight}>
                <Text style={styles.selectedValue}>{selectedLga}</Text>
                <Feather color={colors.muted} name={lgaOpen ? 'chevron-up' : 'chevron-down'} size={18} />
              </View>
            }
          />
          {lgaOpen ? (
            <View style={[styles.lgaList, { borderTopColor: colors.divider }]}>
              {LGAS.map((lga) => {
                const selected = selectedLga === lga;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={lga}
                    onPress={() => setLga(lga)}
                    style={styles.lgaOption}
                  >
                    <Text style={[styles.lgaText, { color: selected ? RED : colors.text }]}>{lga}</Text>
                    {selected ? <Feather color={RED} name="check" size={17} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </Section>

        <Section title="OFFLINE READING">
          <Row
            description="Open and manage full articles saved on this device"
            icon="download"
            onPress={onOpenOffline}
            title="Offline Reading"
            right={<Feather color={colors.muted} name="chevron-right" size={19} />}
          />
        </Section>

        <Section title="DATA & STORAGE">
          <Row
            description="Use smaller available story images and reduce media loading"
            icon="database"
            title="Data Saver"
            right={
              <Switch
                onValueChange={setDataSaver}
                trackColor={{ false: '#D5D5D5', true: '#E8A6A8' }}
                thumbColor={settings.dataSaver ? RED : '#FFFFFF'}
                value={settings.dataSaver}
              />
            }
          />
          <Divider />
          <Row
            description={
              settings.dataSaver
                ? 'Off while Data Saver is enabled'
                : 'No videos currently play automatically'
            }
            disabled={settings.dataSaver}
            icon="play-circle"
            title="Autoplay Videos"
            right={
              <Switch
                disabled={settings.dataSaver}
                onValueChange={(autoplayVideos) => update({ autoplayVideos })}
                trackColor={{ false: '#D5D5D5', true: '#E8A6A8' }}
                thumbColor={settings.autoplayVideos && !settings.dataSaver ? RED : '#FFFFFF'}
                value={settings.autoplayVideos && !settings.dataSaver}
              />
            }
          />
        </Section>

        <Section title="ABOUT">
          <View style={styles.aboutBrand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandN}>N</Text>
            </View>
            <View>
              <Text style={[styles.aboutName, { color: colors.text }]}>Nasarawa Newsline</Text>
              <Text style={[styles.aboutTagline, { color: colors.muted }]}>News for All</Text>
            </View>
          </View>
          <Text style={[styles.aboutDescription, { color: colors.muted }]}>
            Nasarawa Newsline is a digital news platform dedicated to delivering timely news,
            information, stories, and developments from Nasarawa State and beyond.
          </Text>
          <Divider />
          <Row
            description={WEBSITE.replace(/^https?:\/\//, '')}
            icon="globe"
            onPress={openWebsite}
            title="Official Website"
            right={<Feather color={colors.muted} name="external-link" size={17} />}
          />
          <Divider />
          <Row
            description="Nasarawa Newsline"
            icon="info"
            title="App Version"
            right={<Text style={[styles.version, { color: colors.muted }]}>{appVersion}</Text>}
          />
        </Section>

        <Pressable accessibilityRole="button" onPress={confirmReset} style={styles.resetButton}>
          <Feather color={RED} name="refresh-ccw" size={16} />
          <Text style={styles.resetButtonText}>Reset Settings</Text>
        </Pressable>
        <Text style={[styles.footer, { color: colors.muted }]}>NASARAWA NEWSLINE · NEWS FOR ALL</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 57,
    paddingHorizontal: 15,
  },
  backButton: { alignItems: 'center', height: 40, justifyContent: 'center', marginRight: 8, width: 36 },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSubtitle: { fontSize: 11, marginTop: 2 },
  content: { paddingBottom: 28, paddingHorizontal: 15, paddingTop: 8 },
  section: { marginTop: 15 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginLeft: 3 },
  sectionCard: { borderRadius: 12, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 66, paddingHorizontal: 12, paddingVertical: 10 },
  rowPressed: { opacity: 0.72 },
  rowDisabled: { opacity: 0.48 },
  rowIcon: { alignItems: 'center', height: 30, justifyContent: 'center', marginRight: 10, width: 26 },
  rowCopy: { flex: 1, paddingRight: 8 },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowDescription: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  rowRight: { alignItems: 'center', flexDirection: 'row', gap: 4, maxWidth: '43%' },
  selectedValue: { color: RED, fontSize: 11, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
  optionBlock: { paddingHorizontal: 12, paddingVertical: 13 },
  optionHeading: { alignItems: 'center', flexDirection: 'row' },
  segmentRow: { flexDirection: 'row', gap: 7, marginLeft: 36, marginTop: 12 },
  segment: { alignItems: 'center', borderRadius: 7, borderWidth: 1, flex: 1, minHeight: 34, justifyContent: 'center' },
  segmentActive: { backgroundColor: RED, borderColor: RED },
  segmentText: { fontSize: 11, fontWeight: '700' },
  errorBanner: { alignItems: 'center', backgroundColor: '#FFF0F0', borderRadius: 8, flexDirection: 'row', gap: 8, marginTop: 8, padding: 11 },
  errorText: { color: RED, flex: 1, fontSize: 11, lineHeight: 16 },
  resetLink: { color: RED, fontSize: 11, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginLeft: 36, marginTop: 13 },
  categoryChip: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  categoryChipSelected: { backgroundColor: RED, borderColor: RED },
  categoryChipText: { fontSize: 10, fontWeight: '600' },
  categoryChipTextSelected: { color: '#FFFFFF' },
  helperText: { fontSize: 11, marginLeft: 36, marginTop: 12 },
  lgaList: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 3 },
  lgaOption: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 39 },
  lgaText: { fontSize: 12, fontWeight: '600' },
  comingSoon: { color: '#A16C1D', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  aboutBrand: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingTop: 15 },
  brandMark: { alignItems: 'center', backgroundColor: RED, borderRadius: 10, height: 45, justifyContent: 'center', width: 45 },
  brandN: { color: '#FFFFFF', fontSize: 30, fontWeight: '900' },
  aboutName: { fontSize: 15, fontWeight: '800' },
  aboutTagline: { fontSize: 11, marginTop: 3 },
  aboutDescription: { fontSize: 11, lineHeight: 17, paddingHorizontal: 14, paddingVertical: 13 },
  version: { fontSize: 11, fontWeight: '600' },
  resetButton: { alignItems: 'center', alignSelf: 'center', borderColor: '#E8BABC', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 8, marginTop: 23, paddingHorizontal: 16, paddingVertical: 11 },
  resetButtonText: { color: RED, fontSize: 12, fontWeight: '700' },
  footer: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 20, textAlign: 'center' },
});
