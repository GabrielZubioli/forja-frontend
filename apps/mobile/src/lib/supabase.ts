import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

/**
 * Client Supabase para React Native.
 *
 * Usado para **autenticação** e como backend de upload do PowerSync (as leituras
 * de dados passam pelo SQLite local do PowerSync, não por aqui).
 *
 * ⚠️ SecureStore tem limite de ~2 KB por valor; o token de sessão pode passar
 * disso. Antes de produção, trocar por um adaptador "LargeSecureStore" (cifra a
 * sessão com uma chave no SecureStore e guarda o blob no AsyncStorage) —
 * ver docs do Supabase para RN. Milestone 1.
 */
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Variáveis EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausentes. Veja apps/mobile/.env.example.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
