# Secyposbot

Bot de Telegram para administrar suscripciones a un canal privado con revisión manual de pagos.

## Requisitos

- Node.js 20 o superior
- Un bot creado con BotFather
- Un canal privado donde el bot sea administrador

## Configuración

```sh
cd Secyposbot
npm install
cp .env.example .env
```

Completa `.env` con el token del bot, el ID negativo del canal y los IDs numéricos de los administradores. Nunca subas `.env` al repositorio. El bot necesita permiso para invitar usuarios y restringir miembros. Inicia una conversación privada con el bot desde cada cuenta administradora antes de probar notificaciones.

Para obtener los IDs, puedes consultar tu ID numérico y el ID del canal reenviando una publicación del canal a un bot de consulta de IDs de Telegram. El ID del canal privado suele comenzar con `-100`. En `ADMIN_IDS`, escribe solo números separados por coma, sin corchetes.

Antes de iniciar el bot, comprueba el token, el canal y los permisos configurados:

```sh
npm run doctor
```

El comando no imprime ni transmite el token; consulta a Telegram y muestra el usuario del bot, el título del canal y el resultado de los permisos necesarios.

Los planes y precios iniciales están en `src/config.js`. Cambialos antes de aceptar pagos.

## Demo web local de catálogo y videos

El prototipo permite seleccionar videos del dispositivo, subirlos al almacenamiento local del Codespace, asignarles un número correlativo, publicar artículos, reproducirlos y registrar vistas/ventas de prueba. Es independiente del bot, su `.env` y la base de suscripciones. No contacta un proveedor de video: reproduce el archivo original y no genera HLS.

Este demo anterior sigue sin autenticación y no debe usarse para gestionar pagos reales. El nuevo prototipo Next está en [`apps/panel`](../apps/panel/README.md): incorpora un panel de modelo protegido por código, catálogo con PostgreSQL y vista de socio con token firmado. La reproducción de Cloudflare aún no está firmada, el panel admin y los roles de cliente no están implementados, y Mercado Pago sigue inactivo. Consulta [TODO.md](./TODO.md) para las tareas pendientes.

```sh
cd Secyposbot
npm run demo
```

Abre el puerto 3000 en la pestaña **Ports** de VS Code/Codespaces; está configurado para reenviarse automáticamente. Para abrirlo desde el teléfono, usa el enlace HTTPS que muestra Codespaces y mantén la visibilidad del puerto en **Private**. Inicia sesión con la misma cuenta de GitHub autorizada para el Codespace.

Los metadatos de prueba se guardan en `data/demo-catalog.sqlite` y los videos en `data/demo-videos/`; ambos se excluyen de Git. Límite de subida: 500 MiB por archivo. Este demo no tiene autenticación propia ni está preparado para producción: no cambies el puerto a público ni cargues contenido sensible.

Para usar otro puerto o carpeta durante una prueba, configura `DEMO_PORT`, `DEMO_DB_PATH` o `DEMO_UPLOAD_DIR` en el entorno del proceso. No hace falta añadirlos a `.env`.

## Comandos de desarrollo

```sh
npm run migrate
npm test
npm run check
npm run dev
```

Para iniciar en primer plano, usa `npm start`. El proceso aplica el esquema al iniciar, recibe updates por long polling y ejecuta el barrido de vencimientos cada hora. Ejecuta una sola instancia para evitar conflictos de polling y tareas duplicadas.

## Flujo de operación

1. La persona abre el bot y usa `/start`.
2. Usa `/planes` o `/pagar`, elige un plan y transfiere al alias configurado.
3. Envía el comprobante como texto o foto.
4. El bot lo envía a los administradores; un admin confirma o rechaza el pago.
5. Al confirmar, el bot activa o extiende la suscripción y envía un enlace con solicitud de ingreso.
6. El bot aprueba la solicitud solo si la suscripción sigue activa.
7. El proceso avisa cuando faltan tres días y retira el acceso al vencer.

Comandos de usuario: `/start`, `/planes`, `/pagar`, `/estado`, `/acceso`.

Comandos de administrador: `/link`, `/lista`, `/sweep`.

La revisión del comprobante es manual; recibir una foto o un texto no confirma que el pago se haya realizado. Mercado Pago está elegido como proveedor objetivo, pero no está integrado ni habilitado. Para activarlo faltan importes aprobados en ARS, definir la política de renovación, credenciales y un webhook HTTPS. Telegram tampoco puede impedir por completo que alguien capture o copie contenido.

## CLI y despliegue

Este scaffold incluye una CLI de proyecto mediante scripts npm (`migrate`, `test`, `check`, `dev`, `start`). No usa `tgcloud`: la publicación npm consultada no ofrece README y el repositorio enlazado no estaba accesible, así que no se asumió una API de despliegue incompatible. Para producción, usa un host Node.js que mantenga el proceso activo, persista `DB_PATH` y permita long polling; configura las variables de `.env` como secretos del host. SQLite requiere almacenamiento persistente y una sola instancia.

Antes de habilitar pagos reales, prueba con un canal y una cuenta secundaria: comprobante aprobado/rechazado, acceso, renovación, recordatorio y vencimiento. No compartas el token del bot ni publiques IDs privados en logs o documentación.