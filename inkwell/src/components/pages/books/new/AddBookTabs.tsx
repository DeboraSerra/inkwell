"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AddBookForm from "./AddBookForm";

// One tab left: the form searches by title and looks up ISBNs itself. The
// tabs go in 5a4.
export function AddBookTabs() {
  return (
    <Tabs defaultValue='manual' className='gap-6'>
      <TabsList variant="line">
        <TabsTrigger value='manual'>Manual</TabsTrigger>
      </TabsList>
      <TabsContent value='manual'>
        <AddBookForm lookups />
      </TabsContent>
    </Tabs>
  );
}
