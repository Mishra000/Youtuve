import React, { useState } from "react";
import { useRouter } from "next/router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Check, Sparkles, Shield, AlertTriangle, Crown, CreditCard } from "lucide-react";
import { updateSubscriptionPlan, UserQuota } from "@/lib/downloadService";
import { toast } from "sonner";

interface SubscriptionPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentQuota?: UserQuota | null;
  onPlanUpdated: () => void;
}

export default function SubscriptionPlanModal({
  isOpen,
  onClose,
  userId,
  currentQuota,
  onPlanUpdated,
}: SubscriptionPlanModalProps) {
  const router = useRouter();
  const [updatingPlan, setUpdatingPlan] = useState<string | null>(null);

  const plans = [
    {
      id: "FREE",
      name: "Free",
      limit: "1 download/day",
      price: "Free",
      color: "border-gray-200 bg-white",
      badgeColor: "bg-gray-100 text-gray-700",
      features: [
        "1 secure MP4 download per day",
        "30-min duplicate download protection",
        "Basic standard streaming",
      ],
    },
    {
      id: "BRONZE",
      name: "Bronze",
      limit: "5 downloads/day",
      price: "Razorpay checkout",
      color: "border-amber-300 bg-amber-50/30",
      badgeColor: "bg-amber-100 text-amber-800 border-amber-300",
      features: [
        "5 secure MP4 downloads per day",
        "30-min duplicate protection",
        "Priority download bandwidth",
      ],
    },
    {
      id: "SILVER",
      name: "Silver",
      limit: "10 downloads/day",
      price: "Razorpay checkout",
      color: "border-slate-300 bg-slate-50/40",
      badgeColor: "bg-slate-200 text-slate-800 border-slate-300",
      features: [
        "10 secure MP4 downloads per day",
        "30-min duplicate protection",
        "High-speed multi-part streaming",
        "Download history auditing",
      ],
    },
    {
      id: "GOLD",
      name: "Gold",
      limit: "20 downloads/day",
      price: "Razorpay checkout",
      color: "border-yellow-400 bg-yellow-50/40 shadow-sm",
      badgeColor: "bg-yellow-400 text-yellow-900 border-yellow-500 font-bold",
      features: [
        "20 secure MP4 downloads per day",
        "30-min duplicate protection",
        "Maximum speed priority queue",
        "Full audit log access",
      ],
    },
  ];

  const handleSelectPlan = async (planId: string) => {
    if (!userId) {
      toast.error("Please sign in first");
      return;
    }

    onClose();
    if (planId !== "FREE") {
      await router.push(`/subscription?plan=${encodeURIComponent(planId)}`);
      return;
    }

    await router.push("/subscription");
  };

  const handleSimulateExpiry = async () => {
    if (!userId) return;
    setUpdatingPlan("EXPIRE");
    try {
      await updateSubscriptionPlan(userId, "GOLD", { expireNow: true });
      toast.warning("Simulated expired GOLD subscription (reverted to Free quota)");
      onPlanUpdated();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Failed to simulate expiry";
      toast.error(msg);
    } finally {
      setUpdatingPlan(null);
    }
  };

  const currentPlan = currentQuota?.plan || "FREE";
  const isExpired = currentQuota?.isExpired;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Crown className="w-6 h-6 text-yellow-500" />
            <DialogTitle className="text-xl font-bold">
              Subscription Plans & Video Downloads
            </DialogTitle>
          </div>
          <DialogDescription>
            Choose a tier to unlock more daily video downloads. Limits are
            centrally managed and reset automatically every day.
          </DialogDescription>
        </DialogHeader>

        {/* Current Quota Status Banner */}
        {currentQuota && (
          <div className="p-3 bg-gray-50 border rounded-lg flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Current Plan:</span>
              <span className="px-2 py-0.5 rounded font-semibold text-xs bg-red-100 text-red-700">
                {currentPlan}
              </span>
              {isExpired && (
                <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  <AlertTriangle className="w-3 h-3" /> Expired (Reverted to Free)
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs sm:text-sm">
              <div>
                <span className="text-gray-500">Today&apos;s Usage: </span>
                <span className="font-semibold text-gray-900">
                  {currentQuota.downloadsToday} / {currentQuota.dailyLimit}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Remaining Today: </span>
                <span className="font-semibold text-green-700">
                  {currentQuota.remainingDownloads}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
          {plans.map((p) => {
            const isSelected = currentPlan === p.id && !isExpired;
            return (
              <div
                key={p.id}
                className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                  p.color
                } ${isSelected ? "ring-2 ring-blue-600" : "hover:border-gray-400"}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-base text-gray-900">
                      {p.name}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${p.badgeColor}`}
                    >
                      {p.limit}
                    </span>
                  </div>
                  <div className="text-xl font-extrabold text-gray-900 mb-3">
                    {p.price}
                  </div>
                  <ul className="space-y-2 text-xs text-gray-600 mb-4">
                    {p.features.map((f, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  size="sm"
                  className={`w-full text-xs font-semibold ${
                    isSelected
                      ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                  disabled={updatingPlan !== null || isSelected}
                  onClick={() => handleSelectPlan(p.id)}
                >
                  {isSelected
                    ? "Current Plan"
                    : p.id === "FREE"
                    ? "View free plan"
                    : (
                      <>
                        <CreditCard className="w-3.5 h-3.5 mr-1" />
                        Continue to payment
                      </>
                    )}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Testing helper footer: simulate expired */}
        <div className="mt-2 pt-3 border-t flex flex-wrap items-center justify-between text-xs text-gray-500 gap-2">
          <span>
            Limits reset automatically at 00:00 UTC. Duplicate downloads within 30
            mins do not consume quota.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
            disabled={updatingPlan !== null}
            onClick={handleSimulateExpiry}
            title="Simulate past subscription end date to test requirement 13"
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            Test Expired Plan (Reverts to Free)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
