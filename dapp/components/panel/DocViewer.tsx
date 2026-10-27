import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  Cpu,
  Info,
  KeyRound,
  LayoutGrid,
  Network,
  PackagePlus,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDoc, listDocs, type Doc, type DocBlock } from "@/lib/docs";

export const DOC_ICONS: Record<string, typeof Info> = {
  LayoutGrid,
  Cpu,
  PackagePlus,
  Network,
  KeyRound,
};

export function DocIcon({ name, className }: { name: string; className?: string }) {
  const Icon = DOC_ICONS[name] ?? Info;
  return <Icon className={className} />;
}

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "p":
      return <p className="text-sm leading-relaxed text-muted-foreground">{block.text}</p>;
    case "steps":
      return (
        <ol className="grid gap-2">
          {block.items.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{s}</span>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="grid gap-1.5">
          {block.items.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              {s}
            </li>
          ))}
        </ul>
      );
    case "code":
      return (
        <div className="grid gap-1">
          <Badge variant="secondary" className="w-fit font-mono text-[10px]">
            {block.lang}
          </Badge>
          <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
            {block.text}
          </pre>
        </div>
      );
    case "callout":
      return (
        <Alert variant={block.tone === "warn" ? "destructive" : "default"}>
          {block.tone === "warn" ? <CircleAlert /> : <Info />}
          {block.title && <AlertTitle>{block.title}</AlertTitle>}
          <AlertDescription>{block.text}</AlertDescription>
        </Alert>
      );
    case "table":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              {block.head.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {block.rows.map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell key={j} className="whitespace-normal">
                    {c}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
  }
}

export default function DocViewer({ doc }: { doc: Doc }) {
  const related = doc.related
    .map((s) => getDoc(s))
    .filter((d): d is Doc => d !== null);
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-4 pb-12 sm:p-6">
      <Link
        href="/panel"
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver al panel
      </Link>
      <header className="grid gap-2">
        <p className="flex items-center gap-2">
          <DocIcon name={doc.icon} className="size-5 text-primary" />
          <Badge variant="secondary">Guía</Badge>
          <span className="text-xs text-muted-foreground">act. {doc.updated}</span>
        </p>
        <h1 className="text-2xl font-bold">{doc.title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{doc.summary}</p>
      </header>
      <Separator />
      {doc.sections.map((s) => (
        <section key={s.heading} className="grid gap-3">
          <h2 className="text-base font-semibold">{s.heading}</h2>
          {s.blocks.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </section>
      ))}
      {related.length > 0 && (
        <>
          <Separator />
          <section className="grid gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Sigue con
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/panel/docs/${r.slug}`}
                  className="flex items-center gap-2.5 rounded-xl border p-3 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <DocIcon name={r.icon} className="size-4 shrink-0 text-primary" />
                  {r.title}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function DocsIndex() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 pb-12 sm:p-6">
      <Link
        href="/panel"
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver al panel
      </Link>
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold">Documentación</h1>
        <p className="text-sm text-muted-foreground">
          Guías del ecosistema: apps, OS, agentes y proveedores.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {listDocs().map((d) => (
          <Link
            key={d.slug}
            href={`/panel/docs/${d.slug}`}
            className="grid gap-2 rounded-xl border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <p className="flex items-center gap-2.5 text-sm font-semibold">
              <DocIcon name={d.icon} className="size-5 shrink-0 text-primary" />
              {d.title}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">{d.summary}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
