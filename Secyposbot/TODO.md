# Lista de tareas

## Paneles web

- [ ] Implementar autenticacion web y permisos de servidor para cliente, modelo y administrador. No usar el selector de vistas del demo como control de acceso.
- [ ] Crear el panel de cliente: perfil, nivel y vencimiento, historial de pagos, renovacion y contenido disponible.
- [ ] Crear el panel de modelo: carga y publicacion de contenido, catalogo, metricas e ingresos propios.
- [ ] Crear el panel de administracion: cuentas y roles, suscripciones, pagos pendientes, planes y registro de acciones.
- [ ] Aislar los datos y archivos de cada modelo y comprobar los permisos en cada endpoint, no solo en la interfaz.
- [ ] Agregar pruebas para acceso permitido/denegado, aislamiento de datos, renovaciones y vencimientos.

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

- [ ] Configurar el remoto Git del repositorio destino y confirmar la rama de publicacion.
- [ ] Revisar los archivos a publicar y excluir `.env`, bases de datos, videos, `node_modules` y configuracion local.
- [ ] Ejecutar pruebas y comprobaciones; crear el commit y subirlo al remoto autorizado.

## Estado actual

Los paneles cliente y modelo son vistas de un demo local, no cuentas con roles: el servidor del demo no tiene autenticacion y no debe exponerse publicamente. El panel de administrador web aun no existe. Los pagos reales de Mercado Pago estan inactivos; el bot conserva la aprobacion manual de comprobantes. Para activarlos faltan los precios en ARS, la politica de renovacion, las credenciales y una URL HTTPS para el webhook.
