# Подписване на десктопа: macOS (нотаризация) и Windows (Authenticode) — стъпки за Симо

Днес (E9g А5, D-376) инсталаторите се строят **неподписани**: `pnpm --dir apps/desktop run dist:mac|win|linux` локално или
`.github/workflows/desktop-build.yml` в GitHub Actions (само artifacts, без release). Подписването чака теб (Q-053).
Този документ казва какво да вземеш и какво да зададеш; кодът не се променя — electron-builder подписва сам, когато
види променливите по-долу.

Фактите за променливите са прочетени от самия electron-builder 26.17.0 (`app-builder-lib/out/mac/MacTargetHelper.js`,
`codeSign/windowsSignToolManager.js`, `options/winOptions.d.ts`), 24.10.2026. Страниците на Apple и Microsoft не са
отваряни нощес: цените и менютата в портала са [НП].

## Какво вижда човек днес (без подпис)
- **macOS**: dmg-то се отваря, но при първо пускане macOS казва, че приложението е от неидентифициран разработчик (или
  „повредено“, ако е свалено от интернет). Заобикаляне за тест: десен бутон върху Harness.app → Open, или
  `xattr -dr com.apple.quarantine /Applications/Harness.app`. За хора извън екипа това не е приемливо → нотаризация.
- **Windows**: SmartScreen показва „Windows protected your PC“ → More info → Run anyway.
- **Linux**: AppImage и deb не се подписват по този начин; няма предупреждение (по желание: подпис на AppImage с gpg — не е нужен).

## macOS: Developer ID + нотаризация
1. Apple Developer Program на твое име или на фирма (годишен абонамент [НП]). Нужен е Apple ID с двуфакторна защита.
2. В developer.apple.com → Certificates → създай **Developer ID Application** сертификат. Изтегли го, отвори го в
   Keychain Access, после File → Export → `.p12` с парола. (Само за dmg извън App Store; „Apple Distribution“ е за App Store.)
3. Запиши си **Team ID** (Membership details).
4. Нотаризацията иска едно от трите (electron-builder проверява в този ред):
   - Apple ID: `APPLE_ID` (имейлът), `APPLE_APP_SPECIFIC_PASSWORD` (appleid.apple.com → App-Specific Passwords),
     `APPLE_TEAM_ID`;
   - или API ключ от App Store Connect: `APPLE_API_KEY` (път до `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`;
   - или профил в keychain от `xcrun notarytool store-credentials`: `APPLE_KEYCHAIN_PROFILE` (+ по избор `APPLE_KEYCHAIN`).
5. Сертификатът за подпис: `CSC_LINK` (път до `.p12` или base64 на съдържанието му) и `CSC_KEY_PASSWORD`. На собствения
   ти Mac може и без тях — electron-builder намира „Developer ID Application“ в keychain-а.
6. В `apps/desktop/electron-builder.config.mjs` махни реда `identity: null` (той изрично казва „не подписвай“).
   Hardened runtime е включен по подразбиране за mac; ако приложението не тръгне след подпис заради node-pty, добави
   entitlement `com.apple.security.cs.disable-library-validation` [НП — да се провери с подписан build].
7. Строй: `pnpm --dir apps/desktop run dist:mac`. В изхода трябва да има „notarization successful“. Проверка:
   `spctl -a -vv /Volumes/Harness/Harness.app` → `accepted, source=Notarized Developer ID`.

## Windows: Authenticode
Има два пътя; новите OV/EV сертификати вече не се дават като свободен `.pfx` файл, а върху хардуерен токен или в облачен
HSM [НП — провери при издателя], затова Azure е по-лесният път за CI.
- **Azure Trusted Signing** (препоръчано): акаунт в Azure, Trusted Signing account + Certificate profile. В
  `win` на конфигурацията добави `azureSignOptions: { publisherName, endpoint, certificateProfileName, codeSigningAccountName }`.
  Вход в Entra ID през променливите на средата на Azure (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`).
- **Класически `.pfx`**: `WIN_CSC_LINK` (или `CSC_LINK`) — път/base64 на `.pfx`, `WIN_CSC_KEY_PASSWORD`. electron-builder
  подписва с signtool.
Строй: `pnpm --dir apps/desktop run dist:win` (на Windows). Проверка: десен бутон върху `.exe` → Properties → Digital Signatures.

## В GitHub Actions
1. Repo → Settings → Secrets and variables → Actions → добави секретите (напр. `CSC_LINK` като base64 на `.p12`,
   `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`; за Windows `AZURE_*`).
2. В `.github/workflows/desktop-build.yml` махни `CSC_IDENTITY_AUTO_DISCOVERY: "false"` и подай секретите като `env:`
   само на стъпката `dist:*` на съответната ОС.
3. Workflow-ът и тогава **не публикува**: `--publish never` остава. Release с инсталаторите правиш ръчно (или с отделно
   решение), а auto-update се включва с `MANDAT_UPDATE_FEED=github` (Q-054, `apps/desktop/src/updater.ts`).

## Защо не сега
Правило 3: без публикуване и без подписи от името на човек, който спи. Неподписаният dmg е достатъчен за проверката на
AC-12.1 на тази машина; подписът е само конфигурация отгоре.
