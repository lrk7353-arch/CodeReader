import { findUserByEmail, verifyPassword } from "./user-store";

type LoginRequest = {
  email: string;
  password: string;
};

type LoginResult =
  | { ok: true; userId: string; displayName: string }
  | { ok: false; reason: "missing_input" | "invalid_credentials" };

export async function loginUser(request: LoginRequest): Promise<LoginResult> {
  const email = request.email.trim().toLowerCase();
  const password = request.password;

  if (!email || !password) {
    return { ok: false, reason: "missing_input" };
  }

  const user = await findUserByEmail(email);

  if (!user) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);

  if (!passwordMatches) {
    return { ok: false, reason: "invalid_credentials" };
  }

  return {
    ok: true,
    userId: user.id,
    displayName: user.displayName
  };
}
