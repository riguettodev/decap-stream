# Roadmap — Instalação de extensões no Chromium

## 1. Análise — como o Chromium é iniciado hoje

**Linha de comando** (`scripts/stream.template.conf`):
- `--no-sandbox --test-type`
- `{{GPU_FLAGS}}` `--window-size=...` `--start-fullscreen`
- `--user-data-dir=/app/data/streams/{{STREAM_ID}}/chrome-profile`
- **`--disable-extensions`** ← bloqueia qualquer extensão hoje
- ...

**Managed policy global** (`Dockerfile`):
```
/etc/chromium/policies/managed/policy.json
{"PasswordManagerEnabled":false,...,"TranslateEnabled":false}
```
- Política **global** lida por todas as instâncias.

**Provisionamento:** `provisionStream()` em `supervisor.ts` + `reprovision.mjs` no boot. Ambos usam o mesmo template.

**Reload sem recriar perfil:** `applyAutoReload()` é o padrão canônico — `supervisorctl stop/start` apenas de um programa específico.

---

## 2. Decisão arquitetural — **Suportar ambos (A + B)**

| Caso de uso | Estratégia ideal |
|---|---|
| uBlock Origin / extensões da Web Store | **B (forcelist)** — automático, sempre atualizado |
| Extensão proprietária/interna | **A (load-extension)** — distribuição manual |
| Ambiente air-gapped | **A** — única opção viável |

**Decisão:** entregar **ambos**. Gestão **por-stream** (cada stream tem sua própria lista).

---

## 3. Modelo de dados

### 3.1 `Stream` (em `streams.json`)

```ts
extensions?: {
  unpacked?: string[]   // slugs de diretórios em /app/data/extensions/{streamId}/
  forcelist?: string[]  // IDs da Web Store (32 chars [a-p])
}
```

### 3.2 Storage de unpacked

```
/app/data/extensions/
  {streamId}/
    ublock/
      manifest.json
      ...
```

### 3.3 Injeção no template

- `--load-extension=/app/data/extensions/{id}/slug1,/app/data/extensions/{id}/slug2`
- ou referência a `policy.json` específico (forcelist) — ver §6.

---

## 4. Fluxo de upload (Opção A)

### 4.1 Endpoints REST

| Método | Rota | Função |
|---|---|---|
| `GET` | `/api/streams/{id}/extensions` | Lista atual |
| `POST` | `/api/streams/{id}/extensions/upload` | ZIP multipart |
| `DELETE` | `/api/streams/{id}/extensions/unpacked/{slug}` | Remove unpacked |
| `POST` | `/api/streams/{id}/extensions/forcelist` | Body: `{ ids: string[] }` |
| `DELETE` | `/api/streams/{id}/extensions/forcelist/{extId}` | Remove ID |
| `POST` | `/api/streams/{id}/extensions/apply` | Re-provisiona + restarta Chromium |

### 4.2 Validações

- ZIP só (CRX em fase 2).
- Validar `manifest.json` na raiz.
- Slug sanitizado: `[a-z0-9-]+` (anti path-traversal).
- Limites: 50MB / 1000 files / 200MB descomprimido [VERIFICAR].

### 4.3 Forcelist input
- Textarea de IDs (um por linha) ou parse de URL da Web Store.
- Validação: `/^[a-p]{32}$/`.

---

## 5. UI

### 5.1 Local
Botão "Extensions..." no menu de 3 pontos do `StreamCard`, abrindo modal.

### 5.2 Modal `ExtensionsModal.tsx`

```
┌─────────────────────────────────────────┐
│ Extensions — {stream.name}        [×]   │
├─────────────────────────────────────────┤
│ [Tab] Web Store IDs   [Tab] Upload      │
├─────────────────────────────────────────┤
│ Tab "Web Store IDs":                    │
│   Textarea: cole IDs (um por linha)     │
│   Lista atual com botão [Del]           │
│                                         │
│ Tab "Upload":                           │
│   [Drop ZIP here / Browse]              │
│   Lista com [Del]                       │
├─────────────────────────────────────────┤
│ [Cancel]              [Apply & Restart] │
└─────────────────────────────────────────┘
```

Aviso: "Aplicar requer restart do Chromium (~5s tela preta no ffmpeg)".

---

## 6. Mudanças no template

### 6.1 `stream.template.conf`

Substituir `--disable-extensions \\` por `{{EXTENSIONS_FLAGS}}`:

- **Sem extensões:** `"    --disable-extensions \\\n"` (preserva legacy).
- **Com unpacked:** `"    --load-extension=...paths... \\\n"`.
- **Com forcelist apenas:** sem flag (managed policy cuida).

### 6.2 Managed policy por-stream

`/etc/chromium/policies/managed/forcelist-{streamId}.json`:
```json
{"ExtensionInstallForcelist": ["id;https://clients2.google.com/service/update2/crx", ...]}
```

> [VERIFICAR] Chromium mescla múltiplos arquivos no diretório managed. Forcelist de uma stream pode aparecer globalmente (mas só instala onde o profile permite).

### 6.3 Funções em `supervisor.ts`

```ts
function buildExtensionsFlags(stream: Stream): string { ... }
function writeForcelistPolicy(stream: Stream): void { ... }
export function applyExtensions(id: string): void {
  const stream = getStream(id)
  provisionStream(stream)
  writeForcelistPolicy(stream)
  supervisorctl(`stop chromium-${id}`)
  supervisorctl(`start chromium-${id}`)
  supervisorctl(`stop autologin-${id}`)
  supervisorctl(`start autologin-${id}`)
}
```

---

## 7. Reprovisionamento

`scripts/reprovision.mjs` precisa replicar `buildExtensionsFlags` e `writeForcelistPolicy`.

---

## 8. Persistência

- **Forcelist**: instalada dentro de `chrome-profile`. `recreate` apaga → re-download na próxima boot (precisa internet).
- **Unpacked**: `/app/data/extensions/{id}/` sobrevive a `recreate`. Apenas o storage interno da extensão é perdido.

`removeStream()` deve limpar:
- `/app/data/extensions/{id}/`
- `/etc/chromium/policies/managed/forcelist-{id}.json`

---

## 9. Segurança

- **Unpacked**: extensão local pode rodar código arbitrário. Banner de aviso na UI.
- **Path traversal**: sanitizar slug.
- **ZIP bomb**: limites de tamanho.
- **Auth**: middleware existente protege.

---

## 10. Checkpoints

### CP1 — Schema, tipos e endpoint de leitura
- **Arquivos**: `src/types/stream.ts`, `src/app/api/streams/[id]/extensions/route.ts`
- **Aceite**: `curl /api/streams/{id}/extensions` retorna `{unpacked:[],forcelist:[]}`.
- **Risco**: Baixo.

### CP2 — Template, supervisor.ts e reprovision
- **Arquivos**: `scripts/stream.template.conf`, `src/lib/supervisor.ts`, `scripts/reprovision.mjs`
- **Aceite**: Stream sem extensions continua subindo; editar manualmente streams.json com forcelist e reprovisionar gera o policy file; uBlock aparece no Chromium via VNC.
- **Risco**: Médio — toca todas as streams ao re-renderizar.

### CP3 — POST forcelist + apply endpoint
- **Arquivos**: `src/app/api/streams/[id]/extensions/forcelist/route.ts`, `src/app/api/streams/[id]/extensions/apply/route.ts`
- **Aceite**: POST + apply restarta só Chromium (ffmpeg continua); outras streams intocadas.
- **Risco**: Médio.

### CP4 — Upload de extensão unpacked
- **Arquivos**: `src/app/api/streams/[id]/extensions/upload/route.ts`, `src/app/api/streams/[id]/extensions/unpacked/[slug]/route.ts`
- **Aceite**: `curl -F file=@ublock.zip` extrai e atualiza streams.json; DELETE remove.
- **Risco**: Alto — primeiro endpoint que aceita arquivo do usuário.

### CP5 — UI modal + integração no card
- **Arquivos**: `src/components/ExtensionsModal.tsx`, `src/components/StreamCard.tsx`
- **Aceite**: Modal abre, ambas as tabs funcionam, Apply restarta Chromium e extensão aparece.
- **Risco**: Médio.

### CP6 — Polimento + docs
- **Arquivos**: `src/components/ExtensionsModal.tsx`, `CLAUDE.md`
- **Aceite**: Empty states, loading, error toasts, doc atualizada.
- **Risco**: Baixo.

### CP7 (opcional) — Suporte a CRX e nome/versão
- **Arquivos**: upload route, modal, GET extensions
- **Aceite**: CRX exportado da Web Store funciona; modal exibe nome+versão.
- **Risco**: Baixo.

---

## 11. Atualização do CLAUDE.md

Adicionar seção "Chromium — extensões":

> Cada stream pode ter extensões via dois mecanismos:
> 1. **Unpacked** (`stream.extensions.unpacked`): diretórios em `/app/data/extensions/{id}/`. Template injeta `--load-extension`.
> 2. **Forcelist** (`stream.extensions.forcelist`): IDs da Web Store. Geram `/etc/chromium/policies/managed/forcelist-{id}.json`.
>
> `applyExtensions(id)` em `supervisor.ts` segue padrão `applyAutoReload`: re-provisiona conf e restarta apenas Chromium + autologin.
>
> Template substituiu `--disable-extensions` fixo por `{{EXTENSIONS_FLAGS}}`.

Atualizar "Recreate" e "Re-provisionamento no startup".

---

## Pontos `[VERIFICAR]`
1. `ExtensionInstallForcelist` em `/etc/chromium/policies/managed/*.json` no Chromium Debian — testar com uBlock antes do CP2.
2. `--load-extension` em Chromium com `--test-type`.
3. Comportamento real de policies por-arquivo (mescla? sobrescreve?).
4. Permissões de escrita em `/etc/chromium/policies/managed/`.
5. Limites de upload (50MB / 1000 files / 200MB).
6. Lib de unzip (`adm-zip` vs `unzipper` vs inline).
7. CRX3 header parser (16 bytes mágicos).
8. Tela preta no ffmpeg durante restart do Chromium (~5s).
9. Path absoluto com vírgula em `--load-extension`.
