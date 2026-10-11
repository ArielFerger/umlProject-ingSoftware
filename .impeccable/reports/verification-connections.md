# Conexiones editables de clases UML

## Alcance

Extensión del editor de clases: selección por línea, etiquetas o multiplicidad; recorrido automático, recto, curvo o en ángulo; extremos ajustables en los cuatro lados de su clase y hasta 20 puntos intermedios. La relación Mermaid conserva su significado y las otras declaraciones. El recorrido se guarda en el comentario `%% uml-studio:` y no modifica los diagramas originales al usar una copia para QA.

## Comprobaciones

- 34 pruebas aprobadas, incluidas seis de geometría: proyección a cualquier lado y posición, entrada de terminales según lado, líneas ortogonales, conexiones propias, coordenadas finitas y compatibilidad de metadatos. La eliminación de una relación paralela conserva el recorrido de las demás con sus claves actualizadas.
- TypeScript y compilación Next.js para Vercel aprobados. Docker reconstruido con las mismas 34 pruebas, tipos y compilación Worker; contenedor final saludable en `127.0.0.1:3000`.
- ESLint de los módulos de geometría, metadatos y sus pruebas sin errores ni advertencias. El lint completo heredado no se declara aprobado.
- Navegador de producción `127.0.0.1:3002`: arrastre real de un punto y de un extremo hacia otro lado de su clase; cambio de las tres formas; movimiento de puntos por teclado; deshacer/rehacer; guardado y recuperación tras recargar.
- SVG descargado de la compilación final y validado como XML: conserva exactamente el recorrido ortogonal observado en el navegador y elimina áreas auxiliares, controles y resaltado de selección. Sin errores ni advertencias de consola en la comprobación final.

## Inspección acotada

La primera inspección encontró un recorrido ortogonal que volvía sobre la clase con lados mirando hacia afuera y un conflicto de flex móvil que estrechaba la segunda fila. El lote corrigió el corredor exterior y la base de esa fila; se confirmó con las mismas escenas. Capturas finales ignoradas por Git en `.impeccable/review/`: `draw-orthogonal-desktop.png`, `draw-curved-desktop.png`, `draw-straight-desktop.png` a 1440×900 y `draw-mobile.png` a 375×812. El proveedor devuelve bytes JPEG bajo nombres `.png`; las capturas de escritorio presentan menor nitidez global que las móviles, sin editar los archivos para aparentar otra calidad.

La barra contextual ocupa espacio propio encima del lienzo, sin superponer herramientas sobre las clases. Los cuadrados representan extremos y los círculos puntos; su tamaño se conserva al cambiar el zoom. Se permite desplazar el lienzo para alcanzar el resto del diagrama. La prueba se realizó sobre una copia llamada «Prueba de conexiones».

## Impeccable

Detector: cero hallazgos en las 12 superficies de interfaz, sin configuración ni excepciones; hashes actualizados en `detector-scope.json`. La revisión independiente pidió además que los trazados recto y curvo eviten ocultarse dentro de sus propias clases al elegir origen superior y destino izquierdo. Se incorporó un recorrido exterior previo al suavizado, se protegió la dirección de salida y llegada y se añadió una regresión que muestrea la curva y verifica los segmentos. Se recapturaron las cuatro vistas con la compilación final. Al arrastrar un punto dentro de una clase se proyecta hacia afuera, manteniendo control y línea sincronizados. La revisión independiente se registra en `finish-review-connections.md`.

Documenter independiente: **No changes** después de comprobar PRODUCT.md, DESIGN.md, el sidecar, el contrato del editor, CSS y módulos de conexiones. La paleta y tipografía existentes se conservan; las dimensiones y comportamiento de los controles corresponden al código. Los residuos previos de tokens `--canvas-dot`, `--green` y `--green-soft` no se canonizaron ni repararon en esta extensión.

## GitHub

El usuario confirmó que subirá el commit desde su cliente Git autenticado. Esta terminal no dispone de autenticación HTTPS de GitHub; se prepara y verifica el commit local, sin afirmar que esté publicado.
