# Laurabot

Proyecto en Codespaces con un bot de Telegram para suscripciones y un prototipo web independiente.

## Panel web

La aplicación Next.js está en [`apps/panel`](./apps/panel/README.md). Incluye un panel de modelo protegido por sesión, PostgreSQL con Drizzle, correlativos atómicos de catálogo, subida directa a Cloudflare Stream, webhook firmado y una página de socios que filtra contenido por nivel.

```sh
cd apps/panel
pnpm install
cp .env.example .env.local
docker compose up -d
pnpm db:push
pnpm db:seed
pnpm dev
```

La aplicación se sirve en el puerto 3001. Configura los secretos en `.env.local`; no los subas a Git. La vista de socio firma niveles y caduca los enlaces a los 30 días, pero la reproducción de Cloudflare aún no usa URLs firmadas. Usa solo videos de prueba no sensibles.

El panel multiusuario de cliente, los roles, la consola de administrador y los pagos premium siguen pendientes. Mercado Pago no está integrado ni activo. La lista completa está en [`Secyposbot/TODO.md`](./Secyposbot/TODO.md).

## Bot de Telegram

Consulta la configuración y las instrucciones del bot en [`Secyposbot/README.md`](./Secyposbot/README.md). El bot conserva el flujo actual de comprobantes con aprobación manual.
