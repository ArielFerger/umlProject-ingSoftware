---
name: UML Studio
description: Mesa de diagramado y aprendizaje técnico con superficies minerales, lectura nítida y movimiento breve.
colors:
  ink: '#e2e7eb'
  muted: '#aebbc6'
  line: '#3a444e'
  accent: '#91c6d6'
  accent-hover: '#b2dce7'
  accent-soft: '#30434b'
  surface: '#1d242b'
  paper: '#242b33'
  rail: '#151c23'
  danger: '#f4a6ad'
  field: '#20272e'
  hover: '#303b44'
  selected: '#30464f'
  selected-ink: '#c0e5ef'
  code-surface: '#1c232a'
  code-ink: '#d7e2e9'
  code-line: '#2b3a44'
  selection: '#3b5968'
  canvas: '#1b252e'
  positive: '#9bd3bb'
  warning-soft: '#3a3223'
  warning-ink: '#eed1a0'
  error-soft: '#452c32'
  graphite-ink: '#dce8f4'
  graphite-muted: '#abc0d3'
  graphite-line: '#30445a'
  graphite-paper: '#14273a'
  graphite-surface: '#102032'
  graphite-field: '#112337'
  graphite-accent: '#88c4e3'
  graphite-accent-hover: '#b3dcf1'
  graphite-accent-soft: '#23445e'
  graphite-rail: '#0b1927'
  graphite-danger: '#f4a6ad'
  graphite-hover: '#1e364b'
  graphite-selected: '#244860'
  graphite-selected-ink: '#c2e6f7'
  graphite-code-surface: '#102033'
  graphite-code-ink: '#d5e5f2'
  graphite-code-line: '#1e354b'
  graphite-selection: '#31546d'
  graphite-canvas: '#102132'
  graphite-positive: '#9bd3bb'
  graphite-warning-soft: '#3a3428'
  graphite-warning-ink: '#eed1a0'
  graphite-error-soft: '#432e38'
  night-ink: '#3c423e'
  night-muted: '#60695f'
  night-line: '#dcded3'
  night-paper: '#fffef8'
  night-surface: '#f5f4ea'
  night-field: '#faf9ef'
  night-accent: '#4b6652'
  night-accent-hover: '#354d3b'
  night-accent-soft: '#e8eee3'
  night-rail: '#303e32'
  night-hover: '#eeeee1'
  night-selected: '#e2e9d8'
  night-selected-ink: '#344e3a'
  night-code-surface: '#faf9f0'
  night-code-ink: '#414c41'
  night-code-line: '#eeeee1'
  night-selection: '#d5e3cf'
  night-canvas: '#faf9f0'
  paper-git-work: '#9ac7e7'
  paper-git-work-soft: '#1d3547'
  paper-git-stage: '#f3ba8e'
  paper-git-stage-soft: '#403020'
  paper-git-local: '#9dd8b6'
  paper-git-local-soft: '#243c30'
  paper-git-remote: '#e8cc84'
  paper-git-remote-soft: '#3d3522'
  dark-action-ink: '#102532'
  dark-danger-ink: '#3b1c22'
typography:
  display:
    fontFamily: Source Sans 3 Variable, sans-serif
    fontSize: clamp(34px, 4vw, 52px)
    fontWeight: 720
    lineHeight: 1.12
    letterSpacing: -1.8px
  headline:
    fontFamily: Source Sans 3 Variable, sans-serif
    fontSize: 36px
    fontWeight: 720
    lineHeight: 1.15
    letterSpacing: -1.2px
  title:
    fontFamily: Source Sans 3 Variable, sans-serif
    fontSize: 22px
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: -.02em
  body:
    fontFamily: Source Sans 3 Variable, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  study-body:
    fontFamily: Source Sans 3 Variable, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: Source Sans 3 Variable, sans-serif
    fontSize: 13px
    fontWeight: 550
    lineHeight: 1.5
  button:
    fontFamily: Source Sans 3 Variable, sans-serif
    fontSize: 14px
    fontWeight: 550
    lineHeight: 1.5
  code:
    fontFamily: IBM Plex Mono, monospace
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.85
  uml-class:
    fontFamily: Source Sans 3 Variable, sans-serif
    fontSize: 17px
    fontWeight: 650
  uml-member:
    fontFamily: IBM Plex Mono, monospace
    fontSize: 14px
    fontWeight: 400
  inspector-member:
    fontFamily: IBM Plex Mono, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.85
  console:
    fontFamily: IBM Plex Mono, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.75
rounded:
  segment: 4px
  control: 6px
  overlay: 8px
  study-control: 7px
  study-panel: 9px
  study-article: 12px
  study-progress: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.paper}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: 0 12px
    height: 36px
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-primary-graphite:
    backgroundColor: '{colors.graphite-accent}'
    textColor: '{colors.dark-action-ink}'
  button-primary-night:
    backgroundColor: '{colors.night-accent}'
    textColor: '{colors.dark-action-ink}'
  button-primary-paper:
    backgroundColor: '{colors.paper-accent}'
    textColor: '{colors.paper}'
  button-secondary:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    typography: '{typography.button}'
    rounded: '{rounded.control}'
    padding: 0 12px
    height: 36px
  button-secondary-hover:
    backgroundColor: '{colors.surface}'
  button-danger:
    backgroundColor: '{colors.danger}'
    textColor: '{colors.paper}'
    rounded: '{rounded.control}'
    padding: 0 12px
    height: 36px
    typography: '{typography.button}'
  button-danger-dark:
    textColor: '{colors.dark-danger-ink}'
  button-quiet:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    rounded: '{rounded.control}'
    typography: '{typography.label}'
    padding: 0 12px
    height: 36px
  property-field:
    backgroundColor: '{colors.field}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: 7px 9px
    typography: '{typography.label}'
  study-navigation:
    backgroundColor: transparent
    textColor: '{colors.muted}'
    padding: 14px 0 11px
  study-navigation-active:
    textColor: '{colors.accent}'
  study-level-tab:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.muted}'
    rounded: '{rounded.overlay}'
    padding: 11px 14px
  study-level-tab-active:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.paper}'
  study-article:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.study-article}'
    padding: 32px 38px
  git-zone-work:
    backgroundColor: '{colors.git-work-soft}'
    textColor: '{colors.git-work}'
    rounded: '{rounded.control}'
    padding: 14px 11px
    height: 76px
  git-zone-stage:
    backgroundColor: '{colors.git-stage-soft}'
    textColor: '{colors.git-stage}'
    rounded: '{rounded.control}'
    padding: 14px 11px
    height: 76px
  git-zone-local:
    backgroundColor: '{colors.git-local-soft}'
    textColor: '{colors.git-local}'
    rounded: '{rounded.control}'
    padding: 14px 11px
    height: 76px
  git-zone-remote:
    backgroundColor: '{colors.git-remote-soft}'
    textColor: '{colors.git-remote}'
    rounded: '{rounded.control}'
    padding: 14px 11px
    height: 76px
  git-console-prompt:
    backgroundColor: transparent
    textColor: '#eef5fa'
    typography: '{typography.code}'
    padding: 3px
---

# Design System: UML Studio

## Overview

**Creative North Star: "La mesa de diagramado"**

La mesa de diagramado organiza UML Studio como una aplicación de trabajo sobria. Superficies minerales, navegación grafito y acento petróleo dan prioridad a nombres, miembros, conexiones y estados. La densidad pertenece a la tarea; la decoración no compite con el contenido.

El mismo lenguaje une el editor, Estudio y Git Lab. Los temas cambian tinta y superficies conservando la jerarquía; los cuatro colores de Git mantienen su función. Las transiciones cortas confirman selección y resultado, con una alternativa de movimiento reducido.

**Key Characteristics:**

- Lectura técnica clara con interfaz en español.
- Superficies separadas por tono y líneas finas.
- Controles compactos; espacio amplio para diagramas y lectura.
- Color y movimiento vinculados al estado de la tarea.

Esta captura describe el código publicado localmente en `/`, `/estudio` y `/git`. Fuentes: `app/globals.css`, `app/themes.css`, `app/canvas-interactions.css`, `app/git.css`, `app/study.css`, `components/diagram-preview.tsx`, `components/code-editor.tsx` y `components/theme-picker.tsx`. Los contratos de superficie conservan la composición de cada ruta; este documento registra las reglas compartidas.

## Colors

La paleta es mineral y de bajo ruido: el acento petróleo indica intervención, las tintas sostienen la lectura y los colores Git explican el flujo.

### Primary

Los tokens `accent`, `accent-hover` y `accent-soft` definen acción, respuesta al puntero y selección tenue. `selected` y `selected-ink` sostienen el documento o ejercicio activo. Grafito y Noche azul aclaran el acento y usan `dark-action-ink` para el texto de los botones; Papel cambia el acento hacia un verde grisáceo.

### Secondary

Las parejas `git-work` / `git-work-soft`, `git-stage` / `git-stage-soft`, `git-local` / `git-local-soft` y `git-remote` / `git-remote-soft` representan trabajo azul, índice naranja, historial local verde y remoto amarillo. Se aplican a títulos, archivos, nodos y acciones de transferencia. Grafito y Noche azul comparten las variantes `dark-git-*`; Papel conserva las parejas de Claro.

### Tertiary

`positive` confirma guardado o resolución. `warning-ink` / `warning-soft` expresan avisos; `danger` / `error-soft` expresan errores y eliminación. El texto explica siempre el estado.

### Neutral

`paper` es la superficie principal; `surface` separa exploradores y áreas secundarias; `field` contiene edición; `ink` y `muted` separan lectura principal y apoyo; `line` divide regiones. `code-surface`, `code-ink`, `code-line` y `selection` sostienen la lectura y selección del código.

| Tema visible / id | Fuente y aplicación |
| --- | --- |
| Claro / `light` | Base de `app/globals.css :root`, completada por `app/themes.css :root`. Tokens sin prefijo. |
| Grafito / `graphite` | `app/themes.css :root[data-app-theme="graphite"]`; tokens `graphite-*`, más Git oscuro compartido. |
| Noche azul / `night` | `app/themes.css :root[data-app-theme="night"]`; tokens `night-*`, más Git oscuro compartido. |
| Papel / `paper` | `app/themes.css :root[data-app-theme="paper"]`; tokens `paper-*`; los roles que no redefine heredan Claro. |

`ThemeManager` aplica el tema a `data-app-theme` de la raíz; el selector y la preferencia son comunes a las tres rutas. El frontmatter registra las variantes reales y el sidecar enlaza cada variable con su token. Los valores del frontmatter son normativos; las rampas OKLCH del sidecar son exploraciones derivadas y no se usan en la aplicación.

El tema del diagrama es independiente del tema de interfaz. La opción Studio adopta el render oscuro en Grafito/Noche azul; Neutral y Oscuro tienen su propia paleta Mermaid. `components/diagram-preview.tsx` conserva estos colores de render y el fondo punteado pertenece a `app/globals.css`; `--canvas` determina el fondo del PNG de Studio. La consola mantiene su superficie oscura en los cuatro temas. Estas excepciones son componentes concretos, no una segunda paleta global.

**The Color con función Rule.** El petróleo identifica acciones y selección; azul, naranja, verde y amarillo conservan los cuatro roles de Git en todos los temas.

## Typography

**Display Font / Body Font:** Source Sans 3 Variable, con fallback sans-serif.
**Label/Mono Font:** IBM Plex Mono, con fallback monospace, para contenido técnico.

Las fuentes se importan en `app/layout.tsx`: Source Sans 3 variable y los pesos 400/500 de IBM Plex Mono. La interfaz usa pesos intermedios de Source Sans para distinguir regiones sin recurrir a mayúsculas decorativas. La escala responde a cada tarea, sin una razón modular universal.

### Hierarchy

- **Display:** bienvenida de Estudio; conserva el tamaño fluido del token `display` y se ajusta a una sola columna en móvil.
- **Headline:** títulos de Estudio, con variaciones de artículo y ejercicio. El artículo usa (34px) y pasa a (28px) en móvil.
- **Title:** nombre editable del documento; encabezados y selección usan (18–22px), con peso (650).
- **Body:** base de interfaz; Estudio usa `study-body` para los párrafos de teoría y un interlineado más abierto. La introducción limita su ancho a (750px) y la bienvenida a (580px).
- **Label:** controles y apoyo en (12–14px); los estados y recuentos usan cifras tabulares. Las etiquetas compactas de (10–11px) pertenecen a barras, referencias y hashes, no a los miembros del diagrama.
- **Contenido técnico:** CodeMirror usa `code`; el inspector usa `inspector-member`; Mermaid distingue `uml-class` de `uml-member`. Los miembros se leen a (14px) antes del zoom, con divisiones finas entre atributos y métodos.

**The Dos voces Rule.** Source Sans 3 sostiene interfaz y nombres de clases; IBM Plex Mono sostiene código, miembros, comandos y hashes.

## Layout

El ritmo compartido usa `xs`, `sm`, `md` y `lg`; los módulos también emplean padding contextual de (12px), (18px), (20px) y (22px). No se fuerza todo el espacio a una retícula de múltiplos: la lectura y el tamaño de cada región mandan.

El editor ocupa (100dvh). Su estructura de escritorio combina navegación de (52px), explorador de (228px), área flexible y propiedades de (264px), con cabecera de (58px). La vista dividida añade código con mínimo de (230px) y ancho de (30%). Ocultar código, explorador o propiedades devuelve ese espacio al lienzo. Por debajo de (1100px), las propiedades se superponen; por debajo de (800px), el explorador también se superpone y la navegación pasa a (44px). A (600px) o menos, la vista dividida apila código y lienzo en proporción (40% / 60%). A partir de (1700px), código y propiedades llegan a (340px / 284px).

Git usa ejercicios de (240px) y una región flexible. Las cuatro zonas aparecen arriba de la consola, en columnas de igual ancho con separación de (16px). A (1050px) o menos pasan a dos columnas; a (800px) o menos, la página usa scroll normal, el selector reemplaza la lista de ejercicios y la consola crece de (246px) a (300px). La estructura conserva el orden trabajo → índice → local → remoto.

Estudio centra el contenido con referencia de (1200px), margen mínimo de (24px), índice de (250px) y artículo flexible. Usa dos columnas para listas de ejercicios y exámenes; a (760px) o menos, contenido e índice se apilan, las listas pasan a una columna y el padding lateral se reduce a (17px). Los breakpoints completos y su fuente están en el sidecar.

## Elevation & Depth

La profundidad combina separación tonal, bordes finos y sombras suaves sólo en elementos flotantes. No hay elevación general de tarjetas. Los menús contextuales, controles de zoom, popovers y diálogos se levantan sobre el lienzo; los paneles móviles superpuestos usan una sombra lateral.

### Shadow Vocabulary

- **Control flotante:** barra de zoom (`0 3px 16px #20344018`); feedback sobre lienzo (`0 3px 14px #20344018`).
- **Popover:** opciones de estilo (`0 5px 24px #20344024`).
- **Menú contextual:** acciones de clase (`0 8px 30px #20344026`).
- **Diálogo:** formulario protegido (`0 16px 60px #20344030`), con backdrop translúcido (`#172c3b66`).
- **Panel superpuesto:** propiedades (`-6px 0 24px #20344015`) y explorador móvil (`6px 0 20px #20344018`).

**The Plano en reposo Rule.** Los paneles permanentes se separan por tono y borde; las sombras suaves pertenecen a controles flotantes y paneles superpuestos.

## Shapes

Los controles usan `control` y las superficies flotantes `overlay`, con bordes continuos de (1px). Los segmentos pequeños usan `segment`. El rectángulo técnico de una clase UML mantiene la forma de Mermaid y sus compartimentos; los grafos Git usan círculos para commits, sin convertirlos en tarjetas.

Estudio conserva una extensión más amplia: controles de `study-control`, ejercicios y workbenches de `study-panel`, artículos y niveles de `study-article`, y progreso de `study-progress`. Estos radios describen esos componentes; no reemplazan las esquinas compactas de las herramientas. Los iconos son SVG de Lucide, con trazo y tamaño acordes al control.

## Components

### Buttons

Compactos y directos. La base tiene altura mínima de (36px), padding horizontal de (12px), texto `button` y radio `control`. La acción primaria usa acento; la secundaria usa superficie principal y borde; la quieta conserva fondo transparente y texto secundario; la destructiva usa `danger`. Las variantes oscuras cambian el texto de primaria y destructiva. El hover de la secundaria cambia a `surface` y borde (`#a9bec9`); la primaria usa `accent-hover`. El foco muestra outline de (2px) con offset de (3px), y disabled baja la opacidad a (.45). Exportar usa la navegación grafito como tratamiento particular.

### Chips

Los filtros de nivel de Estudio son botones con borde, radio `overlay`, padding de (11px 14px) y texto de (13px). El seleccionado usa acento y texto blanco. Las referencias Git son etiquetas de texto compacto junto al hash; HEAD usa peso (700), y el seguimiento remoto usa acento. No se añade una cápsula decorativa a cada referencia.

### Cards / Containers

Los paneles permanentes de UML y Git son planos y dividen áreas con líneas. El artículo de Estudio usa `study-article`, borde `accent-soft` y padding de (32px 38px), reducido en pantallas menores. La tarjeta de progreso usa `study-progress`, superficie secundaria y barra de progreso de (6px). Los títulos de zona Git usan las parejas funcionales y radio `control`; el contenido debajo queda abierto, con una línea de cierre.

### Inputs / Fields

Los campos de propiedades usan `field`, borde `line`, radio `control`, padding de (7px 9px) y texto de (13px). El foco muestra outline de acento (2px) con offset de (1px). Los campos read-only usan superficie secundaria y texto apagado; el nombre de clase no se presenta como editable. La búsqueda agrupa icono e input bajo un foco del contenedor; las notas y miembros admiten altura y redimensionado vertical. Error se expresa con texto y rol de alerta.

### Navigation

El explorador conserva nombre principal y metadatos secundarios. El documento seleccionado usa `selected` / `selected-ink`; las pestañas de vista combinan fondo y peso. Estudio usa una línea inferior de (2px) y acento para la pestaña activa. Git usa la misma selección tonal para el ejercicio y un selector en móvil. El tema vive en un select nativo común, con nombre accesible.

### Diagramas, grafos y consola

La selección UML enlaza el trazo de clase con el título del inspector. Soltar una clase confirma el movimiento con trazo de (4px → 2.5px) durante (220ms); crear una relación revela el trazo durante (320ms). El texto no se mueve como efecto ornamental. Los miembros conservan mono, símbolos de visibilidad y separadores de compartimentos.

Git mantiene los grafos sobre la consola. Un commit seleccionado aumenta el trazo y explica padres, autor y archivos; su pulso dura (220ms). Los archivos de trabajo e índice comparten una fila compacta con acción de transferencia. El prompt admite historial y sugerencias opcionales sobre el campo: Tab/clic inserta, Escape cierra; ejecutar es una acción separada. La consola usa su paleta fija oscura, mono y salida que envuelve líneas.

Los controles transicionan en (120ms); menús y diálogos aparecen en (180ms) con `--ease-arrive`. Feedback usa (150–160ms) ease-out. Con `prefers-reduced-motion`, desaparecen los movimientos de presión, desplazamiento, relaciones y commits; menús/diálogos conservan sólo un fade de (100ms). Estudio desactiva el desplazamiento suave y el pequeño avance lateral de los niveles. El detalle exacto vive en `extensions.motion`.

## Do's and Don'ts

### Do:

- **Do** usar las variables semánticas compartidas y comprobar Claro, Grafito, Noche azul y Papel.
- **Do** mantener los miembros UML legibles y el foco visible; el zoom permite recorrer diagramas amplios.
- **Do** acompañar el color con nombres, texto de estado y símbolos familiares.
- **Do** reservar las animaciones para confirmar una acción y respetar prefers-reduced-motion.
- **Do** colocar la familia de una ficha debajo de su título y mantener la lectura del contenido en primer plano.

### Don't:

- **Don't** convertir azul, naranja, verde y amarillo de Git en acentos intercambiables.
- **Don't** usar sombras duras ni elevación decorativa en los paneles permanentes.
- **Don't** reemplazar los iconos SVG por glifos de texto ni añadir etiquetas decorativas encima de los títulos.
- **Don't** expandir las esquinas amplias de las tarjetas de Estudio a los controles compactos del editor.
- **Don't** presentar una sugerencia de comando como si ya se hubiera ejecutado.

No canonizado: `--canvas-dot` y los alias heredados `--green` / `--green-soft` no definen reglas nuevas porque no gobiernan el render vigente. La revisión final registra `ship` sin hallazgos materiales; esta documentación no corrige implementación ni convierte valores residuales en doctrina.
