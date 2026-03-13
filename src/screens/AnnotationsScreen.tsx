import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getAnnotations, Annotation } from '../githubSync';

type AnnotationsScreenRouteProp = RouteProp<RootStackParamList, 'Annotations'>;
type AnnotationsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Annotations'>;

interface Props {
    route: AnnotationsScreenRouteProp;
    navigation: AnnotationsScreenNavigationProp;
}

export default function AnnotationsScreen({ route, navigation }: Props) {
    const { title } = route.params;
    const [annotations, setAnnotations] = useState<Annotation[]>([]);

    useEffect(() => {
        async function load() {
            const data = await getAnnotations(title);
            setAnnotations(data || []);
        }
        load();
    }, [title]);

    const renderItem = ({ item }: { item: Annotation }) => {
        const date = new Date(item.created_at).toLocaleString();
        return (
            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <Text style={styles.badge}>{item.type.toUpperCase()}</Text>
                    <Text style={styles.date}>{date}</Text>
                </View>
                {item.text && <Text style={styles.content}>{item.text}</Text>}
                {item.type === 'highlight' && (
                    <Text style={[styles.highlightText, { backgroundColor: item.color || '#fffeb3' }]}>
                        {item.cfiRange ? "(Selected Text Range)" : "(Highlight)"}
                    </Text>
                )}
                <Text style={styles.cfiText}>Location: {item.cfi}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{title} Notes</Text>
            </View>
            <FlatList
                data={annotations}
                keyExtractor={(item, index) => `${item.type}-${index}`}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                ListEmptyComponent={<Text style={styles.empty}>No notes or bookmarks yet.</Text>}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f7',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    backBtn: {
        marginRight: 15,
    },
    backText: {
        color: '#007aff',
        fontSize: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        flex: 1,
    },
    list: {
        padding: 15,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 15,
        marginBottom: 15,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    badge: {
        fontSize: 10,
        fontWeight: 'bold',
        backgroundColor: '#eee',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        color: '#666',
    },
    date: {
        fontSize: 12,
        color: '#999',
    },
    content: {
        fontSize: 16,
        color: '#333',
        marginBottom: 10,
        lineHeight: 22,
    },
    highlightText: {
        fontSize: 14,
        fontStyle: 'italic',
        padding: 4,
        borderRadius: 4,
        marginBottom: 10,
    },
    cfiText: {
        fontSize: 10,
        color: '#bbb',
    },
    empty: {
        textAlign: 'center',
        marginTop: 50,
        color: '#999',
    }
});
