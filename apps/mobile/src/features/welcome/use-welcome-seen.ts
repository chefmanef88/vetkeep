import { useCallback, useEffect, useState } from "react";
import { chunkedSecureStore } from "@/security/chunked-secure-store";

/**
 * Whether the welcome flow has been shown on this device.
 *
 * Stored beside the session rather than on the account, because it describes
 * this installation and not this veterinarian: reinstalling should introduce the
 * app again, and signing in on a second device should too.
 *
 * `null` while the answer is still being read. The caller must render nothing
 * in that state — flashing the welcome flow at someone who has already dismissed
 * it is worse than a few frames of blank.
 */

const KEY = "vetkeep.welcome.seen";

export function useWelcomeSeen(): { seen: boolean | null; markSeen: () => void } {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void chunkedSecureStore
      .getItem(KEY)
      .then((value) => {
        if (active) setSeen(value === "1");
      })
      .catch(() => {
        // A device that cannot read the flag should not be trapped on the
        // welcome flow forever. Treat it as seen and let them get on.
        if (active) setSeen(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const markSeen = useCallback(() => {
    // Set in state first so the flow closes immediately. Persisting is what
    // stops it returning next launch, and is not worth a spinner.
    setSeen(true);
    void chunkedSecureStore.setItem(KEY, "1").catch(() => {
      // Shown once more next launch is a small cost; blocking entry is not.
    });
  }, []);

  return { seen, markSeen };
}
