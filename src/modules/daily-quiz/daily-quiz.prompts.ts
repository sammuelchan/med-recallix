export function buildDailyQuizPrompt(
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
4. 尽量从不同角度出题，避免重复

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

export function buildErrorReviewPrompt(
  kpContent: string,
  kpTitle: string,
  previousQuestion?: string,
): string {
  const avoidSection = previousQuestion
    ? `\n之前的题目（请换一个考查角度）：\n${previousQuestion}\n`
    : "";

  return `你是一位医学考试出题专家。基于以下知识点，请生成一道 A1 型单选题。

知识点标题：${kpTitle}
知识点内容：
${kpContent}
${avoidSection}
要求：
1. 从不同角度考查此知识点（如病因、临床表现、诊断、治疗、鉴别）
2. 5个选项(A-E)，只有一个正确答案
3. 干扰选项具有迷惑性但可明确区分
4. 提供简洁的解析说明

严格按以下 JSON 格式输出，不要输出其他内容：
{"stem":"题干内容","options":[{"label":"A","text":"选项A"},{"label":"B","text":"选项B"},{"label":"C","text":"选项C"},{"label":"D","text":"选项D"},{"label":"E","text":"选项E"}],"answer":"正确选项字母","explanation":"解析"}`;
}
