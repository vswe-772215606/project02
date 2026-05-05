import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth.store';
import { useSettingsStore } from '../stores/settings.store';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { NewOrderScreen } from '../screens/NewOrderScreen';
import { OrderEditScreen } from '../screens/OrderEditScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ServerSetupScreen } from '../screens/ServerSetupScreen';

export type RootStackParamList = {
  ServerSetup: undefined;
  Login: undefined;
  Home: undefined;
  NewOrder: undefined;
  OrderEdit: { orderId: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const user = useAuthStore((s) => s.user);
  const serverUrl = useSettingsStore((s) => s.serverUrl);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {!serverUrl ? (
          <Stack.Screen name="ServerSetup" component={ServerSetupScreen} />
        ) : user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="NewOrder" component={NewOrderScreen} />
            <Stack.Screen name="OrderEdit" component={OrderEditScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
