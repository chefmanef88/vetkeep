import { Redirect } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/auth/session-provider";
import { AuthScreen } from "@/features/auth/auth-screen";
import { MfaChallengeScreen } from "@/features/mfa/mfa-challenge-screen";
import { MfaEnrollScreen } from "@/features/mfa/mfa-enroll-screen";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { WelcomeScreen } from "@/features/welcome/welcome-screen";
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

  if (!sessionState.session) return <SignedOut />;
  if (sessionState.mfaState === "enroll") return <MfaEnrollScreen />;
  if (sessionState.mfaState === "challenge") return <MfaChallengeScreen />;
  if (!sessionState.profile) return <OnboardingScreen />;

  // Everything before this point is a screen with no tab bar: there is nothing
  // to move between until there is a practice to move around in. Once there is,
  // the tab group takes over — and it checks the same three conditions itself,
  // so arriving there by any other route cannot skip them.
  return <Redirect href="/home" />;
}

/**
 * Everything before a session exists: the introduction, then the sign-in form.
 *
 * The introduction was shown once per installation and remembered in the
 * keychain. It is now shown every time there is no session, which is what
 * signing out should produce — you land back at the beginning rather than on a
 * bare form. Skip is one tap for anyone who does not want it.
 *
 * The state lives here rather than in the page above so it resets by itself:
 * this component unmounts the moment a session appears and mounts again when
 * one goes away, so a sign-out returns to the first slide with nothing to clear.
 */
function SignedOut() {
  const [introDone, setIntroDone] = useState(false);
  if (!introDone) return <WelcomeScreen onDone={() => setIntroDone(true)} />;
  return <AuthScreen />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.ground
  }
});
