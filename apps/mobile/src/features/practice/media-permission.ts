import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";

/**
 * Asking for the camera or the photo library, including the second time.
 *
 * iOS prompts once. After that the request resolves immediately as denied and
 * nothing appears on screen, so a vet who tapped "Don't Allow" the first time —
 * or who was holding an animal and dismissed it — is stuck: the button does
 * nothing and the message tells them to grant access they cannot reach from
 * here. That is what "VetKeep doesn't have access" looks like from the inside.
 *
 * `canAskAgain` is how the two cases are told apart. Freshly denied is worth a
 * sentence; permanently denied is worth a way out, which on iOS is only ever
 * the Settings app.
 *
 * Returns true when the picker may be opened.
 */
export async function ensureMediaPermission(source: "camera" | "library"): Promise<boolean> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (permission.granted) return true;

  const what = source === "camera" ? "the camera" : "your photos";

  if (permission.canAskAgain) {
    // The prompt was shown and declined. Saying what it is for is more use than
    // repeating that it was refused.
    Alert.alert(
      source === "camera" ? "Camera access needed" : "Photo access needed",
      source === "camera"
        ? "VetKeep uses the camera to photograph the animal. Nothing is saved to your phone's photo gallery."
        : "VetKeep needs to read a photo or video you choose. It only reads the one you pick.",
      [{ text: "OK" }]
    );
    return false;
  }

  // iOS will not ask again, so the only route is Settings. Offering to open it
  // is the difference between a dead end and two taps.
  Alert.alert(
    "Access is turned off",
    `VetKeep cannot reach ${what} because permission was declined earlier. ` +
      `iOS only asks once, so it has to be turned back on in Settings.`,
    [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => void Linking.openSettings() }
    ]
  );
  return false;
}
