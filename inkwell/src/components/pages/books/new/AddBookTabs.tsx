"use client";

import { useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatIsbn } from "@/server/books/isbn";
import AddBookForm from "./AddBookForm";
import IsbnLookup from "./IsbnLookup";

type Tab = "isbn" | "manual";

export function AddBookTabs() {
  const [tab, setTab] = useState<Tab>("isbn");
  // An ISBN the lookup couldn't find, carried into the manual form. The count
  // remounts the form so a second "Fill in by hand" applies too.
  const [prefill, setPrefill] = useState({ isbn: "", count: 0 });

  const fillByHand = useCallback((isbn13: string) => {
    setPrefill((current) => ({ isbn: isbn13, count: current.count + 1 }));
    setTab("manual");
  }, []);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className='gap-6'>
      <TabsList variant="line">
        <TabsTrigger value='isbn'>ISBN</TabsTrigger>
        <TabsTrigger value='manual'>Manual</TabsTrigger>
      </TabsList>
      {/* Kept mounted, so switching tabs doesn't lose what's typed. */}
      <TabsContent value='isbn' keepMounted>
        <IsbnLookup onFillByHand={fillByHand} />
      </TabsContent>
      <TabsContent value='manual' keepMounted>
        <AddBookForm
          key={prefill.count}
          defaultIsbn={prefill.isbn ? formatIsbn(prefill.isbn) : undefined}
        />
      </TabsContent>
    </Tabs>
  );
}
