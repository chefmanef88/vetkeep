import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/auth/session-provider";
import { AuthScreen } from "@/features/auth/auth-screen";
import { HomeScreen } from "@/features/home/home-screen";
import { MfaChallengeScreen } from "@/features/mfa/mfa-challenge-screen";
import { MfaEnrollScreen } from "@/features/mfa/mfa-enroll-screen";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { WelcomeScreen } from "@/features/welcome/welcome-screen";
import { useWelcomeSeen } from "@/features/welcome/use-welcome-seen";
import { palette } from "@/ui/tokens";

export default function IndexPage() {
  const sessionState = useSession();
  // Read before the session resolves, so a first launch does not show the sign-in
  // form for a frame and then replace it with the welcome flow.
  const { seen, markSeen } = useWelcomeSeen();

  if (sessionState.loading || seen === null) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }
  // Only ahead of the sign-in form. Someone with a session has been here before,
  // and an introduction after the fact is an obstacle.
  if (!sessionState.session && !seen) return <WelcomeScreen onDone={markSeen} />;
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
