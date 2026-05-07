# Roadmap — Presets de TV Wall (DecapStream)

## 1. Análise do estado atual

### 1.1 Onde "vive" o TV Wall hoje

| Conceito | Onde mora | Tipo de persistência |
|----------|-----------|----------------------|
| `rows` / `cols` da grade | `globalPrefs.tvRows` / `tvCols` em `localStorage["global-prefs"]` (cliente) | Local por browser |
| `clickAction` (hls/html/vnc) | `globalPrefs.tvClickAction` em `localStorage["global-prefs"]` | Local por browser |
| Mapeamento `slot → stream` | Campo `tvPosition: number \| null` por stream em `streams.json` | Servidor |
| Toggle "TV Layout ativo" | `localStorage["tv-layout"]` (cliente) | Local por browser |
| Defaults de instalação | env vars `DEFAULT_TV_LAYOUT/ROWS/COLS/CLICK_ACTION` lidos por `GET /api/config` | Aplicados na primeira visita |

### 1.2 Como o TV Wall lê esses dados

- `GET /api/tv-wall?rows=R&cols=C&pure=1` em `src/app/api/tv-wall/route.ts`:
  - Recebe rows/cols por query string — não conhece nenhuma noção de preset.
  - Lê `readStreams()` e chama `buildSlots(streams, rows*cols)`.
- Botão Play (`src/app/page.tsx`): monta URL com `globalPrefs.tvRows/tvCols` + `pure=1` quando `pureMode`.
- `src/components/TvLayoutGrid.tsx` (editor visual):
  - Função `buildSlots` duplicada da do servidor.
  - Drag-end → `PUT /api/streams/tv-slots { slots: (string|null)[] }`.
  - Endpoint sobrescreve `tvPosition` em cada stream.

### 1.3 Observações estruturais

- Modelo atual **acopla** posição do stream à própria entidade Stream.
- Grade é **única globalmente** porque `tvPosition` é um único número.
- `rows`/`cols` são **só do browser** — trocar para presets server-side resolve "Play funcionar igual em qualquer browser".
- `buildSlots` está duplicada (server e client). [VERIFICAR] vale a pena promover para `src/lib/tvwall.ts`.

---

## 2. Modelo de dados proposto

### 2.1 Arquivo dedicado

```
/app/data/streams/tv-presets.json
```

### 2.2 Schema do preset

```ts
// src/types/tvPreset.ts
export interface TvPreset {
  id: string                  // slug, ex: "default", "tarde", "mosaico-12"
  name: string                // exibição
  rows: number                // 1..20
  cols: number                // 1..20
  clickAction: TvClickAction  // "hls" | "html" | "vnc"
  slots: (string | null)[]    // length = rows*cols, valores = streamId | null
  order: number
  createdAt: string
  updatedAt: string
}

export interface TvPresetsFile {
  version: 1
  selectedPresetId: string | null
  presets: TvPreset[]
}
```

### 2.3 Migração one-shot

Ao primeiro `readPresets()`:
1. Se arquivo existe → carrega.
2. Se não existe:
   - Lê `streams.json`.
   - Lê env vars `DEFAULT_TV_ROWS/COLS/CLICK_ACTION`.
   - Constrói `slots` rodando `buildSlots(streams, rows*cols)` sobre os `tvPosition` existentes.
   - Cria preset "default" com layout idêntico.
3. **Não** limpa `tvPosition` das streams ainda.

---

## 3. Mudanças no schema

### 3.1 `src/types/stream.ts`

Manter `tvPosition` como deprecated por uma versão (rollback emergencial).

### 3.2 Novos arquivos

- `src/types/tvPreset.ts`
- `src/lib/tvPresets.ts` (mesmo padrão de `db.ts`)

---

## 4. Endpoints novos / modificados

### 4.1 Novos

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/api/tv-presets` | Lista + selecionado |
| `POST` | `/api/tv-presets` | Cria preset |
| `GET` | `/api/tv-presets/[id]` | Lê preset |
| `PUT` | `/api/tv-presets/[id]` | Patch parcial (redimensiona slots se rows/cols mudam) |
| `DELETE` | `/api/tv-presets/[id]` | Remove |
| `PUT` | `/api/tv-presets/select` | Troca preset ativo |
| `PUT` | `/api/tv-presets/reorder` | Reordena lista |

### 4.2 Modificados

- `GET /api/tv-wall` — aceita `?preset=<id>`. Mantém fallback `?rows=&cols=`.
- `GET /api/config` — adiciona `selectedPresetId`.

### 4.3 Depreciado

- `PUT /api/streams/tv-slots` — substituído por `PUT /api/tv-presets/[id]`.

---

## 5. Mudanças na UI

### 5.1 Botão Play
- Se há `selectedPresetId` → `/api/tv-wall?preset=<id>`.

### 5.2 Seletor de preset (novo)
Dropdown no header ao lado do botão TV Layout, visível quando `tvLayoutActive`:
- Lista de presets (radio)
- "+ New preset"
- "Edit current preset"
- "Delete current preset"

### 5.3 `TvLayoutGrid`
- Recebe `preset: TvPreset`.
- Drag-end salva via `PUT /api/tv-presets/{id}`.

### 5.4 Settings popup
- Remove inputs de Grid e click action (vão para o editor de preset).
- Mantém toggle "TV Layout".

---

## 6. Compatibilidade

- Streams existentes: migração preserva layout exato.
- Env vars `DEFAULT_TV_*` agora só afetam o preset "default" criado na migração.
- URL legada `/api/tv-wall?rows=3&cols=4` continua funcionando (fallback).

---

## 7. Checkpoints de implementação

### CP1 — Tipos e biblioteca de presets (server-only)
- **Arquivos**: `src/types/tvPreset.ts`, `src/lib/tvPresets.ts`
- **Aceite**: `readPresets()` retorna preset "default" criado a partir de `streams.json` + env vars.
- **Risco**: Baixo.

### CP2 — Endpoints CRUD
- **Arquivos**: `src/app/api/tv-presets/{route.ts,[id]/route.ts,select/route.ts,reorder/route.ts}`
- **Aceite**: `curl /api/tv-presets` retorna estado inicial; CRUD funciona; validações OK.
- **Risco**: Baixo.

### CP3 — `tv-wall` aceita `?preset=<id>`
- **Arquivos**: `src/app/api/tv-wall/route.ts`
- **Aceite**: `?preset=default` funciona; `?rows=&cols=` continua funcionando.
- **Risco**: Baixo-médio.

### CP4 — UI: seletor + botão Play usa preset
- **Arquivos**: `src/app/page.tsx`, novo `src/components/TvPresetSelector.tsx`
- **Aceite**: Dropdown aparece; criar preset funciona; selecionar persiste.
- **Risco**: Médio.

### CP5 — `TvLayoutGrid` lê/escreve preset
- **Arquivos**: `src/components/TvLayoutGrid.tsx`, `src/app/page.tsx`
- **Aceite**: Drag persiste no preset; trocar preset muda grade; redimensionar funciona.
- **Risco**: Médio.

### CP6 — Settings popup limpeza
- **Arquivos**: `src/app/page.tsx`, `src/app/api/config/route.ts`
- **Aceite**: Settings só mostra toggle; usuários antigos não quebram.
- **Risco**: Baixo.

### CP7 — Endpoint legado e cleanup do schema (opcional)
- **Arquivos**: `src/app/api/streams/tv-slots/route.ts`, `src/types/stream.ts`, `src/lib/db.ts`
- **Aceite**: Build sem warnings; `streams.json` perde `tvPosition`; endpoint legado retorna 410.
- **Risco**: Alto se feito cedo. Aguardar 1 versão.

---

## 8. Atualização do CLAUDE.md

- Modificar seção "TV Wall (HTML fullscreen)" para mencionar `?preset=<id>`.
- Modificar "TV Layout" (drag agora salva via preset).
- Modificar "Preferências globais" (remover `tvRows/tvCols/tvClickAction` ativos).
- Adicionar nova seção "Presets de TV Wall".

---

## Pontos `[VERIFICAR]`
- Localização do arquivo (`/streams/` vs `/app/data/`)
- Auto-append de novas streams no preset selecionado?
- Comportamento do Play sem presets
- Extração de `buildSlots` para `lib/`
- Momento exato da migração (lazy vs reprovision)
