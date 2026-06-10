/**
 * Knowledge API Route
 *
 * GET  /api/knowledge            → list knowledge point index (optional category filter)
 * POST /api/knowledge            → create knowledge point + auto-add review card
 */

import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService, CreateKPSchema } from "@/modules/knowledge";
import { ReviewService } from "@/modules/review";
import { AppError } from "@/shared/lib/errors";
import { getUserId } from "@/shared/lib/get-user-id";

export async function GET(req: NextRequest) {
  const t0 = performance.now();
  try {
    const userId = await getUserId(req);
    const tAuth = performance.now();

    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    // Batch fetch by IDs (for review page)
    const ids = req.nextUrl.searchParams.get("ids");
    if (ids) {
      const { kvBatchGet, kvKeys } = await import("@/shared/infrastructure/kv");
      const tImport = performance.now();
      const idList = ids.split(",").filter(Boolean);
      const keys = idList.map((id) => kvKeys.knowledgePoint(userId, id));
      const results = await kvBatchGet<import("@/modules/knowledge").KnowledgePoint>(keys);
      const tKv = performance.now();
      const map: Record<string, { contentMode: string; content: string; qaItems?: unknown[] }> = {};
      for (let i = 0; i < idList.length; i++) {
        const kp = results[i];
        if (kp) {
          map[idList[i]] = {
            contentMode: kp.contentMode ?? "text",
            content: kp.content,
            qaItems: kp.qaItems,
          };
        }
      }
      console.log(`[perf] GET /api/knowledge?ids total=${(performance.now()-t0).toFixed(0)}ms auth=${(tAuth-t0).toFixed(0)}ms import=${(tImport-tAuth).toFixed(0)}ms kv=${(tKv-tImport).toFixed(0)}ms`);
      return NextResponse.json({ success: true, data: map });
    }

    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const items = await KnowledgeService.list(userId, category);
    const tList = performance.now();

    console.log(`[perf] GET /api/knowledge total=${(tList-t0).toFixed(0)}ms auth=${(tAuth-t0).toFixed(0)}ms list=${(tList-tAuth).toFixed(0)}ms`);
    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    console.log(`[perf] GET /api/knowledge ERROR total=${(performance.now()-t0).toFixed(0)}ms`);
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

/** POST — create a knowledge point and automatically add a review card for it. */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const input = CreateKPSchema.parse(body);
    const kp = await KnowledgeService.create(userId, input);

    // Fire-and-forget: add review card (non-blocking for response)
    ReviewService.addCard(userId, kp.id, kp.displayTitle).catch(() => {});

    return NextResponse.json({ success: true, data: kp }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ success: false, error: "输入格式有误" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
