import React from 'react';
import { FlatList, Image, Pressable, Text, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSettings } from './settings';
import type { OfflineArticle } from './offline';

export default function OfflineReadingScreen({ articles, storageBytes, onOpen, onRemove }: {
  articles: OfflineArticle[]; storageBytes: number; onOpen: (article: OfflineArticle) => void; onRemove: (id: number) => void;
}) {
  const { colors } = useSettings();
  if (!articles.length) return <View style={styles.empty}>
    <Feather color="#B82025" name="download-cloud" size={32} />
    <Text style={[styles.title, { color: colors.text }]}>No offline stories yet</Text>
    <Text style={[styles.copy, { color: colors.muted }]}>Open a story and tap Download to keep its article on this device.</Text>
  </View>;
  return <FlatList data={articles} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list}
    ListHeaderComponent={<Text style={[styles.storage,{color:colors.muted}]}>{articles.length} {articles.length === 1 ? 'story' : 'stories'} · {(storageBytes / (1024 * 1024)).toFixed(1)} MB of images</Text>}
    renderItem={({ item }) => <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Read ${item.title} offline`} onPress={() => onOpen(item)} style={styles.story}>
        {item.imageUri ? <Image source={{ uri: item.imageUri }} style={styles.image} /> : <View style={[styles.image, styles.noImage]}><Feather color="#aaa" name="file-text" size={22}/></View>}
        <View style={styles.details}><Text style={styles.category}>{item.categoryName.toUpperCase()}</Text><Text numberOfLines={3} style={[styles.headline,{color:colors.text}]}>{item.title}</Text><Text style={[styles.date,{color:colors.muted}]}>Saved {new Date(item.downloadedAt).toLocaleDateString()}</Text></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.title} from offline reading`} onPress={() => onRemove(item.id)} style={styles.remove}><Feather color="#B82025" name="trash-2" size={18}/></Pressable>
    </View>} />;
}
const styles=StyleSheet.create({list:{padding:14,gap:10},storage:{fontSize:12,marginBottom:2},card:{borderRadius:12,overflow:'hidden',flexDirection:'row',alignItems:'center'},story:{flex:1,flexDirection:'row',padding:12,gap:12},image:{width:88,height:82,borderRadius:8,backgroundColor:'#eee'},noImage:{alignItems:'center',justifyContent:'center'},details:{flex:1,justifyContent:'center'},category:{color:'#B82025',fontSize:10,fontWeight:'800',marginBottom:5},headline:{fontSize:15,fontWeight:'700',lineHeight:20},date:{fontSize:11,marginTop:7},remove:{padding:14},empty:{flex:1,alignItems:'center',justifyContent:'center',padding:35},title:{fontSize:18,fontWeight:'800',marginTop:14},copy:{fontSize:14,lineHeight:21,textAlign:'center',marginTop:8}});
