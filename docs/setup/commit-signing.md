# Подпис на комитите при локално прилагане (E9е, D-661)

Мандат подписва своите комити на компютъра ти: клона `mandat/<задача>-a<n>` и одобрените правила. Ползва собствен SSH
ключ, направен при първата локална задача:

- `$MANDAT_HOME/keys/commit-signing-ed25519` (0600, без парола; не влиза в пясъчника), `.pub` до него;
- `$MANDAT_HOME/keys/allowed_signers` — за проверка.

Проверка в огледалото или в твоето копие след `mandat apply`:

```sh
git -c gpg.ssh.allowedSignersFile="$MANDAT_HOME/keys/allowed_signers" log -3 --format='%h %G? %GS %s'
```

`G mandat@localhost` значи подписан от харнеса. Изключване: `MANDAT_SIGN_COMMITS=0` в env на worker-а. Ако няма
`ssh-keygen` (OpenSSH), комитът е неподписан, както преди. За да виждаш „Verified“ и в GitHub, можеш да качиш `.pub` като
signing key в профила си. Това не е нужно за проверката локално. Keyless подпис (gitsign + Rekor) е за M3.
