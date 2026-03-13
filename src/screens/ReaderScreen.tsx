import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import EpubReader, { EpubReaderRef, EpubLocationData } from '../components/EpubReader';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

    // 디바운스 저장을 위한 타이머 캐시
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleLocationChange = useCallback((loc: EpubLocationData) => {
        setProgress(loc.progress);

        // 로컬 자동 저장 (1초 디바운스 적용)
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        saveTimerRef.current = setTimeout(async () => {
            try {
                // 특정 책의 마지막 위치를 로컬 스토리지에 저장 (나중에 githubSync.ts 연동)
                // 키워드는 책의 고유 식별자(여기서는 파일명 혹은 title)를 활용합니다.
                const key = `book_cfi_${encodeURIComponent(title)}`;
                await AsyncStorage.setItem(key, loc.cfi);
                console.log(`[AutoSave] Saved CFI to local storage: ${loc.cfi} (${Math.round(loc.progress * 100)}%)`);
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

    return (
        <SafeAreaView style={[styles.safeArea, theme === 'dark' && styles.safeAreaDark]}>
            <View style={[styles.headerBar, theme === 'dark' && styles.headerDark]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                    <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>← Back</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, theme === 'dark' && styles.textDark]} numberOfLines={1}>
                    {title}
                </Text>
                <TouchableOpacity onPress={toggleTheme} style={styles.headerButton}>
                    <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>
                        {theme === 'light' ? '🌙' : '☀️'}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.readerContainer}>
                <EpubReader
                    ref={readerRef}
                    bookUrl={bookUrl}
                    initialCfi={lastReadPosition || undefined}
                    onLocationChange={handleLocationChange}
                    onReady={handleReady}
                    theme={theme}
                    fontSize={fontSize}
                />
            </View>

            <View style={[styles.footerBar, theme === 'dark' && styles.footerDark]}>
                <TouchableOpacity onPress={() => readerRef.current?.goPrev()} style={styles.footerButton}>
                    <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>Prev Page</Text>
                </TouchableOpacity>

                <View style={styles.fontControls}>
                    <TouchableOpacity onPress={decreaseFont} style={styles.fontBtn}>
                        <Text style={[styles.controlText, theme === 'dark' && styles.textDark]}>A-</Text>
                    </TouchableOpacity>

                    <Text style={[styles.progressText, theme === 'dark' && styles.textDark]}>
                        {Math.round(progress * 100)}%
                    </Text>

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
        minWidth: 50,
        paddingVertical: 5,
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
        fontSize: 12,
        color: '#888',
        marginHorizontal: 10,
    }
});
