import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import EpubReader, { EpubReaderRef, EpubLocationData } from '../components/EpubReader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateBookProgress, addAnnotation } from '../githubSync';
import { Modal, TextInput, ScrollView } from 'react-native';

type ReaderScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Reader'>;
type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;

interface Props {
    navigation: ReaderScreenNavigationProp;
    route: ReaderScreenRouteProp;
}

export default function ReaderScreen({ route, navigation }: Props) {
    const { bookUrl, title, lastReadPosition } = route.params;
    const readerRef = useRef<EpubReaderRef>(null);

    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [fontSize, setFontSize] = useState<number>(100);
    const [progress, setProgress] = useState(0);
    const [paging, setPaging] = useState({ current: 0, total: 0 });
    const [currentCfi, setCurrentCfi] = useState('');
    const [selectedRange, setSelectedRange] = useState<string | null>(null);
    const [memoModalVisible, setMemoModalVisible] = useState(false);
    const [tempMemo, setTempMemo] = useState('');

    // 디바운스 저장을 위한 타이머 캐시
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleLocationChange = useCallback((loc: EpubLocationData) => {
        setProgress(loc.progress);
        setPaging({ current: loc.currentLocation, total: loc.totalLocations });
        setCurrentCfi(loc.cfi);

        // 로컬 자동 저장 (1초 디바운스 적용)
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        saveTimerRef.current = setTimeout(async () => {
            try {
                // 특정 책의 마지막 위치를 로컬 스토리지에 저장 (빠른 로딩 및 오프라인 대비용)
                const key = `book_cfi_${encodeURIComponent(title)}`;
                await AsyncStorage.setItem(key, loc.cfi);
                console.log(`[AutoSave] Saved CFI to local storage: ${loc.cfi} (${Math.round(loc.progress * 100)}%)`);

                // GitHub 원격 서버로 읽던 위치 백업(Push)
                await updateBookProgress(title, loc.cfi);
            } catch (e) {
                console.error('Failed to save reading position', e);
            }
        }, 1000);
    }, [title]);

    const handleReady = (totalLocs: number) => {
        console.log(`Book is ready. Total Locations: ${totalLocs}`);
    };

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const increaseFont = () => setFontSize(prev => prev + 10);
    const decreaseFont = () => setFontSize(prev => Math.max(50, prev - 10));

    const handleAddBookmark = async () => {
        await addAnnotation(title, {
            type: 'bookmark',
            cfi: currentCfi,
            created_at: new Date().toISOString()
        });
        alert('Bookmark added!');
    };

    const handleAddHighlight = async (color: string) => {
        if (!selectedRange) return;
        readerRef.current?.addHighlight(color);
        await addAnnotation(title, {
            type: 'highlight',
            cfi: currentCfi,
            cfiRange: selectedRange,
            color: color,
            created_at: new Date().toISOString()
        });
        setSelectedRange(null);
    };

    const handleSaveMemo = async () => {
        if (!selectedRange || !tempMemo) return;
        await addAnnotation(title, {
            type: 'memo',
            cfi: currentCfi,
            cfiRange: selectedRange,
            text: tempMemo,
            created_at: new Date().toISOString()
        });
        setMemoModalVisible(false);
        setTempMemo('');
        setSelectedRange(null);
    };

    return (
        <SafeAreaView style={[styles.safeArea, theme === 'dark' && styles.safeAreaDark]}>
            <View style={[styles.headerBar, theme === 'dark' && styles.headerDark]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>← Back</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, theme === 'dark' && styles.textDark]} numberOfLines={1}>
                    {title}
                </Text>
                <View style={styles.headerButtons}>
                    <TouchableOpacity onPress={() => navigation.navigate('Annotations', { title })} style={styles.headerButton}>
                        <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>📝</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleAddBookmark} style={styles.headerButton}>
                        <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>🔖</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleTheme} style={styles.headerButton}>
                        <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>
                            {theme === 'light' ? '🌙' : '☀️'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.readerContainer}>
                <EpubReader
                    ref={readerRef}
                    bookUrl={bookUrl}
                    initialCfi={lastReadPosition || undefined}
                    onLocationChange={handleLocationChange}
                    onTextSelected={setSelectedRange}
                    onReady={handleReady}
                    theme={theme}
                    fontSize={fontSize}
                />
            </View>

            {selectedRange && (
                <View style={styles.selectionMenu}>
                    <TouchableOpacity onPress={() => handleAddHighlight('yellow')} style={styles.menuBtn}>
                        <Text>🟡 Highlight</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setMemoModalVisible(true)} style={styles.menuBtn}>
                        <Text>📝 Memo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setSelectedRange(null)} style={styles.menuBtn}>
                        <Text>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Modal visible={memoModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Save Note</Text>
                        <TextInput
                            style={styles.memoInput}
                            multiline
                            placeholder="Type your note here..."
                            value={tempMemo}
                            onChangeText={setTempMemo}
                        />
                        <View style={styles.modalBtns}>
                            <TouchableOpacity onPress={() => setMemoModalVisible(false)} style={styles.modalBtn}>
                                <Text>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSaveMemo} style={[styles.modalBtn, styles.saveBtn]}>
                                <Text style={{ color: '#fff' }}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <View style={[styles.footerBar, theme === 'dark' && styles.footerDark]}>
                <TouchableOpacity onPress={() => readerRef.current?.goPrev()} style={styles.footerButton}>
                    <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>Prev Page</Text>
                </TouchableOpacity>

                <View style={styles.fontControls}>
                    <TouchableOpacity onPress={decreaseFont} style={styles.fontBtn}>
                        <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>A-</Text>
                    </TouchableOpacity>

                    <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.pagingText, theme === 'dark' && styles.textDark]}>
                            {paging.current} / {paging.total}
                        </Text>
                        <Text style={[styles.progressText, theme === 'dark' && styles.textDark]}>
                            {Math.round(progress * 100)}%
                        </Text>
                    </View>

                    <TouchableOpacity onPress={increaseFont} style={styles.fontBtn}>
                        <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>A+</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => readerRef.current?.goNext()} style={styles.footerButton}>
                    <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>Next Page</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#fff',
    },
    safeAreaDark: {
        backgroundColor: '#121212',
    },
    headerBar: {
        paddingTop: Platform.OS === 'android' ? 10 : 0,
        paddingBottom: 15,
        paddingHorizontal: 15,
        backgroundColor: '#fff',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: '#ebebeb',
    },
    headerDark: {
        backgroundColor: '#1a1a1a',
        borderBottomColor: '#333',
    },
    headerButton: {
        minWidth: 40,
        paddingVertical: 5,
        marginLeft: 10,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    controlText: {
        fontSize: 16,
        color: '#007aff',
    },
    textDark: {
        color: '#ff9500',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        flex: 1,
        textAlign: 'center',
        color: '#000',
    },
    readerContainer: {
        flex: 1,
        backgroundColor: 'transparent'
    },
    footerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 5,
        paddingHorizontal: 15,
        borderTopWidth: 1,
        borderTopColor: '#ebebeb',
        backgroundColor: '#f9f9f9',
    },
    footerDark: {
        backgroundColor: '#1a1a1a',
        borderTopColor: '#333',
    },
    footerButton: {
        padding: 10,
    },
    fontControls: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    fontBtn: {
        paddingHorizontal: 15,
        paddingVertical: 10,
    },
    progressText: {
        fontSize: 10,
        color: '#888',
    },
    pagingText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#444',
    },
    selectionMenu: {
        position: 'absolute',
        top: 100,
        alignSelf: 'center',
        backgroundColor: '#fff',
        borderRadius: 20,
        flexDirection: 'row',
        padding: 5,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    menuBtn: {
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRightWidth: 0.5,
        borderRightColor: '#eee',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        backgroundColor: '#fff',
        borderRadius: 15,
        padding: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 15,
        textAlign: 'center',
    },
    memoInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 10,
        height: 100,
        textAlignVertical: 'top',
        marginBottom: 20,
    },
    modalBtns: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    modalBtn: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        marginLeft: 10,
    },
    saveBtn: {
        backgroundColor: '#007aff',
    }
});
