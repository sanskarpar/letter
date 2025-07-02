// utils/credits.ts
import { getFirestore, doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { app } from "@/firebase/config";

const db = getFirestore(app);

export interface UserCredits {
  credits: number;
  planType: string;
  subscriptionEndDate: Date;
}

/**
 * Add monthly credits to all active subscribers
 * This function should be called by a cron job or scheduled function
 */
export async function addMonthlyCredits(): Promise<void> {
  // This would typically be implemented with a batch operation
  // For now, it's a placeholder for the monthly credit addition logic
  console.log("Monthly credits distribution - implement with batch operations");
}

/**
 * Check if user's subscription is active
 */
export async function isSubscriptionActive(userId: string): Promise<boolean> {
  const userCredits = await getUserCredits(userId);
  if (!userCredits || userCredits.planType === "free") {
    return false;
  }

  return userCredits.subscriptionEndDate > new Date();
}

/**
 * Example usage in your application when user performs an action that costs credits
 */
export async function performActionWithCredits(
  userId: string, 
  creditCost: number, 
  action: () => Promise<any>
): Promise<{ success: boolean; error?: string; result?: any }> {
  try {
    // Check if user has enough credits
    const hasCredits = await hasEnoughCredits(userId, creditCost);
    if (!hasCredits) {
      return { 
        success: false, 
        error: "Insufficient credits. Please purchase more credits or upgrade your plan." 
      };
    }

    // Debit credits first
    const debitSuccess = await debitCredits(userId, creditCost);
    if (!debitSuccess) {
      return { 
        success: false, 
        error: "Failed to debit credits. Please try again." 
      };
    }

    try {
      // Perform the action
      const result = await action();
      return { success: true, result };
    } catch (actionError) {
      // If action fails, refund the credits
      await addCredits(userId, creditCost);
      throw actionError;
    }
  } catch (error: any) {
    console.error("Error performing action with credits:", error);
    return { 
      success: false, 
      error: error.message || "An unexpected error occurred" 
    };
  }
}

// Example of how to use in your email sending function
export async function sendEmailWithCredits(userId: string, emailData: any) {
  return performActionWithCredits(userId, 1, async () => {
    // Your email sending logic here
    console.log("Sending email...", emailData);
    // return emailService.send(emailData);
    return { messageId: "example-message-id" };
  });
}
 
export async function getUserCredits(userId: string): Promise<UserCredits | null> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      return null;
    }

    const userData = userDoc.data();
    let subscriptionEndDate: Date | null = null;
    if (userData.subscriptionEndDate) {
      if (typeof userData.subscriptionEndDate.toDate === "function") {
        subscriptionEndDate = userData.subscriptionEndDate.toDate();
      } else if (userData.subscriptionEndDate instanceof Date) {
        subscriptionEndDate = userData.subscriptionEndDate;
      }
    }
    return {
      credits: userData.credits || 0,
      planType: userData.planType || "free",
      subscriptionEndDate: subscriptionEndDate || new Date("2100-01-01"),
    };
  } catch (error) {
    console.error("Error getting user credits:", error);
    return null;
  }
}

/**
 * Debit credits from user account
 * Returns true if successful, false if insufficient credits
 */
export async function debitCredits(userId: string, amount: number): Promise<boolean> {
  try {
    const userCredits = await getUserCredits(userId);
    if (!userCredits || userCredits.credits < amount) {
      return false; // Insufficient credits
    }

    // Debit the credits
    await updateDoc(doc(db, "users", userId), {
      credits: increment(-amount),
    });

    return true;
  } catch (error) {
    console.error("Error debiting credits:", error);
    return false;
  }
}

/**
 * Add credits to user account
 */
export async function addCredits(userId: string, amount: number): Promise<boolean> {
  try {
    await updateDoc(doc(db, "users", userId), {
      credits: increment(amount),
    });
    return true;
  } catch (error) {
    console.error("Error adding credits:", error);
    return false;
  }
}


export async function hasEnoughCredits(userId: string, required: number): Promise<boolean> {
  const userCredits = await getUserCredits(userId);
  return userCredits ? userCredits.credits >= required : false;
}

