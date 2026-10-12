# Verificación de casos de empresa, lectura C++ y copia para corrección

11 de octubre de 2026. Entrega local en Docker; no se publicó ni se subió a GitHub en esta ampliación.

## Alcance

Se inspeccionaron las cuatro imágenes del ZIP aportado: una hoja de 2024 y tres del parcial del 8/10/2025. Se conservaron como fuentes 28–31. Los ejercicios existentes de sensores, farmacia, Muebles Express, SoftMetrics y workflow se ampliaron manteniendo sus identificadores. Se añadieron 19 actividades, para 105 ejercicios y seis simulacros. Hay 30 fuentes originales y 219 páginas PDF; las cuatro imágenes se identifican como imágenes, sin sumarlas al conteo de páginas PDF.

La aclaración del usuario fija C++ solo para lectura. Las 16 actividades que incluyen código presentan ejemplos completos en C++17 en un bloque seleccionable, desplazable y descargable; no hay editor ni ejecución de C++ en la aplicación. Las respuestas son razonamiento en texto y, cuando corresponde, Mermaid mediante el motor existente. Las adaptaciones señalan su origen didáctico y los originales conservan su lenguaje. Los nueve esquemas UML nuevos o revisados usan los participantes de su dominio.

Copiar y corregir incluye identificación, consigna, caso, código provisto, opciones, respuesta del estudiante, su borrador real y criterios. Excluye soluciones, respuestas correctas y pistas, incluso después de abrir una solución. No incluye una plantilla como si fuera trabajo del estudiante ni envía el texto a una IA. El fallo del portapapeles ofrece selección manual y descarga. La función está disponible al finalizar un simulacro.

## Verificación

- Build final de Docker: tipos, 48 pruebas y compilación Vinext aprobados; contenedor saludable en localhost:3000 con el volumen existente.
- Los 13 fragmentos distintos de C++ compilaron con `-std=c++17 -Wall -Wextra -Werror -pedantic`, y sus ejecuciones secuenciales produjeron las salidas explicadas. El Singleton deliberadamente inseguro se probó solo secuencialmente: el resultado no constituye evidencia de seguridad concurrente.
- `.sites-runtime/exam-qa.mjs` y `exam-qa.json`: 16 lecturas de solo lectura, nueve guías UML renderizadas, progreso previo y borrador tras recarga, copia de casos/C++/UML/opciones/números, ausencia de filtrado del solucionario, copia manual/descarga, restricción durante simulacro, seis simulacros, cuatro imágenes servidas y ausencia de errores de página/desbordamiento móvil.
- La verificación usa contextos privados de Chrome de escritorio, sin modificar respuestas reales ni diagramas del usuario. Se normalizaron los saltos CRLF del portapapeles de Windows en el script de comparación.
- Se dieron nombres accesibles explícitos a las respuestas y al campo de copia manual, para mantenerlos estables al restaurar texto guardado.

## Continuidad visual y límites

Se mantiene Read/Operate dentro de La mesa de diagramado: paleta, fuentes, controles, artículos y motor existentes. Los casos separan contexto y consigna; el C++ utiliza la superficie de código. Copiar y corregir se ubica junto a la fase de revisión. La recuperación reutiliza el diálogo existente, con campo de 16 px y botones adaptados a móvil.

Se revisaron capturas en Claro a 1440×1100 y 390×844: `exam-company-desktop.png`, `exam-cpp-desktop.png`, `exam-cpp-mobile.png`, `exam-copy-mobile.png` y `exam-copy-fallback-{desktop,mobile}.png`, dentro de `.impeccable/review/`. La segunda ronda se limitó a confirmar la recuperación después de terminar la animación de apertura; no hubo nuevas correcciones visuales. El código conserva desplazamiento horizontal interno en móvil.

El detector se ejecutó una vez sobre Study y study.css: cero hallazgos primarios y avisos tipográficos orientativos. El nuevo título de 18 px reutiliza la jerarquía de Estudio; no se redefine DESIGN.md para reparar su discrepancia previa con la escala. La cobertura no afirma validación visual de otros temas, navegadores, dispositivos físicos o accesibilidad mediante lector de pantalla, ni certificación académica de las soluciones. No se ejecutó un nuevo build de Vercel para este cambio.
