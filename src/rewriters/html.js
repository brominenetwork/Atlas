import { rewriteUrl } from "./url.js";
import { rewriteCss } from "./css.js";

const URL_ATTRS = new Set([
  "href", "src", "action", "formaction", "poster", "data",
  "background", "ping", "manifest", "xlink:href",
]);
const SRCSET_ATTRS = new Set(["srcset", "imagesrcset"]);

function rewriteSrcset(val, base) {
  return val.split(",").map(part => {
    const m = part.trim().match(/^(\S+)(\s.*)?$/);
    return m ? rewriteUrl(m[1], base) + (m[2] || "") : part;
  }).join(", ");
}

function processAttrs(attrs, base) {
  return attrs.replace(
    /(\s+)([\w:-]+)(\s*=\s*)(["'])([\s\S]*?)\4/g,
    (m, sp, name, eq, q, val) => {
      const n = name.toLowerCase();
      if (n === "integrity") return "";
      if (n === "style") return sp + name + eq + q + rewriteCss(val, base) + q;
      if (URL_ATTRS.has(n)) return sp + name + eq + q + rewriteUrl(val.trim(), base) + q;
      if (SRCSET_ATTRS.has(n)) return sp + name + eq + q + rewriteSrcset(val, base) + q;
      return m;
    }
  );
}

function findTagEnd(html, from) {
  let q = 0;
  for (let i = from; i < html.length; i++) {
    const c = html.charCodeAt(i);
    if (q) { if (c === q) q = 0; }
    else if (c === 34 || c === 39) { q = c; }
    else if (c === 62) return i;
  }
  return -1;
}

const INJECT = (base) =>
  `<script>!function(){var c=window.__atlas={prefix:"/atlas/",base:${JSON.stringify(base)},` +
  `encode:function(u){try{return btoa(encodeURIComponent(u)).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=/g,"")}catch(e){return u}},` +
  `decode:function(e){try{var p=e+"=".repeat((4-e.length%4)%4);return decodeURIComponent(atob(p.replace(/-/g,"+").replace(/_/g,"/")))}catch(e){return e}},` +
  `rewrite:function(u,b){if(!u)return u;var t=String(u).trim();` +
  `if(/^(javascript:|data:|blob:|#|mailto:|tel:|about:|\\/atlas\\/)/.test(t))return u;` +
  `try{var r=b?new URL(t,b).href:new URL(t).href;return"/atlas/"+c.encode(r)}catch(e){return u}}}();</script>` +
  `<script src="/atlas.client.js"></script>`;

export function rewriteHtml(html, base) {
  const out = [];
  let i = 0;
  let inScript = false;
  let inStyle = false;
  let styleBuf = "";
  let injected = false;

  while (i < html.length) {
    if (html.charCodeAt(i) !== 60) {
      const next = html.indexOf("<", i);
      if (next === -1) {
        (inStyle ? (styleBuf += html.slice(i)) : out.push(html.slice(i)));
        break;
      }
      inStyle ? (styleBuf += html.slice(i, next)) : out.push(html.slice(i, next));
      i = next;
      continue;
    }

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      if (end === -1) { out.push(html.slice(i)); break; }
      out.push(html.slice(i, end + 3));
      i = end + 3;
      continue;
    }

    if (html.charCodeAt(i + 1) === 33) {
      const end = html.indexOf(">", i + 2);
      if (end === -1) { out.push(html.slice(i)); break; }
      out.push(html.slice(i, end + 1));
      i = end + 1;
      continue;
    }

    const tagEnd = findTagEnd(html, i + 1);
    if (tagEnd === -1) { out.push(html.slice(i)); break; }

    const inner = html.slice(i + 1, tagEnd);
    const nm = inner.match(/^(\/?)([\w-]+)/);
    const tag = nm?.[2]?.toLowerCase() ?? "";
    const isClose = nm?.[1] === "/";

    if (inScript) {
      if (isClose && tag === "script") { inScript = false; out.push("</script>"); }
      else out.push(html.slice(i, tagEnd + 1));
      i = tagEnd + 1;
      continue;
    }

    if (inStyle) {
      if (isClose && tag === "style") {
        inStyle = false;
        out.push(rewriteCss(styleBuf, base));
        styleBuf = "";
        out.push("</style>");
      } else {
        styleBuf += html.slice(i, tagEnd + 1);
      }
      i = tagEnd + 1;
      continue;
    }

    if (isClose) {
      if (!injected && tag === "head") { out.push(INJECT(base)); injected = true; }
      out.push(`</${tag}>`);
      i = tagEnd + 1;
      continue;
    }

    if (tag === "meta") {
      if (/content-security-policy/i.test(inner)) { i = tagEnd + 1; continue; }
    }

    if (tag === "base") {
      const m = inner.match(/\shref\s*=\s*(["'])([^"']*)\1/i);
      if (m) try { base = new URL(m[2], base).href; } catch {}
    }

    const attrStr = inner.slice(nm?.[0]?.length ?? 0);
    const selfClose = /\/\s*$/.test(attrStr);
    const attrs = processAttrs(attrStr.replace(/\/\s*$/, ""), base);
    out.push(`<${tag}${attrs}${selfClose ? " /" : ""}>`);

    if (tag === "head" && !injected) { out.push(INJECT(base)); injected = true; }
    if (tag === "script") inScript = true;
    if (tag === "style") inStyle = true;

    i = tagEnd + 1;
  }

  if (!injected) out.unshift(INJECT(base));
  return out.join("");
}
