import mongoose from "mongoose";
import users from "../Modals/Auth.js";
import { PLAN_HIERARCHY, getPlanDetails } from "../config/subscriptionPlans.js";

// Helper to extract authenticated user from request
export async function getAuthUserFromRequest(req) {
  const userId =
    req.headers["x-user-id"] ||
    (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : null) ||
    req.query.userId ||
    req.body?.userId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }

  const userDoc = await users.findById(userId);
  return userDoc;
}

/**
 * Middleware factory enforcing minimum subscription tier and validity
 * e.g. requireSubscription("BRONZE")
 */
export function requireSubscription(requiredPlan = "BRONZE") {
  return async (req, res, next) => {
    try {
      const user = await getAuthUserFromRequest(req);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required to access premium features",
          code: "AUTH_REQUIRED",
        });
      }

      req.user = user;

      const sub = user.subscription || { plan: "FREE", status: "ACTIVE" };
      let plan = (sub.plan || "FREE").toUpperCase();
      let status = (sub.status || "ACTIVE").toUpperCase();

      // Check Expiry for paid plans
      const expiry = sub.expiryDate || sub.endDate;
      if (plan !== "FREE" && expiry && new Date(expiry) < new Date()) {
        // Auto-downgrade expired plan in-memory & persist if status wasn't EXPIRED
        plan = "FREE";
        status = "EXPIRED";
        if (sub.status !== "EXPIRED") {
          user.subscription.status = "EXPIRED";
          user.subscription.plan = "FREE";
          user.subscription.isActive = false;
          await user.save();
        }
      }

      const userLevel = PLAN_HIERARCHY[plan] ?? 0;
      const reqLevel = PLAN_HIERARCHY[requiredPlan.toUpperCase()] ?? 0;

      if (userLevel < reqLevel || (plan !== "FREE" && status !== "ACTIVE")) {
        return res.status(403).json({
          success: false,
          message: `An active ${requiredPlan} subscription is required to access this feature.`,
          currentPlan: plan,
          requiredPlan: requiredPlan.toUpperCase(),
          isExpired: status === "EXPIRED",
          code: "PREMIUM_REQUIRED",
        });
      }

      next();
    } catch (err) {
      console.error("requireSubscription middleware error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to verify subscription access",
        error: err.message,
      });
    }
  };
}
