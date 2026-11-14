import { BookFormat } from "@/generated/prisma/enums";
import { Smartphone, Book, Headphones } from "lucide-react";
import React from "react";

export const FORMAT_LABELS: Record<BookFormat, {title: string, label: React.ReactNode}> = {
  [BookFormat.EBOOK]: {title:"Ebook", label: <Smartphone size={14}/>},
  [BookFormat.PHYSICAL]: {title:"Physical", label: <Book size={14}/>},
  [BookFormat.AUDIO]: {title:"Audiobook", label: <Headphones size={14}/>},
};
