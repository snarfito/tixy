# COMMIT PARA HACER PUSH

## Cambios realizados:

### 1. Backend (tixy_backend/backend/models/order.py)
- ✅ Enum OrderStatus normalizado a mayúsculas (DRAFT, SENT, CONFIRMED, CANCELLED)

### 2. Frontend (tixy_frontend/src/pages/VendorPage.jsx)
- ✅ Actualizado check de status para comparar contra 'DRAFT' y 'SENT' (mayúsculas)
- Línea ~913: `order.status === 'DRAFT' || order.status === 'SENT'`
- Línea ~922: `order.status === 'DRAFT'`

### 3. Database Migration (tixy_backend/normalize_orderstatus.sql)
- ✅ SQL para cambiar ENUM de ('draft','sent','cancelled') a ('DRAFT','SENT','CONFIRMED','CANCELLED')
- ✅ SQL para normalizar datos existentes a mayúsculas

## Instrucciones de push:

```bash
cd ~/Personal/Proyectos/Tixy

git add tixy_backend/backend/models/order.py \
        tixy_backend/normalize_orderstatus.sql \
        tixy_frontend/src/pages/VendorPage.jsx

git commit -m "fix(frontend): actualizar comparación de status a mayúsculas

- VendorPage.jsx: cambiar comparaciones de 'draft'/'sent' a 'DRAFT'/'SENT'
- Sincroniza con la normalización del enum en backend
- Los botones Editar/Enviar ahora aparecen correctamente para órdenes DRAFT"

git push origin main
```

Vercel se redesplegará automáticamente y los botones funcionarán correctamente.

## Verificación post-push:

1. Navega a https://app.tixyglamour.com/vendedor
2. Haz click en "Mis pedidos"
3. Verifica que los borradores (status DRAFT) muestren los botones "Editar" y "Enviar"
