import { readWorkspace, workspaceOperation, WorkspaceError } from "./browser-workspace";

export const browserStorage = process.env.NEXT_PUBLIC_UML_STORAGE === "browser";
let database: Promise<IDBDatabase> | undefined;
function openWorkspace() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("uml-studio-workspace-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = undefined; }; resolve(request.result); };
    request.onerror = () => { database = undefined; reject(new Error("No se pudo abrir el almacenamiento de este navegador. Permití el almacenamiento del sitio y reintentá.")); };
    request.onblocked = () => { database = undefined; reject(new Error("Cerrá otras ventanas de UML Studio y reintentá para abrir el almacenamiento.")); };
  });
  return database;
}
export async function studioRequest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!browserStorage) return fetch(path, init);
  const url = new URL(path, "https://uml.local");
  if (url.pathname === "/api/study-profile") return Response.json({ owner: "browser-local", storage: "browser" });
  if (url.pathname !== "/api/diagrams") return Response.json({ error: "Ruta no disponible." }, { status: 404 });
  try {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const db = await openWorkspace();
    return await new Promise<Response>((resolve, reject) => {
      const transaction = db.transaction("workspace", "readwrite");
      const store = transaction.objectStore("workspace");
      const request = store.get("current");
      let response: Response;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          const state = readWorkspace(request.result);
          const operation = workspaceOperation(state, init.method || "GET", url.searchParams, body);
          if (request.result === undefined || operation.state !== state) store.put(operation.state, "current");
          response = Response.json(operation.result, { status: operation.status });
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(response);
      transaction.onabort = transaction.onerror = () => reject(failure || new WorkspaceError("No se pudo guardar en este navegador. Descargá tu proyecto JSON y reintentá cuando haya espacio disponible.", 503));
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo acceder al espacio de este navegador." }, { status: error instanceof WorkspaceError ? error.status : 400 });
  }
}
