import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { deviceRegistrationSchema } from "@vetkeep/validation";
import { supabase } from "@/lib/supabase";

const DEVICE_ID_KEY = "vetkeep.device.id";

async function getDeviceId() {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
  return created;
}

export async function registerCurrentDevice() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    throw new Error("VetKeep mobile device registration supports iOS and Android only");
  }

  const input = deviceRegistrationSchema.parse({
    deviceId: await getDeviceId(),
    deviceName: Device.deviceName ?? `${Device.brand ?? "Mobile"} device`,
    platform: Platform.OS,
    appVersion: Application.nativeApplicationVersion ?? null
  });

  const deviceArgs = {
    p_device_id: input.deviceId,
    p_device_name: input.deviceName,
    p_platform: input.platform,
    ...(input.appVersion ? { p_app_version: input.appVersion } : {})
  };

  const { error } = await supabase.rpc("register_current_device", deviceArgs);
  if (error) throw error;
}
