import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareMfaEnrollment, resetMfaEnrollmentCacheForTests } from "./mfa-enrollment";

const enrollmentData = {
  id: "factor-new",
  totp: {
    qr_code: "data:image/svg+xml;base64,qr",
    secret: "secret",
    uri: "otpauth://totp/VetKeep"
  }
};

beforeEach(() => resetMfaEnrollmentCacheForTests());

describe("prepareMfaEnrollment", () => {
  it("shares one in-flight enrollment for Strict Mode effect replays", async () => {
    let resolveList!: (value: { data: { all: never[] }; error: null }) => void;
    const listPromise = new Promise<{ data: { all: never[] }; error: null }>((resolve) => {
      resolveList = resolve;
    });

    const listFactors = vi.fn(() => listPromise);
    const enrollTotp = vi.fn(async () => ({ data: enrollmentData, error: null }));
    const unenroll = vi.fn(async () => ({ error: null }));
    const gateway = { listFactors, enrollTotp, unenroll };

    const first = prepareMfaEnrollment("user-1", gateway);
    const second = prepareMfaEnrollment("user-1", gateway);
    resolveList({ data: { all: [] }, error: null });

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        factorId: "factor-new",
        qrCode: enrollmentData.totp.qr_code,
        secret: enrollmentData.totp.secret,
        uri: enrollmentData.totp.uri
      },
      {
        factorId: "factor-new",
        qrCode: enrollmentData.totp.qr_code,
        secret: enrollmentData.totp.secret,
        uri: enrollmentData.totp.uri
      }
    ]);
    expect(listFactors).toHaveBeenCalledTimes(1);
    expect(enrollTotp).toHaveBeenCalledTimes(1);
  });

  it("removes an orphaned unverified TOTP factor before enrolling", async () => {
    const unenroll = vi.fn(async () => ({ error: null }));
    const enrollTotp = vi.fn(async () => ({ data: enrollmentData, error: null }));

    await prepareMfaEnrollment("user-2", {
      listFactors: async () => ({
        data: {
          all: [
            { id: "orphan", factor_type: "totp", status: "unverified" },
            { id: "phone", factor_type: "phone", status: "unverified" }
          ]
        },
        error: null
      }),
      unenroll,
      enrollTotp
    });

    expect(unenroll).toHaveBeenCalledTimes(1);
    expect(unenroll).toHaveBeenCalledWith("orphan");
    expect(enrollTotp).toHaveBeenCalledTimes(1);
  });

  it("clears a failed preparation so a retry can succeed", async () => {
    const listFactors = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "temporary failure" } })
      .mockResolvedValueOnce({ data: { all: [] }, error: null });
    const enrollTotp = vi.fn(async () => ({ data: enrollmentData, error: null }));
    const gateway = {
      listFactors,
      unenroll: vi.fn(async () => ({ error: null })),
      enrollTotp
    };

    await expect(prepareMfaEnrollment("user-3", gateway)).rejects.toThrow("temporary failure");
    await expect(prepareMfaEnrollment("user-3", gateway)).resolves.toMatchObject({
      factorId: "factor-new"
    });
    expect(listFactors).toHaveBeenCalledTimes(2);
    expect(enrollTotp).toHaveBeenCalledTimes(1);
  });
});
