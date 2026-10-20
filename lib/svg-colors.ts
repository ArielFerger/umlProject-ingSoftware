const originals = new WeakMap<Element, Map<string, [string, string]>>();

function paint(el: Element, color: string | undefined, properties: Record<string, string>) {
  let saved = originals.get(el);
  if (!saved) { saved = new Map(); originals.set(el, saved); }
  const style = (el as SVGElement).style;
  for (const [key, value] of Object.entries(properties)) {
    if (!saved.has(key)) saved.set(key, [style.getPropertyValue(key), style.getPropertyPriority(key)]);
    const original = saved.get(key)!;
    if (color) style.setProperty(key, value, "important");
    else if (original[0]) style.setProperty(key, original[0], original[1]);
    else style.removeProperty(key);
  }
}

export function colorInk(color: string) {
  const channels = color.slice(1).match(/../g)!.map(hex => {
    const value = parseInt(hex, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? "#111827" : "#ffffff";
}

export function colorClass(node: SVGGElement, color?: string) {
  const ink = color ? colorInk(color) : "";
  node.querySelectorAll(".outer-path path:not([fill=none]),rect:not(.background),polygon").forEach(el => paint(el, color, { fill: color!, stroke: ink }));
  node.querySelectorAll("line,.divider path,.outer-path path[fill=none]").forEach(el => paint(el, color, { stroke: ink }));
  node.querySelectorAll("text,tspan,.nodeLabel,.nodeLabel *").forEach(el => paint(el, color, { fill: ink, color: ink }));
}

const markerFills = new WeakMap<Element, boolean>();
export function colorArrow(path: SVGPathElement, markers: SVGMarkerElement[], color?: string) {
  paint(path, color, { stroke: color! });
  for (const marker of markers) {
    for (const el of marker.querySelectorAll("path,polygon,circle,line,polyline")) {
      if (!markerFills.has(el)) {
        const style = getComputedStyle(el);
        // Hollow UML triangles/diamonds retain their background and meaning.
        markerFills.set(el, style.fill !== "none" && style.fill !== "transparent" && style.fill !== "rgba(0, 0, 0, 0)" && style.fill === style.stroke);
      }
      paint(el, color, { stroke: color!, ...(markerFills.get(el) ? { fill: color! } : {}) });
    }
  }
}
