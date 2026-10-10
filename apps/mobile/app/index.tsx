import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { epley1RM, nextDoubleProgression, type DoubleProgressionConfig } from "@forja/domain";
import { useTheme, type ThemeMode } from "@/theme/theme";

/**
 * Tela inicial de verificação do scaffold.
 * Prova que:
 *  - a lógica de domínio (@forja/domain) roda em React Native;
 *  - os tokens de tema âmbar (light/dark) funcionam via NativeWind;
 *  - o override manual de tema está ligado.
 *
 * Será substituída pela navegação real (dashboard/treino/dieta/corpo) nos
 * próximos milestones.
 */
const DEMO_CONFIG: DoubleProgressionConfig = {
  minReps: 8,
  maxReps: 12,
  incrementKg: 2.5,
  workingSets: 3,
};

export default function Home() {
  const { mode, setMode } = useTheme();

  const e1rm = epley1RM(100, 8);
  const suggestion = nextDoubleProgression(
    [
      { weightKg: 50, reps: 12 },
      { weightKg: 50, reps: 12 },
      { weightKg: 50, reps: 12 },
    ],
    DEMO_CONFIG,
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="p-6 gap-5">
        <View className="gap-1">
          <Text className="text-3xl font-bold text-foreground">Habitual Fit</Text>
          <Text className="text-base text-muted-foreground">
            Fundação do app mobile — scaffold funcional.
          </Text>
        </View>

        <View className="rounded-2xl border border-border bg-card p-5 gap-2">
          <Text className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Domínio compartilhado
          </Text>
          <Text className="text-foreground">e1RM (100 kg × 8): {e1rm.toFixed(1)} kg</Text>
          <Text className="text-foreground">
            Progressão sugerida: {suggestion.weightKg} kg × {suggestion.targetReps} reps
            {suggestion.advanced ? " (subiu!)" : ""}
          </Text>
        </View>

        <View className="rounded-2xl bg-primary p-5">
          <Text className="text-lg font-semibold text-primary-foreground">Acento âmbar</Text>
          <Text className="text-primary-foreground/90">
            Cor de destaque aplicada via tokens de tema.
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Tema
          </Text>
          <View className="flex-row gap-2">
            {(["system", "light", "dark"] as ThemeMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                className={`flex-1 items-center rounded-xl border px-4 py-3 ${
                  mode === m ? "border-primary bg-accent" : "border-border bg-card"
                }`}
              >
                <Text
                  className={
                    mode === m ? "font-semibold text-accent-foreground" : "text-foreground"
                  }
                >
                  {m === "system" ? "Sistema" : m === "light" ? "Claro" : "Escuro"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
