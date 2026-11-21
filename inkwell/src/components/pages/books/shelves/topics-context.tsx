"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { TopicLists } from "@/types/shelf.type";

// The curated genres and tropes, loaded once by the shelves page, for the
// filter and the edit dialog's pickers.
const topicsContext = createContext<TopicLists | null>(null);

export const TopicsProvider = ({ topics, children }: Readonly<{ topics: TopicLists; children: ReactNode }>) => (
  <topicsContext.Provider value={topics}>{children}</topicsContext.Provider>
);

export const useTopics = () => useContext(topicsContext);
