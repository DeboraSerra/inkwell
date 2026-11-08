import { FieldSeparator } from "@/components/ui/field";
import EmailSignInForm from "./EmailSignInForm";
import GoogleSignInButton from "./GoogleSignInButton";

export const Login = ({ next }: { next: string | undefined }) => {
  return (
    <main className='flex flex-1 items-center justify-center px-4'>
      <div className='w-full max-w-sm space-y-6 text-center'>
        <div className='space-y-2'>
          <h1 className='text-3xl font-semibold'>Inkwell</h1>
          <p className='text-muted-foreground'>Your reading journal.</p>
        </div>
        <EmailSignInForm next={next} />
        <FieldSeparator>or</FieldSeparator>
        <GoogleSignInButton next={next} />
      </div>
    </main>
  );
};
