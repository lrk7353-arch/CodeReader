import { loginUser } from "./login-controller";

export async function runLogin(email: string, password: string) {
  const result = await loginUser({ email, password });
  return result.ok ? `signed-in:${result.userId}` : "rejected";
}
