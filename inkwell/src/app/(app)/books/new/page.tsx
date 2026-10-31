import AddBookForm from "@/components/AddBookForm";
import { requireUser } from "@/server/auth/auth.guard";

export default async function AddBookPage() {
  await requireUser();

  return (
    <div className='max-w-xl mx-auto flex flex-col gap-4'>
      <h1 className='text-2xl font-semibold'>Add a book</h1>
      <AddBookForm />
    </div>
  );
}
