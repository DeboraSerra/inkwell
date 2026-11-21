"use client";

import { useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddBookForm from "./AddBookForm";
import SearchLookup from "./SearchLookup";
import type { AddBookTab } from "@/types/ui.type";

export function AddBookTabs() {
  const [tab, setTab] = useState<AddBookTab>("search");
  // Remounts the manual form, so "Fill in by hand" starts it blank.
  const [manualCount, setManualCount] = useState(0);

  const fillByHand = useCallback(() => {
    setManualCount((count) => count + 1);
    setTab("manual");
  }, []);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as AddBookTab)} className='gap-6'>
      <TabsList variant="line">
        <TabsTrigger value='search'>Search</TabsTrigger>
        <TabsTrigger value='manual'>Manual</TabsTrigger>
      </TabsList>
      {/* Kept mounted, so switching tabs doesn't lose what's typed. */}
      <TabsContent value='search' keepMounted>
        <SearchLookup onFillByHand={fillByHand} />
      </TabsContent>
      <TabsContent value='manual' keepMounted>
        <AddBookForm key={manualCount} lookups />
      </TabsContent>
    </Tabs>
  );
}
