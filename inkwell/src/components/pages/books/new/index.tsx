import AddBookForm from "./AddBookForm";

export const BooksNew = () => {
  return (
      <div className='max-w-xl mx-auto flex flex-col gap-4'>
        <h1 className='text-2xl font-semibold'>Add a book</h1>
        <AddBookForm />
      </div>
    );
}