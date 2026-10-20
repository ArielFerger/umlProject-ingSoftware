import { cleanSource, readCanvas, writeCanvas } from "./canvas.ts";

const IDENT = "[A-Za-z_][\\w-]*";
const escaped = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function topLevelFilter(text: string, keep: (line: string) => boolean) {
  let inClass = false;
  return text.split(/\r?\n/).filter(line => {
    if (inClass) { if (line.includes("}")) inClass = false; return true; }
    if (/^[ \t]*class\s+/.test(line) && line.includes("{")) { inClass = !line.includes("}"); return true; }
    return keep(line);
  }).join("\n");
}

// Restrict mutations to declarations and relationship endpoints, never global text replacement.
export function classDefinition(source: string, name: string) {
  const text = cleanSource(source);
  const pattern = new RegExp(`^[ \\t]*class[ \\t]+${escaped(name)}(?=[ \\t{\\[\\r\\n]|$)(?:[ \\t]*\\[[^\\r\\n]*?\\])?[ \\t]*`, "m");
  const match = pattern.exec(text);
  if (!match) return null;
  const start = match.index;
  let end = start + match[0].length;
  let body = "";
  if (text[end] === "{") {
    const close = text.indexOf("}", end + 1);
    if (close < 0) throw new Error("La clase tiene una llave sin cerrar. Corregí la sintaxis antes de editarla.");
    body = text.slice(end + 1, close).trim(); end = close + 1;
  }
  return { start, end, body, header: match[0].trim(), code: text.slice(start, end).trim() };
}

function relationEndpoints(line: string): [string, string] | null {
  const match = line.match(new RegExp(`^[ \\t]*(${IDENT})(?:[ \\t]+"[^"\\r\\n]*")?[ \\t]+([<>|o*.\\-]+)[ \\t]+(?:"[^"\\r\\n]*"[ \\t]+)?(${IDENT})(?=[ \\t:]|$)`));
  return match && /--|\.\./.test(match[2]) ? [match[1], match[3]] : null;
}

export function classNames(source: string) {
  const names = new Set<string>();
  for (const line of cleanSource(source).split(/\r?\n/)) {
    const declaration = line.match(new RegExp(`^[ \\t]*class[ \\t]+(${IDENT})(?=[ \\t{\\[]|$)`));
    if (declaration) names.add(declaration[1]);
    const pair = relationEndpoints(line);
    if (pair) pair.forEach(name => names.add(name));
    const member = line.match(new RegExp(`^[ \\t]*(${IDENT})[ \\t]*:`));
    if (member) names.add(member[1]);
  }
  return names;
}

export function classMembers(source: string, name: string) {
  const definition = classDefinition(source, name);
  const outside = definition ? cleanSource(source).slice(0, definition.start) + cleanSource(source).slice(definition.end) : cleanSource(source);
  const memberPattern = new RegExp(`^[ \\t]*${escaped(name)}[ \\t]*:[ \\t]*(.*)$`);
  const members: string[] = [];
  topLevelFilter(outside, line => {
    const match = line.match(memberPattern);
    // Preserve external stereotypes while editing attributes and operations.
    if (match && !/^<<.*>>$/.test(match[1].trim())) members.push(match[1].trim());
    return true;
  });
  return [definition?.body, ...members].filter(Boolean).join("\n");
}

export function setClassMembers(source: string, name: string, body: string) {
  if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new Error("Usá un identificador sin espacios: letras, números, guiones o guion bajo.");
  if (/[{}]/.test(body)) throw new Error("Los atributos y métodos no pueden contener llaves.");
  const text = cleanSource(source), definition = classDefinition(source, name);
  const snippet = `${definition?.header || `class ${name}`} {\n${body.split("\n").filter(line => line.trim()).map(line => "  " + line.trim()).join("\n")}\n}`;
  let next = definition ? text.slice(0, definition.start) + snippet + text.slice(definition.end) : text + "\n" + snippet;
  // The old external members now live inside the class; unrelated lines stay intact.
  const memberPattern = new RegExp(`^[ \\t]*${escaped(name)}[ \\t]*:[ \\t]*(.*)$`);
  next = topLevelFilter(next, line => { const match = line.match(memberPattern); return !match || /^<<.*>>$/.test(match[1].trim()); });
  return writeCanvas(next, readCanvas(source));
}

function externalStereotypes(source: string, name: string) {
  const found: string[] = [];
  const member = new RegExp(`^[ \\t]*${escaped(name)}[ \\t]*:[ \\t]*(<<[^>]+>>)[ \\t]*$`);
  const annotation = new RegExp(`^[ \\t]*(<<[^>]+>>)[ \\t]+${escaped(name)}[ \\t]*$`);
  topLevelFilter(cleanSource(source), line => { const match = line.match(member) || line.match(annotation); if (match) found.push(match[1]); return true; });
  return [...new Set(found)];
}

export function classSnippet(source: string, name: string) {
  const definition = classDefinition(source, name);
  const body = [classMembers(source, name), ...externalStereotypes(source, name)].filter(Boolean).join("\n");
  return `${definition?.header || `class ${name}`} {\n${body.split("\n").filter(Boolean).map(line => "  " + line.trim()).join("\n")}\n}`;
}

export function duplicateClass(source: string, name: string, occupied: string[] = []) {
  const names = new Set([...classNames(source), ...occupied]);
  let copy = name + "_copia", count = 2;
  while (names.has(copy)) copy = name + "_copia" + count++;
  let next = setClassMembers(source, copy, [classMembers(source, name), ...externalStereotypes(source, name)].filter(Boolean).join("\n"));
  const settings = readCanvas(next), position = settings.positions[name];
  if (position) settings.positions[copy] = { x: Math.min(19000, position.x + 70), y: Math.min(19000, position.y + 70) };
  if (settings.nodeColors && Object.hasOwn(settings.nodeColors, name)) settings.nodeColors[copy] = settings.nodeColors[name];
  next = writeCanvas(next, settings);
  return { name: copy, source: next };
}

export function removeClass(source: string, name: string) {
  const definition = classDefinition(source, name);
  const text = cleanSource(source);
  const remaining = definition ? text.slice(0, definition.start) + text.slice(definition.end) : text;
  const member = new RegExp(`^[ \\t]*${escaped(name)}[ \\t]*:`);
  const annotation = new RegExp(`^[ \\t]*<<[^>]+>>[ \\t]+${escaped(name)}[ \\t]*$`);
  const note = new RegExp(`^[ \\t]*note[ \\t]+for[ \\t]+${escaped(name)}[ \\t]+`);
  const next = topLevelFilter(remaining, line => {
    const pair = relationEndpoints(line);
    return !(pair?.includes(name) || member.test(line) || annotation.test(line) || note.test(line));
  });
  const settings = readCanvas(source); delete settings.positions[name];
  if (settings.nodeColors) delete settings.nodeColors[name];
  if (settings.frameLinks) settings.frameLinks = Object.fromEntries(Object.entries(settings.frameLinks).filter(([, link]) => ![link.from, link.to].some(end => end.kind === "class" && end.id === name)));
  return writeCanvas(next, settings);
}
