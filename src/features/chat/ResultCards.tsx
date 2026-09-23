import { BatteryCharging, Check, Clock3, Plane, ShoppingBag, Star } from "lucide-react";
import type { RunResult } from "@/types/pilot";

function FlightResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="result-card">
      <div className="flex items-center justify-between">
        <div className="result-icon">
          <Plane />
        </div>
        <span className="status-success">Confirmed</span>
      </div>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground">FROM</p>
          <p className="text-xl font-semibold">{String(data["from"] ?? "JFK")}</p>
        </div>
        <div className="mb-1 h-px flex-1 bg-border mx-4 relative">
          <Plane className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 text-agent" />
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">TO</p>
          <p className="text-xl font-semibold">{String(data["to"] ?? "DXB")}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
        <span>{String(data["airline"] ?? "—")}</span>
        <span>{String(data["stops"] ?? "Nonstop")}</span>
        <b className="text-right">{String(data["price"] ?? "—")}</b>
      </div>
    </div>
  );
}

function FoodResult({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="result-card">
      <div className="flex items-center gap-3">
        <div className="result-icon">
          <ShoppingBag />
        </div>
        <div>
          <b>Order confirmed</b>
          <p className="text-xs text-muted-foreground">{String(data["restaurant"] ?? "—")}</p>
        </div>
        <span className="status-success ml-auto">Preparing</span>
      </div>
      <div className="mt-5 flex justify-between rounded-xl bg-muted p-4">
        <div>
          <b>{String(data["item"] ?? "—")}</b>
          <p className="mt-1 text-xs text-muted-foreground">{String(data["description"] ?? "")}</p>
        </div>
        <b>{String(data["price"] ?? "—")}</b>
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Clock3 className="size-4" />
        {String(data["eta"] ?? "Arriving soon")}
      </p>
    </div>
  );
}

function ProductResult({ data }: { data: Record<string, unknown> }) {
  const items = (Array.isArray(data["items"]) ? data["items"] : []) as Record<string, unknown>[];
  return (
    <div className="result-card">
      <div className="flex items-center justify-between">
        <b>Best matches</b>
        <span className="text-xs text-muted-foreground">{items.length} compared</span>
      </div>
      {items.map((p, i) => (
        <div
          key={String(p["name"] ?? i)}
          className="mt-3 flex items-center gap-3 border-t border-border pt-3"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-muted text-xs font-semibold">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <b className="text-sm">{String(p["name"] ?? "—")}</b>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {i === 0 ? <Star className="size-3" /> : <BatteryCharging className="size-3" />}
              {String(p["highlight"] ?? "")}
            </p>
          </div>
          <b className="text-sm">{String(p["price"] ?? "—")}</b>
        </div>
      ))}
    </div>
  );
}

function GenericResult({ result }: { result: RunResult }) {
  return (
    <div className="result-card space-y-3">
      <div className="flex items-center gap-2">
        <div className="result-icon">
          <Check />
        </div>
        <b>{result.message}</b>
      </div>
      {Object.entries(result.data).map(([k, v]) => (
        <div key={k} className="flex justify-between border-t border-border pt-2 text-sm">
          <span className="capitalize text-muted-foreground">{k}</span>
          <span className="font-medium">{String(v)}</span>
        </div>
      ))}
      {result.sources.length > 0 && (
        <div className="pt-2 border-t border-border space-y-1">
          {result.sources.map((s) => (
            <a
              key={s}
              href={s}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-xs text-page-link hover:underline"
            >
              {s}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultCard({ result }: { result: RunResult }) {
  if (result.kind === "flight") return <FlightResult data={result.data} />;
  if (result.kind === "food") return <FoodResult data={result.data} />;
  if (result.kind === "products") return <ProductResult data={result.data} />;
  return <GenericResult result={result} />;
}
