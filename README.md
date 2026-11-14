# Multicalc

Calculadora web con **varias calculadoras a la vez**: empezás una cuenta en *Calc 1*, saltás a *Calc 2* o *Calc 3*, y cuando volvés todo sigue donde lo dejaste (incluida la operación a medio hacer, el historial y la memoria).

- **Estilo iPhone**: botones redondos, respeta el orden de operaciones (2 + 3 × 4 = 14), deslizar el número borra un dígito.
- **Estilo Windows**: ejecución inmediata (2 + 3 × 4 = 20), memoria (MC, MR, M+, M−, MS), 1/x, x², √x, CE.
- Historial por calculadora, renombrar, duplicar, borrar.
- Se guarda sola en el teléfono y funciona sin internet.

## Usarla en el iPhone

1. Abrí el link en **Safari**.
2. Tocá **Compartir** → **Agregar a inicio**.
3. Queda como una app más, a pantalla completa.

Cada teléfono guarda sus propias calculadoras (no se mezclan entre personas).

## Publicación (gratis, GitHub Pages)

Settings → Pages → *Deploy from a branch* → elegir la rama y carpeta `/ (root)` → Save.
El link queda en `https://sarkismorales.github.io/Cc/`.

## Desarrollo

Sin dependencias ni build: HTML + CSS + JS.

```bash
python3 -m http.server 8000
```

```bash
node tests/engine.test.mjs
```
