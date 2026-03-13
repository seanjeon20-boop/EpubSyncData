import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, Text, GestureResponderEvent } from 'react-native';
import { EPUB_TEMPLATE } from './EpubTemplate';

let WebView: any = null;
if (Platform.OS !== 'web') {
    WebView = require('react-native-webview').WebView;
}

export interface EpubReaderRef {
    goNext: () => void;
    goPrev: () => void;
    jumpTo: (href: string) => void;
    changeTheme: (theme: 'light' | 'dark') => void;
    changeFontSize: (size: number) => void;
    addHighlight: (color: string) => void;
}

export interface EpubLocationData {
    cfi: string;
    progress: number;
    currentLocation: number;
    totalLocations: number;
}

export interface TocItem {
    label: string;
    href: string;
}

interface EpubReaderProps {
    bookUrl: string;
    initialCfi?: string | null;
    onLocationChange?: (location: EpubLocationData) => void;
    onTextSelected?: (cfiRange: string) => void;
    onAnnotation?: (data: any) => void;
    onToc?: (toc: TocItem[]) => void;
    onReady?: (totalLocations: number) => void;
    theme?: 'light' | 'dark';
    fontSize?: number;
}

const EpubReader = forwardRef<EpubReaderRef, EpubReaderProps>(({
    bookUrl,
    initialCfi,
    onLocationChange,
    onTextSelected,
    onAnnotation,
    onToc,
    onReady,
    theme = 'light',
    fontSize = 100
}, ref) => {
    const webviewRef = useRef<any>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [loading, setLoading] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const [debugError, setDebugError] = useState<string | null>(null);

    // 스와이프를 위한 터치 추적
    const touchStartX = useRef<number>(0);
    const touchStartY = useRef<number>(0);
    const touchStartTime = useRef<number>(0);

    const isWeb = Platform.OS === 'web';

    const executeScript = (script: string) => {
        if (isWeb) {
            try {
                (iframeRef.current?.contentWindow as any)?.eval(script);
            } catch (e) { console.error('iframe eval error', e) }
        } else {
            webviewRef.current?.injectJavaScript(`${script}; true;`);
        }
    };

    // Expose API to parent component
    useImperativeHandle(ref, () => ({
        goNext: () => executeScript(`window.goNext()`),
        goPrev: () => executeScript(`window.goPrev()`),
        jumpTo: (href: string) => executeScript(`window.jumpTo("${href}")`),
        changeTheme: (newTheme) => executeScript(`window.changeTheme("${newTheme}")`),
        changeFontSize: (newSize) => executeScript(`window.changeFontSize(${newSize})`),
        addHighlight: (color: string) => executeScript(`window.addHighlight("${color}")`),
    }));

    // 테마/폰트 변경: isReady 조건 없이 항상 시도 (나이트모드 버그 수정)
    useEffect(() => {
        if (isReady) {
            // 나이트모드 즉시 적용
            executeScript(`
                if (typeof window.changeTheme === 'function') {
                    window.changeTheme("${theme}");
                } else {
                    // fallback: 직접 CSS 적용
                    document.body.style.background = "${theme === 'dark' ? '#1a1a2e' : '#ffffff'}";
                    document.body.style.color = "${theme === 'dark' ? '#e8e8e8' : '#000000'}";
                }
            `);
        }
    }, [theme, isReady]);

    useEffect(() => {
        if (isReady) {
            executeScript(`window.changeFontSize(${fontSize});`);
        }
    }, [fontSize, isReady]);

    const processMessageData = (dataStr: string) => {
        try {
            const data = JSON.parse(dataStr);
            if (data.type === 'location' && onLocationChange) {
                onLocationChange({
                    cfi: data.cfi,
                    progress: data.progress || 0,
                    currentLocation: data.currentLocation || 0,
                    totalLocations: data.totalLocations || 0
                });
            } else if (data.type === 'ready') {
                setIsReady(true);
                setLoading(false);
                if (onReady) onReady(data.totalLocations);
            } else if (data.type === 'textSelected' && onTextSelected) {
                onTextSelected(data.cfiRange);
            } else if (data.type === 'annotation' && onAnnotation) {
                onAnnotation(data);
            } else if (data.type === 'toc' && onToc) {
                onToc(data.toc);
            }
        } catch (e) {
            // Ignore non-json or external messages
        }
    };

    const onMessage = (event: any) => {
        processMessageData(event.nativeEvent.data);
    };

    // Handle iframe messages for WebView fallback on Web
    useEffect(() => {
        if (!isWeb) return;
        const handleMsg = (event: MessageEvent) => {
            if (typeof event.data === 'string') {
                processMessageData(event.data);
            }
        };
        window.addEventListener('message', handleMsg);
        return () => window.removeEventListener('message', handleMsg);
    }, [isWeb, onLocationChange, onReady]);

    // 8초 후에도 ready가 안 오면 디버그 정보 표시
    useEffect(() => {
        if (!isReady) {
            const t = setTimeout(() => {
                setDebugError(`URL: ${bookUrl ? bookUrl.substring(0, 120) : 'null'}`);
            }, 8000);
            return () => clearTimeout(t);
        }
    }, [bookUrl, isReady]);

    const onLoadEnd = () => {
        if (!isReady) {
            const script = `window.initEpub(${JSON.stringify(bookUrl)}, ${JSON.stringify(initialCfi || '')})`;
            executeScript(script);
        }
    };

    // 네이티브 터치로 스와이프 처리 (PanGestureHandler 대신)
    const handleTouchStart = (e: GestureResponderEvent) => {
        touchStartX.current = e.nativeEvent.pageX;
        touchStartY.current = e.nativeEvent.pageY;
        touchStartTime.current = Date.now();
    };

    const handleTouchEnd = (e: GestureResponderEvent) => {
        const dx = e.nativeEvent.pageX - touchStartX.current;
        const dy = e.nativeEvent.pageY - touchStartY.current;
        const dt = Date.now() - touchStartTime.current;

        // 빠른 수평 스와이프만 인식: 세로보다 가로 거리가 2배 이상, 400ms 이내
        if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 40 && dt < 400) {
            if (dx < 0) {
                // 왼쪽 스와이프 → 다음 페이지
                executeScript(`window.goNext()`);
            } else {
                // 오른쪽 스와이프 → 이전 페이지
                executeScript(`window.goPrev()`);
            }
        }
    };

    return (
        <View
            style={styles.container}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {isWeb ? (
                <iframe
                    ref={iframeRef as any}
                    srcDoc={EPUB_TEMPLATE}
                    onLoad={onLoadEnd}
                    style={{ flex: 1, border: 'none', backgroundColor: 'transparent' }}
                />
            ) : (
                <WebView
                    ref={webviewRef}
                    originWhitelist={['*']}
                    source={{ html: EPUB_TEMPLATE }}
                    onLoadEnd={onLoadEnd}
                    onMessage={onMessage}
                    style={styles.webview}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowFileAccessFromFileURLs={true}
                    allowUniversalAccessFromFileURLs={true}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    scrollEnabled={false}
                    bounces={false}
                />
            )}

            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#000" />
                    {debugError && (
                        <Text style={{color: 'red', fontSize: 10, padding: 10, textAlign: 'center'}}>
                            {debugError}
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent'
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
    }
});

export default EpubReader;
