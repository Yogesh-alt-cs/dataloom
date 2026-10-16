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

- Vault sync: browser encrypts everything (AES-GCM, PBKDF2-derived); server functions in src/lib/vault.functions.ts store only ciphertext plus a hash of a password-derived access token in `vaults` (service-role only, no public policies). Why: server must never see readable content or the password.
