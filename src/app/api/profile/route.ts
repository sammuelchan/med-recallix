/**
 * Profile API Route — user study profile
 *
 * GET /api/profile → check if profile exists and return it
 * PUT /api/profile → create or update study profile (exam target, subjects, etc.)
 *
 * Used by the bootstrap chat flow to save the auto-collected profile,
 * and by the settings page for manual edits.
 */

import { NextRequest, NextResponse } from "next/server";
import { ProfileService } from "@/modules/agent";
import { getUserId } from "@/shared/lib/get-user-id";

export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId)
    return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

  const profile = await ProfileService.getProfile(userId);
  return NextResponse.json({
    success: true,
    data: { hasProfile: profile !== null, profile },
  });
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId)
    return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

  const body = await req.json();
  const profile = await ProfileService.updateProfile(userId, body);
  return NextResponse.json({ success: true, data: profile });
}
