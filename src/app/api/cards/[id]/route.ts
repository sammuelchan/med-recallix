import { NextRequest, NextResponse } from "next/server";
import { ReviewService, ReviewGradeSchema } from "@/modules/review";
import { AppError } from "@/shared/lib/errors";
import type { ReviewGrade } from "@/modules/review";
import { getUserId } from "@/shared/lib/get-user-id";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { grade } = ReviewGradeSchema.parse(body);

    const card = await ReviewService.reviewCard(userId, id, grade as ReviewGrade);
    return NextResponse.json({ success: true, data: card });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json(err.toJSON(), { status: err.status });
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ success: false, error: "评分格式有误" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
