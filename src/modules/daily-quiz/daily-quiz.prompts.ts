export function buildDailyQuizPrompt(
  knowledgePoints: { title: string; content: string }[],
  count: number,
  feedbackContext?: string,
): string {
  const kpText = knowledgePoints
    .map((kp, i) => `【知识点 ${i + 1}】${kp.title}\n${kp.content}`)
    .join("\n\n");

  const feedbackSection = feedbackContext
    ? `\n**用户历史反馈（请避免以下问题）：**\n${feedbackContext}\n`
    : "";

  return `你是一位资深医学考试出题专家。请严格基于以下知识点内容，出 ${count} 道 A1/A2 型单选题。

${kpText}
${feedbackSection}
**核心要求（必须严格遵守）：**
1. 每道题有 A-E 五个选项，只有一个正确答案
2. **所有选项必须与题干属于同一医学领域/同一类别**。例如：题干问"治疗方案"，则5个选项都必须是治疗方案；题干问"临床表现"，则5个选项都必须是临床表现
3. **干扰选项必须具有迷惑性**：应是同类疾病的相似概念、易混淆的选项，而非完全无关的内容
4. **正确答案必须能从给定知识点内容中直接推导出来**，不得编造知识点中未提及的信息作为答案
5. 题目难度适中，符合执业医师考试水平
6. **解析必须包含**：(a) 为什么正确答案是对的 (b) 关键干扰项为什么不对 (c) 核心记忆要点
7. 尽量从不同角度出题（病因、临床表现、诊断、治疗、鉴别诊断），避免重复

**禁止事项：**
- 禁止选项与题干内容完全无关（如题干问内科疾病，选项出现外科操作）
- 禁止使用"以上都不是""以上均正确"等笼统选项
- 禁止编造知识点中没有的内容作为正确答案

严格按以下 JSON 格式输出，不要输出其他内容：
[
  {
    "stem": "题干内容（完整的临床情景或直接提问）",
    "options": [
      {"label": "A", "text": "选项A内容"},
      {"label": "B", "text": "选项B内容"},
      {"label": "C", "text": "选项C内容"},
      {"label": "D", "text": "选项D内容"},
      {"label": "E", "text": "选项E内容"}
    ],
    "answer": "正确选项字母",
    "explanation": "【答案分析】正确答案为X。原因：...。A选项错误因为...。B选项错误因为...。记忆要点：..."
  }
]`;
}

export function buildErrorReviewPrompt(
  kpContent: string,
  kpTitle: string,
  previousQuestion?: string,
): string {
  const avoidSection = previousQuestion
    ? `\n之前的题目（请换一个考查角度）：\n${previousQuestion}\n`
    : "";

  return `你是一位资深医学考试出题专家。基于以下知识点，请生成一道 A1 型单选题。

知识点标题：${kpTitle}
知识点内容：
${kpContent}
${avoidSection}
**核心要求：**
1. 从不同角度考查此知识点（如病因、临床表现、诊断、治疗、鉴别诊断）
2. 5个选项(A-E)，只有一个正确答案
3. **所有选项必须属于同一类别/同一维度**（如都是药物名、都是症状、都是诊断方法）
4. 干扰选项必须是该领域中容易混淆的相关概念，不得使用无关内容
5. 正确答案必须能从知识点内容中直接推导
6. 解析要说明：正确答案的依据 + 主要干扰项错在哪里 + 记忆要点

严格按以下 JSON 格式输出，不要输出其他内容：
{"stem":"题干内容","options":[{"label":"A","text":"选项A"},{"label":"B","text":"选项B"},{"label":"C","text":"选项C"},{"label":"D","text":"选项D"},{"label":"E","text":"选项E"}],"answer":"正确选项字母","explanation":"【答案分析】正确答案为X。原因：...。易错点：...。记忆要点：..."}`;
}
