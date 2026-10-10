import React, { useEffect, useState, useCallback, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { format } from "date-fns";
import {
  Crown,
  Check,
  X,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  CreditCard,
  Calendar,
  Zap,
  ArrowRight,
  FileText,
  Clock,
  Download,
  Film,
  Award,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { useUser } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import {
  fetchSubscriptionPlans,
  fetchSubscriptionStatus,
  createSubscriptionOrder,
  verifyPayment,
  cancelSubscriptionOrder,
  toggleAutoRenew,
  scheduleDowngrade,
  fetchBillingHistory,
  fetchInvoiceDetails,
  loadRazorpayScript,
  PlanConfig,
  UserSubscriptionStatus,
  UserFeatures,
  TransactionRecord,
} from "@/lib/subscriptionService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function SubscriptionPage() {
  const router = useRouter();
  const { user, handlegooglesignin } = useUser();

  const [plans, setPlans] = useState<Record<string, PlanConfig>>({});
  const [razorpayKeyId, setRazorpayKeyId] = useState<string>("");
  const [subStatus, setSubStatus] = useState<UserSubscriptionStatus | null>(null);
  const [features, setFeatures] = useState<UserFeatures | null>(null);
  const [history, setHistory] = useState<TransactionRecord[]>([]);

  const [selectedCycle, setSelectedCycle] = useState<"MONTHLY" | "QUARTERLY" | "YEARLY">("MONTHLY");
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const autoCheckoutStarted = useRef<string | null>(null);

  // Invoice modal state
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Downgrade confirm modal
  const [downgradeModalPlan, setDowngradeModalPlan] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      const plansRes = await fetchSubscriptionPlans();
      setPlans(plansRes.plans);
      setRazorpayKeyId(plansRes.razorpayKeyId);

      if (user?._id) {
        const [statusRes, historyRes] = await Promise.all([
          fetchSubscriptionStatus(user._id),
          fetchBillingHistory(user._id),
        ]);
        setSubStatus(statusRes.subscription);
        setFeatures(statusRes.features);
        setHistory(historyRes.transactions || []);
      }
    } catch (err) {
      console.error("Failed to load subscription data:", err);
      toast.error("Failed to load subscription details");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Payment checkout flow
  const handleInitiatePayment = async (targetPlanId: string) => {
    if (!user?._id) {
      toast.error("Please sign in to choose a subscription plan", {
        action: { label: "Sign in", onClick: handlegooglesignin },
      });
      return;
    }

    if (processingPlan) return;
    setProcessingPlan(targetPlanId);

    try {
      // 1. Create Order on backend (server authoritatively calculates price)
      const orderRes = await createSubscriptionOrder(
        user._id,
        targetPlanId,
        selectedCycle
      );

      const { order } = orderRes;
      const rzpLoaded = await loadRazorpayScript();

      if (rzpLoaded && (window as any).Razorpay) {
        // Real or Sandbox Razorpay Popup
        const options = {
          key: order.keyId || razorpayKeyId,
          amount: order.amount,
          currency: order.currency || "INR",
          name: "YourTube Premium",
          description: `${order.plan} Subscription (${selectedCycle})`,
          order_id: order.id,
          prefill: {
            name: order.customer.name,
            email: order.customer.email,
          },
          theme: {
            color: "#dc2626", // Brand Red
          },
          handler: async (response: any) => {
            try {
              toast.loading("Verifying payment signature with backend...", { id: "verify-tx" });
              const verifyRes = await verifyPayment(user._id, {
                razorpayOrderId: response.razorpay_order_id || order.id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                paymentMethod: "razorpay_checkout",
              });

              toast.dismiss("verify-tx");
              if (verifyRes.success) {
                toast.success(verifyRes.message || "Subscription activated!");
                await loadAllData();
              } else {
                toast.error("Payment verification failed");
              }
            } catch (vErr: any) {
              toast.dismiss("verify-tx");
              toast.error(vErr.response?.data?.message || "Payment verification failed");
              await loadAllData();
            } finally {
              setProcessingPlan(null);
            }
          },
          modal: {
            ondismiss: async () => {
              await cancelSubscriptionOrder(user._id, order.id, "User closed checkout");
              setProcessingPlan(null);
              toast.info("Payment cancelled");
              await loadAllData();
            },
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", async (response: any) => {
          toast.error(`Payment failed: ${response.error.description}`);
          await loadAllData();
          setProcessingPlan(null);
        });
        rzp.open();
      } else {
        await cancelSubscriptionOrder(user._id, order.id, "Razorpay Checkout failed to load");
        toast.error("Razorpay checkout couldn't load. Your plan has not been changed.");
        setProcessingPlan(null);
      }
    } catch (err: any) {
      console.error("Order initiation error:", err);
      toast.error(
        err.response?.data?.message || err.message || "Failed to initiate payment"
      );
      setProcessingPlan(null);
    }
  };

  const initiatePaymentRef = useRef(handleInitiatePayment);
  initiatePaymentRef.current = handleInitiatePayment;

  useEffect(() => {
    const requestedPlan = router.query.plan;
    if (
      !router.isReady ||
      !user?._id ||
      Object.keys(plans).length === 0 ||
      typeof requestedPlan !== "string" ||
      !["BRONZE", "SILVER", "GOLD"].includes(requestedPlan.toUpperCase()) ||
      autoCheckoutStarted.current === requestedPlan
    ) {
      return;
    }

    autoCheckoutStarted.current = requestedPlan;
    router
      .replace("/subscription", undefined, { shallow: true })
      .then(() => initiatePaymentRef.current(requestedPlan.toUpperCase()))
      .catch(() => {
        autoCheckoutStarted.current = null;
        toast.error("Couldn't open the payment page. Please try again.");
      });
  }, [plans, router, user?._id]);

  const handleToggleAutoRenew = async () => {
    if (!user?._id) return;
    try {
      const res = await toggleAutoRenew(user._id);
      toast.success(res.message);
      await loadAllData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update renewal setting");
    }
  };

  const handleConfirmDowngrade = async () => {
    if (!user?._id || !downgradeModalPlan) return;
    try {
      const res = await scheduleDowngrade(user._id, downgradeModalPlan);
      toast.success(res.message);
      setDowngradeModalPlan(null);
      await loadAllData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to schedule downgrade");
    }
  };

  const openInvoiceModal = async (txId: string) => {
    if (!user?._id) return;
    try {
      const res = await fetchInvoiceDetails(user._id, txId);
      setSelectedInvoice(res.invoice);
      setIsInvoiceOpen(true);
    } catch (err) {
      toast.error("Failed to load invoice");
    }
  };

  const currentPlanId = subStatus?.plan || "FREE";
  const isPaidActive = currentPlanId !== "FREE" && subStatus?.status === "ACTIVE";

  const planOrder = ["FREE", "BRONZE", "SILVER", "GOLD"];

  return (
    <>
      <Head>
        <title>Subscriptions & Premium Plans – YourTube</title>
      </Head>

      <div className="max-w-6xl mx-auto space-y-8 pb-16">
        {/* Header */}
        <div className="text-center space-y-2 max-w-2xl mx-auto pt-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold mb-1">
            <Sparkles className="w-3.5 h-3.5" /> Razorpay Test Payment Integration
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight sm:text-4xl">
            Upgrade Your Streaming Experience
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Enjoy 4K UHD streaming, higher daily download quotas, exclusive courses, and ad-free videos with flexible monthly, quarterly, or yearly plans.
          </p>
        </div>

        {/* ─── SECTION 1: CURRENT ACTIVE SUBSCRIPTION ─── */}
        {user && subStatus && (
          <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-black text-white rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-gray-700 pb-6">
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  Current Membership
                </span>
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
                    <Crown className="w-7 h-7 text-yellow-400" />
                    {subStatus.plan} PLAN
                  </h2>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                      subStatus.status === "ACTIVE"
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : subStatus.status === "EXPIRED"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {subStatus.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {subStatus.plan === "FREE"
                    ? "Standard free viewer tier. Upgrade to unlock premium perks."
                    : `Billed ${subStatus.billingCycle.toLowerCase()} with automatic renewal`}
                </p>
              </div>

              {/* Status details / Action */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {isPaidActive ? (
                  <>
                    <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 space-y-1">
                      <div className="text-gray-400">Days Remaining</div>
                      <div className="text-lg font-extrabold text-white">
                        {subStatus.daysRemaining} days
                      </div>
                    </div>

                    <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-3 space-y-1">
                      <div className="text-gray-400">Next Renewal / Expiry</div>
                      <div className="font-semibold text-white">
                        {subStatus.expiryDate
                          ? format(new Date(subStatus.expiryDate), "dd MMM yyyy")
                          : "N/A"}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleToggleAutoRenew}
                      className="border-gray-600 text-gray-200 hover:bg-gray-800"
                    >
                      {subStatus.autoRenew ? "Cancel Auto-Renewal" : "Enable Auto-Renewal"}
                    </Button>
                  </>
                ) : (
                  <Link href="#plans-section">
                    <Button className="bg-red-600 hover:bg-red-700 text-white font-semibold">
                      Explore Paid Tiers <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {/* Scheduled downgrade warning if applicable */}
            {subStatus.scheduledDowngradePlan && (
              <div className="mt-4 p-3 bg-amber-900/30 border border-amber-600/40 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Scheduled downgrade to <strong>{subStatus.scheduledDowngradePlan}</strong> will take effect at the end of your billing cycle on {subStatus.expiryDate ? format(new Date(subStatus.expiryDate), "dd MMM yyyy") : ""}.
                </span>
              </div>
            )}

            {/* Feature Allowance Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-xs">
              <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/60">
                <div className="text-gray-400 flex items-center gap-1.5 mb-1">
                  <Film className="w-3.5 h-3.5 text-blue-400" /> Streaming Quality
                </div>
                <div className="font-bold text-sm text-white">
                  {features?.streamingQuality || "720p HD"}
                </div>
              </div>

              <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/60">
                <div className="text-gray-400 flex items-center gap-1.5 mb-1">
                  <Download className="w-3.5 h-3.5 text-green-400" /> Daily Downloads
                </div>
                <div className="font-bold text-sm text-white">
                  {features?.downloadLimit ?? 1} / day
                </div>
              </div>

              <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/60">
                <div className="text-gray-400 flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-purple-400" /> Watch Time Limit
                </div>
                <div className="font-bold text-sm text-white">
                  {features?.watchTimeLimitMinutes === 0
                    ? "Unlimited"
                    : `${features?.watchTimeLimitMinutes ?? 120} mins/day`}
                </div>
              </div>

              <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/60">
                <div className="text-gray-400 flex items-center gap-1.5 mb-1">
                  <Award className="w-3.5 h-3.5 text-yellow-400" /> Premium Content
                </div>
                <div className="font-bold text-sm text-white">
                  {features?.premiumVideoAccess ? "Unlocked" : "Locked (Free)"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── SECTION 2: BILLING CYCLE TOGGLE ─── */}
        <div id="plans-section" className="flex flex-col items-center space-y-3">
          <div className="inline-flex p-1 bg-gray-100 rounded-xl border border-gray-200">
            <button
              onClick={() => setSelectedCycle("MONTHLY")}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                selectedCycle === "MONTHLY"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setSelectedCycle("QUARTERLY")}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                selectedCycle === "QUARTERLY"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Quarterly
              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded">
                Save ~10%
              </span>
            </button>
            <button
              onClick={() => setSelectedCycle("YEARLY")}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 ${
                selectedCycle === "YEARLY"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Yearly
              <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                Save ~17%
              </span>
            </button>
          </div>
          <span className="text-xs text-gray-500">
            All payments are securely processed through Razorpay Test Gateway.
          </span>
        </div>

        {/* ─── SECTION 3: PLAN COMPARISON CARDS ─── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {planOrder.map((planKey) => {
            const p = plans[planKey];
            if (!p) return null;

            const cycleData = p.pricing[selectedCycle] || p.pricing.MONTHLY;
            const isCurrent = currentPlanId === p.planId;
            const currentLevel = planOrder.indexOf(currentPlanId);
            const targetLevel = planOrder.indexOf(p.planId);
            const isUpgrade = targetLevel > currentLevel;
            const isDowngrade = targetLevel < currentLevel;

            return (
              <div
                key={p.planId}
                className={`flex flex-col justify-between rounded-2xl border p-6 transition-all relative ${
                  p.planId === "GOLD"
                    ? "border-yellow-400 bg-yellow-50/20 shadow-md ring-1 ring-yellow-400"
                    : p.planId === "SILVER"
                    ? "border-slate-300 bg-slate-50/30 shadow-sm"
                    : p.planId === "BRONZE"
                    ? "border-amber-300 bg-amber-50/20 shadow-sm"
                    : "border-gray-200 bg-white"
                } ${isCurrent ? "ring-2 ring-blue-600" : ""}`}
              >
                {/* Popular or Recommended Tag */}
                {p.planId === "GOLD" && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow">
                    Most Popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 right-4 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow">
                    Active Plan
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-extrabold text-lg text-gray-900">{p.name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.badgeColor}`}>
                      {p.streamingQuality}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 min-h-[32px] mb-4">
                    {p.description}
                  </p>

                  {/* Pricing block */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-gray-900">
                        {p.symbol} {cycleData.price.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-500">
                        /{selectedCycle === "MONTHLY" ? "mo" : selectedCycle === "QUARTERLY" ? "3 mos" : "yr"}
                      </span>
                    </div>
                    {cycleData.discountPercent && (
                      <span className="text-[11px] text-green-700 font-semibold">
                        Saves {cycleData.discountPercent}% over monthly
                      </span>
                    )}
                  </div>

                  {/* Features list */}
                  <ul className="space-y-2.5 text-xs text-gray-700 mb-6 border-t pt-4">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                      <span><strong>{p.downloadLimit}</strong> download{p.downloadLimit > 1 ? "s" : ""}/day</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                      <span>Max Quality: <strong>{p.streamingQuality}</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                      <span>Watch limit: <strong>{p.watchTimeLimitMinutes === 0 ? "Unlimited" : `${p.watchTimeLimitMinutes}m/day`}</strong></span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.premiumVideoAccess ? (
                        <Check className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 shrink-0" />
                      )}
                      <span className={p.premiumVideoAccess ? "font-medium" : "text-gray-400"}>
                        Premium Video Access
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.adFree ? (
                        <Check className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 shrink-0" />
                      )}
                      <span className={p.adFree ? "font-medium" : "text-gray-400"}>
                        Ad-Free Viewing
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.premiumCourses ? (
                        <Check className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 shrink-0" />
                      )}
                      <span className={p.premiumCourses ? "font-medium" : "text-gray-400"}>
                        Masterclasses &amp; Courses
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {p.priorityContent ? (
                        <Check className="w-4 h-4 text-green-600 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-gray-300 shrink-0" />
                      )}
                      <span className={p.priorityContent ? "font-medium text-yellow-700" : "text-gray-400"}>
                        Priority Releases
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Card Action Button */}
                <div className="pt-2">
                  {p.planId === "FREE" ? (
                    <Button
                      variant="outline"
                      className="w-full text-xs font-semibold"
                      disabled={isCurrent}
                      onClick={() => setDowngradeModalPlan("FREE")}
                    >
                      {isCurrent ? "Current Free Plan" : "Downgrade to Free"}
                    </Button>
                  ) : isCurrent ? (
                    <Button
                      className="w-full text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800"
                      onClick={() => handleInitiatePayment(p.planId)}
                      disabled={processingPlan !== null}
                    >
                      {processingPlan === p.planId ? "Processing..." : "Renew Current Plan"}
                    </Button>
                  ) : isUpgrade ? (
                    <Button
                      className="w-full text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm"
                      onClick={() => handleInitiatePayment(p.planId)}
                      disabled={processingPlan !== null}
                    >
                      {processingPlan === p.planId ? "Opening Checkout..." : `Upgrade to ${p.name}`}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full text-xs font-semibold text-gray-700"
                      onClick={() => setDowngradeModalPlan(p.planId)}
                    >
                      Downgrade to {p.name}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── SECTION 4: BILLING & INVOICE HISTORY TABLE ─── */}
        <div className="space-y-4 pt-6 border-t">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-700" />
                Billing History &amp; Invoices
              </h2>
              <p className="text-xs text-gray-500">
                View all payment transactions, verified Razorpay payment receipts, and download invoices.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadAllData}
              disabled={loading}
              className="text-xs"
            >
              <RotateCcw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Loading transactions...
            </div>
          ) : history.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
              No payment transactions yet. When you upgrade to Bronze, Silver, or Gold, your invoices will appear here.
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-600 border-b uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Plan &amp; Cycle</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Payment ID</th>
                    <th className="py-3 px-4 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((tx) => (
                    <tr key={tx._id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-gray-900">
                        {tx.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {format(new Date(tx.createdAt), "dd MMM yyyy, h:mm a")}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-gray-900">{tx.subscriptionPlan}</span>{" "}
                        <span className="text-gray-500">({tx.billingCycle})</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">
                        ₹{tx.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            tx.paymentStatus === "SUCCESS"
                              ? "bg-green-100 text-green-800"
                              : tx.paymentStatus === "FAILED"
                              ? "bg-red-100 text-red-800"
                              : tx.paymentStatus === "CANCELLED"
                              ? "bg-gray-100 text-gray-700"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {tx.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-500 text-[11px]">
                        {tx.razorpayPaymentId || tx.razorpayOrderId}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openInvoiceModal(tx._id)}
                          className="text-xs h-7 text-red-600 hover:text-red-700"
                        >
                          View Invoice
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── INVOICE RECEIPT MODAL ─── */}
      <Dialog open={isInvoiceOpen} onOpenChange={setIsInvoiceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <FileText className="w-5 h-5 text-red-600" />
              Tax Invoice &amp; Receipt
            </DialogTitle>
            <DialogDescription>
              Verified proof of payment processed via Razorpay Test Gateway.
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4 text-xs text-gray-700 border-t pt-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-gray-400 uppercase text-[10px] font-semibold">Billed To</span>
                  <div className="font-bold text-gray-900 text-sm">{selectedInvoice.user?.name}</div>
                  <div className="text-gray-500">{selectedInvoice.user?.email}</div>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 uppercase text-[10px] font-semibold">Invoice No</span>
                  <div className="font-mono font-bold text-gray-900">{selectedInvoice.invoiceNumber}</div>
                  <div className="text-gray-500">
                    {format(new Date(selectedInvoice.date), "dd MMM yyyy")}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl space-y-2 border">
                <div className="flex justify-between">
                  <span>Subscription:</span>
                  <strong className="text-gray-900">YourTube {selectedInvoice.plan}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Billing Cycle:</span>
                  <span>{selectedInvoice.billingCycle}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Gateway:</span>
                  <span>{selectedInvoice.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span>Razorpay Payment ID:</span>
                  <span className="font-mono">{selectedInvoice.razorpayPaymentId || "N/A"}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-sm font-extrabold text-gray-900">
                  <span>Total Amount Paid:</span>
                  <span className="text-green-700">₹{selectedInvoice.amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="text-xs"
                >
                  Print Invoice
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsInvoiceOpen(false)}
                  className="bg-gray-900 text-white text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── DOWNGRADE CONFIRMATION MODAL ─── */}
      <Dialog open={downgradeModalPlan !== null} onOpenChange={() => setDowngradeModalPlan(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Schedule Plan Downgrade
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to downgrade to <strong>{downgradeModalPlan}</strong>?
            </DialogDescription>
          </DialogHeader>

          <p className="text-xs text-gray-600">
            Per platform policy, you retain all current {subStatus?.plan} privileges until the end of your current paid billing period ({subStatus?.expiryDate ? format(new Date(subStatus.expiryDate), "dd MMM yyyy") : ""}), after which your subscription will switch to {downgradeModalPlan}.
          </p>

          <div className="flex justify-end gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDowngradeModalPlan(null)}
              className="text-xs"
            >
              Keep Current Plan
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmDowngrade}
              className="bg-red-600 hover:bg-red-700 text-white text-xs"
            >
              Confirm Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
