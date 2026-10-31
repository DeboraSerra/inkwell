import "server-only";
import { prisma, type Db } from "@/server/db";

export type UserProfile = { id: string; email: string; name?: string | null };

export function upsertUser({ id, email, name }: UserProfile, db: Db = prisma) {
  return db.user.upsert({
    where: { id },
    create: { id, email, name },
    update: { email },
  });
}

export function findUserById(id: string, db: Db = prisma) {
  return db.user.findUnique({ where: { id } });
}
