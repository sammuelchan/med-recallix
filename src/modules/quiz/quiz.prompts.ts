/**
 * Build a structured prompt for medical MCQ generation.
 * Outputs instructions for A1/A2-type single-choice questions
 * with strict JSON format requirements for reliable parsing.
 */
export function buildQuizPrompt(
  knowledgePoints: { title: string; content: string }[],
  count: number,
): string {
  const kpText = knowledgePoints
    .map((kp, i) => `【知识点 ${i + 1}】${kp.title}\n${kp.content}`)
    .join("\n\n");

  return `你是一位医学考试出题专家。请根据以下知识点，出 ${count} 道 A1/A2 型单选题。

${kpText}

要求：
1. 每道题有 A-E 五个选项，只有一个正确答案
2. 题目难度适中，符合执业医师考试水平
3. 每道题附带简明解析

严格按以下 JSON 格式输出，不要输出其他内容：
[
  {
    "stem": "题干内容",
    "options": [
      {"label": "A", "text": "选项A内容"},
      {"label": "B", "text": "选项B内容"},
      {"label": "C", "text": "选项C内容"},
      {"label": "D", "text": "选项D内容"},
      {"label": "E", "text": "选项E内容"}
    ],
    "answer": "正确选项字母",
    "explanation": "解析内容"
  }
]`;
}
