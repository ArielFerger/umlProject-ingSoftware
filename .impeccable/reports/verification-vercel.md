# Verificación de Vercel y selección de relaciones

Esta entrega amplía el rediseño existente sin reemplazar sus temas, simulador Git o material de estudio. La verificación anterior queda en `verification.md`.

## Compilación y comportamiento

- `npm test`: 28 pruebas aprobadas. Incluyen las 20 anteriores y ocho nuevas sobre relaciones Mermaid y almacenamiento: relaciones paralelas, comentarios y metadatos, eliminación acotada, selección obsoleta, validación, repositorio de documentos vacío, historial y conflictos de revisión.
- TypeScript y compilación de producción Next.js aprobados con `npm run build:vercel`. Editor, Estudio y Git respondieron en el servidor de producción `127.0.0.1:3002`.
- Compilación Worker aprobada. Imagen Docker reconstruida con las 28 pruebas y comprobación de tipos; contenedor final saludable en `127.0.0.1:3000`.
- `npm run test:docker`: una prueba del adaptador HTTP aprobada. ESLint de los nuevos módulos, pruebas y configuración aprobado; no se declara aprobado el lint completo del editor heredado.
- `git diff --check` aprobado antes de preparar el commit.

## Vercel

`vercel.json` selecciona Next.js y la compilación específica. La sustitución de `cloudflare:workers` permite compilar para Node sin introducir credenciales ni una base D1 compartida. No se ha publicado en una cuenta Vercel: se verifica la compilación y el servidor local de producción.

En esta plataforma, documentos y hasta 30 versiones anteriores se conservan en IndexedDB por navegador y origen. La comparación de revisión y escritura comparten una transacción. Una revisión obsoleta devuelve 409; datos inválidos se conservan y generan error. El espacio vacío permanece vacío. El editor indica «Guardado en este navegador» y ofrece compartir JSON. La API de documentos y el conector Sites responden 501 con explicación en esta plataforma; Docker conserva su almacenamiento e identidad locales.

Se comprobaron guardado y recuperación al recargar en el modo Next, selección de relaciones por ratón y teclado, apertura del editor con F2 y cambios de etiqueta y multiplicidad. El servidor final de producción carga los tres documentos iniciales y las flechas accesibles. Estudio habilita el recorrido después de cargar el perfil local; Git muestra los siete ejercicios, las cuatro áreas y la consola. No hubo errores ni advertencias de consola en la comprobación del editor de producción.

## Relaciones y evidencia visual

Las relaciones del diagrama de clases tienen una zona invisible de selección de 22 píxeles CSS que conserva su anchura al cambiar el zoom. Clic sobre línea o etiqueta, Enter y Espacio seleccionan; F2 edita y Escape deselecciona. El editor cambia tipo, etiqueta y multiplicidades de la línea seleccionada, mantiene clases y metadatos y usa el historial de deshacer existente. Las áreas invisibles y el resaltado de selección se eliminan de las exportaciones.

La inspección acotada detectó una superposición de la indicación del lienzo con el panel de selección. Se corrigió en un lote y se confirmó con las mismas capturas finales, abiertas visualmente: escritorio Grafito 1440×900, escritorio Claro 1280×720, móvil Grafito 375×812, y diálogo de relación en escritorio y móvil. El zoom inicial es 80%; el lienzo admite desplazamiento para ver el resto del diagrama. Evidencia local ignorada en `.impeccable/review/vercel-*.png`.

## Impeccable y documentación

Detector final: `[]`, cero hallazgos en las 12 superficies y hashes registrados en `detector-scope.json`, con `--no-config` y sin exclusiones. La revisión independiente de esta extensión se registra en `finish-review-vercel.md`.

El documenter entregó `DESIGN.md` y `.impeccable/design.json`, pero alcanzó su límite antes de validar. Se completó la validación siguiendo el rol de documenter en línea: esquema 2, referencias resueltas, ocho secciones canónicas, cuatro temas y 110 colores contrastados con CSS. Se corrigió su asignación de temas para describir el código real. Los ocho conjuntos OKLCH derivados son metadatos exploratorios, no colores normativos.

Resumen del sistema comprobado: petróleo sobrio y neutrales por tema; Source Sans 3 para interfaz; IBM Plex Mono para UML y consola; separación por superficies y bordes discretos; selección y movimiento con feedback sutil y reducción de movimiento. No se canonizaron defectos visuales ni valores ajenos al código.
