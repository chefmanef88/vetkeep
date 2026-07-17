export type MfaEnrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};

type MfaFactor = {
  id: string;
  factor_type: string;
  status: string;
};

type MfaError = { message: string };

type MfaGateway = {
  listFactors: () => Promise<{
    data: { all: MfaFactor[] } | null;
    error: MfaError | null;
  }>;
  unenroll: (factorId: string) => Promise<{ error: MfaError | null }>;
  enrollTotp: () => Promise<{
    data: {
      id: string;
      totp: { qr_code: string; secret: string; uri: string };
    } | null;
    error: MfaError | null;
  }>;
};

const enrollmentByUser = new Map<string, Promise<MfaEnrollment>>();

async function createEnrollment(gateway: MfaGateway): Promise<MfaEnrollment> {
  const factorsResult = await gateway.listFactors();
  if (factorsResult.error) throw new Error(factorsResult.error.message);

  const unverifiedTotp =
    factorsResult.data?.all.filter(
      (factor) => factor.factor_type === "totp" && factor.status === "unverified"
    ) ?? [];

  for (const factor of unverifiedTotp) {
    const removal = await gateway.unenroll(factor.id);
    if (removal.error) throw new Error(removal.error.message);
  }

  const enrollment = await gateway.enrollTotp();
  if (enrollment.error) throw new Error(enrollment.error.message);
  if (!enrollment.data) throw new Error("MFA enrollment returned no data.");

  return {
    factorId: enrollment.data.id,
    qrCode: enrollment.data.totp.qr_code,
    secret: enrollment.data.totp.secret,
    uri: enrollment.data.totp.uri
  };
}

/**
 * Shares one in-flight enrollment per authenticated user. React Strict Mode
 * intentionally re-runs effects in development; without this guard the page can
 * create an orphan factor and then fail when the second request reuses the same
 * friendly name.
 */
export function prepareMfaEnrollment(userId: string, gateway: MfaGateway): Promise<MfaEnrollment> {
  const existing = enrollmentByUser.get(userId);
  if (existing) return existing;

  const pending = createEnrollment(gateway);
  enrollmentByUser.set(userId, pending);

  void pending.catch(() => {
    if (enrollmentByUser.get(userId) === pending) enrollmentByUser.delete(userId);
  });

  return pending;
}

export function clearPreparedMfaEnrollment(userId: string): void {
  enrollmentByUser.delete(userId);
}

export function resetMfaEnrollmentCacheForTests(): void {
  enrollmentByUser.clear();
}
