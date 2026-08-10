import * as LocalAuthentication from "expo-local-authentication";

/**
 * Re-authenticate before an action that is hard to undo or that sends clinical
 * information out of the application.
 *
 * This deliberately reuses the device's own biometric or passcode rather than
 * introducing an application PIN. A second secret would be another thing to
 * choose, remember, rotate and recover, and the recovery path is the part that
 * usually ends up weakening it. The device credential is already enrolled,
 * already trusted to unlock the app (see local-unlock-gate), and its recovery
 * is the operating system's problem rather than ours.
 *
 * Returns true when the vet confirmed. A device with nothing enrolled returns
 * true as well: refusing would lock a veterinarian out of their own records on
 * a phone with no lock screen, which is a worse failure than the one this
 * guards against. The action is audited server-side regardless.
 */
export async function confirmWithDevice(prompt: string): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) return true;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    // Falling back to the device passcode keeps a wet or gloved hand from
    // blocking the action entirely.
    disableDeviceFallback: false,
    cancelLabel: "Cancel"
  });

  return result.success;
}
