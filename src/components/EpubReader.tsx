import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { EPUB_TEMPLATE } from './EpubTemplate';

let WebView: any = null;
if (Platform.OS !== 'web') {
    WebView = require('react-native-webview').WebView;
}

export interface EpubReaderRef {
    goNext: () => void;
    goPrev: () => void;
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

interface EpubReaderProps {
    bookUrl: string;
    initialCfi?: string | null;
    onLocationChange?: (location: EpubLocationData) => void;
    onTextSelected?: (cfiRange: string) => void;
    onAnnotation?: (data: any) => void;
    onReady?: (totalLocations: number) => void;
    theme?: 'light' | 'dark';
    fontSize?: number; // percentage, e.g., 100
}

const EpubReader = forwardRef<EpubReaderRef, EpubReaderProps>(({
    bookUrl,
    initialCfi,
    onLocationChange,
    onTextSelected,
    onAnnotation,
    onReady,
    theme = 'light',
    fontSize = 100
}, ref) => {
    const webviewRef = useRef<any>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [loading, setLoading] = useState(true);
    const [isReady, setIsReady] = useState(false);

    const isWeb = Platform.OS === 'web';

    const executeScript = (script: string) => {
        if (isWeb) {
            try {
                // Ignore type error for contentWindow eval on web
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
        changeTheme: (newTheme) => executeScript(`window.changeTheme("${newTheme}")`),
        changeFontSize: (newSize) => executeScript(`window.changeFontSize(${newSize})`),
        addHighlight: (color: string) => executeScript(`window.addHighlight("${color}")`),
    }));

    // Update theme and font size when props change, but only if webview is ready
    useEffect(() => {
        if (isReady) {
            executeScript(`window.changeTheme("${theme}");`);
            executeScript(`window.changeFontSize(${fontSize});`);
        }
    }, [theme, fontSize, isReady]);

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

    const onLoadEnd = () => {
        // When webview/iframe is loaded, inject the initialization script
        if (!isReady) {
            executeScript(`window.initEpub("${bookUrl}", "${initialCfi || ''}")`);
        }
    };

    return (
        <View style={styles.container}>
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
