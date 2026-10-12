# Verificación de diagramas guiados en Estudio

Fecha: 11 de octubre de 2026. Resultado de la revisión independiente final: **SHIP**, con las cinco secciones del contrato de revisión y sin correcciones materiales pendientes.

## Alcance y sistema preservado

La ampliación mantiene Estudio dentro de **«La mesa de diagramado»**, en modo Read/Operate: lectura técnica en español, diagramas de referencia seleccionables y práctica editable. Conserva la paleta mineral mediante variables semánticas compartidas, Source Sans 3 para lectura y nombres, IBM Plex Mono para código y miembros UML, separación tonal y bordes finos. Mantiene los radios propios de artículos, paneles, progreso y controles; las nuevas pestañas y pasos siguen los estados de acento, foco y selección existentes. Las superficies permanentes permanecen planas y el movimiento reducido desactiva transiciones y desplazamiento suave.

Se conservan el artículo, las pestañas de navegación y el progreso existentes. La familia del patrón permanece debajo del título. En móvil, el selector nativo permite cambiar de patrón dentro de la composición apilada. Los diagramas de referencia usan ajuste inicial de contención como opción explícita; el editor principal conserva su ajuste inicial legible.

La entrega reúne ocho estructuras de patrones, ocho vistas nuevas de secuencia y siete mapas de teoría: **23 diagramas guiados**. Añade doce ejercicios para un total de **86**. Amplía `public/estudio/Resumen-IS-II.md` y enlaza el PDF de 36 páginas suministrado por el usuario, copiado sin cambios a `public/estudio/fuentes/27.pdf`, con SHA-256 coincidente.

## Evidencia visual

La revisión independiente inspeccionó estas capturas del build final de Docker, en tema **Claro**:

| Archivo en `.impeccable/review/` | Tamaño | Estado observado |
| --- | --- | --- |
| `study-desktop.png` | 1440 × 1200 | Estructura de Observer |
| `study-sequence.png` | 1440 × 1200 | Secuencia de Observer, con desplazamiento interno |
| `study-theory.png` | 1440 × 1200 | Mapa GQM, con desplazamiento interno |
| `study-mobile.png` | 390 × 844 | Strategy en su estado inicial |
| `study-mobile-diagram.png` | 390 × 844 | Secuencia de Strategy, con desplazamiento interno |

Estas capturas sustentan la continuidad de jerarquía, material y controles en los estados indicados. El desplazamiento interno permite recorrer el contenido sin desbordar horizontalmente la página móvil.

## Comportamiento y persistencia

`.sites-runtime/study-qa.json` y los scripts `study-qa.mjs` y `study-controls-qa.mjs` registran render correcto de los 23 diagramas, pasos con foco guiado, ejercicios y soluciones, corrección de respuestas y conservación del progreso previo. También verifican descarga del PDF, ausencia de errores de página y ausencia de desbordamiento horizontal móvil.

La selección y los pasos actúan sobre referencias de solo lectura. Abrir una copia editable y volver a abrirla conserva las ediciones guardadas. El tipo de diagrama se mantiene en borradores, soluciones y transferencia al editor completo, incluida la secuencia. Los controles se verificaron sobre Docker con mensajes de ratón, deshacer/rehacer, recarga del borrador, resaltado de participantes, copia de referencia y selector móvil. Pasaron **43 pruebas unitarias**, la comprobación de tipos y los builds de Docker y Vercel.

Fuentes de implementación verificadas: `components/study.tsx`, `components/study-visual.tsx`, `lib/study.ts`, `lib/study-visuals.json`, `app/study.css` y `components/diagram-preview.tsx`.

## Deriva y límites

El detector se ejecutó una vez sobre los objetivos de Estudio modificados. Solo informó desajustes orientativos de escala tipográfica ya presentes en `study.css` (19, 18, 56, 24, 20, 11, 21, 38, 10, 28 y 26 px); no encontró reglas nuevas incumplidas. La deriva previa del sidecar queda registrada y sin cambios. Esta extensión no redefine tokens ni reglas de `DESIGN.md` o `.impeccable/design.json`.

La cobertura visual documentada se limita a Claro, los dos tamaños y los cinco estados anteriores. Los checks de render de los 23 diagramas no equivalen a una revisión visual exhaustiva de cada uno. La coincidencia del PDF acredita integridad de la copia; no se realizó una auditoría independiente de exactitud académica del PDF ni de cada explicación derivada.
