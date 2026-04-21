/**
 * Knowledge Point Detail API Route
 *
 * GET    /api/knowledge/:id → read single knowledge point
 * PUT    /api/knowledge/:id → update knowledge point fields
 * DELETE /api/knowledge/:id → delete knowledge point + linked review card
 */

import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService, UpdateKPSchema } from "@/modules/knowledge";
import { ReviewService } from "@/modules/review";
import { AppError } from "@/shared/lib/errors";
import { getUserId } from "@/shared/lib/get-user-id";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { id } = await params;
    const kp = await KnowledgeService.get(userId, id);
    return NextResponse.json({ success: true, data: kp });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const input = UpdateKPSchema.parse(body);
    const kp = await KnowledgeService.update(userId, id, input);
    return NextResponse.json({ success: true, data: kp });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ success: false, error: "输入格式有误" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { id } = await params;
    await ReviewService.removeCardByKP(userId, id);
    await KnowledgeService.delete(userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
