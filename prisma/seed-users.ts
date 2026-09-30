import type { Role } from "../src/generated/prisma/enums";

// Initial team. Passwords are never stored here: each person's initial
// password is read from the env var named in `passwordEnv`.
export const INITIAL_USERS: { name: string; email: string; role: Role; passwordEnv: string }[] = [
  { name: "Gautami Varma", email: "admin@wonderlearning.in", role: "ADMIN", passwordEnv: "SEED_PASSWORD_GAUTAMI" },
  { name: "Viren Dogra", email: "virend@wonderlearning.in", role: "SALES_HEAD", passwordEnv: "SEED_PASSWORD_VIREN" },
  { name: "Rohan Jayde", email: "rj@wonderlearning.in", role: "SALES_MANAGER", passwordEnv: "SEED_PASSWORD_ROHAN" },
  { name: "Vinay Choure", email: "vinay.wonderlearning@gmail.com", role: "SALES_MANAGER", passwordEnv: "SEED_PASSWORD_VINAY" },
  { name: "Harshal Jadhav", email: "harshal.wonderlearning@gmail.com", role: "SALES_MANAGER", passwordEnv: "SEED_PASSWORD_HARSHAL" },
];
