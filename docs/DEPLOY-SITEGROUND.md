# Deploy na SiteGround (GitHub Actions)

Pipeline: [.github/workflows/deploy-siteground.yml](../.github/workflows/deploy-siteground.yml)

Workflow odpala się przy `push` na `main` oraz ręcznie (Actions → Deploy to SiteGround → Run workflow).
Buduje `dist/` z `.env` złożonego z sekretów i wgrywa go na SiteGround przez `rsync` po SSH.

---

## 1. Co zrobić po stronie SiteGround

### 1.1. Utwórz / wskaż domenę

- Site Tools → **Domain → Parked Domains / Subdomains** (lub główna domena hostingu).
- Ustal docelową ścieżkę katalogu publicznego, np.:
  `/home/customer/www/bi-docs.candf24.pl/public_html`

### 1.2. Włącz SSH i wygeneruj klucz

- Site Tools → **Devs → SSH Keys Manager**.
- **Create New SSH Key**:
  - Name: `github-actions-deploy`
  - Key type: `ED25519` (albo RSA 4096 jeśli ED25519 niedostępne)
  - Passphrase: **wymagane przez SiteGround** — ustaw silne hasło i zapisz je, trafi do sekretu `SITEGROUND_SSH_PASSPHRASE`.
- Po utworzeniu:
  - Pobierz **private key** (zachowasz do sekretu GitHub `SITEGROUND_SSH_KEY`).
  - Klucz publiczny zostaje na SiteGround i jest już autoryzowany dla użytkownika SSH.

> SiteGround wymusza passphrase przy generowaniu klucza. Workflow odblokowuje klucz w `ssh-agent` na runnerze za pomocą `expect` i sekretu `SITEGROUND_SSH_PASSPHRASE`.

### 1.3. Zbierz dane SSH

W **SSH Keys Manager → przy kluczu → "SSH Credentials Details"** znajdziesz:

| Pole | Przykład | Sekret GitHub |
|---|---|---|
| Hostname | `ssh.eu-central-1.siteground.eu` | `SITEGROUND_SSH_HOST` |
| Port | `18765` | `SITEGROUND_SSH_PORT` |
| Username | `u1234-abcdef` | `SITEGROUND_SSH_USER` |
| Private key | zawartość pliku `.pem` / `id_ed25519` | `SITEGROUND_SSH_KEY` |
| Remote path | `/home/customer/www/bi-docs.candf24.pl/public_html` | `SITEGROUND_REMOTE_PATH` |

### 1.4. Sprawdź połączenie z lokalnej maszyny (opcjonalnie)

```sh
ssh -p 18765 -i ~/.ssh/siteground_key u1234-abcdef@ssh.eu-central-1.siteground.eu
ls -la /home/customer/www/bi-docs.candf24.pl/public_html
```

Jeśli `ls` działa — Actions też zadziała.

### 1.5. Wyczyść `public_html` przed pierwszym deployem (jeśli były tam stare pliki)

`rsync --delete` z workflow usunie wszystko, czego nie ma w `dist/`.
Jeżeli w `public_html` masz coś czego nie chcesz stracić (np. `.htaccess`, `cgi-bin`) — przenieś to do `dist/` albo zmień ścieżkę docelową na podkatalog.

### 1.6. (Opcjonalnie) HTTPS i cache

- Site Tools → **Security → SSL Manager** — zainstaluj Let's Encrypt na docelowej domenie.
- Site Tools → **Speed → Caching** — Dynamic Cache zwykle OK; jeśli zmiany nie schodzą po deployu, kliknij **Flush Cache**.

---

## 2. Co zrobić po stronie GitHub

### 2.1. Wgraj pliki workflow do repo

W repozytorium powinny być:

- [.github/workflows/deploy-siteground.yml](../.github/workflows/deploy-siteground.yml)
- [docs/DEPLOY-SITEGROUND.md](DEPLOY-SITEGROUND.md) (ten plik)

Commit + push na `main`.

### 2.2. Skonfiguruj sekrety repozytorium

**Settings → Secrets and variables → Actions → New repository secret**.

Sekrety SSH (SiteGround):

| Nazwa | Wartość |
|---|---|
| `SITEGROUND_SSH_HOST` | hostname z SiteGround |
| `SITEGROUND_SSH_PORT` | port SSH (np. `18765`) |
| `SITEGROUND_SSH_USER` | username SSH |
| `SITEGROUND_SSH_KEY` | **cała** zawartość private key, łącznie z liniami `-----BEGIN ... KEY-----` i `-----END ... KEY-----` |
| `SITEGROUND_SSH_PASSPHRASE` | passphrase ustawione przy generowaniu klucza w SiteGround |
| `SITEGROUND_REMOTE_PATH` | bezwzględna ścieżka docelowa, np. `/home/customer/www/bi-docs.candf24.pl/public_html` |

Sekrety builda (odpowiednik `.env`):

| Nazwa | Z `.env` |
|---|---|
| `AT_PROPERTY` | `at_property` |
| `METAROUTER_WRITE_KEY` | `metarouter_write_key` |
| `METAROUTER_HOST` | `metarouter_host` |
| `METAROUTER_CLIENT_NAME` | `metarouter_client_name` |
| `METAROUTER_CONTAINER_ID` | `metarouter_container_id` |
| `METAROUTER_GCS_BASE` | `metarouter_gcs_base` |
| `ONETRUST_DOMAIN_ID` | `onetrust_domain_id` |
| `ONETRUST_TARGET_CATEGORY_ID` | `onetrust_target_category_id` |
| `TARGET_SCRIPT_URL` | `target_script_url` (np. `./at.js`) |

> Wartości muszą być realne (te same, których używasz lokalnie do `./scripts/build.sh`).

### 2.3. (Opcjonalnie) Ochrona środowiska

Jeżeli chcesz wymagać ręcznej akceptacji deployu:

- **Settings → Environments → New environment** → `production`.
- Włącz **Required reviewers**.
- W workflow dodaj `environment: production` do joba `build-and-deploy` i przenieś sekrety do tego environment.

### 2.4. Pierwsze uruchomienie

- **Actions → Deploy to SiteGround → Run workflow → Run** (branch `main`).
- Obserwuj logi:
  - krok **Run build** musi zakończyć się `Build gotowy: .../dist`,
  - krok **Deploy dist/ via rsync** musi zakończyć się `total size is ... speedup ...` bez błędów.

### 2.5. Weryfikacja po deployu

W przeglądarce otwórz docelową domenę:

```text
https://bi-docs.candf24.pl/target-demo.html
```

Sprawdź:

1. Baner OneTrust się ładuje.
2. Po zgodzie ładuje się `at.js` (DevTools → Network).
3. W konsoli `adobe.target.VERSION` zwraca wersję.
4. Bridge MetaRouter wysyła `metaTagger.track()` z `experience_name`, `experience_type`, `event222`.

---

## 3. Typowe problemy

| Symptom | Przyczyna / fix |
|---|---|
| `Permission denied (publickey)` w logu Actions | Zły `SITEGROUND_SSH_KEY` (brakuje nagłówków BEGIN/END, niepełna zawartość) lub złe `SITEGROUND_SSH_PASSPHRASE`. Sprawdź, czy wkleiłeś cały plik klucza i czy passphrase zgadza się z tym podanym przy generowaniu klucza w SiteGround. |
| `Bad passphrase, try again` / `ssh-add` zawisa | Zły `SITEGROUND_SSH_PASSPHRASE`. Wygeneruj klucz ponownie w SiteGround (zapisz passphrase) i zaktualizuj oba sekrety. |
| `Host key verification failed` | Zła wartość `SITEGROUND_SSH_HOST` lub `SITEGROUND_SSH_PORT`. Skopiuj dokładnie z **SSH Credentials Details**. |
| `rsync: ... No such file or directory` na zdalnej ścieżce | Zła `SITEGROUND_REMOTE_PATH`. Zaloguj się ręcznie po SSH i sprawdź `pwd` w docelowym katalogu. |
| Build się sypie na `: Brak X w .env` | Brak sekretu builda w GitHub. Dodaj brakujący secret i odpal workflow ponownie. |
| Stare wersje plików na produkcji | Dynamic Cache SiteGround. Site Tools → **Speed → Caching → Flush Cache**. |
| Zmiana w repo nie wywołuje deployu | Push poszedł na inny branch niż `main`. Workflow słucha tylko `main`. |

---

## 4. Rollback

Workflow nie trzyma historii artefaktów na SiteGround. Żeby cofnąć:

1. `git revert <commit>` (albo reset brancha `main` na poprzedni commit) i push.
2. Workflow odpali się ponownie i `rsync --delete` przywróci poprzedni stan `dist/`.
