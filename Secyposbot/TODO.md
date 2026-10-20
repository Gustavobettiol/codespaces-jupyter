# Lista de tareas

## Paneles web

- [ ] Completar autenticacion web multiusuario y permisos de servidor para cliente, modelo y administrador. El prototipo Next usa un codigo compartido para el estudio y tokens firmados para socios, pero no tiene cuentas ni roles.
- [ ] Completar el panel de cliente: perfil, nivel y vencimiento, historial de pagos, renovacion y contenido disponible. La primera pagina de socio firmada filtra el catalogo por nivel; pagos y suscripciones no estan conectados.
- [ ] Completar el panel de modelo en `apps/panel`: carga TUS a Cloudflare, correlativo atomico, webhook firmado, catalogo y tabla de metricas. Falta configurar servicios y probar una subida real de punta a punta.
- [ ] Crear el panel de administracion: cuentas y roles, suscripciones, pagos pendientes, planes y registro de acciones.
- [ ] Aislar los datos y archivos de cada modelo y comprobar los permisos en cada endpoint, no solo en la interfaz.
- [ ] Agregar pruebas para acceso permitido/denegado, aislamiento de datos, renovaciones y vencimientos. Las pruebas actuales cubren niveles y firma del webhook.

## Pagos y suscripciones premium

- [x] Elegir Mercado Pago como proveedor objetivo y mantener el flujo actual de transferencia con revision manual.
- [x] Conservar los planes existentes: Base USD 15, Plus USD 30 y VIP USD 50, cada uno por 30 dias, como configuracion actual.
- [ ] Definir importes finales en ARS para Base, Plus y VIP; no convertir automaticamente desde USD sin una regla de cambio aprobada.
- [ ] Decidir si la renovacion sera manual cada 30 dias o recurrente automatica, incluyendo cancelaciones y reembolsos.
- [ ] Configurar credenciales de prueba y luego de produccion en el gestor de secretos del entorno; nunca guardar tokens en Git ni en el frontend.
- [ ] Implementar checkout de Mercado Pago y validar el estado consultando la API del proveedor antes de conceder acceso.
- [ ] Publicar un webhook HTTPS, validar su firma y procesar notificaciones de forma idempotente.
- [ ] Probar pagos aprobados, rechazados, pendientes, duplicados, renovaciones y vencimientos en sandbox antes de activar cobros reales.

## Publicacion

- [x] Confirmar el destino indicado: `https://github.com/Gustavobettiol/laurabot.git` (remoto `upstream`); el `origin` del Codespace sigue apuntando a `codespaces-jupyter`.
- [ ] Revisar los archivos a publicar y excluir `.env`, bases de datos, videos, `node_modules`, `.vscode` y configuracion MCP local.
- [x] Ejecutar pruebas y comprobaciones; crear los commits locales `9ee73e6` y `f0b1890` (8 pruebas aprobadas).
- [ ] Publicar el historial actualizado en `upstream/main`; el repositorio destino estaba vacio y este proceso no tiene credenciales de push.

## Estado actual

Los paneles cliente y modelo son vistas de un demo local, no cuentas con roles: el servidor del demo no tiene autenticacion y no debe exponerse publicamente. El panel de administrador web aun no existe. Los pagos reales de Mercado Pago estan inactivos; el bot conserva la aprobacion manual de comprobantes. Para activarlos faltan los precios en ARS, la politica de renovacion, las credenciales y una URL HTTPS para el webhook.

El nuevo prototipo Next esta en `apps/panel`. Su panel de modelo usa un codigo compartido y su pagina de socio usa tokens firmados; ninguno reemplaza el sistema multiusuario. La reproduccion de Cloudflare sigue sin URL firmada, por lo que solo deben usarse videos de prueba no sensibles. No habilites el puerto Public salvo el tiempo imprescindible para probar el webhook firmado.

El panel usa PostgreSQL local y Drizzle. La futura migracion a Supabase puede conservar las tablas y `DATABASE_URL`; no se instalo ni habilito el MCP de Supabase porque quedo para una fase posterior.
