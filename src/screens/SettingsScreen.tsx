import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, ScrollView, Alert } from 'react-native';
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
        if (!token || !owner || !repo) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        await AsyncStorage.setItem('github_token', token);
        await AsyncStorage.setItem('github_owner', owner);
        await AsyncStorage.setItem('github_repo', repo);

        // 로컬 변수 즉시 업데이트
        await loadSyncConfig();

        Alert.alert('Success', 'GitHub configuration saved successfully!', [
            { text: 'OK', onPress: () => navigation.goBack() }
        ]);
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={styles.header}>GitHub Sync Settings</Text>
                <Text style={styles.description}>
                    Enter your GitHub Personal Access Token and repository details to enable private cloud sync.
                </Text>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Personal Access Token (PAT)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="ghp_xxxxxxxxxxxx"
                        value={token}
                        onChangeText={setToken}
                        secureTextEntry
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Repository Owner (GitHub ID)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="username"
                        value={owner}
                        onChangeText={setOwner}
                        autoCapitalize="none"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Repository Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="EpubSyncData"
                        value={repo}
                        onChangeText={setRepo}
                        autoCapitalize="none"
                    />
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>Save Configuration</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>Why do I need this?</Text>
                    <Text style={styles.infoText}>
                        This information allows the app to securely push and pull your reading progress and books from your own PRIVATE GitHub repository. Your data is never shared with anyone else.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    scroll: {
        padding: 20,
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#212529',
    },
    description: {
        fontSize: 14,
        color: '#6c757d',
        marginBottom: 30,
        lineHeight: 20,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#495057',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ced4da',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    saveBtn: {
        backgroundColor: '#007aff',
        borderRadius: 8,
        padding: 15,
        alignItems: 'center',
        marginTop: 10,
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelBtn: {
        padding: 15,
        alignItems: 'center',
        marginTop: 10,
    },
    cancelBtnText: {
        color: '#6c757d',
        fontSize: 16,
    },
    infoBox: {
        marginTop: 40,
        padding: 15,
        backgroundColor: '#e9ecef',
        borderRadius: 8,
    },
    infoTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#495057',
        marginBottom: 5,
    },
    infoText: {
        fontSize: 12,
        color: '#6c757d',
        lineHeight: 18,
    }
});
