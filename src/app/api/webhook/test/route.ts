import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "active",
    env: {
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY
    }
  });
}
