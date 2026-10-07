export type SettingsUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
};

export type UpdateMePayload = {
  name?: string;
  phone?: string;
  password?: string;
  confirm_password?: string;
  unlock_token: string;
};

export type SettingsUnlockStartResult =
  | {
      ok: true;
      data: {
        ok: boolean;
        expiresInSeconds: number;
        resendCooldownSeconds: number;
      };
    }
  | { ok: false; status: number; message?: string };

export type SettingsUnlockResendResult =
  | {
      ok: true;
      data: {
        ok: boolean;
        expiresInSeconds: number;
        resendCooldownSeconds: number;
        resendsRemaining: number;
      };
    }
  | { ok: false; status: number; message?: string };

export type SettingsUnlockVerifyResult =
  | {
      ok: true;
      data: {
        ok: boolean;
        unlockToken: string;
        unlockExpiresInSeconds: number;
      };
    }
  | { ok: false; status: number; message?: string };
