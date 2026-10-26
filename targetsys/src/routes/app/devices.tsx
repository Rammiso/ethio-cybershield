import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { CustomerShell } from "@/components/customer-shell";
import { getDevicesFn, registerDeviceFn, removeDeviceFn } from "@/lib/banking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  Laptop,
  CheckCircle2,
  Calendar,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/app/devices")({
  component: DevicesPage,
});

interface DeviceItem {
  id: string;
  public_id: string;
  label: string;
  fingerprint_hash: string;
  user_agent?: string | null;
  trusted: boolean;
  first_seen_at: string;
  last_seen_at: string;
  status: string;
}

function DevicesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      void navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  const loadDevices = async () => {
    setLoading(true);
    try {
      const res = await getDevicesFn();
      setDevices(res as DeviceItem[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadDevices();
    }
  }, [user]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceLabel.trim()) {
      setError("Please enter a device label.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await registerDeviceFn({ data: { label: deviceLabel.trim() } });
      setSuccessMsg("Device successfully registered and marked as trusted.");
      setDeviceLabel("");
      setModalOpen(false);
      await loadDevices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to register device.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (publicId: string, label: string) => {
    if (!confirm(`Are you sure you want to remove "${label}"? This device will be deregistered.`)) {
      return;
    }

    try {
      await removeDeviceFn({ data: { devicePublicId: publicId } });
      setSuccessMsg(`Device "${label}" has been removed.`);
      await loadDevices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove device.");
    }
  };

  return (
    <CustomerShell>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Smartphone className="w-6 h-6 text-emerald-600" />
              Recognized Devices
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Manage your hardware authenticators and authorized banking devices.
            </p>
          </div>

          <Button
            onClick={() => {
              setDeviceLabel("");
              setError(null);
              setModalOpen(true);
            }}
            className="bg-emerald-700 hover:bg-emerald-800 text-white self-start sm:self-auto gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Register Device
          </Button>
        </div>

        {/* Status Alerts */}
        {error && (
          <Alert variant="destructive">
            <ShieldAlert className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMsg && (
          <Alert className="bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/40">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}

        {/* Devices List */}
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            Loading registered devices...
          </div>
        ) : devices.length === 0 ? (
          <Card className="text-center py-12 border-dashed">
            <CardContent className="space-y-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <Laptop className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-foreground">No Devices Registered</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Registering your current browser or mobile phone creates a trusted device token and
                reduces step-up OTP prompts.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(true)}
                className="mt-2"
              >
                Register This Device
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {devices.map((device) => (
              <Card
                key={device.id}
                className="hover:border-border transition-colors border-border/60 bg-card/60 backdrop-blur-sm"
              >
                <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Laptop className="w-4 h-4 text-muted-foreground" />
                      <span>{device.label}</span>
                    </CardTitle>
                    <CardDescription className="text-xs font-mono">
                      ID: {device.public_id}
                    </CardDescription>
                  </div>

                  {device.trusted ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Trusted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Untrusted
                    </span>
                  )}
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  <div className="bg-muted/40 p-2.5 rounded-lg space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Fingerprint:</span>
                      <span className="text-foreground" title={device.fingerprint_hash}>
                        {device.fingerprint_hash.slice(0, 16)}...
                      </span>
                    </div>
                    {device.user_agent && (
                      <div className="text-muted-foreground truncate" title={device.user_agent}>
                        <span className="text-foreground/70">UA: </span>
                        {device.user_agent}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Added: {new Date(device.first_seen_at).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5" />
                      Last Active: {new Date(device.last_seen_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-border/40 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleRemove(device.public_id, device.label)}
                      className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 h-8 px-2.5"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Register Device Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={(e) => void handleRegister(e)}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-600" />
                  Register Current Device
                </DialogTitle>
                <DialogDescription>
                  Give this device or browser a recognizable name to mark it as a trusted terminal.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="device-label">Device Name / Label</Label>
                  <Input
                    id="device-label"
                    placeholder="e.g. Work MacBook Chrome, Home PC, iPhone 15"
                    value={deviceLabel}
                    onChange={(e) => setDeviceLabel(e.target.value)}
                    required
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This captures the current browser fingerprint and associates it with your user profile.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  {isSubmitting ? "Registering..." : "Save & Trust Device"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </CustomerShell>
  );
}
