import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMfa } from "@/lib/auth/require-mfa";
import { SignOutButton } from "./sign-out-button";
import { RevokeDeviceButton } from "./revoke-device-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase } = await requireMfa();

  const { data: profile, error: profileError } = await supabase
    .from("vets")
    .select("full_name, license_number, license_verified, account_status")
    .maybeSingle();
  if (profileError) throw new Error("Unable to load the veterinarian profile.");
  if (!profile) redirect("/onboarding");

  const { data: devices, error: devicesError } = await supabase
    .from("vet_devices")
    .select("id, device_name, platform, app_version, last_seen_at, revoked_at")
    .order("created_at", { ascending: false });
  if (devicesError) throw new Error("Unable to load registered devices.");

  return (
    <main className="stack">
      <section className="card stack">
        <p className="muted">Authenticated workspace</p>
        <h1>{profile.full_name}</h1>
        <p>Account: {profile.account_status}</p>
        <p>
          Licence: {profile.license_number ?? "Not supplied"} —{" "}
          {profile.license_verified ? "verified" : "verification pending"}
        </p>
        <div className="actions">
          <Link className="button" href="/practice/clients">
            Open practice
          </Link>
          <SignOutButton />
        </div>
      </section>
      <section className="card stack">
        <h2>Registered mobile devices</h2>
        <p className="muted">
          Revoking a device also terminates all other refresh-token sessions. Existing access tokens
          expire within 15 minutes.
        </p>
        {devices?.length ? (
          <ul>
            {devices.map((device) => (
              <li key={device.id} className="device-row">
                <div>
                  <strong>{device.device_name}</strong> · {device.platform} ·{" "}
                  {device.revoked_at ? "revoked" : "active"}
                  {device.last_seen_at ? (
                    <span className="muted">
                      {" "}
                      · last seen {new Date(device.last_seen_at).toLocaleString()}
                    </span>
                  ) : null}
                </div>
                {!device.revoked_at ? (
                  <RevokeDeviceButton deviceId={device.id} deviceName={device.device_name} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No mobile devices registered yet.</p>
        )}
      </section>
    </main>
  );
}
