import type { ShelfBook } from "@/server/library/library.service";

export interface ShelfType {
  books: ShelfBook[];
  page: number;
  pageCount: number;
  total: number;
  firstIndex: number;
}

export interface UserType {
  name: string | null;
  id: string;
  email: string;
  photoUrl: string | null;
  age: number | null;
  createdAt: Date;
  updatedAt: Date;
}
