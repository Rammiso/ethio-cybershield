import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  listRegisteredCustomersFn,
  depositCustomerFundsFn,
  getRecentDepositsFn,
  registerCustomerByTellerFn,
} from "@/lib/banking.functions";
import { storeRegisteredEntity, getStoredEntities } from "@/lib/client-headers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Building2,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  DollarSign,
  UserCheck,
  ShieldCheck,
  Receipt,
  RotateCw,
  LogOut,
  Wallet,
  ArrowDownLeft,
  Users,
  UserPlus,
  KeyRound,
  X,
  Sparkles,
  Eye,
  EyeOff,
} from "lucide-react";

export const Route = createFileRoute("/employee/")({
  component: EmployeeDashboardPage,
});

interface CustomerAccountItem {
  accountId: string;
  accountPublicId: string;
  accountNumber: string;
  balanceMinor: number;
  balanceEtb: number;
  currency: string;
  accountStatus: string;
  userId: string;
  userPublicId: string;
  fullName: string;
  email: string;
  phone: string | null;
  registeredAt: string;
}

interface RecentDepositItem {
  id: string;
  publicId: string;
  amountMinor: number;
  amountEtb: number;
  currency: string;
  status: string;
  note: string | null;
  accountNumber: string;
  customerName: string;
  customerPhone: string | null;
  completedAt: string;
}

function EmployeeDashboardPage() {
  const { user, roles, logout, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<"deposit" | "register">("deposit");

  // Customer register state
  const [customers, setCustomers] = useState<CustomerAccountItem[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Deposit Form State
  const [amountStr, setAmountStr] = useState<string>("5000");
  const [channel, setChannel] = useState<string>("BRANCH_CASH");
  const [reference, setReference] = useState<string>(`OTC-${Math.floor(100000 + Math.random() * 900000)}`);
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  // Success Confirmation State
  const [lastDepositReceipt, setLastDepositReceipt] = useState<{
    receiptNumber: string;
    transactionId: string;
    accountNumber: string;
    customerName: string;
    depositAmountEtb: number;
    balanceAfterEtb: number;
    processedAt: string;
  } | null>(null);

  // Teller Customer Registration State
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("+2519");
  const [regInitialPassword, setRegInitialPassword] = useState("Welcome@2026");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regIsSubmitting, setRegIsSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [onboardingNotice, setOnboardingNotice] = useState<string | null>(null);

  // Recent Deposits Log
  const [recentDeposits, setRecentDeposits] = useState<RecentDepositItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Enforce staff/admin authorization
  const isStaff = roles.includes("employee") || roles.includes("admin");

  useEffect(() => {
    if (!authLoading && !user) {
      void navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  const loadData = async () => {
    setLoadingCustomers(true);
    setLoadingRecent(true);
    try {
      const [custList, depList] = await Promise.all([
        listRegisteredCustomersFn(),
        getRecentDepositsFn({ data: { limit: 15 } }),
      ]);
      let typedCust = (custList as CustomerAccountItem[]) || [];
      const stored = getStoredEntities();
      for (const s of stored) {
        if (!typedCust.some((c) => c.accountId === s.accountId || c.accountNumber === s.accountNumber || (s.email && c.email.toLowerCase() === s.email.toLowerCase()))) {
          typedCust.unshift({
            accountId: s.accountId,
            accountPublicId: s.accountPublicId || "ACC_REG",
            accountNumber: s.accountNumber,
            balanceMinor: s.balanceMinor ?? 0,
            balanceEtb: s.balanceEtb ?? ((s.balanceMinor ?? 0) / 100),
            currency: s.currency || "ETB",
            accountStatus: s.accountStatus || "ACTIVE",
            userId: s.userId,
            userPublicId: s.userPublicId || "U_CUST",
            fullName: s.fullName,
            email: s.email,
            phone: s.phone ?? null,
            registeredAt: s.registeredAt || new Date().toISOString(),
          });
        }
      }
      setCustomers(typedCust);
      setRecentDeposits(depList as RecentDepositItem[]);

      if (typedCust.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(typedCust[0]!.accountId);
      }
    } catch (err: unknown) {
      setDepositError(err instanceof Error ? err.message : "Failed to load customer register");
    } finally {
      setLoadingCustomers(false);
      setLoadingRecent(false);
    }
  };

  useEffect(() => {
    if (user && isStaff) {
      void loadData();
    }
  }, [user, isStaff]);

  // Handle clicking outside customer search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full border-red-500/30">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-2">
              <AlertCircle className="w-6 h-6" />
            </div>
            <CardTitle>Staff Authorization Required</CardTitle>
            <CardDescription>
              The Employee & Teller Cash-In Portal is restricted to authorized HonorPay branch personnel and system administrators.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full bg-emerald-700 hover:bg-emerald-800 text-white">
              <Link to="/app">Go to Customer App</Link>
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await logout();
                void navigate({ to: "/login" });
              }}
            >
              Sign In with Teller Account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filtered customer list matching typed letters, names, or Ethiopian phone numbers (09...)
  const cleanQ = searchQuery.toLowerCase().trim();
  const cleanDigits = cleanQ.replace(/\D/g, "");
  const corePhoneQ = cleanDigits.startsWith("251") ? cleanDigits.slice(3) : cleanDigits.startsWith("0") ? cleanDigits.slice(1) : cleanDigits;

  const filteredCustomers = customers.filter((c) => {
    if (!cleanQ) return true;
    if (c.fullName.toLowerCase().includes(cleanQ)) return true;
    if (c.accountNumber.toLowerCase().includes(cleanQ)) return true;
    if (c.email.toLowerCase().includes(cleanQ)) return true;
    if (c.accountPublicId.toLowerCase().includes(cleanQ)) return true;

    if (c.phone) {
      const pLower = c.phone.toLowerCase();
      if (pLower.includes(cleanQ)) return true;
      const pDigits = c.phone.replace(/\D/g, "");
      const corePDigits = pDigits.startsWith("251") ? pDigits.slice(3) : pDigits.startsWith("0") ? pDigits.slice(1) : pDigits;

      if (cleanDigits.length >= 3 && pDigits.includes(cleanDigits)) return true;
      if (corePhoneQ.length >= 3 && (corePDigits.includes(corePhoneQ) || corePhoneQ.includes(corePDigits))) return true;

      const localPhone = corePDigits.length === 9 ? `0${corePDigits}` : "";
      if (localPhone && (localPhone.includes(cleanQ) || cleanQ.includes(localPhone))) return true;
    }
    return false;
  });

  const selectedCustomer = customers.find((c) => c.accountId === selectedCustomerId);

  // Handle deposit processing
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      setDepositError("Please select a registered customer to credit.");
      return;
    }

    const amountEtb = parseFloat(amountStr);
    if (isNaN(amountEtb) || amountEtb <= 0) {
      setDepositError("Please enter a valid deposit amount greater than 0 ETB.");
      return;
    }

    setIsSubmitting(true);
    setDepositError(null);

    try {
      const res = await depositCustomerFundsFn({
        data: {
          customerAccountId: selectedCustomer.accountId,
          amountEtb,
          channel,
          reference,
          note: note.trim() || undefined,
        },
      });

      setLastDepositReceipt(res);
      // Reset reference for next transaction
      setReference(`OTC-${Math.floor(100000 + Math.random() * 900000)}`);
      setNote("");

      // Refresh customer register and recent list
      await loadData();
    } catch (err: unknown) {
      setDepositError(err instanceof Error ? err.message : "Deposit failed to process");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle customer registration by teller
  const handleRegisterCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegIsSubmitting(true);

    try {
      const res = await registerCustomerByTellerFn({
        data: {
          fullName: regFullName.trim(),
          email: regEmail.trim(),
          phone: regPhone.trim() || undefined,
          initialPassword: regInitialPassword.trim(),
        },
      });

      // Persist newly registered customer to client storage for cross-container sync
      storeRegisteredEntity(res);

      // Reload customer register
      await loadData();

      // Select newly registered customer
      setSelectedCustomerId(res.accountId);
      setSearchQuery(res.fullName);

      // Show prominent banner & immediately switch to deposit terminal
      setOnboardingNotice(
        `Customer "${res.fullName}" registered successfully! Account #${res.accountNumber} created. Temporary login password is "${res.initialPassword}". Customer can log in using mobile phone (${res.phone || "09..."}) or email. Ready for initial cash deposit below.`,
      );
      setActiveTab("deposit");

      // Reset registration form
      setRegFullName("");
      setRegEmail("");
      setRegPhone("+2519");
      setRegInitialPassword("Welcome@2026");
    } catch (err: unknown) {
      setRegError(err instanceof Error ? err.message : "Failed to register customer at branch");
    } finally {
      setRegIsSubmitting(false);
    }
  };

  const presetAmounts = [500, 1000, 5000, 10000, 50000];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Teller Bar */}
      <header className="border-b border-border/70 bg-card sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-700 text-white shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-foreground">
                  HonorPay
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Teller Portal
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline-block">
                  • Addis Ababa Head Branch (UTC+3)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Branch Cash-In & Registered Customer Onboarding Terminal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-foreground">{user?.email}</div>
              <div className="text-[10px] font-mono text-muted-foreground">
                Roles: {roles.join(", ")}
              </div>
            </div>

            {roles.includes("admin") && (
              <Button asChild variant="outline" size="sm" className="text-xs">
                <Link to="/admin">Admin Ops</Link>
              </Button>
            )}

            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/app">Customer View</Link>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                void navigate({ to: "/login" });
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Branch Overview Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="border-border/60 bg-gradient-to-br from-emerald-500/10 via-card to-card">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Registered Customers
                </p>
                <div className="text-2xl font-bold text-foreground mt-1">
                  {loadingCustomers ? "..." : customers.length}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                <Users className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Today's Deposits
                </p>
                <div className="text-2xl font-bold text-foreground mt-1">
                  {loadingRecent ? "..." : recentDeposits.length}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Total Credited (Feed)
                </p>
                <div className="text-2xl font-bold text-foreground mt-1 font-mono">
                  {loadingRecent
                    ? "..."
                    : recentDeposits
                        .reduce((sum, d) => sum + d.amountEtb, 0)
                        .toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
                  <span className="text-xs text-muted-foreground font-normal">ETB</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                <DollarSign className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Telemetry Channel
                </p>
                <div className="text-sm font-semibold text-emerald-600 flex items-center gap-1.5 mt-2">
                  <ShieldCheck className="w-4 h-4" /> Live Sync (ECS)
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void loadData()}
                title="Refresh customer & deposit records"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <RotateCw className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Action Mode Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("deposit")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "deposit"
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wallet className="w-4 h-4" />
              Cash Deposit Terminal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("register")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "register"
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Register Customer at Branch
            </button>
          </div>

          <div className="text-xs text-muted-foreground">
            {activeTab === "deposit" ? (
              <span>Credit cash for registered customers with 10-digit accounts</span>
            ) : (
              <span>Create customer profile & assign temporary password</span>
            )}
          </div>
        </div>

        {/* Global Onboarding / Success Notification */}
        {onboardingNotice && (
          <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div className="flex-1 space-y-1">
              <AlertTitle className="text-sm font-bold flex items-center justify-between">
                <span>Customer Successfully Registered & Pre-Selected</span>
                <button
                  type="button"
                  onClick={() => setOnboardingNotice(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                {onboardingNotice}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* VIEW 1: Cash Deposit Terminal */}
        {activeTab === "deposit" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Customer Directory / Selector Column */}
            <div className="lg:col-span-5 space-y-4">
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center justify-between">
                    <span>1. Customer Register</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {filteredCustomers.length} registered
                    </span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Transfers & deposits are strictly bound to registered HonorPay accounts.
                  </CardDescription>

                  {/* Customer Search Autocomplete Input with Floating Dropdown */}
                  <div ref={searchContainerRef} className="relative mt-2">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder="Type name, account (1000...), phone..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      className="pl-9 pr-8 text-xs"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setIsDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Floating Dropdown Result Popup */}
                    {isDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-card border border-border/80 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto backdrop-blur-md">
                        <div className="p-2 border-b border-border/40 bg-muted/40 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                          <span>Matching Registered Customers ({filteredCustomers.length})</span>
                          <span className="text-[10px]">Click to select</span>
                        </div>
                        {filteredCustomers.length === 0 ? (
                          <div className="p-4 text-center space-y-2">
                            <p className="text-xs text-muted-foreground">
                              No customer found matching &quot;{searchQuery}&quot;
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setIsDropdownOpen(false);
                                setActiveTab("register");
                                if (searchQuery.includes("@")) {
                                  setRegEmail(searchQuery);
                                } else if (/^\+?[0-9]+$/.test(searchQuery)) {
                                  setRegPhone(searchQuery);
                                } else {
                                  setRegFullName(searchQuery);
                                }
                              }}
                            >
                              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                              Register Customer at Branch
                            </Button>
                          </div>
                        ) : (
                          <div className="divide-y divide-border/30">
                            {filteredCustomers.map((cust) => {
                              const isSelected = cust.accountId === selectedCustomerId;
                              return (
                                <div
                                  key={cust.accountId}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setSelectedCustomerId(cust.accountId);
                                    setSearchQuery(cust.fullName);
                                    setIsDropdownOpen(false);
                                    setDepositError(null);
                                  }}
                                  className={`p-3 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                                    isSelected
                                      ? "bg-emerald-500/15 border-l-4 border-l-emerald-600"
                                      : "hover:bg-muted/60"
                                  }`}
                                >
                                  <div className="space-y-0.5 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-xs text-foreground truncate">
                                        {cust.fullName}
                                      </span>
                                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-muted text-muted-foreground">
                                        {cust.accountPublicId}
                                      </span>
                                      {isSelected && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                                          Selected
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                                      <span className="font-mono font-medium text-foreground">
                                        Acc: {cust.accountNumber}
                                      </span>
                                      {cust.phone && <span>• {cust.phone}</span>}
                                    </div>
                                  </div>

                                  <div className="text-right shrink-0">
                                    <div className="font-mono font-bold text-xs text-foreground">
                                      {cust.balanceEtb.toLocaleString("en-US", {
                                        minimumFractionDigits: 2,
                                      })}{" "}
                                      ETB
                                    </div>
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                      Select →
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {loadingCustomers ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      Loading registered customers...
                    </div>
                  ) : customers.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground space-y-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                        <Users className="w-5 h-5" />
                      </div>
                      <p className="font-medium text-foreground">No Registered Customers Yet</p>
                      <p className="text-muted-foreground">
                        Register a customer to issue their 10-digit HonorPay bank account and perform cash deposits.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setActiveTab("register")}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs"
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Register First Customer
                      </Button>
                    </div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground space-y-2">
                      <p>No registered customers match &quot;{searchQuery}&quot;.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActiveTab("register");
                          setRegFullName(searchQuery);
                        }}
                        className="text-xs"
                      >
                        Register New Customer
                      </Button>
                    </div>
                  ) : (
                    filteredCustomers.map((cust) => {
                      const isSelected = cust.accountId === selectedCustomerId;
                      return (
                        <button
                          type="button"
                          key={cust.accountId}
                          onClick={() => {
                            setSelectedCustomerId(cust.accountId);
                            setSearchQuery(cust.fullName);
                            setDepositError(null);
                          }}
                          className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? "border-emerald-600 bg-emerald-500/10 shadow-xs"
                              : "border-border/60 hover:bg-muted/50"
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-foreground truncate">
                                {cust.fullName}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-muted text-muted-foreground">
                                {cust.accountPublicId}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                              <span className="font-mono font-medium text-foreground">
                                {cust.accountNumber}
                              </span>
                              {cust.phone && <span>• {cust.phone}</span>}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-xs text-foreground">
                              {cust.balanceEtb.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              ETB
                            </div>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                cust.accountStatus === "ACTIVE"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                              }`}
                            >
                              {cust.accountStatus}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Deposit Action Form Column */}
            <div className="lg:col-span-7 space-y-4">
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="pb-3 border-b border-border/50">
                  <CardTitle className="text-base font-semibold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-emerald-600" />
                      <span>2. Branch Cash Deposit Execution</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">Ref: {reference}</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Credit physical cash or over-the-counter deposit to customer's available balance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {depositError && (
                    <Alert variant="destructive" className="py-2.5">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">{depositError}</AlertDescription>
                    </Alert>
                  )}

                  {/* Selected Customer Highlight Card */}
                  {selectedCustomer ? (
                    <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-emerald-600" />
                          <span className="font-bold text-sm text-foreground">
                            {selectedCustomer.fullName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 font-mono">
                            Verified
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3">
                          <span>
                            Account:{" "}
                            <strong className="text-foreground font-mono">
                              {selectedCustomer.accountNumber}
                            </strong>
                          </span>
                          {selectedCustomer.phone && <span>Phone: {selectedCustomer.phone}</span>}
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                          Current Deposit Balance
                        </div>
                        <div className="text-lg font-black text-foreground font-mono">
                          {selectedCustomer.balanceEtb.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          <span className="text-xs font-normal text-muted-foreground">ETB</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center rounded-xl border border-dashed border-emerald-500/30 bg-muted/20 space-y-2">
                      <Search className="w-6 h-6 mx-auto text-muted-foreground" />
                      <p className="text-xs font-medium text-foreground">
                        No Customer Selected
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Use the search input above to type letters and select a customer from the dropdown, or register a new one.
                      </p>
                    </div>
                  )}

                  {/* Form */}
                  <form onSubmit={handleDepositSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="amount" className="text-xs font-semibold">
                          Deposit Amount (ETB)
                        </Label>
                        {selectedCustomer && (
                          <span className="text-[11px] text-muted-foreground">
                            Balance after deposit:{" "}
                            <strong className="text-emerald-600 font-mono font-bold">
                              {(
                                selectedCustomer.balanceEtb + (parseFloat(amountStr) || 0)
                              ).toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
                              ETB
                            </strong>
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          id="amount"
                          type="number"
                          step="any"
                          min="1"
                          placeholder="e.g. 5000"
                          value={amountStr}
                          onChange={(e) => setAmountStr(e.target.value)}
                          required
                          className="text-lg font-mono font-bold pr-16"
                        />
                        <span className="absolute right-3 top-2.5 text-xs font-bold text-muted-foreground">
                          ETB
                        </span>
                      </div>

                      {/* Quick Preset Amount Buttons */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {presetAmounts.map((p) => (
                          <button
                            type="button"
                            key={p}
                            onClick={() => setAmountStr(p.toString())}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border/70 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors text-foreground"
                          >
                            +{p.toLocaleString()} ETB
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="channel" className="text-xs">
                          Deposit Channel
                        </Label>
                        <select
                          id="channel"
                          value={channel}
                          onChange={(e) => setChannel(e.target.value)}
                          className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="BRANCH_CASH">Branch Cash Counter (OTC)</option>
                          <option value="AGENT_CASHIN">HonorPay USSD Agent Cash-In</option>
                          <option value="BANK_DEPOSIT">EthSwitch / Commercial Transfer</option>
                          <option value="PAYROLL_CREDIT">Corporate Payroll Deposit</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="reference" className="text-xs">
                          Deposit Slip / Voucher Ref
                        </Label>
                        <Input
                          id="reference"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                          placeholder="OTC-..."
                          className="text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="note" className="text-xs">
                        Teller Remarks (Optional)
                      </Label>
                      <Input
                        id="note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. Physical cash verified at Addis Ababa Branch window 4"
                        className="text-xs"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting || !selectedCustomer}
                      className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-sm py-2.5"
                    >
                      {isSubmitting ? (
                        "Processing Cash Deposit..."
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Confirm & Credit Deposit into Account
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Success Receipt Banner */}
              {lastDepositReceipt && (
                <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 p-4">
                  <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <div className="space-y-1">
                    <AlertTitle className="text-sm font-bold flex items-center justify-between">
                      <span>Deposit Receipt: {lastDepositReceipt.receiptNumber}</span>
                      <span className="text-[10px] font-mono font-normal">
                        Tx: {lastDepositReceipt.transactionId}
                      </span>
                    </AlertTitle>
                    <AlertDescription className="text-xs space-y-1">
                      <p>
                        Successfully credited{" "}
                        <strong>
                          {lastDepositReceipt.depositAmountEtb.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          ETB
                        </strong>{" "}
                        to <strong>{lastDepositReceipt.customerName}</strong> (Acc:{" "}
                        <span className="font-mono">{lastDepositReceipt.accountNumber}</span>).
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        New available customer balance:{" "}
                        <strong className="text-foreground font-mono">
                          {lastDepositReceipt.balanceAfterEtb.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}{" "}
                          ETB
                        </strong>{" "}
                        • Processed at{" "}
                        {new Date(lastDepositReceipt.processedAt).toLocaleTimeString("en-US", {
                          timeZone: "Africa/Addis_Ababa",
                        })}{" "}
                        EAT
                      </p>
                    </AlertDescription>
                  </div>
                </Alert>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: Register Customer at Branch */}
        {activeTab === "register" && (
          <div className="max-w-2xl mx-auto space-y-4">
            <Card className="border-border/60 shadow-md">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Register Customer at Branch</CardTitle>
                    <CardDescription className="text-xs">
                      Issue a new 10-digit HonorPay checking account with temporary credentials.
                      The customer will be required to change their password on first login.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {regError && (
                  <Alert variant="destructive" className="mb-4 py-2.5">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{regError}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleRegisterCustomer} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="regFullName" className="text-xs font-semibold">
                      Customer Full Name *
                    </Label>
                    <Input
                      id="regFullName"
                      placeholder="e.g. Abebe Bikila"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="regEmail" className="text-xs font-semibold">
                      Email Address (Login Identifier) *
                    </Label>
                    <Input
                      id="regEmail"
                      type="email"
                      placeholder="e.g. abebe.bikila@gmail.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="regPhone" className="text-xs font-semibold">
                      Phone Number (USSD & SMS Notifications)
                    </Label>
                    <Input
                      id="regPhone"
                      placeholder="e.g. +251911223344"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="regInitialPassword" className="text-xs font-semibold">
                      Temporary Assigned Password *
                    </Label>
                    <div className="relative">
                      <Input
                        id="regInitialPassword"
                        type={showRegPassword ? "text" : "password"}
                        value={regInitialPassword}
                        onChange={(e) => setRegInitialPassword(e.target.value)}
                        required
                        className="font-mono text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
                        aria-label={showRegPassword ? "Hide password" : "Show password"}
                      >
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2 rounded-lg mt-1">
                      <KeyRound className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Upon their first login on the mobile banking app, the customer will be strictly prompted to change this temporary password.
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                    <Button
                      type="submit"
                      disabled={regIsSubmitting}
                      className="w-full sm:flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-medium"
                    >
                      {regIsSubmitting ? (
                        "Registering Customer..."
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Register Customer & Open Deposit Form
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveTab("deposit")}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent Branch Deposits Register */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Branch Deposit Register & Audit Trail
              </CardTitle>
              <CardDescription className="text-xs">
                Live ledger of over-the-counter deposits credited by tellers
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              className="text-xs"
            >
              <RotateCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Log
            </Button>
          </CardHeader>
          <CardContent>
            {loadingRecent ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Loading deposit register...
              </div>
            ) : recentDeposits.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No branch deposits recorded yet today. Use the terminal above to process a deposit.
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {recentDeposits.map((dep) => (
                  <div
                    key={dep.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                        <span>{dep.customerName}</span>
                        <span className="font-mono text-[11px] text-muted-foreground font-normal">
                          (Acc: {dep.accountNumber})
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-muted text-muted-foreground">
                          {dep.publicId}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(dep.completedAt).toLocaleString("en-US", {
                          timeZone: "Africa/Addis_Ababa",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}{" "}
                        EAT • {dep.note || "Teller cash deposit"}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1">
                      <div className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                        +{dep.amountEtb.toLocaleString("en-US", { minimumFractionDigits: 2 })} ETB
                      </div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Credited
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}