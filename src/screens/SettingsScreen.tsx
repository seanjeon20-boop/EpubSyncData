import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ScrollView, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { loadSyncConfig } from '../githubSync';

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

interface Props {
    navigation: SettingsScreenNavigationProp;
}

export default function SettingsScreen({ navigation }: Props) {
    const [token, setToken] = useState('');
    const [owner, setOwner] = useState('');
    const [repo, setRepo] = useState('');

    useEffect(() => {
        async function load() {
            setToken(await AsyncStorage.getItem('github_token') || '');
            setOwner(await AsyncStorage.getItem('github_owner') || '');
            setRepo(await AsyncStorage.getItem('github_repo') || '');
        }
        load();
    }, []);

    const handleSave = async () => {
        console.log("Save button pressed"); // 디버깅용 로그
        
        if (!token || !owner || !repo) {
            const msg = 'Please fill in all fields';
            if (Platform.OS === 'web') {
                window.alert(msg);
            } else {
                Alert.alert('Error', msg);
            }
            return;
        }

        try {
            await AsyncStorage.setItem('github_token', token);
            await AsyncStorage.setItem('github_owner', owner);
            await AsyncStorage.setItem('github_repo', repo);

            // 로컬 변수 즉시 업데이트
            await loadSyncConfig();

            const successMsg = 'GitHub configuration saved successfully!';
            if (Platform.OS === 'web') {
                window.alert(successMsg);
                navigation.goBack();
            } else {
                Alert.alert('Success', successMsg, [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            }
        } catch (error) {
            console.error("Save error:", error);
            if (Platform.OS === 'web') {
                window.alert("Failed to save settings.");
            }
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.headerContainer}>
                    <Text style={styles.header}>GitHub Sync Settings</Text>
                    <Text style={styles.description}>
                        Enter your GitHub Personal Access Token and repository details to enable private cloud sync.
                    </Text>
                </View>

                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Personal Access Token (PAT)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="ghp_xxxxxxxxxxxx"
                            placeholderTextColor="#adb5bd"
                            value={token}
                            onChangeText={setToken}
                            secureTextEntry
                            autoCorrect={false}
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Repository Owner (GitHub ID)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="username"
                            placeholderTextColor="#adb5bd"
                            value={owner}
                            onChangeText={setOwner}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Repository Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="EpubSyncData"
                            placeholderTextColor="#adb5bd"
                            value={repo}
                            onChangeText={setRepo}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    <TouchableOpacity 
                        style={styles.saveBtn} 
                        onPress={handleSave}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.saveBtnText}>Save Configuration</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.cancelLink} 
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.cancelLinkText}>Cancel</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.infoFooter}>
                    <Text style={styles.infoText}>
                        Your data is stored securely in your own private repository. 
                        The app never sees your books unless you sync them.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    scroll: {
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 40,
    },
    headerContainer: {
        marginBottom: 32,
    },
    header: {
        fontSize: 28,
        fontWeight: '800',
        color: '#1a1a1a',
        marginBottom: 12,
        letterSpacing: -0.5,
    },
    description: {
        fontSize: 15,
        color: '#666',
        lineHeight: 22,
        fontWeight: '400',
    },
    form: {
        width: '100%',
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#444',
        marginBottom: 10,
        marginLeft: 2,
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#E1E4E8',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1a1a1a',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    saveBtn: {
        backgroundColor: '#007AFF',
        borderRadius: 14,
        paddingVertical: 18,
        alignItems: 'center',
        marginTop: 12,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    saveBtnText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    cancelLink: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    cancelLinkText: {
        color: '#8E8E93',
        fontSize: 16,
        fontWeight: '500',
    },
    infoFooter: {
        marginTop: 20,
        paddingTop: 30,
        borderTopWidth: 1,
        borderTopColor: '#F2F2F7',
    },
    infoText: {
        fontSize: 13,
        color: '#AEAEB2',
        textAlign: 'center',
        lineHeight: 18,
    }
});
