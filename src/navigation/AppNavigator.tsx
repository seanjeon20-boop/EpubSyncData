import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LibraryScreen from '../screens/LibraryScreen';
import ReaderScreen from '../screens/ReaderScreen';

export type RootStackParamList = {
    Library: undefined;
    Reader: { bookUrl: string; title: string; lastReadPosition: string | null | undefined };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Stack.Navigator initialRouteName="Library">
                <Stack.Screen
                    name="Library"
                    component={LibraryScreen}
                    options={{ title: 'My Epub Library' }}
                />
                <Stack.Screen
                    name="Reader"
                    component={ReaderScreen}
                    options={{ headerShown: false }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
