import { revokeApiToken } from "@/server/auth/auth.controller";
import { requireUser } from "@/server/auth/auth.guard";
import { listApiTokens } from "@/server/auth/auth.service";
import CreateTokenForm from "./create-token-form";

const formatDate = (date: Date) =>
  date.toLocaleDateString("en", { dateStyle: "medium" });

export default async function SettingsPage() {
  const user = await requireUser();
  const tokens = await listApiTokens(user.id);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">API tokens</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            The Chrome extension uses a token to add your Kindle books to your
            library. Paste it into the extension&apos;s options page.
          </p>
        </div>

        <CreateTokenForm />

        {tokens.length > 0 && (
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{token.name}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    <code>{token.prefix}…</code> · created {formatDate(token.createdAt)}
                    {" · "}
                    {token.lastUsedAt ? `last used ${formatDate(token.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                <form action={revokeApiToken}>
                  <input type="hidden" name="tokenId" value={token.id} />
                  <button type="submit" className="text-sm font-medium text-red-600 hover:underline dark:text-red-400">
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
