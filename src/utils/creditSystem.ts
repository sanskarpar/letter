// utils/creditSystem.ts
// Utility functions for managing the credit system

import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { app } from "@/firebase/config";

const db = getFirestore(app);

export interface CreditSystemConfig {
  freeMonthlyCredits: number;
  bonusMonthlyCredits: number;
  subscriptionCredits: {
    monthly: { free: number; bonus: number; total: number };
    semiannual: { free: number; bonus: number; total: number };
    annual: { free: number; bonus: number; total: number };
  };
}

export const CREDIT_SYSTEM: CreditSystemConfig = {
  freeMonthlyCredits: 5,
  bonusMonthlyCredits: 20,
  subscriptionCredits: {
    monthly: { free: 5, bonus: 20, total: 25 },
    semiannual: { free: 30, bonus: 120, total: 150 }, // 6 months
    annual: { free: 60, bonus: 240, total: 300 } // 12 months
  }
};

export interface UserCreditInfo {
  currentCredits: number;
  planType: "free" | "premium";
  lastMonthlyGrant?: Date;
  subscriptionEndDate?: Date;
  creditHistory: CreditTransaction[];
}

export interface CreditTransaction {
  date: Date;
  type: "monthly_grant" | "subscription_purchase" | "subscription_renewal" | "usage" | "manual_adjustment";
  freeCredits?: number;
  bonusCredits?: number;
  totalCredits: number;
  description: string;
  subscriptionPlan?: string;
}

/**
 * Get user's current credit information
 */
export async function getUserCreditInfo(userId: string): Promise<UserCreditInfo | null> {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return null;
    }
    
    const userData = userDoc.data();
    
    return {
      currentCredits: userData?.credits || 0,
      planType: userData?.planType || "free",
      lastMonthlyGrant: userData?.lastMonthlyGrant?.toDate(),
      subscriptionEndDate: userData?.subscriptionEndDate?.toDate(),
      creditHistory: userData?.creditHistory || []
    };
  } catch (error) {
    console.error("Error getting user credit info:", error);
    return null;
  }
}

/**
 * Check if user is eligible for monthly free credits
 */
export function isEligibleForMonthlyCredits(lastMonthlyGrant?: Date): boolean {
  if (!lastMonthlyGrant) return true;
  
  const now = new Date();
  const daysSinceLastGrant = Math.floor((now.getTime() - lastMonthlyGrant.getTime()) / (1000 * 60 * 60 * 24));
  
  // Allow monthly grant if it's been at least 28 days (to handle month variations)
  return daysSinceLastGrant >= 28;
}

/**
 * Grant monthly free credits to a user
 */
export async function grantMonthlyCredits(userId: string): Promise<boolean> {
  try {
    const userInfo = await getUserCreditInfo(userId);
    if (!userInfo) {
      console.error("User not found:", userId);
      return false;
    }
    
    if (!isEligibleForMonthlyCredits(userInfo.lastMonthlyGrant)) {
      console.log("User not eligible for monthly credits yet:", userId);
      return false;
    }
    
    const freeCredits = CREDIT_SYSTEM.freeMonthlyCredits;
    const bonusCredits = userInfo.planType === "premium" ? CREDIT_SYSTEM.bonusMonthlyCredits : 0;
    const totalCredits = freeCredits + bonusCredits;
    
    const transaction: CreditTransaction = {
      date: new Date(),
      type: "monthly_grant",
      freeCredits,
      bonusCredits,
      totalCredits,
      description: `Monthly credit grant: ${freeCredits} free${bonusCredits > 0 ? ` + ${bonusCredits} bonus` : ''} credits`
    };
    
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      credits: userInfo.currentCredits + totalCredits,
      lastMonthlyGrant: new Date(),
      updatedAt: new Date(),
      creditHistory: [...(userInfo.creditHistory || []), transaction]
    });
    
    console.log(`✅ Granted ${totalCredits} monthly credits to user ${userId}`);
    return true;
    
  } catch (error) {
    console.error("Error granting monthly credits:", error);
    return false;
  }
}

/**
 * Deduct credits when user performs an action
 */
export async function deductCredits(userId: string, amount: number, description: string): Promise<boolean> {
  try {
    const userInfo = await getUserCreditInfo(userId);
    if (!userInfo) {
      console.error("User not found:", userId);
      return false;
    }
    
    if (userInfo.currentCredits < amount) {
      console.log("Insufficient credits for user:", userId);
      return false;
    }
    
    const transaction: CreditTransaction = {
      date: new Date(),
      type: "usage",
      totalCredits: -amount,
      description
    };
    
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      credits: userInfo.currentCredits - amount,
      updatedAt: new Date(),
      creditHistory: [...(userInfo.creditHistory || []), transaction]
    });
    
    console.log(`✅ Deducted ${amount} credits from user ${userId}`);
    return true;
    
  } catch (error) {
    console.error("Error deducting credits:", error);
    return false;
  }
}

/**
 * Check if user has sufficient credits
 */
export async function hasEnoughCredits(userId: string, requiredAmount: number): Promise<boolean> {
  const userInfo = await getUserCreditInfo(userId);
  return userInfo ? userInfo.currentCredits >= requiredAmount : false;
}

/**
 * Get credit breakdown for display
 */
export function getCreditBreakdown(planType: "free" | "premium"): {
  monthly: { free: number; bonus: number; total: number };
  description: string;
} {
  if (planType === "premium") {
    return {
      monthly: {
        free: CREDIT_SYSTEM.freeMonthlyCredits,
        bonus: CREDIT_SYSTEM.bonusMonthlyCredits,
        total: CREDIT_SYSTEM.freeMonthlyCredits + CREDIT_SYSTEM.bonusMonthlyCredits
      },
      description: `${CREDIT_SYSTEM.freeMonthlyCredits} free credits + ${CREDIT_SYSTEM.bonusMonthlyCredits} bonus credits = ${CREDIT_SYSTEM.freeMonthlyCredits + CREDIT_SYSTEM.bonusMonthlyCredits} total credits per month`
    };
  } else {
    return {
      monthly: {
        free: CREDIT_SYSTEM.freeMonthlyCredits,
        bonus: 0,
        total: CREDIT_SYSTEM.freeMonthlyCredits
      },
      description: `${CREDIT_SYSTEM.freeMonthlyCredits} free credits per month`
    };
  }
}