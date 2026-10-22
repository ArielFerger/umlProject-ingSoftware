import { z } from "zod";

export const TYPES = ["class", "sequence", "state", "activity", "usecase", "component", "er", "der"] as const;
export type DiagramType = typeof TYPES[number];
export const TYPE_LABELS: Record<DiagramType, string> = {
  class: "Clases", sequence: "Secuencia", state: "Estados", activity: "Actividades",
  usecase: "Casos de uso", component: "Componentes", er: "Entidad-relación", der: "DER (Chen)",
};
export const diagramInput = z.object({
  name: z.string().trim().min(1).max(100), type: z.enum(TYPES),
  project: z.string().trim().min(1).max(80), source: z.string().min(1).max(80000),
  theme: z.enum(["studio", "neutral", "dark"]).default("studio"),
  notes: z.string().max(10000).default(""),
});
export type DiagramInput = z.infer<typeof diagramInput>;
export type Diagram = DiagramInput & {
  access?: "owner" | "edit" | "view"; id: string; revision: number; updatedAt: string;
  /** Present on boards shared with the current user: the account that owns them. */
  owner?: string; ownerName?: string; sharedProject?: boolean;
};
export const signature = (d: DiagramInput) => JSON.stringify([d.name, d.type, d.project, d.source, d.theme, d.notes]);

export const TEMPLATES: { type: DiagramType; name: string; description: string; source: string }[] = [
  { type: "class", name: "Tienda online", description: "Clientes, pedidos y productos", source: `classDiagram
direction TB
class Cliente {
  +String nombre
  +String email
  +crearPedido() Pedido
}
class Pedido {
  +int numero
  +Date fecha
  +String estado
  +calcularTotal() float
  +confirmar() void
}
class DetallePedido {
  +int cantidad
  +float precioUnitario
  +subtotal() float
}
class Producto {
  +String nombre
  +float precio
  +int stock
  +actualizarStock(int cantidad) void
}
class Pago {
  <<interface>>
  +procesar(float monto) bool
}
Cliente "1" --> "0..*" Pedido : realiza
Pedido "1" *-- "1..*" DetallePedido : contiene
DetallePedido "*" --> "1" Producto : referencia
Pedido ..> Pago : utiliza` },
  { type: "sequence", name: "Inicio de sesión", description: "Autenticación con respuesta alternativa", source: `sequenceDiagram
autonumber
actor Usuario
participant App
participant API
participant DB as Base de datos
Usuario->>App: Ingresa email y clave
App->>API: POST /login
activate API
API->>DB: Buscar usuario
DB-->>API: Datos del usuario
alt Credenciales validas
  API-->>App: Token de sesión
  App-->>Usuario: Acceso al panel
else Credenciales incorrectas
  API-->>App: Error de autenticación
  App-->>Usuario: Reintentar
end
deactivate API` },
  { type: "state", name: "Ciclo de un pedido", description: "Estados y transiciones de compra", source: `stateDiagram-v2
direction LR
[*] --> Borrador
Borrador --> Confirmado: confirmar
Confirmado --> Pagado: pagar
Pagado --> Enviado: despachar
Enviado --> Entregado: recibir
Confirmado --> Cancelado: cancelar
Entregado --> [*]
Cancelado --> [*]` },
  { type: "activity", name: "Proceso de compra", description: "Decisiones y flujo de actividades", source: `flowchart TD
Inicio([Inicio]) --> Carrito[Revisar carrito]
Carrito --> Stock{Stock disponible?}
Stock -->|Si| Datos[Completar datos]
Stock -->|No| Aviso[Mostrar faltantes]
Aviso --> Carrito
Datos --> Pago[Procesar pago]
Pago --> Resultado{Pago aprobado?}
Resultado -->|Si| Confirmar[Confirmar pedido]
Resultado -->|No| Pago
Confirmar --> Fin([Fin])` },
  { type: "usecase", name: "Portal de clientes", description: "Actores y casos de uso", source: `flowchart LR
Cliente["Cliente"]:::umlActor
Admin["Administrador"]:::umlActor
subgraph Sistema[Portal de clientes]
  Comprar([Realizar compra])
  Historial([Consultar pedidos])
  Pagar([Procesar pago])
  Catalogo([Gestionar catalogo])
end
Cliente --- Comprar
Cliente --- Historial
Comprar -. include .-> Pagar
Admin --- Catalogo` },
  { type: "component", name: "Arquitectura de servicios", description: "Componentes e integraciones", source: `flowchart LR
subgraph Frontend
  Web["Web app"]
  Mobile["App movil"]
end
Gateway["API Gateway"]
subgraph Servicios
  Auth["Autenticación"]
  Orders["Pedidos"]
  Products["Catalogo"]
end
DB[(Base de datos)]
Web --> Gateway
Mobile --> Gateway
Gateway --> Auth
Gateway --> Orders
Gateway --> Products
Orders --> DB
Products --> DB` },
  { type: "er", name: "Base de datos", description: "Entidades, atributos y cardinalidad", source: `erDiagram
CLIENTE ||--o{ PEDIDO : realiza
PEDIDO ||--|{ DETALLE : contiene
PRODUCTO ||--o{ DETALLE : aparece
CLIENTE {
  int id PK
  string nombre
  string email UK
}
PEDIDO {
  int id PK
  int cliente_id FK
  date fecha
  string estado
}
PRODUCTO {
  int id PK
  string nombre
  float precio
}
DETALLE {
  int pedido_id FK
  int producto_id FK
  int cantidad
}` },
  { type: "der", name: "Pedidos (Chen)", description: "Entidades, relaciones y atributos en notación de Chen", source: `flowchart LR
%% DER en notación de Chen: entidades [ ], relaciones { } y atributos ([ ])
Cliente["Cliente"]:::derEntity
Pedido["Pedido"]:::derEntity
Articulo["Artículo"]:::derEntity
Realiza{"Realiza"}:::derRelation
%% der-ratio Realiza 1:N
SeCompone{"Se compone"}:::derRelation
%% der-ratio SeCompone N:M
Cliente_DNI(["DNI"]):::derKey
Pedido_Fecha(["Fecha"]):::derKey
Articulo_NumSerie(["Núm Serie"]):::derKey
SeCompone_Cantidad(["Cantidad"]):::derAttribute
Cliente ---|"1"| Realiza
Realiza ---|"*"| Pedido
Pedido ---|"*"| SeCompone
SeCompone ---|"*"| Articulo
Cliente --- Cliente_DNI
Pedido --- Pedido_Fecha
Articulo --- Articulo_NumSerie
SeCompone --- SeCompone_Cantidad
%% uml-studio: {"positions":{"Cliente":{"x":150,"y":130},"Realiza":{"x":460,"y":130},"Pedido":{"x":770,"y":130},"Cliente_DNI":{"x":80,"y":225},"Pedido_Fecha":{"x":860,"y":40},"SeCompone":{"x":770,"y":320},"Articulo":{"x":460,"y":320},"Articulo_NumSerie":{"x":340,"y":420},"SeCompone_Cantidad":{"x":640,"y":430}},"lineWidth":2,"arrowScale":1.4,"labelSize":14,"routes":{}}
` },
];

export function classBlocks(source: string) {
  return Array.from(source.matchAll(/\bclass\s+([A-Za-z_][\w-]*)\s*\{([^}]*?)\}/g))
    .map(m => ({ name: m[1], body: m[2].trim(), start: m.index!, end: m.index! + m[0].length }));
}

export function exportDocument(d: DiagramInput) {
  return JSON.stringify({ format: "uml-studio", version: 1, diagram: d }, null, 2);
}
