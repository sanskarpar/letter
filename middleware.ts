import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Only protect /admin route
  if (path.startsWith("/admin")) {
    // Call your API route to check role
    const res = await fetch(`${request.nextUrl.origin}/api/auth/role`, {
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });

    if (res.status !== 200) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { role } = await res.json();

    if (role !== "owner" && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}
