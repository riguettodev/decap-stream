# Roadmap — TV Wall: fill/align por stream

Feature: permitir que cada stream defina, **por stream**, como o vídeo se acomoda no slot do TV Wall.

- `tvFill: boolean` — `true` (padrão) preenche o slot cortando excesso; `false` preserva aspect ratio (letterbox/pillarbox).
- `tvAlign: "left" | "center" | "right"` — usado **somente quando `tvFill=false`**.

Persistência server-side em `streams.json`. Aplicado **apenas no TV Wall**.

---

## 1. Análise do estado atual

### 1.1 Renderização atual em `tv-wall/route.ts`

```css
.cell{position:relative;background:#000;overflow:hidden}
.cell video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
```

Hoje **todos** os vídeos usam `object-fit: contain` sem `object-position`.

> [VERIFICAR] CLAUDE.md diz "object-fit: cover" mas código usa `contain`. Esclarecer divergência.

### 1.2 Outros players

| Arquivo | object-fit |
|---|---|
| `src/app/api/tv-wall/route.ts` | `contain` |
| `src/app/static/[id]/route.ts` | `contain` |
| `src/app/api/player-html/[id]/route.ts` | `contain` |
| `src/app/player/[id]/page.tsx` | `object-contain` |

---

## 2. Modelo de dados

### 2.1 Novos campos em `Stream`

```ts
export interface Stream {
  ...
  tvFill?: boolean                            // default true
  tvAlign?: "left" | "center" | "right"       // default "center"
}
```

### 2.2 Defaults

```ts
export const STREAM_DEFAULTS = {
  ...
  tvFill: true,
  tvAlign: "center" as const,
}
```

Aplicar com `??` na leitura. Sem migração necessária.

---

## 3. Geração do CSS

### 3.1 Estilo inline no `<video>`

Em `tv-wall/route.ts`, mudar para:

```js
var meta = ${metaJson};
function makePlayer(cell, id){
  var info = meta[id] || { name: id, fill: true, align: "center" };
  var v = document.createElement('video');
  v.style.width = '100%';
  v.style.height = '100%';
  v.style.objectFit = info.fill ? 'cover' : 'contain';
  v.style.objectPosition = info.fill
    ? '50% 50%'
    : (info.align === 'left'  ? '0% 50%'
    :  info.align === 'right' ? '100% 50%'
    :                            '50% 50%');
  cell.appendChild(v);
  ...
}
```

Remover regra CSS estática `.cell video { object-fit: contain }`.

---

## 4. Endpoints

### 4.1 Endpoint dedicado: `POST /api/streams/[id]/tv-display`

**Recomendado** em vez de PATCH geral, para evitar restart desnecessário do ffmpeg/Chromium (mesmo padrão do `autoreload`).

```ts
// body: { fill?: boolean; align?: "left" | "center" | "right" }
```

Apenas `saveStream`, sem `provisionStream`/`restartStream`.

### 4.2 Outros endpoints

- `GET /api/tv-wall` — só template muda.
- `GET/POST /api/streams` — herda defaults via spread.

---

## 5. UI

### 5.1 Local
**Menu de 3 pontos do `StreamCard`** (mesmo padrão do Auto-reload).

### 5.2 Design
```
TV display
[ Fill slot ⬤ ]   ← Toggle
Align (when not fill):
[ Left ] [ Center ] [ Right ]   ← visível só se !fill
```

### 5.3 Comportamento
- Sem `onRefresh()` necessário.
- TV Wall aberto em outra aba só pega mudança no próximo reload.

---

## 6. Comportamento esperado

| Player | Aplicar fill/align? |
|---|---|
| `/api/tv-wall` | ✅ Sim (escopo da feature) |
| `/static/[id]` | ❌ Não — single-stream usa `contain` |
| `/player/[id].html` | ❌ Não |
| `/player/[id]` | ❌ Não |

---

## 7. Checkpoints

### CP1 — Modelo de dados
- **Arquivos**: `src/types/stream.ts`
- **Aceite**: `tsc --noEmit` passa; nova stream tem campos defaults; antigas continuam.
- **Risco**: Baixo.

### CP2 — Endpoint dedicado
- **Arquivos**: `src/app/api/streams/[id]/tv-display/route.ts`
- **Aceite**: `curl POST` persiste; ffmpeg não reinicia; validações OK.
- **Risco**: Baixo.

### CP3 — TV Wall aplica fill/align
- **Arquivos**: `src/app/api/tv-wall/route.ts`
- **Aceite**: Editar `streams.json` manualmente, abrir TV Wall, ver fill/align aplicado.
- **Risco**: Médio — **mudança de default visual** (de `contain` para `cover`).

### CP4 — UI no card
- **Arquivos**: `src/components/StreamCard.tsx`
- **Aceite**: Toggle e botões de align funcionam, persistem, e refletem na TV Wall.
- **Risco**: Baixo.

### CP5 — Documentação
- **Arquivos**: `CLAUDE.md`
- **Aceite**: Seção "TV Wall" atualizada com fill/align e nota de escopo.
- **Risco**: Nenhum.

---

## 8. Atualização do CLAUDE.md

Adicionar à seção "TV Wall (HTML fullscreen)":

> Cada stream tem `tvFill: boolean` e `tvAlign: "left"|"center"|"right"`. Quando `tvFill=true` (default), o `<video>` recebe `object-fit: cover`. Quando `false`, recebe `contain` + `object-position` derivado de `tvAlign`. Aplicado **apenas** no TV Wall.
>
> Persistência via `POST /api/streams/[id]/tv-display` (endpoint dedicado, mesmo padrão do `autoreload`) — não via PATCH geral, para evitar restart do ffmpeg/Chromium.

---

## Pontos `[VERIFICAR]`
- Default de `tvFill`: `true` (cover) ou `false` (contain)?
- Divergência entre CLAUDE.md (cover) e código (contain).
- `tvAlign` vertical no futuro?
- BroadcastChannel para refresh automático do TV Wall aberto.
