export function buildDailyQuizPrompt(
  knowledgePoints: { title: string; content: string }[],
  count: number,
  feedbackContext?: string,
  existingStems?: string[],
): string {
  const kpText = knowledgePoints
    .map((kp, i) => `【知识点 ${i + 1}】${kp.title}\n${kp.content}`)
    .join("\n\n");

  const feedbackSection = feedbackContext
    ? `\n**用户历史反馈（请避免以下问题）：**\n${feedbackContext}\n`
    : "";

  const dedupSection = existingStems && existingStems.length > 0
    ? `\n**以下题目已经出过，严禁出相同或高度相似的题目（包括换汤不换药的变体）：**\n${existingStems.map((s, i) => `${i + 1}. ${s.length > 80 ? s.slice(0, 80) + "…" : s}`).join("\n")}\n`
    : "";

  return `你是一位资深临床执业医师考试命题专家，熟悉近5年（2021-2026）国家临床执业医师资格考试和临床执业助理医师资格考试的命题规律和高频考点。

请严格基于以下知识点内容，出 ${count} 道 A1/A2 型单选题。

${kpText}
${feedbackSection}${dedupSection}
**出题方向（必须遵循近5年临床医考命题趋势）：**
- 优先考查**临床思维和实际应用能力**，而非单纯记忆
- 重点覆盖近5年高频考点方向：疾病的首选治疗/检查、典型临床表现、鉴别诊断要点、急危重症处理原则
- A1型题：考查基本概念、基础知识的直接提问
- A2型题：以简短临床病例引出问题，考查临床分析和判断能力（优先出此类题型）
- 题目难度对标真实考试：中等难度为主，少量易题和难题搭配

**核心要求（必须严格遵守）：**
1. 每道题有 A-E 五个选项，只有一个正确答案
2. **所有选项必须与题干属于同一医学领域/同一类别**。例如：题干问"治疗方案"，则5个选项都必须是治疗方案；题干问"临床表现"，则5个选项都必须是临床表现
3. **干扰选项必须具有迷惑性**：应是同类疾病的相似概念、易混淆的选项，而非完全无关的内容
4. **正确答案必须能从给定知识点内容中直接推导出来**，不得编造知识点中未提及的信息作为答案
5. **解析必须包含**：(a) 为什么正确答案是对的 (b) 关键干扰项为什么不对 (c) 核心记忆要点/考试技巧
6. 尽量从不同角度出题（病因、临床表现、诊断、治疗、鉴别诊断、急救处理），避免重复
7. A2型临床病例题需包含必要的年龄、性别、主诉、关键体征/检查结果等信息

**禁止事项：**
- 禁止选项与题干内容完全无关（如题干问内科疾病，选项出现外科操作）
- 禁止使用"以上都不是""以上均正确"等笼统选项
- 禁止编造知识点中没有的内容作为正确答案
- 禁止出偏题怪题，必须紧扣临床执业医师考试大纲范围

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

export function buildDistractorPrompt(
  qaItems: { question: string; answer: string; kpTitle: string }[],
): string {
  const items = qaItems
    .map(
      (item, i) =>
        `${i + 1}. 题目：${item.question}\n   正确答案：${item.answer}\n   所属知识点：${item.kpTitle}`,
    )
    .join("\n\n");

  return `你是一位资深临床执业医师考试命题专家，熟悉近5年国家临床执业医师资格考试命题规律。我有以下 ${qaItems.length} 道题目，每道题已有正确答案。请为每道题生成 3 个高质量的干扰选项。

${items}

**干扰选项核心要求：**
1. **同类别同维度**：干扰项必须与正确答案属于同一类型（如都是药物名、都是症状、都是检查方法）
2. **具有迷惑性**：选择该领域中容易混淆的相近概念，让考生需要真正理解才能区分
3. **长度相近**：干扰项的字数应与正确答案接近
4. **禁止明显错误**：不得使用与题目完全无关的选项、笼统选项（如"以上都不是"）

严格按以下 JSON 格式输出，不要输出其他内容：
[
  {"distractors": ["干扰项1", "干扰项2", "干扰项3"]},
  {"distractors": ["干扰项1", "干扰项2", "干扰项3"]}
]

每个对象对应一道题，按顺序对应上面的题目。`;
}

export function buildErrorReviewPrompt(
  kpContent: string,
  kpTitle: string,
  previousQuestion?: string,
): string {
  const avoidSection = previousQuestion
    ? `\n之前的题目（请换一个考查角度）：\n${previousQuestion}\n`
    : "";

  return `你是一位资深临床执业医师考试命题专家，熟悉近5年国家临床执业医师资格考试命题规律和高频考点。基于以下知识点，请生成一道 A1 型单选题。

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
