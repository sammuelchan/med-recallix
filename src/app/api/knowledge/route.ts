import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService, CreateKPSchema } from "@/modules/knowledge";
import { ReviewService } from "@/modules/review";
import { AppError } from "@/shared/lib/errors";
import { getUserId } from "@/shared/lib/get-user-id";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const items = await KnowledgeService.list(userId, category);
    return NextResponse.json({ success: true, data: items });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}

// 典型 API Route 文件 只做三件事：校验 → 调用 Service → 返回响应
// 1. 校验用户是否登录
// 2. 解析请求体
// 3. 调用 Service 创建知识点
// 4. 返回响应
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
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
