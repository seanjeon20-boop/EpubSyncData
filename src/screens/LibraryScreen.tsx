import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [hasAutoNavigated, setHasAutoNavigated] = useState(false);

    useFocusEffect(
        React.useCallback(() => {
            async function loadData() {
                const isConfigured = await loadSyncConfig();
                setConfigReady(isConfigured);

                // 1. 캐시된 데이터 먼저 불러오기 (오프라인 지원)
                let cachedBooksData: any[] = [];
                let cachedSyncDataLocal: any = null;
                try {
                    const cachedBooks = await AsyncStorage.getItem('cached_books_list');
                    const cachedSync = await AsyncStorage.getItem('cached_sync_data');
                    if (cachedBooks) {
                        cachedBooksData = JSON.parse(cachedBooks);
                        setBooks(cachedBooksData);
                    }
                    if (cachedSync) {
                        cachedSyncDataLocal = JSON.parse(cachedSync);
                        setSyncData(cachedSyncDataLocal);
                    }
                } catch (e) { console.warn("Failed to load cache:", e); }

                if (isConfigured) {
                    setLoading(cachedBooksData.length === 0);
                    try {
                        const result = await initializeGitHubSync();
                        const freshSyncData = result.syncData;
                        const freshBooks = result.booksOnCloud || [];
                        setSyncData(freshSyncData);
                        setBooks(freshBooks);
                        setErrorMessage(result.error || null);

                        // 2. 성공 시 최신 데이터 캐싱
                        if (freshBooks.length > 0) {
                            await AsyncStorage.setItem('cached_books_list', JSON.stringify(freshBooks));
                        }
                        if (freshSyncData) {
                            await AsyncStorage.setItem('cached_sync_data', JSON.stringify(freshSyncData));
                        }

                        // 3. 앱 시작 시 최초 1회: 마지막 읽던 책 자동 열기 (크로스플랫폼 동기화)
                        if (!hasAutoNavigated && freshBooks.length > 0) {
                            setHasAutoNavigated(true);
                            try {
                                const lastReadRaw = await AsyncStorage.getItem('last_read_book');
                                if (lastReadRaw) {
                                    const lastRead = JSON.parse(lastReadRaw);
                                    const matchedBook = freshBooks.find((b: any) =>
                                        b.name === lastRead.title ||
                                        b.name.includes(lastRead.title) ||
                                        lastRead.title.includes(b.name)
                                    );
                                    if (matchedBook) {
                                        // GitHub sync에서 최신 CFI 우선 사용 (크로스플랫폼)
                                        let lastPos = lastRead.cfi;
                                        if (freshSyncData?.books) {
                                            const syncKey = Object.keys(freshSyncData.books).find((k: string) =>
                                                freshSyncData.books[k].file_path.includes(matchedBook.name) ||
                                                freshSyncData.books[k].title === matchedBook.name
                                            );
                                            if (syncKey && freshSyncData.books[syncKey].last_read_position) {
                                                lastPos = freshSyncData.books[syncKey].last_read_position;
                                                console.log(`[AutoOpen] Cross-platform sync CFI: ${lastPos}`);
                                            }
                                        }
                                        console.log(`[AutoOpen] Opening last read book: ${matchedBook.name}`);
                                        navigation.navigate('Reader', {
                                            bookUrl: matchedBook.download_url,
                                            title: matchedBook.name,
                                            lastReadPosition: lastPos
                                        });
                                    }
                                }
                            } catch (e) {
                                console.warn('Failed to auto-open last read book', e);
                            }
                        }
                    } catch (e: any) {
                        console.error("Failed to load library data:", e);
                        if (cachedBooksData.length === 0) setErrorMessage("Offline? " + e.message);
                    } finally {
                        setLoading(false);
                    }
                } else {
                    setLoading(false);
                }
            }
            loadData();
        }, [hasAutoNavigated])
    );

    const handleBookPress = async (bookFile: any) => {
        // Find book info from sync_data if available
        let progressData = null;
        if (syncData && syncData.books) {
            const fileName = bookFile.name;
            const matchKey = Object.keys(syncData.books).find(k => 
                syncData.books[k].file_path.includes(fileName) || 
                syncData.books[k].title === fileName
            );
            if (matchKey) {
                progressData = syncData.books[matchKey];
            }
        }

        // GitHub 데이터가 없으면 로컬 스토리지에서 다시 확인
        let lastPos = progressData ? progressData.last_read_position : null;
        if (!lastPos) {
            const key = `book_cfi_${encodeURIComponent(bookFile.name)}`;
            const localPos = await AsyncStorage.getItem(key);
            if (localPos) {
                console.log(`[Library] Using local storage fallback for ${bookFile.name}`);
                lastPos = localPos;
            }
        }

        navigation.navigate('Reader', {
            bookUrl: bookFile.download_url, // For epub.js to download/render
            title: bookFile.name,
            lastReadPosition: lastPos
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
        <SafeAreaView style={styles.container}>
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.header}>My Library</Text>
                    <Text style={styles.subtitle}>Welcome back to your collection</Text>
                </View>
                <TouchableOpacity 
                    style={styles.settingsBtn}
                    onPress={() => navigation.navigate('Settings')}
                >
                    <Text style={styles.settingsIcon}>⚙️</Text>
                </TouchableOpacity>
            </View>

            {/* Reading Stats Summary */}
            {configReady && (
                <View style={styles.statsContainer}>
                    <View style={styles.statBox}>
                        <Text style={styles.statValue}>{syncData?.stats?.total_reading_minutes || 0}</Text>
                        <Text style={styles.statLabel}>Total Min</Text>
                    </View>
                    <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: '#F2F2F7' }]}>
                        <Text style={styles.statValue}>
                            {syncData?.stats?.daily_stats?.[new Date().toISOString().split('T')[0]] || 0}
                        </Text>
                        <Text style={styles.statLabel}>Today (Min)</Text>
                    </View>
                    <View style={[styles.statBox, { borderLeftWidth: 1, borderLeftColor: '#F2F2F7' }]}>
                        <Text style={styles.statValue}>{books.length}</Text>
                        <Text style={styles.statLabel}>Books</Text>
                    </View>
                </View>
            )}

            {!configReady ? (
                <View style={styles.noConfig}>
                    <View style={styles.illustrationPlaceholder}>
                        <Text style={{fontSize: 60}}>📚</Text>
                    </View>
                    <Text style={styles.noConfigTitle}>Welcome to EpubSync</Text>
                    <Text style={styles.noConfigText}>
                        Cloud sync is not configured yet. Set up your GitHub credentials to view your private library.
                    </Text>
                    <TouchableOpacity style={styles.configBtn} onPress={() => navigation.navigate('Settings')}>
                        <Text style={styles.configBtnText}>Setup GitHub Sync</Text>
                    </TouchableOpacity>
                </View>
            ) : (books.length === 0 || errorMessage) ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyIcon}>{errorMessage ? '⚠️' : '📂'}</Text>
                    <Text style={styles.emptyText}>
                        {errorMessage ? 'Sync Error' : 'No books found'}
                    </Text>
                    <Text style={styles.emptySub}>
                        {errorMessage 
                            ? `GitHub said: ${errorMessage}`
                            : 'Upload .epub files to your repository (/books folder or root) to see them here.'}
                    </Text>
                    {errorMessage && (
                        <TouchableOpacity style={[styles.configBtn, {marginTop: 20}]} onPress={() => navigation.navigate('Settings')}>
                            <Text style={styles.configBtnText}>Check Settings</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <FlatList
                    data={books}
                    keyExtractor={(item) => item.sha}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (
                        <TouchableOpacity 
                            style={styles.bookCard} 
                            onPress={() => handleBookPress(item)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.bookIconContainer}>
                                <Text style={styles.bookIcon}>📖</Text>
                            </View>
                            <View style={styles.bookInfo}>
                                <Text style={styles.bookTitle} numberOfLines={2}>{item.name}</Text>
                                <Text style={styles.bookSub}>Size: {(item.size / 1024).toFixed(1)} KB</Text>
                            </View>
                            <View style={styles.chevronContainer}>
                                <Text style={styles.chevron}>›</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 24,
    },
    header: {
        fontSize: 28,
        fontWeight: '800',
        color: '#1a1a1a',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        color: '#8E8E93',
        marginTop: 4,
        fontWeight: '500',
    },
    settingsBtn: {
        backgroundColor: '#F2F2F7',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    settingsIcon: {
        fontSize: 20,
    },
    listContainer: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    bookCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F2F2F7',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    bookIconContainer: {
        width: 48,
        height: 48,
        backgroundColor: '#F2F2F7',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    bookIcon: {
        fontSize: 24,
    },
    bookInfo: {
        flex: 1,
    },
    bookTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1c1c1e',
        lineHeight: 22,
    },
    bookSub: {
        fontSize: 13,
        color: '#8E8E93',
        marginTop: 4,
        fontWeight: '500',
    },
    chevronContainer: {
        marginLeft: 8,
    },
    chevron: {
        fontSize: 24,
        color: '#C7C7CC',
        fontWeight: '300',
    },
    noConfig: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    illustrationPlaceholder: {
        marginBottom: 24,
    },
    noConfigTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1a1a1a',
        marginBottom: 12,
        textAlign: 'center',
    },
    noConfigText: {
        textAlign: 'center',
        color: '#636366',
        marginBottom: 32,
        fontSize: 15,
        lineHeight: 22,
    },
    configBtn: {
        backgroundColor: '#007AFF',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 14,
        width: '100%',
        alignItems: 'center',
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    configBtnText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1c1c1e',
        marginBottom: 8,
    },
    emptySub: {
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
        lineHeight: 20,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsContainer: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 24,
        marginBottom: 20,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F2F2F7',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#007AFF',
    },
    statLabel: {
        fontSize: 11,
        color: '#8E8E93',
        marginTop: 4,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
});
