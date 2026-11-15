import "server-only";
import { prisma } from "@/server/db";
import type { UserProfile } from "@/types/auth.type";
import type { Db } from "@/types/server.type";

export function upsertUser({ id, email, name, photoUrl }: UserProfile, db: Db = prisma) {
  return db.user.upsert({
    where: { id },
    create: { id, email, name, photoUrl },
    update: { email, photoUrl },
  });
}

export function findUserById(id: string, db: Db = prisma) {
  return db.user.findUnique({ where: { id } });
}
