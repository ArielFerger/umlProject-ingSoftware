# Parciales originales: fidelidad y verificación

12 de octubre de 2026. El usuario pidió conservar los exámenes tal como se tomaron: consigna, enunciado íntegro, pregunta siguiente, numeración y orden. También autorizó commit y push al terminar.

## Fuentes y contenido

- 2025: las tres imágenes aportadas (fuentes 29, 30 y 31). Teoría presenta SoftMetrics, sus siete características y las preguntas 1–5 con 5, 10, 5, 20 y 10 puntos. Práctica reinicia la numeración en 1–2. Muebles Express conserva los tres párrafos completos de la hoja; esa consigna pide identificar y justificar patrones, no modelar un UML adicional.
- 2024: foto (28) y `Modelo Parcial 2024.docx` (17). El texto XML del Word recupera los bordes cortados de la foto, y confirma la cuarta pregunta. El diagrama farmacéutico y la continuación del código se extrajeron sin modificaciones de los medios del Word. Se conserva la referencia original a Eiffel y el código original de Operador, sin reparar sus particularidades de sintaxis.
- Los idiomas del documento histórico se preservan, incluido PHP en 2025. Las adaptaciones C++ son prácticas separadas, de solo lectura. Los originales tienen enlaces a sus fuentes. No se sustituyen consignas por resumen ni se inventan preguntas adicionales.

## Presentación y respuestas

`/estudio?parcial=2025` y `/estudio?parcial=2024` muestran cada parcial consecutivamente en una sola página. El catálogo diferencia Parciales por año de Simulacros de práctica adicional. Los intentos con tiempo abren el documento completo; los tiempos siguen siendo propuestas de entrenamiento. Los campos `p2024-*` y `p2025-*` guardan respuestas propias, con importación/exportación y recarga, sin sobrescribir las respuestas de ejercicios ni alterar su XP. Las preguntas que solicitan modelado tienen un espacio Mermaid opcional que reutiliza editor, lienzo, historial y guía.

Se puede copiar una pregunta o el parcial completo: conserva contexto original, numeración, puntos, código, respuesta y UML del estudiante. No adjunta soluciones de referencia. La pregunta farmacéutica incorpora la transcripción textual del diagrama al texto de copia para explicar la figura sin asumir que una IA puede acceder al archivo local. La corrección se habilita al finalizar el intento con tiempo.

## Evidencia

- Build final de Docker: comprobación de tipos, 52 pruebas y compilación Vinext aprobadas.
- `tests/study-paper.test.mjs`: estructura y puntajes de 2025, texto completo de Muebles Express, ausencia de tarea UML añadida, cuatro preguntas originales de 2024, conservación de idiomas/código/medios, IDs propios y copia con contexto y respuestas reales.
- `.sites-runtime/paper-qa.mjs` y `paper-qa.json`: orden de todas las preguntas, texto y código mostrados, copia por pregunta/completa, respuestas separadas, recarga, exportación/importación, diagrama editable y guía, cronómetro, fuentes servidas y ausencia de errores de página/desbordamiento móvil. Se usó un contexto privado de Chrome, sin modificar respuestas reales ni diagramas del usuario.
- Capturas revisadas en Claro: 1440×1200 y 390×844; `paper-2025-desktop.png`, `paper-muebles-desktop.png`, `paper-2024-desktop.png`, `paper-muebles-mobile.png`, `paper-2024-mobile.png` en `.impeccable/review/`.
- La primera inspección detectó que el reset global ocultaba los marcadores nativos. Se fijaron `decimal` y `disc` únicamente dentro de los parciales. La segunda y última ronda confirmó números y viñetas visibles en escritorio y móvil; las pruebas del navegador verifican también sus estilos computados.
- Detector ejecutado una vez: cero hallazgos primarios; avisos tipográficos orientativos que reutilizan la jerarquía de Estudio. Se mantiene el sistema visual y no se reparó su deriva histórica.

La revisión está limitada a estas fuentes y tamaños de Chrome en tema Claro. No equivale a una verificación de duración oficial, soluciones de la cátedra, dispositivos físicos, otros navegadores o lectores de pantalla. El contenido histórico se transcribió de los documentos aportados, con espaciado de código y saltos de línea normalizados para lectura, sin suponer que los fragmentos originales son programas compilables. No se ejecutó un nuevo build de Vercel para este cambio.
