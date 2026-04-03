import { NextRequest, NextResponse } from "next/server";
import { ReviewService, ReviewGradeSchema } from "@/modules/review";
import type { ReviewGrade } from "@/modules/review";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { grade } = ReviewGradeSchema.parse(body);

    const card = await ReviewService.reviewCard(userId, id, grade as ReviewGrade);
    return NextResponse.json({ success: true, data: card });
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ success: false, error: "评分格式有误" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
