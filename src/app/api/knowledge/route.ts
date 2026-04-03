import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService, CreateKPSchema } from "@/modules/knowledge";
import { ReviewService } from "@/modules/review";
import { AppError } from "@/shared/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const items = await KnowledgeService.list(userId, category);
    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const body = await req.json();
    const input = CreateKPSchema.parse(body);
    const kp = await KnowledgeService.create(userId, input);

    await ReviewService.addCard(userId, kp.id, kp.title);

    return NextResponse.json({ success: true, data: kp }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ success: false, error: "输入格式有误" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
