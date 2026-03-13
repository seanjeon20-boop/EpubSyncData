import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { initializeGitHubSync, loadSyncConfig, BookData } from '../githubSync';
import { useFocusEffect } from '@react-navigation/native';

type LibraryScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Library'>;

interface Props {
    navigation: LibraryScreenNavigationProp;
}

export default function LibraryScreen({ navigation }: Props) {
    const [books, setBooks] = useState<any[]>([]);
    const [syncData, setSyncData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [configReady, setConfigReady] = useState(false);

    useFocusEffect(
        React.useCallback(() => {
            async function loadData() {
                const isConfigured = await loadSyncConfig();
                setConfigReady(isConfigured);

                if (isConfigured) {
                    setLoading(true);
                    try {
                        const result = await initializeGitHubSync();
                        setSyncData(result.syncData);
                        setBooks(result.booksOnCloud || []);
                    } catch (e) {
                        console.error("Failed to load library data:", e);
                    } finally {
                        setLoading(false);
                    }
                } else {
                    setLoading(false);
                }
            }
            loadData();
        }, [])
    );

    const handleBookPress = (bookFile: any) => {
        // In a real app, you'd match the book file to the syncData 
        // to find the correct last_read_position. 
        // Here we'll just pass some mock or retrieved data.

        // Find book info from sync_data if available
        let progressData = null;
        if (syncData && syncData.books) {
            // Just finding any match for demonstration
            const matchKey = Object.keys(syncData.books).find(k => syncData.books[k].file_path.includes(bookFile.name));
            if (matchKey) {
                progressData = syncData.books[matchKey];
            }
        }

        navigation.navigate('Reader', {
            bookUrl: bookFile.download_url, // For epub.js to download/render
            title: bookFile.name,
            lastReadPosition: progressData ? progressData.last_read_position : null
        });
    };

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#0000ff" />
                <Text style={{ marginTop: 10 }}>Synching with GitHub...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.header}>My Library</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                    <Text style={styles.settingsIcon}>⚙️ Settings</Text>
                </TouchableOpacity>
            </View>

            {!configReady ? (
                <View style={styles.noConfig}>
                    <Text style={styles.noConfigTitle}>Welcome to EpubSync!</Text>
                    <Text style={styles.noConfigText}>
                        Cloud sync is not configured yet. Set up your GitHub credentials to view your books.
                    </Text>
                    <TouchableOpacity style={styles.configBtn} onPress={() => navigation.navigate('Settings')}>
                        <Text style={styles.configBtnText}>Setup GitHub Sync</Text>
                    </TouchableOpacity>
                </View>
            ) : books.length === 0 ? (
                <Text style={styles.emptyText}>No books found in GitHub /books folder.</Text>
            ) : (
                <FlatList
                    data={books}
                    keyExtractor={(item) => item.sha}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.bookCard} onPress={() => handleBookPress(item)}>
                            <Text style={styles.bookTitle}>{item.name}</Text>
                            <Text style={styles.bookSub}>Size: {(item.size / 1024).toFixed(1)} KB</Text>
                        </TouchableOpacity>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f5f5',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#333',
    },
    bookCard: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 8,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.41,
        elevation: 2,
    },
    bookTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    bookSub: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    emptyText: {
        fontSize: 16,
        color: '#777',
        textAlign: 'center',
        marginTop: 40,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    settingsIcon: {
        fontSize: 16,
        color: '#007aff',
    },
    noConfig: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    noConfigTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    noConfigText: {
        textAlign: 'center',
        color: '#666',
        marginBottom: 30,
        lineHeight: 22,
    },
    configBtn: {
        backgroundColor: '#007aff',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    configBtnText: {
        color: '#fff',
        fontWeight: 'bold',
    }
});
