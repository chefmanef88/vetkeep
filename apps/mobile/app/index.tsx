import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/auth/session-provider";
import { AuthScreen } from "@/features/auth/auth-screen";
import { HomeScreen } from "@/features/home/home-screen";
import { MfaChallengeScreen } from "@/features/mfa/mfa-challenge-screen";
import { MfaEnrollScreen } from "@/features/mfa/mfa-enroll-screen";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { palette } from "@/ui/tokens";

export default function IndexPage() {
  const sessionState = useSession();

  if (sessionState.loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }
  if (!sessionState.session) return <AuthScreen />;
  if (sessionState.mfaState === "enroll") return <MfaEnrollScreen />;
  if (sessionState.mfaState === "challenge") return <MfaChallengeScreen />;
  if (!sessionState.profile) return <OnboardingScreen />;
  return <HomeScreen />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.ground
  }
});
