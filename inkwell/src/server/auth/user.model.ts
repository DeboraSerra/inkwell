import "server-only";
import { prisma, type Db } from "@/server/db";

export type UserProfile = {
  id: string;
  email: string;
  name?: string | null;
  photoUrl?: string | null;
};

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
