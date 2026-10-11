# Verificación del rediseño UML Studio

La extensión posterior de Vercel y selección de flechas se verifica en [verification-vercel.md](verification-vercel.md). Este informe conserva la evidencia del rediseño original.

## Resultado funcional

- `npm run typecheck`, `npm test` y `npm run build`: aprobados dentro de la imagen Docker final, Node.js 24. Las 20 pruebas verifican metadatos UML, mutaciones de clases y semántica del simulador Git, incluido repositorio vacío, primer commit, remoto, conflictos y autocompletado sin ejecución.
- `npm run test:docker`: prueba del adaptador HTTP aprobada. Comprueba identidad local, límites de host/origen, redirecciones y salud de Worker/D1.
- ESLint de los archivos nuevos de Git, propiedades, temas y Docker: aprobado. El lint completo conserva errores previos del editor; no se declara aprobado.
- `git diff --check`: aprobado.
- Docker Compose reconstruido; contenedor saludable y puerto publicado en `127.0.0.1:3000`. Las migraciones locales se aplican de forma incremental y los datos quedan en el volumen `uml-data`.

## Navegador y persistencia

- Los siete ejercicios se completaron usando la consola web. Se verificaron preparación, commit, rama, merge, push, fetch, integración y resolución de conflictos. Las condiciones comprueban el estado real de la simulación.
- Se creó una carpeta completamente vacía con un nombre propio; `git init`, creación de README, `add`, primer commit sin padres, `remote add` y primer push produjeron los estados esperados. Ningún comando accede al repositorio real.
- El autocompletado inserta por Tab o clic; se comprobó la opción apagada, archivos existentes y la recuperación del estado y la preferencia al recargar.
- El editor mantuvo edición visual de miembros, deshacer/rehacer, vista dividida, guardado y exportación SVG. El PNG descargado con Studio + Grafito contiene fondo oscuro y nombres, miembros y etiquetas legibles.
- La API local creó el documento de prueba, conservó historial, rechazó una revisión obsoleta con 409 y persistió notas, código y `%% uml-studio:` después de reconstrucciones. Se respaldó y eliminó únicamente el documento temporal de QA con su revisión actual.
- Los archivos del contenido del curso y sus 25 documentos originales no se modificaron. La sesión y el progreso del estudio se conservan separados de Git Lab.

## Evidencia visual

Matriz de Claro, Grafito, Noche azul y Papel; Git y UML a 1440×900 y 1280×720. Las capturas móviles de Git son de 375×812 píxeles (el navegador informó un viewport DOM de 390×844); las de UML y Estudio son de 390×844 píxeles. Los archivos de captura conservan los bytes JPEG que devuelve la API bajo los nombres de revisión `.png`; no se altera su contenido.

Git móvil se verifica en dos estados de scroll, con las cuatro zonas arriba y la consola abajo. También se capturaron el formulario de repositorio nuevo y las sugerencias del repositorio vacío en escritorio y móvil. La ficha Singleton confirma la familia del patrón debajo del título. Las capturas se abrieron después de esperar el estado renderizado; no se usa evidencia de carga o del tema anterior.

Copias y exportaciones de QA en `.sites-runtime/qa/`, ignoradas por Git. Copias para el revisor en `.impeccable/review/`, también ignoradas. Los controles respetan `prefers-reduced-motion`; la revisión de movimiento se basa en el código, sin grabaciones de animaciones.

## Detector de Impeccable

`detector.json` devuelve `[]`: **0 findings**. Se ejecutó `--no-config` sobre las 12 superficies de interfaz enumeradas en README. `detector-scope.json` registra cada ruta y SHA-256. No se silenciaron reglas ni se excluyeron patrones. El resultado se limita a esas superficies; la revisión visual y funcional se registra por separado.

## Revisión independiente

El revisor de Impeccable solicitó corregir el fondo del PNG bajo temas oscuros, las etiquetas sobre títulos de Estudio y las barras de desplazamiento claras en superficies oscuras. Se aplicó el lote y se recapturó la misma matriz. El veredicto final se guarda en `finish-review.md`.
