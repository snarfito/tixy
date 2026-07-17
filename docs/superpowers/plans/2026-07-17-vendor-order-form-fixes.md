# Vendor Order Form Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs in the vendor order form (`tixy_frontend/src/pages/VendorPage.jsx` + `tixy_backend/backend/routers/references.py`): an error alert that's invisible on mobile, a reference search that isn't restricted to active collections, and stale store/client fields when re-selecting a client from the search dropdown.

**Architecture:** No new dependencies, no new files, no new abstractions — all changes are targeted edits to two existing files. The alert becomes a fixed-position toast instead of a document-flow banner; the reference search gets one backend join+filter plus a frontend label using data already in memory; the client-select handlers get the missing `setX(...)` calls they were always supposed to have.

**Tech Stack:** React (Vite, JS, hooks — no TypeScript), Tailwind utility classes, FastAPI + SQLAlchemy, MySQL 8 (docker-compose), no test framework present in either app.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-vendor-order-form-fixes-design.md` (approved, read it if anything below is ambiguous).
- No automated test framework exists in `tixy_frontend` or `tixy_backend` — the spec's Testing section explicitly says none will be added. Every task below is verified manually (curl / docker exec for backend, browser interaction for frontend) instead of with `pytest`/`vitest` steps.
- Backend runs via `docker compose` (`tixy_backend/docker-compose.yml`) with the `backend` container volume-mounted and `uvicorn --reload`-style hot reload — editing files under `tixy_backend/backend` takes effect without rebuilding. Confirmed running: `tixy_backend` (port 8000), `tixy_db` (port 3307).
- Frontend dev server (`vite`) is already running on port 5173 (`tixy_frontend`), pointed at `VITE_API_URL=http://192.168.1.15:8000` via `.env`.
- Do not touch `order.collection_id` assignment logic, admin reporting endpoints, or `AdminPage.jsx` — all three are explicitly out of scope per the spec.
- Follow existing code style in both files exactly (no semicolons in JS, Tailwind utility strings, Spanish UI copy/comments).

---

### Task 1: Backend — restrict `GET /references/` to active collections when no `collection_id` is given

**Files:**
- Modify: `tixy_backend/backend/routers/references.py:1-42`

**Interfaces:**
- Consumes: `Reference` model (`tixy_backend/backend/models/reference.py`, has `collection_id` FK), `Collection` model (`tixy_backend/backend/models/collection.py`, has `is_active: bool`).
- Produces: `GET /references/` behavior — when the caller omits `collection_id`, only references whose parent collection has `is_active == True` are returned. When the caller passes `collection_id` explicitly (as `AdminPage.jsx` always does via `getReferencesByCollection`), behavior is unchanged (no collection-active filter applied). No response shape change — `ReferenceOut` schema is untouched.

- [ ] **Step 1: Read the current function to confirm line numbers haven't shifted**

Run: `sed -n '1,42p' tixy_backend/backend/routers/references.py`

Expected: matches the block shown in Step 2's "before" (import block ends at line 16, `list_references` spans lines 21-42).

- [ ] **Step 2: Add the `Collection` import and the active-collection filter**

Change the import block at the top of the file from:

```python
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import require_admin, require_vendor
from models.reference import Reference
from models.user import User
from schemas.reference import (
    ReferenceCreate,
    ReferenceOut,
    ReferenceUpdate,
    ReferenceBulkUpdate,
    ReferenceBulkResult,
)
```

to:

```python
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import require_admin, require_vendor
from models.collection import Collection
from models.reference import Reference
from models.user import User
from schemas.reference import (
    ReferenceCreate,
    ReferenceOut,
    ReferenceUpdate,
    ReferenceBulkUpdate,
    ReferenceBulkResult,
)
```

Then change `list_references` from:

```python
@router.get("/", response_model=list[ReferenceOut])
def list_references(
    collection_id: Optional[int] = None,
    category:      Optional[str] = None,
    search:        Optional[str] = Query(None, description="Busca en código y descripción"),
    active_only:   bool = True,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    q = db.query(Reference)
    if active_only:
        q = q.filter(Reference.is_active == True)
    if collection_id:
        q = q.filter(Reference.collection_id == collection_id)
    if category:
        q = q.filter(Reference.category == category)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Reference.code.ilike(like) | Reference.description.ilike(like)
        )
    return q.order_by(Reference.code).all()
```

to:

```python
@router.get("/", response_model=list[ReferenceOut])
def list_references(
    collection_id: Optional[int] = None,
    category:      Optional[str] = None,
    search:        Optional[str] = Query(None, description="Busca en código y descripción"),
    active_only:   bool = True,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    q = db.query(Reference)
    if active_only:
        q = q.filter(Reference.is_active == True)
    if collection_id:
        q = q.filter(Reference.collection_id == collection_id)
    else:
        # Sin collection_id explícito (buscador del vendedor): solo mostrar
        # referencias de colecciones activas. AdminPage siempre pasa
        # collection_id explícito (incluso de colecciones inactivas para
        # poder gestionarlas), así que ese flujo no pasa por este filtro.
        q = q.join(Collection).filter(Collection.is_active == True)
    if category:
        q = q.filter(Reference.category == category)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Reference.code.ilike(like) | Reference.description.ilike(like)
        )
    return q.order_by(Reference.code).all()
```

- [ ] **Step 3: Verify the change is live in the running container**

Run: `docker compose -f tixy_backend/docker-compose.yml logs backend --tail 20`

Expected: a `WatchFiles detected changes` / reload log line shortly after saving the file (confirms hot-reload picked it up — no restart needed).

- [ ] **Step 4: Manually verify the filter with a direct DB query (bypasses auth, exercises the exact same SQLAlchemy query)**

Run:

```bash
docker compose -f tixy_backend/docker-compose.yml exec backend python -c "
from core.database import SessionLocal
from models.reference import Reference
from models.collection import Collection

db = SessionLocal()

# Todas las colecciones y su estado
for c in db.query(Collection).all():
    print('collection', c.id, c.name, 'active=', c.is_active)

# Réplica exacta del query sin collection_id (lo que usa el buscador del vendedor)
q = db.query(Reference).filter(Reference.is_active == True).join(Collection).filter(Collection.is_active == True)
ids_active_join = {r.id for r in q.all()}

# Réplica del query viejo (sin join) para comparar
all_active_refs = {r.id for r in db.query(Reference).filter(Reference.is_active == True).all()}

inactive_collection_ids = {c.id for c in db.query(Collection).filter(Collection.is_active == False).all()}
refs_in_inactive_collections = {r.id for r in db.query(Reference).filter(Reference.collection_id.in_(inactive_collection_ids)).all()} if inactive_collection_ids else set()

print('total active refs (old behavior):', len(all_active_refs))
print('active refs after join+filter (new behavior):', len(ids_active_join))
print('refs sitting in inactive collections:', len(refs_in_inactive_collections))
print('any inactive-collection ref leaking into new result?', bool(ids_active_join & refs_in_inactive_collections))
db.close()
"
```

Expected: the last line prints `False` (no reference from an inactive collection appears in the new filtered result). If there happen to be zero inactive collections in this environment, `refs_in_inactive_collections` will be empty and the check is trivially satisfied — that's fine, it still proves the query runs without error; the important assertion is `ids_active_join` is a subset of `all_active_refs` and excludes anything tied to an inactive collection.

- [ ] **Step 5: Confirm `AdminPage`'s explicit-`collection_id` path is unaffected**

Run:

```bash
docker compose -f tixy_backend/docker-compose.yml exec backend python -c "
from core.database import SessionLocal
from models.reference import Reference
from models.collection import Collection

db = SessionLocal()
inactive = db.query(Collection).filter(Collection.is_active == False).first()
if inactive:
    q = db.query(Reference)  # active_only=False como hace AdminPage
    q = q.filter(Reference.collection_id == inactive.id)  # collection_id explícito -> sin filtro de Collection.is_active
    print('refs found for explicit inactive collection_id:', q.count())
else:
    print('no inactive collections in this environment — skip, admin path unchanged by inspection')
db.close()
"
```

Expected: if an inactive collection exists with references, `q.count()` returns a non-zero count matching what `AdminPage` would show (proves the explicit-`collection_id` branch still ignores `Collection.is_active`, as required).

- [ ] **Step 6: Commit**

```bash
git add tixy_backend/backend/routers/references.py
git commit -m "fix: restrict vendor reference search to active collections"
```

---

### Task 2: Frontend — show collection name in reference search results

**Files:**
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:749-771`

**Interfaces:**
- Consumes: `collections` state (already populated by `getCollections()` at mount, array of `{ id, name, year, season, is_active }`); `refResults` state (array of `ReferenceOut`, each has `collection_id: int`).
- Produces: no new state, no new props — purely a rendering change to the existing reference-search dropdown.

- [ ] **Step 1: Read current block to confirm line numbers**

Run: `sed -n '749,771p' tixy_frontend/src/pages/VendorPage.jsx`

Expected: matches the "before" block in Step 2.

- [ ] **Step 2: Add the collection name lookup and display it under the description**

Change:

```jsx
            {showRefDD && refResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line
                              rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {refResults.map(ref => {
                    const yaEnPedido = lines.some(l => l.refId === ref.id)
                    return (
                      <div key={ref.id}
                        onClick={() => !yaEnPedido && selectRef(ref)}
                        className={`flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0
                          ${yaEnPedido
                            ? 'opacity-50 cursor-not-allowed bg-surface'
                            : 'hover:bg-pink-light cursor-pointer'}`}>
                        <span className="font-mono text-xs font-semibold text-pink-dark w-14 shrink-0">{ref.code}</span>
                        <span className="text-sm text-ink-2 flex-1">{ref.description}</span>
                        {yaEnPedido
                          ? <span className="text-[10px] font-semibold text-ink-3 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap">Ya en pedido</span>
                          : <span className="text-xs text-ink-3">{fmt(ref.base_price)}</span>
                        }
                      </div>
                    )
                  })}
              </div>
            )}
```

to:

```jsx
            {showRefDD && refResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-line
                              rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {refResults.map(ref => {
                    const yaEnPedido = lines.some(l => l.refId === ref.id)
                    const colName = collections.find(c => c.id === ref.collection_id)?.name
                    return (
                      <div key={ref.id}
                        onClick={() => !yaEnPedido && selectRef(ref)}
                        className={`flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0
                          ${yaEnPedido
                            ? 'opacity-50 cursor-not-allowed bg-surface'
                            : 'hover:bg-pink-light cursor-pointer'}`}>
                        <span className="font-mono text-xs font-semibold text-pink-dark w-14 shrink-0">{ref.code}</span>
                        <span className="text-sm text-ink-2 flex-1">
                          {ref.description}
                          {colName && <span className="block text-[11px] text-ink-3">{colName}</span>}
                        </span>
                        {yaEnPedido
                          ? <span className="text-[10px] font-semibold text-ink-3 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap">Ya en pedido</span>
                          : <span className="text-xs text-ink-3">{fmt(ref.base_price)}</span>
                        }
                      </div>
                    )
                  })}
              </div>
            )}
```

- [ ] **Step 3: Manually verify in the browser**

The Vite dev server is already running at `http://localhost:5173`. Load the vendor page, log in as a vendor, type a partial code/description into "Buscar referencia por código o descripción" that you confirmed (Task 1, Step 4) has active-collection matches.

Expected: each result row shows the collection name in small gray text under the description. Confirm no row shows a collection you identified as inactive in Task 1.

- [ ] **Step 4: Commit**

```bash
git add tixy_frontend/src/pages/VendorPage.jsx
git commit -m "feat: show collection name in vendor reference search results"
```

---

### Task 3: Frontend — fix stale store/client fields when selecting from client search

**Files:**
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:185-195` (`selectStore`)
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:648-665` (client-with-no-stores branch)

**Interfaces:**
- Consumes: existing state setters `setSelectedStore`, `setClientName`, `setStoreName`, `setNit`, `setTel`, `setCel`, `setAddress`, `setCity` (all already defined in the component, lines 27-37).
- Produces: no new state — just makes the two client-selection code paths fully overwrite (or clear) every store-derived field instead of leaving stale values from a previous selection.

- [ ] **Step 1: Read both blocks to confirm line numbers**

Run: `sed -n '185,195p;648,665p' tixy_frontend/src/pages/VendorPage.jsx`

Expected: matches the "before" snippets in Steps 2 and 3.

- [ ] **Step 2: Fix `selectStore` — fill `cel` from the store's phone**

Change:

```js
  function selectStore(client, store) {
    setSelectedStore({ id: store.id, clientId: client.id, name: store.name, city: store.city, address: store.address })
    setClientName(client.business_name)
    setStoreName(store.name)
    setNit(client.nit || '')
    setTel(client.phone || '')
    setAddress(store.address || '')
    setCity(store.city || CITIES[0])
    setClientSearch('')
    setShowClientDD(false)
  }
```

to:

```js
  function selectStore(client, store) {
    setSelectedStore({ id: store.id, clientId: client.id, name: store.name, city: store.city, address: store.address })
    setClientName(client.business_name)
    setStoreName(store.name)
    setNit(client.nit || '')
    setTel(client.phone || '')
    setCel(store.phone || '')
    setAddress(store.address || '')
    setCity(store.city || CITIES[0])
    setClientSearch('')
    setShowClientDD(false)
  }
```

- [ ] **Step 3: Fix the "cliente sin almacenes" branch — clear store-derived fields and, critically, `selectedStore`**

Change:

```jsx
                      : (
                          <div key={client.id}
                            onClick={() => {
                              setClientName(client.business_name)
                              setNit(client.nit || '')
                              setTel(client.phone || '')
                              setClientSearch('')
                              setShowClientDD(false)
                            }}
                            className="px-4 py-2.5 hover:bg-pink-light cursor-pointer border-b border-line last:border-0">
```

to:

```jsx
                      : (
                          <div key={client.id}
                            onClick={() => {
                              setClientName(client.business_name)
                              setNit(client.nit || '')
                              setTel(client.phone || '')
                              setStoreName('')
                              setAddress('')
                              setCel('')
                              setSelectedStore(null)
                              setClientSearch('')
                              setShowClientDD(false)
                            }}
                            className="px-4 py-2.5 hover:bg-pink-light cursor-pointer border-b border-line last:border-0">
```

(The closing `)` and the rest of that JSX block, including the `<div className="text-xs text-ink-3 mt-0.5">Sin almacenes — ingresa el almacén manualmente</div>` line right after, are unchanged — only the `onClick` body gets the four new lines.)

- [ ] **Step 4: Manually verify in the browser**

In the vendor form: use "Buscar cliente existente", pick a client that **has** a store — confirm "Nombre del almacén", "Dirección", "Cel." all populate (including a phone number in "Cel." if that store has one saved). Then search again and pick a **different** client that has **no stores** registered (dropdown shows "Sin almacenes — ingresa el almacén manualmente") — confirm "Nombre del almacén", "Dirección" and "Cel." are now **empty**, not left over from the previous client.

Expected: no field from the first client/store selection survives into the second selection.

- [ ] **Step 5: Commit**

```bash
git add tixy_frontend/src/pages/VendorPage.jsx
git commit -m "fix: clear stale store fields when selecting a client without stores"
```

---

### Task 4: Frontend — make the missing-field alert impossible to miss on mobile

**Files:**
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:1` (imports — add `useRef` is already imported; need to add nothing new here, confirm)
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:46-48` (state block — add `fieldErrors`)
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:63` (refs block — add `clientNameRef`, `storeNameRef`)
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:83-91` (`resetForm`)
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:207-210` (`flash`)
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:213-233` (`resolveStoreId`)
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:551-558` (banner JSX → fixed toast)
- Modify: `tixy_frontend/src/pages/VendorPage.jsx:677-688` (Cliente / Nombre del almacén inputs)

**Interfaces:**
- Consumes: existing `banner`/`setBanner` state, existing `flash(type, msg)` function, existing `clientName`/`storeName` state and setters.
- Produces: new state `fieldErrors` (shape `{ clientName?: boolean, storeName?: boolean }`), new refs `clientNameRef`, `storeNameRef` (both `useRef(null)`, attached to the Cliente and Nombre del almacén `<input>` elements) — nothing outside this task depends on these names, but keep them exact for the steps below to compose correctly.

- [ ] **Step 1: Read all six current blocks to confirm line numbers**

Run: `sed -n '44,64p;83,91p;185,196p;207,234p;548,559p;677,689p' tixy_frontend/src/pages/VendorPage.jsx`

Expected: six blocks matching the "before" snippets below, in order. (Line numbers for the last three blocks will have shifted by a few lines if Tasks 2 and 3 were already applied — use the surrounding code shown here, not the literal numbers, to locate each block.)

- [ ] **Step 2: Add `fieldErrors` state and the two input refs**

Change:

```js
  const [submitting,  setSubmitting]  = useState(false)
  const [banner,      setBanner]      = useState(null)
  const [lastOrderId, setLastOrderId] = useState(null)
```

to:

```js
  const [submitting,  setSubmitting]  = useState(false)
  const [banner,      setBanner]      = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})   // { clientName?: bool, storeName?: bool }
  const [lastOrderId, setLastOrderId] = useState(null)
```

Change:

```js
  const refSearchRef = useRef(null)
```

to:

```js
  const refSearchRef  = useRef(null)
  const clientNameRef = useRef(null)
  const storeNameRef  = useRef(null)
```

- [ ] **Step 3: Clear `fieldErrors` on form reset**

Change:

```js
  function resetForm() {
    setLines([])
    setClientName(''); setStoreName(''); setAddress('')
    setNit(''); setTel(''); setCel('')
    setCity('Medellín')
    setSelectedStore(null); setClientSearch(''); setRefSearch('')
    setEditingOrder(null)
    setLastOrderId(null)
  }
```

to:

```js
  function resetForm() {
    setLines([])
    setClientName(''); setStoreName(''); setAddress('')
    setNit(''); setTel(''); setCel('')
    setCity('Medellín')
    setSelectedStore(null); setClientSearch(''); setRefSearch('')
    setEditingOrder(null)
    setLastOrderId(null)
    setFieldErrors({})
  }
```

- [ ] **Step 4: Give error toasts more time on screen**

Change:

```js
  function flash(type, msg) {
    setBanner({ type, msg })
    setTimeout(() => setBanner(null), 3500)
  }
```

to:

```js
  function flash(type, msg) {
    setBanner({ type, msg })
    setTimeout(() => setBanner(null), type === 'err' ? 5000 : 3500)
  }
```

- [ ] **Step 5: Make `resolveStoreId` mark which field is missing and scroll/focus it**

Change:

```js
  async function resolveStoreId() {
    if (selectedStore?.id) return selectedStore.id
    if (!clientName.trim() || !storeName.trim()) {
      flash('err', 'Completa el nombre del cliente y del almacén.')
      return null
    }
    const newClient = await createClient({
```

to:

```js
  async function resolveStoreId() {
    if (selectedStore?.id) return selectedStore.id
    const missingClient = !clientName.trim()
    const missingStore  = !storeName.trim()
    if (missingClient || missingStore) {
      setFieldErrors({ clientName: missingClient, storeName: missingStore })
      flash('err', 'Completa el nombre del cliente y del almacén.')
      const target = missingClient ? clientNameRef.current : storeNameRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target?.focus()
      return null
    }
    setFieldErrors({})
    const newClient = await createClient({
```

(The rest of `resolveStoreId` — the `createClient` call, `setSelectedStore`, `return store.id` — is unchanged.)

- [ ] **Step 6: Turn the banner into a fixed toast**

Change:

```jsx
      {banner && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border
          ${banner.type === 'ok'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}
```

to:

```jsx
      {banner && (
        <div className={`fixed z-50 left-4 right-4 bottom-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm
          px-4 py-3 rounded-lg text-sm font-medium border shadow-lg
          ${banner.type === 'ok'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}
```

- [ ] **Step 7: Wire the refs and red-border state into the Cliente / Nombre del almacén inputs**

Change:

```jsx
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Cliente</div>
              <input className="input-base uppercase" value={clientName}
                onChange={e => setClientName(e.target.value.toUpperCase())} placeholder="NOMBRE O RAZÓN SOCIAL" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Nombre del almacén</div>
              <input className="input-base uppercase" value={storeName}
                onChange={e => setStoreName(e.target.value.toUpperCase())} placeholder="NOMBRE DEL ALMACÉN" />
            </div>
          </div>
```

to:

```jsx
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Cliente</div>
              <input ref={clientNameRef}
                className={`input-base uppercase ${fieldErrors.clientName ? 'border-red-500 ring-1 ring-red-400' : ''}`}
                value={clientName}
                onChange={e => { setClientName(e.target.value.toUpperCase()); setFieldErrors(f => ({ ...f, clientName: false })) }}
                placeholder="NOMBRE O RAZÓN SOCIAL" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-ink-3 mb-1">Nombre del almacén</div>
              <input ref={storeNameRef}
                className={`input-base uppercase ${fieldErrors.storeName ? 'border-red-500 ring-1 ring-red-400' : ''}`}
                value={storeName}
                onChange={e => { setStoreName(e.target.value.toUpperCase()); setFieldErrors(f => ({ ...f, storeName: false })) }}
                placeholder="NOMBRE DEL ALMACÉN" />
            </div>
          </div>
```

- [ ] **Step 8: Manually verify in the browser (desktop viewport first)**

On `http://localhost:5173`, log in as vendor, add at least one reference to the order, leave "Nombre del almacén" empty, fill "Cliente", and click "Enviar pedido →".

Expected: a toast appears fixed near the bottom-right of the viewport (not pushed into document flow), the "Nombre del almacén" input gets a red border, the page scrolls to center that input in view, and it receives focus (visible caret). The toast stays up long enough to read (~5s).

- [ ] **Step 9: Manually verify in a mobile viewport — this is the actual bug from the video**

Use Chrome DevTools device toolbar (or the `claude-in-chrome` mobile viewport) at a phone width (e.g. 390×844), scroll all the way to the bottom of the form so "Enviar pedido →" is the last visible element (matching the WhatsApp video), leave "Nombre del almacén" empty, tap "Enviar pedido →".

Expected: the toast is visible **without scrolling** (it's `fixed` to the viewport, anchored bottom on mobile per the `left-4 right-4 bottom-4` classes), and the page then smooth-scrolls up to reveal the red-bordered, focused "Nombre del almacén" field.

- [ ] **Step 10: Verify existing red border clears once the field is filled in**

With the red border showing from Step 8/9, type a value into "Nombre del almacén".

Expected: the red border disappears immediately (on the first keystroke), before re-submitting.

- [ ] **Step 11: Commit**

```bash
git add tixy_frontend/src/pages/VendorPage.jsx
git commit -m "fix: make missing-field alert visible on mobile with toast + field highlight"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (alert visibility) → Task 4. Section 2 (collection restriction + name display) → Tasks 1 and 2. Section 3 (stale client/store fields) → Task 3. All three spec sections have a corresponding task.
- **Placeholder scan:** no TBD/TODO; every step shows the literal before/after code or an exact runnable command with expected output.
- **Type/name consistency:** `fieldErrors`, `clientNameRef`, `storeNameRef` are introduced once (Task 4, Step 2) and used with the same names in Steps 5 and 7 of the same task. `setCel`, `setSelectedStore`, etc. used in Task 3 match the existing declarations at lines 27-37 (unchanged, not redefined anywhere). Task 1's `Collection` import name matches its usage in the same task's query change. No task renames or shadows a name defined in another task.
- **Task independence:** Tasks 1–4 touch disjoint line ranges except that Task 4 edits the same file as Tasks 2 and 3; Task 4's Step 1 explicitly tells the implementer to locate blocks by surrounding code rather than trust stale line numbers if executed after Tasks 2/3. Recommended execution order: 1 → 2 → 3 → 4 (matches the plan order) to keep line-number references accurate, but any order works since the diffs don't overlap.
