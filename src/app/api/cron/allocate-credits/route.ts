// app/api/cron/allocate-credits/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { app } from "@/firebase/config";

const db = getFirestore(app);

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("❌ Unauthorized cron request");
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log("🕐 Starting monthly credit allocation cron job");

  try {
    const now = new Date();
    console.log("📅 Current time:", now.toISOString());

    // Find users who need credit allocation
    const usersRef = collection(db, "users");
    const q = query(
      usersRef,
      where("planType", "==", "premium"),
      where("nextCreditAllocationDate", "<=", now)
    );

    const querySnapshot = await getDocs(q);
    console.log(`👥 Found ${querySnapshot.size} users eligible for credit allocation`);

    let processedCount = 0;
    let errorCount = 0;

    for (const userDoc of querySnapshot.docs) {
      try {
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        console.log(`🔄 Processing user: ${userId}`);
        console.log(`📊 User data:`, {
          currentCredits: userData.credits,
          nextAllocationDate: userData.nextCreditAllocationDate?.toDate?.() || userData.nextCreditAllocationDate,
          subscriptionPlan: userData.subscriptionPlan,
          subscriptionEndDate: userData.subscriptionEndDate?.toDate?.() || userData.subscriptionEndDate
        });

        // Check if subscription is still active
        const subscriptionEndDate = userData.subscriptionEndDate?.toDate?.() || new Date(userData.subscriptionEndDate);
        if (subscriptionEndDate < now) {
          console.log(`⏰ Subscription expired for user ${userId}, skipping credit allocation`);
          
          // Downgrade to free plan
          await updateDoc(doc(db, "users", userId), {
            planType: "free",
            stripeSubscriptionId: null,
            subscriptionEndDate: null,
            nextCreditAllocationDate: null,
            subscriptionPlan: null,
            updatedAt: new Date()
          });
          
          console.log(`⬇️ Downgraded expired subscription for user ${userId}`);
          continue;
        }

        // Get subscription plan details
        const subscriptionPlan = userData.subscriptionPlan;
        if (!subscriptionPlan) {
          console.warn(`⚠️ No subscription plan found for user ${userId}, skipping`);
          continue;
        }

        const monthlyCredits = subscriptionPlan.monthlyCredits || 25;
        const currentCredits = userData.credits || 0;

        // Calculate next allocation date (1 month from now)
        const nextAllocationDate = new Date();
        nextAllocationDate.setMonth(nextAllocationDate.getMonth() + 1);

        // Update user credits
        const updateData = {
          credits: currentCredits + monthlyCredits,
          nextCreditAllocationDate: nextAllocationDate,
          updatedAt: new Date(),
          lastCreditGrant: {
            date: new Date(),
            freeCredits: subscriptionPlan.freeCredits || 5,
            bonusCredits: subscriptionPlan.bonusCredits || 20,
            totalCredits: monthlyCredits,
            planName: subscriptionPlan.name,
            type: 'monthly_allocation'
          }
        };

        console.log(`💰 Allocating ${monthlyCredits} credits to user ${userId}`);
        console.log(`📅 Next allocation date: ${nextAllocationDate.toISOString()}`);

        await updateDoc(doc(db, "users", userId), updateData);

        // Verify the update
        const updatedDoc = await getDoc(doc(db, "users", userId));
        if (updatedDoc.exists()) {
          const updatedData = updatedDoc.data();
          console.log(`✅ Successfully allocated credits to user ${userId}:`, {
            previousCredits: currentCredits,
            creditsAdded: monthlyCredits,
            newTotalCredits: updatedData.credits,
            nextAllocationDate: updatedData.nextCreditAllocationDate?.toDate?.() || updatedData.nextCreditAllocationDate
          });
        }

        processedCount++;

      } catch (userError) {
        console.error(`💥 Error processing user ${userDoc.id}:`, userError);
        errorCount++;
      }
    }

    const summary = {
      totalEligible: querySnapshot.size,
      processed: processedCount,
      errors: errorCount,
      timestamp: now.toISOString()
    };

    console.log("📊 Credit allocation summary:", summary);

    return NextResponse.json({
      success: true,
      message: "Credit allocation completed",
      ...summary
    });

  } catch (error) {
    console.error("💥 Error in credit allocation cron job:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// Optional: Handle POST requests for manual triggers
export async function POST(request: NextRequest) {
  // Verify admin access for manual triggers
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    console.error("❌ Unauthorized manual trigger request");
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log("🔧 Manual credit allocation trigger");
  
  // Call the same logic as GET
  return GET(request);
}