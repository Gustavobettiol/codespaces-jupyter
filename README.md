# Argentina AI

Bot de Telegram + escena para OBS + Mini App. Todo corre en este Codespace.

## Arrancar
- El bot arranca solo al abrir el Codespace (`postStartCommand`).
- Para arrancarlo a mano: `npm start`
- Para ver si esta vivo: `curl localhost:3001/health`
- Logs: `cat server.log`

## Puertos
- El puerto es 3001. Tiene que estar en Public en la pestana Ports.

## Vercel
- `vercel link` y despues `vercel --prod`
- La Mini App queda en https://TU-PROYECTO.vercel.app/miniapp
