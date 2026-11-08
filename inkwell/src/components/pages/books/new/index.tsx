import { AddBookTabs } from "./AddBookTabs";

export const BooksNew = () => {
  return (
    <div className='flex flex-col gap-4'>
      <h1 className='text-2xl font-semibold'>Add a book</h1>
      <AddBookTabs />
    </div>
  );
};
