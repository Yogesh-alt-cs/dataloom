<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Accounts: browser derives (PBKDF2) an AES content key + a separate access token; server functions in src/lib/account.functions.ts store only ciphertext, salt and SHA-256 of the token in `accounts` (service-role only) and rate-limit via `rate_events`. Content key lives only in memory (src/lib/vault.ts). Why: server must never see readable content or the password.
- DataLoom IDs are stored lowercased; the DB enforces this with a CHECK plus a unique index on lower(login_id). Why: case-insensitive uniqueness must hold even if app validation is bypassed.
