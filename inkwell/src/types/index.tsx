import type { ShelfBook } from "./books.type";
import type { PageSize } from "./shelf.type";

export interface ShelfType {
  books: ShelfBook[];
  page: number;
  pageCount: number;
  pageSize: PageSize;
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
