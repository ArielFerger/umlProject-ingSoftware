# Práctica de respuesta correcta

14 de octubre de 2026. Se agregan 50 preguntas de opción múltiple basadas en el resumen aportado y en temas de los parciales. No se modifican las consignas históricas.

## Contenido y comportamiento

El banco `lib/study-choice.json` utiliza IDs e106–e155, diez preguntas por nivel y cuatro opciones únicas por pregunta. Incluye conceptos y diferencias de patrones, roles/UML, tres lecturas de C++ reutilizadas, calidad, mejora de procesos, CMMI, Git, métricas y casos de Muebles Express, SoftMetrics, farmacia y sensores. Las posiciones correctas se distribuyen 13/13/12/12 entre A/B/C/D. Cada opción tiene una explicación alineada; una respuesta equivocada muestra el motivo del distractor seleccionado sin conceder finalización, y una correcta muestra la explicación y registra avance.

La copia del PDF aportado se conserva sin cambios en la fuente 32, con 36 páginas y SHA-256 `9f56aa6644c6a72d3d82d3c9fba89a5b69d0d753ba6a999fa0fd6bcfdad84778`, coincidente con el archivo de Downloads. Se extrajo el texto de las 36 páginas y se inspeccionaron renderizados de las páginas 1, 26 y 36. La biblioteca tiene 31 documentos y 255 páginas PDF, contando las dos versiones aportadas del resumen; el recorrido tiene 155 ejercicios, 74 de opción múltiple y 19 actividades de lectura C++.

La entrada `/estudio?modo=opciones` y el acceso en Mi recorrido abren práctica de respuesta correcta. El filtro de actividad se combina con los filtros existentes de nivel, tema y repaso. Siguiente desafío se mantiene entre elecciones cuando está activo este formato, ordenando su progresión por nivel. Las actividades que requieren desarrollo o UML mantienen sus editores y comportamientos propios. Los IDs anteriores y las respuestas de los parciales se conservan. El contenido de `lib/study-papers.json` no presenta diferencias en Git respecto de la versión publicada anterior.

Las preguntas distinguen la estructura del patrón de sus garantías concretas: Observer no establece un orden aleatorio obligatorio; Singleton requiere declarar alcance y concurrencia; datos o herramientas aislados no prueban nivel 4 o 5 de CMMI. Los casos de madurez se formulan dentro del esquema didáctico del curso, sin afirmar una evaluación oficial. Las preguntas inspiradas en los exámenes se identifican como entrenamiento adicional.

## Verificación

- Build de Docker: comprobación de tipos, 56 pruebas y compilación Vinext aprobadas.
- `tests/study-grading.test.mjs` verifica cuatro opciones, feedback alineado, distribución de respuestas, niveles y referencias, todas las respuestas de las 50 preguntas, rechazo de índices inválidos y conservación de decimales/tolerancia en la corrección numérica. La nueva función pura conserva la corrección existente y evita convertir espacio, hexadecimal o notación exponencial en índice cero.
- `.sites-runtime/choice-qa.mjs`/`choice-qa.json`: las 50 actividades se probaron en Chrome con respuesta incorrecta y correcta, feedback, ausencia de finalización por error, progreso previo y del parcial, recarga, filtros, continuación entre elecciones, lectura C++ sin editor, copia sin filtración del solucionario y PDF accesible. El contexto privado de prueba no modifica respuestas reales ni documentos del usuario.
- Capturas revisadas en Claro a 1440×1100 y 390×844: listas, respuesta correcta y respuesta incorrecta, dentro de `.impeccable/review/choice-*.png`. No se observó desbordamiento móvil ni errores de página. La segunda ronda se limitó a la confirmación del feedback incorrecto después de finalizar su animación de entrada; no hubo correcciones visuales nuevas.
- Detector ejecutado una vez sobre Study y study.css: cero hallazgos primarios y avisos orientativos del sistema tipográfico existente. Se mantienen paleta, fuentes, controles, distribución y movimiento del sistema; no se modifica DESIGN.md.

Docker estaba apagado al comenzar; se inició la instalación existente por usuario. Después de la primera QA el contenedor quedó detenido con salida 0 mientras había procesos de actualización de Docker activos. Se volvió a iniciar el mismo contenedor sin reconstruir ni alterar su volumen; quedó saludable y se completaron las capturas de confirmación.

La cobertura visual se limita a Chrome, Claro y los tamaños citados. No equivale a pruebas en dispositivos físicos, otros temas o lectores de pantalla ni a una auditoría académica independiente. No se ejecutó un nuevo build de Vercel para este cambio. Las preguntas y explicaciones son material de entrenamiento, no respuestas oficiales de la cátedra.
