/**
 * Exam Prompt Builders — generate open-ended Q&A questions and evaluate answers.
 *
 * Two prompt types:
 *   1. Question generation — extends user's KP Q&A pairs with AI-generated
 *      questions (conceptual, application, comparison, and common-mistake traps)
 *   2. Answer evaluation — scores user's free-text answer against reference
 */

export function buildExamQuestionsPrompt(
  knowledgePoints: Array<{
    title: string;
    content: string;
    category: string[];
    qaItems?: Array<{ question: string; answer: string }>;
  }>,
  count: number,
): string {
  const kpText = knowledgePoints
    .map((kp, i) => {
      let text = `【知识点 ${i + 1}】${kp.title}\n分类: ${kp.category.join(" > ")}\n内容: ${kp.content}`;
      if (kp.qaItems && kp.qaItems.length > 0) {
        text += "\n已有问答:\n" + kp.qaItems.map((qa, j) => `  Q${j + 1}: ${qa.question}\n  A${j + 1}: ${qa.answer}`).join("\n");
      }
      return text;
    })
    .join("\n\n");

  return `你是一位医学考试出题专家。请根据以下知识点内容，生成 ${count} 道开放式简答题。

${kpText}

要求：
1. 题目类型要多样化，包括：
   - 概念辨析题（考察定义和核心概念理解）
   - 临床应用题（结合临床场景的分析判断）
   - 对比区分题（相似概念/疾病的鉴别要点）
   - 易错陷阱题（针对常见误区设计的迷惑性问题）
2. 不要与已有问答重复，要在已有内容基础上扩展和深化
3. 每道题的参考答案要简明扼要，包含核心要点
4. 难度适中，符合执业医师考试水平

严格按以下 JSON 格式输出，不要输出其他内容：
[
  {
    "question": "题目内容",
    "referenceAnswer": "参考答案（核心要点，简明扼要）",
    "type": "concept|application|comparison|trap"
  }
]`;
}

export function buildEvaluationPrompt(
  question: string,
  referenceAnswer: string,
  userAnswer: string,
): string {
  return `你是一位严谨的医学考试阅卷专家。请评估学生的回答。

【题目】
${question}

【参考答案】
${referenceAnswer}

【学生回答】
${userAnswer}

请从两个维度评分（0-100分）：
1. **相似度（similarity）**：学生回答与参考答案的语义匹配程度，关键术语和概念是否对应
2. **完整度（completeness）**：学生回答是否覆盖了参考答案的所有要点

评分标准：
- 90-100：回答准确且完整，展现了深入理解
- 70-89：基本正确，有少许遗漏或表述不够精确
- 50-69：部分正确，有明显遗漏或理解偏差
- 30-49：仅涉及部分内容，存在较大偏差
- 0-29：基本错误或完全偏题

严格按以下 JSON 格式输出，不要输出其他内容：
{
  "similarity": 85,
  "completeness": 70,
  "feedback": "简短的评价反馈，指出亮点和不足",
  "missingPoints": ["遗漏的要点1", "遗漏的要点2"]
}`;
}
