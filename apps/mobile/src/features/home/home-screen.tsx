import { useRouter } from "expo-router";
import { useState } from "react";
import { registerCurrentDevice } from "@/device/device-registry";
import { supabase } from "@/lib/supabase";
import { Body, ErrorText, PrimaryButton, Screen, SecondaryButton, Title } from "@/ui/components";
import { useSession } from "@/auth/session-provider";

export function HomeScreen() {
  const { profile } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Screen>
      <Title>{profile?.full_name ?? "VetKeep"}</Title>
      <Body>Account status: {profile?.account_status}</Body>
      <Body>Licence verification: {profile?.license_verified ? "verified" : "pending"}</Body>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {message ? <Body>{message}</Body> : null}
      <PrimaryButton label="Start work" onPress={() => router.push("/practice/today")} />
      <SecondaryButton
        label="Register or refresh this device"
        onPress={() => {
          setError(null);
          setMessage(null);
          void registerCurrentDevice()
            .then(() => setMessage("Device registration refreshed."))
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : "Registration failed")
            );
        }}
      />
      <SecondaryButton
        label="Sign out"
        onPress={() => void supabase.auth.signOut({ scope: "local" })}
      />
    </Screen>
  );
}
