import type { Metadata } from "next";
import Link from "next/link";

// Public, so the Chrome Web Store listing can link to it. Keep it true to what
// the app and extension actually do: update it when that changes (for example
// when AI enrichment arrives in Phase 5).
export const metadata: Metadata = {
  title: "Privacy · Inkwell",
  description: "What Inkwell and its Kindle import extension collect, and where it goes.",
};

const LAST_UPDATED = "8 November 2026";

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className='space-y-2'>
      <h2 className='text-lg font-semibold'>{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className='mx-auto w-full max-w-2xl space-y-8 px-4 py-10 text-sm leading-relaxed'>
      <header className='space-y-2'>
        <h1 className='text-3xl font-semibold'>Privacy</h1>
        <p className='text-muted-foreground'>Last updated {LAST_UPDATED}</p>
        <p>
          Inkwell is a personal reading journal. This page explains what it stores, what its Kindle
          import extension reads, and where that data goes. Inkwell has no ads and no analytics, and
          it doesn’t sell or share your data.
        </p>
      </header>

      <Section title='Your account'>
        <p>
          You sign in with Google or with an email and password, through Firebase Authentication.
          Inkwell keeps your email address, and your name and profile photo when Google provides
          them, so it can show who’s signed in. Your session is kept in a secure cookie.
        </p>
      </Section>

      <Section title='Your library'>
        <p>
          Inkwell stores the books you add, and for each one the list it’s on, the formats you own,
          your read dates, and any cover, authors or page count you edit. Only you can see your
          library.
        </p>
        <p>
          When you look up a book by ISBN or search for one, the ISBN or the words you typed are sent
          to Open Library and Google Books to find its details and cover. Nothing about you is sent
          with them.
        </p>
      </Section>

      <Section title='The Kindle import extension'>
        <p>
          The Inkwell Kindle import extension for Chrome runs only when you click it, and only on
          the page you clicked it on. On Amazon’s “Manage Your Content and Devices” list, it reads
          each item’s title, authors, cover image address and Amazon identifier (ASIN). It sends
          them to your Inkwell address, using the API token you created in Inkwell’s settings, to
          add them to your library. Personal documents from the Docs tab are kept private to you.
        </p>
        <p>
          The extension stores your Inkwell address and API token in Chrome’s local storage on your
          computer. It doesn’t read any other page, your browsing history, or your Amazon account
          details, and it sends nothing anywhere except your Inkwell address.
        </p>
        <p>
          API tokens are stored by Inkwell only as a one-way hash, and you can revoke one at any time
          in Settings.
        </p>
      </Section>

      <Section title='Where your data is kept'>
        <p>
          Inkwell runs on Vercel, and your data is stored in a Postgres database hosted by Supabase.
          Sign-in is handled by Google’s Firebase Authentication. Each of them processes data only to
          provide that service.
        </p>
      </Section>

      <Section title='Deleting your data'>
        <p>
          You can delete any book from your library, and revoke API tokens, in the app at any time.
          To delete your whole account and everything in it, contact the developer through the
          extension’s Chrome Web Store listing.
        </p>
      </Section>

      <p>
        <Link href='/' className='underline'>
          Back to Inkwell
        </Link>
      </p>
    </main>
  );
}
