"use client";
/**
 * ChatRichText — mini-markdown para las respuestas del agente.
 *
 * El agente responde texto con **negritas**, `código`, listas, títulos y
 * tablas | pipe |. Aquí eso se vuelve legible y con el lenguaje visual
 * del panel: tablas reales (cabecera beige), listas con viñetas y chips
 * monoespaciados — no un muro de texto plano. Sin dependencias.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[]; ordered: boolean }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "code"; text: string };

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Fila separadora de tabla: | --- | :---: | */
function isTableSep(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    // bloque de código ``` … ```
    if (line.trimStart().startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    // título ## / #
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      blocks.push({ kind: "h", text: h[2] ?? "" });
      i += 1;
      continue;
    }
    // tabla: cabecera + separador
    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(cells(lines[i] ?? ""));
        i += 1;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    // listas: - item / * item / 1. item
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    const oli = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (li || oli) {
      const ordered = Boolean(oli);
      const items: string[] = [];
      while (i < lines.length) {
        const m = (lines[i] ?? "").match(
          ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/,
        );
        if (!m) break;
        items.push(m[1] ?? "");
        i += 1;
      }
      blocks.push({ kind: "list", items, ordered });
      continue;
    }
    // párrafo: hasta línea vacía o inicio de otro bloque
    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !/^\s*([-*]\s|\d+[.)]\s|#{1,4}\s|\|)/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").trimStart().startsWith("```")
    ) {
      buf.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ kind: "p", lines: buf });
  }
  return blocks;
}

/** Formato en línea: **negrita** y `código` (chips mono con break-all). */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
          return (
            <strong key={i} className="font-semibold text-foreground">
              {p.slice(2, -2)}
            </strong>
          );
        }
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
          return (
            <code
              key={i}
              className="rounded-md bg-[#F6F4EF] px-1.5 py-0.5 font-mono text-[10.5px] break-all text-foreground"
            >
              {p.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export default function ChatRichText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="grid gap-2 text-xs leading-relaxed break-words">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return (
              <p key={i} className="text-[13px] font-semibold text-foreground">
                <Inline text={b.text} />
              </p>
            );
          case "list":
            return b.ordered ? (
              <ol key={i} className="ml-4 grid list-decimal gap-1">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="ml-4 grid list-disc gap-1">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </ul>
            );
          case "code":
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-xl bg-[#F6F4EF] p-2 font-mono text-[10.5px] text-foreground"
              >
                {b.text}
              </pre>
            );
          case "table":
            return (
              <div
                key={i}
                className="overflow-x-auto rounded-xl border border-[#EDEDED]"
              >
                <Table className="text-[11px]">
                  <TableHeader>
                    <TableRow className="bg-[#F6F4EF] hover:bg-[#F6F4EF]">
                      {b.head.map((h, j) => (
                        <TableHead
                          key={j}
                          className="h-8 px-2.5 py-1 font-semibold text-foreground"
                        >
                          <Inline text={h} />
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.rows.map((row, j) => (
                      <TableRow key={j}>
                        {row.map((c, k) => (
                          <TableCell key={k} className="px-2.5 py-1.5 break-words">
                            <Inline text={c} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          default:
            return (
              <p key={i}>
                <Inline text={b.lines.join(" ")} />
              </p>
            );
        }
      })}
    </div>
  );
}
