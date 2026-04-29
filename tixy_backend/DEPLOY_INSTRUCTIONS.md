## 🚀 INSTRUCCIONES DE DESPLIEGUE - FIX OrderStatus Enum

### ⚠️ ORDEN CRÍTICA DE EJECUCIÓN:

1. **Ejecutar migración SQL en MySQL (PRIMERO)**
2. **Hacer push del código Python (SEGUNDO)**
3. **Reiniciar backend en Railway (TERCERO)**

---

## PASO 1: Ejecutar Migración SQL en Railway MySQL

**EN RAILWAY DASHBOARD (Database → MySQL):**

Abre la consola/query y ejecuta el contenido completo de:
```
tixy_backend/normalize_orderstatus.sql
```

O desde tu terminal local:
```bash
# Obtener credenciales de Railway
# Luego ejecutar:
mysql -h [host] -u [user] -p[password] [database] < tixy_backend/normalize_orderstatus.sql

# Esperado: Ver que las 3 queries se ejecuten sin error
```

**Verificación posterior:**
```sql
-- Debería mostrar solo valores en MAYÚSCULAS:
SELECT DISTINCT status FROM orders;

-- Debería mostrar el total de órdenes:
SELECT COUNT(*) FROM orders;
```

---

## PASO 2: Hacer Push del Código Python

```bash
cd ~/Personal/Proyectos/Tixy

# Verificar que los cambios estén listos
git status

# Si ya está commiteado:
git push origin main

# Si no:
git add tixy_backend/backend/models/order.py tixy_backend/normalize_orderstatus.sql
git commit -m "fix(backend): normalizar OrderStatus enum a mayúsculas

- ENUM MySQL actualizado de (draft,sent,cancelled) a (DRAFT,SENT,CONFIRMED,CANCELLED)
- Código Python actualizado para usar mayúsculas
- Migración SQL ejecutada para normalizar datos existentes"
git push origin main
```

---

## PASO 3: Monitorear Redepliegue

Vercel (frontend) se redesplegará automáticamente.
Railway (backend) se redesplegará automáticamente.

Monitorea los logs en Railway:
- Debe arrancar sin errores en el enum
- Las órdenes deben cargarse correctamente (GET /orders)
- Los nuevos pedidos deben crearse con status='DRAFT' (mayúscula)

---

## ✅ VERIFICACIÓN FINAL

### En Railway Console (SQL):
```sql
-- Verificar que no hay valores en minúsculas
SELECT * FROM orders WHERE status != UPPER(status);
-- Resultado esperado: 0 filas

-- Verificar valores válidos
SELECT DISTINCT status FROM orders ORDER BY status;
-- Resultado esperado: CANCELLED, CONFIRMED, DRAFT, SENT
```

### En la UI (browser):
1. Navega a /admin o /vendedor
2. Crea una nueva orden (debe funcionar sin error)
3. Verifica que se guarde con status DRAFT
4. Intenta cambiar estado a SENT/CONFIRMED/CANCELLED

---

## 🔄 RESUMEN DEL CAMBIO

| Antes | Después |
|-------|---------|
| `ENUM('draft','sent','cancelled')` | `ENUM('DRAFT','SENT','CONFIRMED','CANCELLED')` |
| Python: `"draft"` | Python: `"DRAFT"` |
| Datos: minúsculas | Datos: mayúsculas |
| ❌ Error al leer órdenes | ✅ Funciona correctamente |

