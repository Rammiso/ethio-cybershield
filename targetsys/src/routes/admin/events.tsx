import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { checkAdminAccessFn } from "@/lib/auth.functions";
import {
  getAdminSecurityEventsFn,
  adminRetrySingleEventFn,
} from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity,
  Search,
  RefreshCw,
  X,
  ChevronRight,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Radio,
  FileCode,
  RotateCw,
} from "lucide-react";

export const Route = createFileRoute("/admin/events")({
  beforeLoad: async () => {
    const access = await checkAdminAccessFn();
    if (!access.allowed && access.redirect) {
      throw redirect({ to: access.redirect });
    }
  },
  component: AdminSecurityEventsPage,
});

function AdminSecurityEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("ALL");
  const [resultFilter, setResultFilter] = useState<string>("ALL");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const res = await getAdminSecurityEventsFn({
        data: {
          eventType: eventTypeFilter === "ALL" ? undefined : eventTypeFilter,
          result: resultFilter === "ALL" ? undefined : resultFilter,
          deliveryStatus: deliveryFilter === "ALL" ? undefined : deliveryFilter,
          sourceIp: search.trim() ? search.trim() : undefined,
          limit: 100,
        },
      });
      setEvents((res as any)?.events ?? res ?? []);
    } catch (err: any) {
      console.error("Failed to load security events:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, [eventTypeFilter, resultFilter, deliveryFilter]);

  const handleRetryDelivery = async (eventId: string) => {
    setIsRetrying(true);
    setActionMessage(null);
    try {
      const res = await adminRetrySingleEventFn({ data: { eventId } });
      if (res.ok) {
        setActionMessage({ type: "success", text: "Outbox delivery attempted and logged." });
        await loadEvents();
        // Update selected event if open
        const updated = events.find((e) => e.id === eventId);
        if (updated) setSelectedEvent(updated);
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Failed to retry delivery" });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-amber-500" />
              Security Events & ECS Outbox Telemetry
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Inspect v1.0 standard JSON telemetry dispatched to Ethio-Cyber Shield with delivery statuses and retry queues.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadEvents}
              disabled={isLoading}
              className="text-xs border-zinc-800 text-zinc-300 hover:bg-zinc-900 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Result Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-zinc-500 uppercase font-mono mr-1">Result:</span>
            {["ALL", "SUCCESS", "FAILED", "BLOCKED"].map((r) => (
              <Button
                key={r}
                size="sm"
                variant={resultFilter === r ? "secondary" : "outline"}
                onClick={() => setResultFilter(r)}
                className={`h-7 px-2 text-[11px] font-mono ${
                  resultFilter === r
                    ? "bg-zinc-200 text-zinc-900 font-bold dark:bg-zinc-800 dark:text-zinc-100"
                    : "border-zinc-800 text-zinc-400"
                }`}
              >
                {r}
              </Button>
            ))}
          </div>

          {/* Delivery Status Filter */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-zinc-500 uppercase font-mono mr-1">Outbox:</span>
            {["ALL", "DELIVERED", "PENDING", "FAILED"].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={deliveryFilter === d ? "secondary" : "outline"}
                onClick={() => setDeliveryFilter(d)}
                className={`h-7 px-2 text-[11px] font-mono ${
                  deliveryFilter === d
                    ? "bg-zinc-200 text-zinc-900 font-bold dark:bg-zinc-800 dark:text-zinc-100"
                    : "border-zinc-800 text-zinc-400"
                }`}
              >
                {d}
              </Button>
            ))}
          </div>

          {/* Search by IP */}
          <div className="flex items-center gap-2 flex-1 max-w-xs ml-auto">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" />
              <Input
                type="text"
                placeholder="Search source IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadEvents()}
                className="pl-8 h-7 text-xs bg-zinc-900/60 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 font-mono"
              />
            </div>
            <Button
              size="sm"
              onClick={loadEvents}
              className="h-7 px-2.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
            >
              Filter
            </Button>
          </div>
        </div>

        {/* Security Events Table */}
        <div className="rounded-lg border border-border/60 bg-zinc-950/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-border/60 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Result</th>
                  <th className="py-2.5 px-3">Actor / User</th>
                  <th className="py-2.5 px-3">Source IP</th>
                  <th className="py-2.5 px-3">Outbox Delivery</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-zinc-500" />
                      Loading security events...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground font-sans">
                      No security events found matching the filter criteria.
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => {
                    const resultColor =
                      ev.result === "SUCCESS"
                        ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
                        : ev.result === "FAILED" || ev.result === "BLOCKED"
                        ? "bg-red-500/10 text-red-400 ring-red-500/30"
                        : "bg-amber-500/10 text-amber-400 ring-amber-500/30";

                    const deliveryColor =
                      ev.delivery_status === "DELIVERED"
                        ? "text-emerald-400"
                        : ev.delivery_status === "PENDING"
                        ? "text-amber-400"
                        : "text-red-400";

                    return (
                      <tr
                        key={ev.id}
                        className="hover:bg-zinc-900/40 transition-colors cursor-pointer group"
                        onClick={() => setSelectedEvent(ev)}
                      >
                        <td className="py-3 px-3">
                          <div className="font-semibold text-zinc-100">{ev.event_type}</div>
                          <div className="text-[10px] text-zinc-500 truncate max-w-xs">{ev.id}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1 ${resultColor}`}
                          >
                            {ev.result}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-zinc-300">
                          {ev.user_id_pub || "ANONYMOUS"}
                        </td>
                        <td className="py-3 px-3 text-zinc-300">
                          {ev.source_ip}
                        </td>
                        <td className="py-3 px-3">
                          <div className={`font-semibold flex items-center gap-1 ${deliveryColor}`}>
                            {ev.delivery_status || "PENDING"}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            Attempts: {ev.delivery_attempts ?? 0}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-zinc-400 text-[11px]">
                          {new Date(ev.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 font-sans">
                            {ev.delivery_status !== "DELIVERED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRetryDelivery(ev.id)}
                                disabled={isRetrying}
                                className="h-7 px-2 text-[11px] border-zinc-800 text-amber-400 hover:bg-amber-950/40"
                              >
                                <RotateCw className="w-3 h-3 mr-1" /> Retry
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedEvent(ev)}
                              className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Event Detail Modal / JSON Drawer */}
        {selectedEvent && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end animate-in fade-in duration-150">
            <div className="w-full max-w-xl bg-zinc-950 border-l border-border/80 h-full overflow-y-auto p-6 space-y-6 shadow-2xl font-sans">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-border/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold font-mono text-zinc-100">{selectedEvent.event_type}</h2>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        selectedEvent.result === "SUCCESS"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {selectedEvent.result}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-zinc-400 mt-1">ID: {selectedEvent.id}</div>
                  <div className="text-xs text-zinc-500 font-mono">
                    Time: {new Date(selectedEvent.created_at).toISOString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedEvent(null)}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Status Message */}
              {actionMessage && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    actionMessage.type === "success"
                      ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                      : "bg-red-500/10 text-red-300 border border-red-500/30"
                  }`}
                >
                  {actionMessage.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span>{actionMessage.text}</span>
                </div>
              )}

              {/* Outbox Delivery Summary & Action */}
              <div className="p-3.5 rounded-lg border border-border/60 bg-zinc-900/50 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-blue-400" /> ECS Outbox Status
                  </span>
                  <span
                    className={`font-mono text-[11px] font-bold ${
                      selectedEvent.delivery_status === "DELIVERED"
                        ? "text-emerald-400"
                        : selectedEvent.delivery_status === "PENDING"
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {selectedEvent.delivery_status || "PENDING"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-zinc-400 font-mono text-[11px]">
                  <div>Attempts: {selectedEvent.delivery_attempts ?? 0}</div>
                  <div>Next retry: {selectedEvent.next_attempt_at || "None"}</div>
                </div>
                {selectedEvent.last_error && (
                  <div className="p-2 rounded bg-red-950/40 text-red-300 font-mono text-[10px] border border-red-900/50">
                    Last error: {selectedEvent.last_error}
                  </div>
                )}
                {selectedEvent.delivery_status !== "DELIVERED" && (
                  <div className="pt-1">
                    <Button
                      size="sm"
                      onClick={() => handleRetryDelivery(selectedEvent.id)}
                      disabled={isRetrying}
                      className="w-full text-xs bg-amber-700 hover:bg-amber-800 text-white font-medium"
                    >
                      <RotateCw className={`w-3.5 h-3.5 mr-1.5 ${isRetrying ? "animate-spin" : ""}`} />
                      Trigger Immediate ECS Delivery Retry
                    </Button>
                  </div>
                )}
              </div>

              {/* Exact v1.0 JSON Telemetry Payload as sent to ECS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-xs text-zinc-200 flex items-center gap-1.5">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    v1.0 ECS JSON Payload Schema
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2));
                      setActionMessage({ type: "success", text: "JSON payload copied to clipboard" });
                    }}
                    className="h-6 text-[10px] text-zinc-400 hover:text-white"
                  >
                    Copy JSON
                  </Button>
                </div>
                <pre className="p-3.5 rounded-lg border border-border/50 bg-black text-emerald-400 text-[11px] font-mono overflow-x-auto max-h-96 leading-relaxed">
                  {JSON.stringify(
                    {
                      event_id: selectedEvent.id,
                      schema_version: "1.0",
                      timestamp: selectedEvent.created_at,
                      system_id: "SHIELDBANK_CORE",
                      event_type: selectedEvent.event_type,
                      severity: selectedEvent.severity || "LOW",
                      result: selectedEvent.result,
                      actor: {
                        user_id: selectedEvent.user_id_pub,
                        session_id: selectedEvent.session_id,
                        device_hash: selectedEvent.device_hash,
                      },
                      network: {
                        source_ip: selectedEvent.source_ip,
                        user_agent: selectedEvent.user_agent,
                      },
                      details: selectedEvent.details,
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
