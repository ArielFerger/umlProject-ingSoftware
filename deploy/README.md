# UML Studio en un VPS

La variante online usa cuentas propias (usuario y contraseña), cookies HttpOnly y HTTPS. Cada persona tiene sus diagramas y puede unirse a los de otra mediante una invitación. El propietario elige lectura o edición y puede cambiar o revocar permisos. Los enlaces vencen en siete días; revocarlos impide nuevos ingresos, pero los miembros existentes se quitan por separado.

## Docker y proxy existente

1. Copiá `deploy/online.env.example` a `.env.online` y configurá `UML_PUBLIC_ORIGIN` con la URL HTTPS completa y `UML_PROXY_NETWORK` con la red de Caddy/Traefik. No lleva contraseña maestra ni una identidad compartida.
2. Compilá y arrancá: `docker compose --env-file .env.online -f compose.online.yaml up --build -d`.
3. Agregá al proxy un host como el de `deploy/Caddyfile.example`. El proxy debe estar en la misma red Docker y conservar el encabezado Host. La aplicación valida el origen configurado. No expongas el puerto interno de Wrangler (8787).
4. Abrí la URL y creá tu cuenta. Las cuentas son independientes de ChatGPT y del sitio publicado con Sites. Las contraseñas se guardan con scrypt y sal aleatoria; los tokens de sesión e invitación se almacenan como hashes.

Sin dominio propio se puede usar temporalmente un nombre DNS con la IP del VPS, por ejemplo `uml.203.0.113.10.sslip.io`, y HTTPS de Caddy. Cuando tengas un dominio, cambiá el host del proxy y `UML_PUBLIC_ORIGIN`; la base y los permisos siguen en el volumen. Las sesiones deben abrirse otra vez en el nuevo dominio.

## Dominio de este proyecto

El dominio principal es `diagramia.online`. En DonWeb, el registro A del dominio raíz apunta al VPS y `www` es un CNAME a `diagramia.online`. El proxy redirige `www` al dominio principal; `UML_PUBLIC_ORIGIN` debe ser `https://diagramia.online`. Caddy emite y renueva los certificados cuando el DNS público ya resuelve. No cambies el origen de la aplicación mientras la nueva delegación todavía no esté publicada.

Al migrar desde la dirección temporal, conservá el mismo volumen y redirigí la dirección anterior al dominio principal manteniendo ruta y consulta. Los usuarios inician sesión otra vez en el dominio nuevo; sus tableros y permisos siguen en la misma base.

## Compartir y sincronizar

Abrí un diagrama, pulsá **Compartir**, elegí **Puede ver** o **Puede editar** y creá un enlace. El invitado entra o crea su cuenta; el mismo tablero aparece en su explorador. Los permisos se validan en el servidor, también para historial, edición y eliminación. Sólo el propietario administra participantes e invitaciones y puede eliminar el documento.

Las ventanas visibles consultan revisiones cada dos segundos y descargan sólo diagramas actualizados. Los cambios en texto o posiciones independientes se combinan; cambios superpuestos muestran un conflicto conservando el borrador. **Conservar como copia** guarda una versión personal para comparar y volver al tablero compartido. No hay cursores ni presencia remota. El progreso de Estudio y Git sigue siendo local al navegador.

Los cambios recibidos de otra persona no crean entradas de Deshacer. El historial de versiones del servidor conserva las revisiones de todos los editores.

## Datos y respaldo

`uml-online-data` contiene la base de cuentas y sesiones y las bases D1 locales de diagramas, permisos e historial. Sobrevive a reinicios, reconstrucciones y `docker compose down`. Nunca ejecutes `down -v` si querés conservarlo.

Para un respaldo consistente, detené brevemente el servicio y archivá el volumen completo, luego volvé a iniciarlo. Restaurá en un volumen vacío con el mismo propietario de archivos (UID 1000 de la imagen). Guardá el respaldo fuera del VPS y protegelo: contiene los diagramas y hashes de contraseñas. No hay recuperación por correo configurada; conservá la contraseña de la cuenta y los respaldos.

Para actualizar: respaldá, construí/cargá la imagen nueva y ejecutá `docker compose --env-file .env.online -f compose.online.yaml up -d`. El inicio aplica las migraciones pendientes. Para volver a una imagen anterior, comprobá antes su compatibilidad con las migraciones aplicadas.

La variante personal de `compose.yaml` sigue siendo de un solo usuario y sólo para localhost. Vercel continúa usando IndexedDB del navegador. El conector MCP de Sites no está disponible en el VPS.
