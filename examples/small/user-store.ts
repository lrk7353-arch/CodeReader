export type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
};

const users: UserRecord[] = [
  {
    id: "user-001",
    email: "demo@example.com",
    displayName: "Demo User",
    passwordHash: "hash:demo-password"
  }
];

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  return users.find((user) => user.email === email);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return passwordHash === `hash:${password}`;
}
