# Konfiguracja deploya: GitHub Actions → SiteGround

Dokument opisuje **jak zostało skonfigurowane** automatyczne wdrażanie repozytorium `bi-docs.candf24.pl` na hosting SiteGround.

Pipeline: [.github/workflows/deploy-siteground.yml](../.github/workflows/deploy-siteground.yml)
Skrót operacyjny (kroki, troubleshooting): [DEPLOY-SITEGROUND.md](DEPLOY-SITEGROUND.md)

---

## 1. Architektura

```
   git push origin main
            │
            ▼
   ┌──────────────────────────┐
   │  GitHub Actions runner   │
   │  (ubuntu-latest)         │
   │                          │
   │  1. checkout repo        │
   │  2. .env z Secrets       │
   │  3. scripts/build.sh     │
   │     → dist/              │
   │  4. ssh-agent + key      │
   │  5. rsync --delete       │
   └────────────┬─────────────┘
                │ SSH (port 18765)
                ▼
   ┌──────────────────────────┐
   │  SiteGround              │
   │  public_html/            │
   │  (serwowane przez HTTPS) │
   └──────────────────────────┘
```

Trigger: `push` na branch `main` lub ręczne `workflow_dispatch` z zakładki Actions.

---

## 2. Konfiguracja po stronie SiteGround

### 2.1. Domena

- Site Tools → **Domain** — skonfigurowana domena docelowa.
- Katalog publiczny: `/home/customer/www/bi-docs.candf24.pl/public_html`
- Zawartość `public_html` jest **w całości zarządzana przez deploy** (`rsync --delete`). Nie wrzucać niczego ręcznie — zostanie usunięte przy następnym deployu.

### 2.2. Klucz SSH

- Site Tools → **Devs → SSH Keys Manager** → utworzony klucz `github-actions-deploy`.
- Typ: `ED25519`.
- **Passphrase: ustawione** (SiteGround wymusza passphrase, nie da się utworzyć klucza bez niego).
- Klucz publiczny: automatycznie zainstalowany w `authorized_keys` użytkownika SSH.
- Klucz prywatny: pobrany jednorazowo i wgrany do GitHub Secrets jako `SITEGROUND_SSH_KEY`.

### 2.3. Dane dostępowe SSH

Z **SSH Keys Manager → SSH Credentials Details**:

| Pole | Sekret GitHub |
|---|---|
| Hostname | `SITEGROUND_SSH_HOST` |
| Port | `SITEGROUND_SSH_PORT` |
| Username | `SITEGROUND_SSH_USER` |
| Private key | `SITEGROUND_SSH_KEY` |
| Passphrase | `SITEGROUND_SSH_PASSPHRASE` |
| Ścieżka `public_html` | `SITEGROUND_REMOTE_PATH` |

> Konkretne wartości celowo nie są zapisane w tej dokumentacji — są wyłącznie w GitHub Secrets.

### 2.4. HTTPS / cache

- Security → **SSL Manager** — Let's Encrypt na domenie (jeżeli włączone).
- Speed → **Caching** — Dynamic Cache. Po deployu w razie potrzeby: **Flush Cache**.

---

## 3. Konfiguracja po stronie GitHub

### 3.1. Repozytorium

- Repo: `TomaszRobakowski/bi-docs`
- Branch produkcyjny: `main`
- Workflow: [.github/workflows/deploy-siteground.yml](../.github/workflows/deploy-siteground.yml)

### 3.2. Sekrety repozytorium

Lokalizacja: **Settings → Secrets and variables → Actions → Repository secrets**.

**Grupa A — dostęp SSH do SiteGround (6 sekretów):**

| Sekret | Opis |
|---|---|
| `SITEGROUND_SSH_HOST` | Hostname SSH z SiteGround |
| `SITEGROUND_SSH_PORT` | Port SSH (np. 18765) |
| `SITEGROUND_SSH_USER` | Username SSH |
| `SITEGROUND_SSH_KEY` | Pełna zawartość private key (z `-----BEGIN`/`END-----`) |
| `SITEGROUND_SSH_PASSPHRASE` | Passphrase do private key |
| `SITEGROUND_REMOTE_PATH` | Bezwzględna ścieżka do `public_html` |

**Grupa B — wartości builda (9 sekretów, odpowiednik `.env`):**

| Sekret | Odpowiednik w `.env` | Pochodzenie |
|---|---|---|
| `AT_PROPERTY` | `at_property` | Adobe Target → Administration → Properties |
| `ONETRUST_DOMAIN_ID` | `onetrust_domain_id` | OneTrust → Scripts (`data-domain-script`) |
| `ONETRUST_TARGET_CATEGORY_ID` | `onetrust_target_category_id` | OneTrust → Cookie Categories (zwykle `C0004`) |
| `METAROUTER_WRITE_KEY` | `metarouter_write_key` | MetaRouter → Sources → Write Key |
| `METAROUTER_HOST` | `metarouter_host` | URL instancji MetaRouter klienta |
| `METAROUTER_CLIENT_NAME` | `metarouter_client_name` | Nazwa workspace w MetaRouter |
| `METAROUTER_CONTAINER_ID` | `metarouter_container_id` | MetaRouter → MetaTagger → Containers |
| `METAROUTER_GCS_BASE` | `metarouter_gcs_base` | Bazowy URL buildów MetaTagger (GCS) |
| `TARGET_SCRIPT_URL` | `target_script_url` | Stała: `./at.js` |

Razem: **15 sekretów**.

### 3.3. Brak environment

Workflow nie używa `environment:` — wszystkie sekrety są **Repository secrets**. Environment secrets nie byłyby widoczne dla tego joba.

---

## 4. Działanie pipeline'u

Plik: [.github/workflows/deploy-siteground.yml](../.github/workflows/deploy-siteground.yml)

Job `build-and-deploy` na `ubuntu-latest`:

1. **Checkout** — `actions/checkout@v4`.
2. **Create .env from GitHub Secrets** — heredoc składa lokalny `.env` z 9 sekretów grupy B. Plik istnieje tylko w przestrzeni runnera, znika po jobie.
3. **Run build** — `chmod +x scripts/build.sh && ./scripts/build.sh`.
   - Kopiuje HTML/CSS/JS do `dist/`.
   - Generuje `dist/at.js` z `assets/at.js.template`.
   - Generuje `dist/target-config.js` z wartości `.env`.
4. **Verify dist/ output** — sanity check, że `index.html`, `target-demo.html`, `target-config.js`, `at.js` istnieją.
5. **Configure SSH (known_hosts + key file)** — zapisuje `id_ed25519` z sekretu, pobiera `known_hosts` przez `ssh-keyscan`.
6. **Start ssh-agent and load key with passphrase** — instaluje `expect`, startuje `ssh-agent`, odblokowuje klucz passphrase'em przez skrypt `expect` (passphrase przekazane przez env var, nie przez argument procesu).
7. **Deploy dist/ via rsync over SSH** —
   ```
   rsync -avz --delete \
     -e "ssh -p $PORT -o StrictHostKeyChecking=yes" \
     dist/ user@host:/path/to/public_html/
   ```
   `--delete` synchronizuje stan zdalny 1:1 z `dist/`.
8. **Cleanup** — usuwa private key z runnera i zatrzymuje `ssh-agent` (krok zawsze, nawet przy błędzie).

### Concurrency

```
concurrency:
  group: deploy-siteground
  cancel-in-progress: false
```

Dwa pushe pod rząd nie ścigają się — drugi czeka, aż pierwszy skończy `rsync`.

---

## 5. Co NIE jest w repo

- `.env` — gitignored. Lokalnie tworzony ręcznie do testów; w CI tworzony przez workflow z Secrets.
- `dist/` — gitignored, generowany przez build.
- `at.js`, `target-config.js` na root — gitignored (generowane do `dist/`).
- Sekrety — tylko w GitHub Secrets i w panelu SiteGround.

---

## 6. Procedury operacyjne

### Standardowy deploy

```
git push origin main
```

Workflow odpala się automatycznie. Status: **Actions → Deploy to SiteGround**.

### Ręczny deploy bez commitu

**Actions → Deploy to SiteGround → Run workflow → Run** (branch `main`).

### Zmiana wartości konfiguracyjnej (np. nowy write key)

1. **Settings → Secrets and variables → Actions** → edytuj odpowiedni sekret.
2. Odpal ręcznie workflow (`Run workflow`) — nie trzeba pushować zmian w kodzie.

### Rotacja klucza SSH

1. Site Tools → **SSH Keys Manager** → utwórz nowy klucz (z nowym passphrase).
2. Zaktualizuj `SITEGROUND_SSH_KEY` i `SITEGROUND_SSH_PASSPHRASE` w GitHub Secrets.
3. Odpal workflow ręcznie, żeby zweryfikować.
4. Usuń stary klucz w SiteGround.

### Rollback

```
git revert <commit>
git push origin main
```

Workflow odpali się i `rsync --delete` przywróci poprzedni stan.

---

## 7. Powiązane dokumenty

- [DEPLOY-SITEGROUND.md](DEPLOY-SITEGROUND.md) — checklist setupu i troubleshooting.
- [../README.md](../README.md) — opis projektu i build lokalny.
- [../.env.example](../.env.example) — szablon zmiennych builda.
