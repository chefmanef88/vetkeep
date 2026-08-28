import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { getMobileEnv } from "@/lib/env";
import { Wash } from "@/ui/wash";
import {
  fonts,
  hairline,
  palette,
  radiusControl,
  radiusPill,
  shadowCard,
  space,
  touchTarget,
  type
} from "@/ui/tokens";

/**
 * Signing in, creating an account, and getting back in after forgetting a
 * password — one screen with a mode, as before.
 *
 * The reference design this follows leads with a single prominent action and
 * puts the alternatives beneath a rule. That shape is kept. What is not kept is
 * its row of provider buttons: no OAuth provider is configured on this project,
 * and Sign in with Apple additionally needs a developer account that does not
 * exist yet. A sign-in button that signs nobody in is worse than no button, so
 * the divider and the alternatives below it hold the mode toggle for now, and
 * providers drop into the same place when they are real.
 */

type Mode = "signin" | "signup" | "recover";

const COPY: Record<Mode, { heading: string; lead: string; action: string }> = {
  signin: {
    heading: "Welcome back",
    lead: "Sign in to reach your folders, your records and the day's work.",
    action: "Continue with email"
  },
  signup: {
    heading: "Create your account",
    lead: "For verified veterinary professionals. Accounts are personal — records are signed in your name, so they cannot be shared.",
    action: "Create account"
  },
  recover: {
    heading: "Reset your password",
    lead: "We will send a link to your email address. Opening it lets you set a new password, then you can sign in here.",
    action: "Send the link"
  }
};

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = COPY[mode];
  const emailLooksReal = email.includes("@") && email.trim().length > 3;
  const ready = mode === "recover" ? emailLooksReal : emailLooksReal && password.length >= 12;

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);

    if (mode === "recover") {
      // The link lands on the web application, which already has a route that
      // verifies the token. Handling it in the app instead would mean native
      // deep links, and the reset is a once-in-a-while event that does not
      // justify that surface.
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${getMobileEnv().webBaseUrl}/auth/confirm`
      });
      setBusy(false);
      if (sendError) {
        setError(sendError.message);
        return;
      }
      // Deliberately the same words whether or not the address is registered:
      // saying "no such account" tells anyone holding a list which of their
      // addresses belong to veterinarians.
      setMessage("If that address has an account, the link is on its way.");
      return;
    }

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === "signup") setMessage("Confirm the account from your email, then sign in.");
  }

  return (
    <View style={styles.screen}>
      <Wash name="brand" diameter={300} offsetY={-140} />
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Text style={styles.heading}>{copy.heading}</Text>
          <Text style={styles.lead}>{copy.lead}</Text>
        </View>

        <View style={styles.fields}>
          <Labelled label="Email">
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@practice.com"
              placeholderTextColor={palette.quiet}
              style={styles.input}
            />
          </Labelled>

          {mode === "recover" ? null : (
            <Labelled
              label="Password"
              // Kept under the field rather than inside it: a placeholder
              // carrying the rule disappears at the moment of typing, which is
              // exactly when the rule is needed.
              helper={mode === "signup" ? "At least 12 characters." : undefined}
            >
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder="••••••••••••"
                placeholderTextColor={palette.quiet}
                style={styles.input}
              />
            </Labelled>
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={busy || !ready}
          style={({ pressed }) => [
            styles.primary,
            shadowCard,
            (busy || !ready) && styles.primaryOff,
            pressed && styles.pressed
          ]}
          onPress={() => void submit()}
        >
          <Text style={styles.primaryLabel}>{busy ? "Working…" : copy.action}</Text>
        </Pressable>

        {mode === "signin" ? (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}
            onPress={() => go("recover")}
          >
            <Text style={styles.quietLabel}>Forgot your password?</Text>
          </Pressable>
        ) : null}

        <View style={styles.dividerRow}>
          <View style={styles.rule} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.rule} />
        </View>

        {/* Where provider buttons go once a provider exists. */}
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.alternate, pressed && styles.pressed]}
          onPress={() => go(mode === "signin" ? "signup" : "signin")}
        >
          <Text style={styles.alternateLabel}>
            {mode === "signin"
              ? "Create a veterinarian account"
              : mode === "signup"
                ? "I already have an account"
                : // "I already have an account" is nonsense to someone resetting
                  // the password on the account they are holding.
                  "Back to sign in"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Labelled({
  label,
  helper,
  children
}: {
  label: string;
  helper?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.labelled}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.ground },
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: space.xl, gap: space.lg },
  head: { gap: space.sm, paddingBottom: space.sm },
  heading: { ...type.hero, color: palette.ink },
  lead: { ...type.heroLead, color: palette.quiet },
  fields: { gap: space.lg },
  labelled: { gap: 6 },
  label: { ...type.label, color: palette.ink },
  input: {
    minHeight: touchTarget,
    borderRadius: radiusControl,
    backgroundColor: palette.surface,
    borderWidth: hairline,
    borderColor: palette.line,
    paddingHorizontal: space.lg,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: palette.ink
  },
  helper: { ...type.small, fontSize: 12, color: palette.quiet },
  error: { ...type.small, color: palette.red },
  message: { ...type.small, color: palette.brandInk },
  primary: {
    minHeight: touchTarget,
    borderRadius: radiusPill,
    backgroundColor: palette.brand,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryOff: { opacity: 0.45 },
  primaryLabel: { fontFamily: fonts.semibold, fontSize: 16, color: palette.surface },
  quiet: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  quietLabel: { ...type.action, color: palette.brandInk },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  rule: { flex: 1, height: hairline, backgroundColor: palette.line },
  dividerText: { ...type.small, fontSize: 12, color: palette.quiet },
  alternate: {
    minHeight: touchTarget,
    borderRadius: radiusPill,
    backgroundColor: palette.surface,
    borderWidth: hairline,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center"
  },
  alternateLabel: { fontFamily: fonts.semibold, fontSize: 15, color: palette.ink },
  pressed: { opacity: 0.85 }
});
