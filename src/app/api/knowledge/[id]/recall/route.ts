import { NextRequest, NextResponse } from "next/server";
import { ReviewService } from "@/modules/review";
import { KnowledgeService } from "@/modules/knowledge";
import { AppError } from "@/shared/lib/errors";
import { getUserId } from "@/shared/lib/get-user-id";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId(req);
  if (!userId)
    return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });

  const { id } = await params;

  try {
    const kp = await KnowledgeService.get(userId, id);
    const card = await ReviewService.getCardByKP(userId, id);

    return NextResponse.json({
      success: true,
      data: {
        knowledgePoint: { id: kp.id, title: kp.title, category: kp.category },
        card: card
          ? {
              id: card.id,
              interval: card.interval,
              repetition: card.repetition,
              efactor: card.efactor,
              dueDate: card.dueDate,
              lastReviewDate: card.lastReviewDate,
            }
          : null,
        reviewHistory: card?.reviewHistory ?? [],
      },
    });
  } catch (err) {
    if (err instanceof AppError)
      return NextResponse.json(err.toJSON(), { status: err.status });
    return NextResponse.json({ success: false, error: "服务器错误" }, { status: 500 });
  }
}
