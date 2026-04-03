/**
 * Phase 9 (AI 对话 + Agent 记忆) 自动化验证脚本
 * 运行: npx tsx scripts/verify-phase9.ts
 *
 * 覆盖测试用例: TC-CHAT-040/041/042, TC-CHAT-010/012, TC-CHAT-020/030
 * UI 相关用例 (TC-CHAT-001/002/003/011/050) 需要手动验证
 */

const BASE = "http://localhost:3000";

interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];
let authCookie = "";
let sessionId = "";
let sessionId2 = "";

function record(id: string, name: string, pass: boolean, detail: string) {
  results.push({ id, name, pass, detail });
  const icon = pass ? "✅" : "❌";
  console.log(`  ${icon} ${id}: ${name} — ${detail}`);
}

async function api(
  path: string,
  opts: RequestInit = {},
): Promise<{
  status: number;
  data: Record<string, unknown>;
  raw: Record<string, unknown>;
  headers: Headers;
  rawText: string;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (authCookie) headers["Cookie"] = authCookie;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    redirect: "manual",
  });
  const rawText = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(rawText);
  } catch {
    raw = { _raw: rawText.slice(0, 500) };
  }
  const data = (raw.data ?? raw) as Record<string, unknown>;
  return { status: res.status, data, raw, headers: res.headers, rawText };
}

async function streamApi(
  path: string,
  body: unknown,
): Promise<{
  status: number;
  text: string;
  headers: Headers;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authCookie) headers["Cookie"] = authCookie;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let rawChunks = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    rawChunks += chunk;
    for (const line of chunk.split("\n")) {
      if (line.startsWith("0:")) {
        try {
          accumulated += JSON.parse(line.slice(2).trim());
        } catch {
          /* non-JSON text part */
        }
      }
    }
  }
  return { status: res.status, text: accumulated || rawChunks, headers: res.headers };
}

// ========== 0. Setup: Register + login + config AI ==========

async function setup() {
  console.log("\n🔧 准备环境");

  // Register
  {
    const { status, headers } = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "chatuser", password: "Chat@1234" }),
    });
    const cookie = headers.get("set-cookie") || "";
    if (cookie.includes("med-recallix-token")) {
      authCookie = cookie.split(";")[0];
    }
    if (status === 409) {
      const loginRes = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "chatuser", password: "Chat@1234" }),
      });
      const lc = loginRes.headers.get("set-cookie") || "";
      if (lc.includes("med-recallix-token")) {
        authCookie = lc.split(";")[0];
      }
    }
    record("SETUP-001", "用户注册/登录", !!authCookie, `authCookie=${!!authCookie}`);
  }

  // Set AI config (so streamReply can work if we have a real key)
  {
    const { status } = await api("/api/config", {
      method: "PUT",
      body: JSON.stringify({
        model: "kimi-for-coding",
        baseURL: "https://api.kimi.com/coding/v1",
        apiKey: process.env.KIMI_API_KEY || "sk-test-placeholder",
      }),
    });
    record("SETUP-002", "AI 配置设定", status === 200, `status=${status}`);
  }
}

// ========== 1. Chat API Tests ==========

async function testChatAPI() {
  console.log("\n💬 对话 API");

  // TC-CHAT-040: POST /api/chat — 发送消息
  {
    const result = await streamApi("/api/chat", {
      message: "你好",
      sessionId: "new",
    });
    const newSid = result.headers.get("x-chat-session-id");
    const hasContent = result.text.length > 0;

    if (newSid) sessionId = newSid;

    const hasKey = (process.env.KIMI_API_KEY || "").startsWith("sk-");
    if (hasKey) {
      const pass = result.status === 200 && !!newSid && hasContent;
      record(
        "TC-CHAT-040",
        "POST /api/chat 发送消息并收到流式回复",
        pass,
        `status=${result.status}, sessionId=${newSid}, textLen=${result.text.length}`,
      );
    } else {
      const pass = !!newSid;
      record(
        "TC-CHAT-040",
        "POST /api/chat 发送消息(无有效Key，流可能失败)",
        pass,
        `status=${result.status}, sessionId=${newSid}, note=API Key 为占位符`,
      );
    }
  }

  // TC-CHAT-041: GET /api/chat — 获取会话列表
  {
    const { status, data } = await api("/api/chat");
    const sessions = data as unknown as unknown[];
    const isArray = Array.isArray(sessions);
    const pass = status === 200 && isArray && sessions.length >= 1;
    record(
      "TC-CHAT-041",
      "GET /api/chat 获取会话列表",
      pass,
      `status=${status}, count=${isArray ? sessions.length : "not-array"}`,
    );

    if (isArray && sessions.length > 0) {
      const first = sessions[0] as Record<string, unknown>;
      const hasFields = "sessionId" in first && "title" in first && "lastMessageAt" in first;
      record(
        "TC-CHAT-041b",
        "会话条目包含 sessionId/title/lastMessageAt",
        hasFields,
        `fields=${Object.keys(first).join(",")}`,
      );
    }
  }

  // TC-CHAT-042: GET /api/chat/[sessionId] — 获取对话历史
  if (sessionId) {
    const { status, data } = await api(`/api/chat/${sessionId}`);
    const msgs = data as unknown as unknown[];
    const isArray = Array.isArray(msgs);
    const hasUserMsg = isArray && msgs.some((m: unknown) => (m as Record<string, unknown>).role === "user");
    const pass = status === 200 && isArray && hasUserMsg;
    record(
      "TC-CHAT-042",
      "GET /api/chat/[sessionId] 获取对话历史",
      pass,
      `status=${status}, msgCount=${isArray ? msgs.length : "not-array"}, hasUserMsg=${hasUserMsg}`,
    );
  } else {
    record("TC-CHAT-042", "GET /api/chat/[sessionId] 获取对话历史", false, "无 sessionId");
  }

  // TC-CHAT-010: Create second session
  {
    const result = await streamApi("/api/chat", {
      message: "帮我复习一下内科知识",
      sessionId: "new",
    });
    const newSid = result.headers.get("x-chat-session-id");
    if (newSid) sessionId2 = newSid;
    const pass = !!newSid && newSid !== sessionId;
    record(
      "TC-CHAT-010",
      "创建新对话会话（第二个）",
      pass,
      `newSessionId=${newSid}, diffFromFirst=${newSid !== sessionId}`,
    );
  }

  // Verify 2 sessions in list
  {
    const { data } = await api("/api/chat");
    const sessions = data as unknown as unknown[];
    const isArray = Array.isArray(sessions);
    const pass = isArray && sessions.length >= 2;
    record(
      "TC-CHAT-010b",
      "会话列表包含至少 2 个会话",
      pass,
      `count=${isArray ? sessions.length : 0}`,
    );
  }

  // TC-CHAT-012: DELETE /api/chat/[sessionId]
  if (sessionId2) {
    const { status } = await api(`/api/chat/${sessionId2}`, {
      method: "DELETE",
    });
    const pass = status === 200;
    record("TC-CHAT-012", "DELETE /api/chat/[sessionId] 删除会话", pass, `status=${status}`);

    // Verify deletion
    const { data } = await api("/api/chat");
    const sessions = data as unknown as unknown[];
    const deleted = Array.isArray(sessions) && !sessions.some((s: unknown) => (s as Record<string, unknown>).sessionId === sessionId2);
    record(
      "TC-CHAT-012b",
      "删除后会话列表不含已删除的会话",
      deleted,
      `stillInList=${!deleted}`,
    );
  }

  // TC-CHAT-042b: GET nonexistent session
  {
    const { status } = await api("/api/chat/nonexistent-session-id");
    const pass = status === 404;
    record("TC-CHAT-042b", "GET 不存在的会话返回 404", pass, `status=${status}`);
  }

  // TC-CHAT-043: POST without auth
  {
    const saved = authCookie;
    authCookie = "";
    const { status } = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: "test" }),
    });
    authCookie = saved;
    const pass = status === 401;
    record("TC-CHAT-043", "POST /api/chat 无认证返回 401", pass, `status=${status}`);
  }
}

// ========== 2. Agent Memory Tests ==========

async function testAgentMemory() {
  console.log("\n🧠 Agent 记忆（KV 持久化验证）");

  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const kvDir = path.join(os.homedir(), ".med-recallix", "kv", "med_data");

  // TC-CHAT-020: Agent SOUL (code constant check)
  {
    let pass = false;
    try {
      const soulPath = path.resolve("src/modules/agent/soul.ts");
      const content = fs.readFileSync(soulPath, "utf-8");
      pass = content.includes("瑞卡利斯") && content.includes("主人");
      record("TC-CHAT-020", "Agent SOUL 人格常量包含瑞卡利斯+主人", pass, `fileExists=true`);
    } catch (e) {
      record("TC-CHAT-020", "Agent SOUL 人格常量", false, `${e}`);
    }
  }

  // TC-CHAT-020b: Agent RULES
  {
    let pass = false;
    try {
      const soulPath = path.resolve("src/modules/agent/soul.ts");
      const content = fs.readFileSync(soulPath, "utf-8");
      pass = content.includes("AGENT_RULES") && content.includes("行为规则");
      record("TC-CHAT-020b", "Agent RULES 行为规则常量存在", pass, "");
    } catch (e) {
      record("TC-CHAT-020b", "Agent RULES 行为规则常量", false, `${e}`);
    }
  }

  // TC-CHAT-030: Profile service — check KV files for profile
  {
    if (fs.existsSync(kvDir)) {
      const files = fs.readdirSync(kvDir);
      const chatFiles = files.filter((f: string) => f.startsWith("chat_"));
      record(
        "TC-CHAT-030-kv",
        "对话数据已写入 KV 文件",
        chatFiles.length >= 1,
        `chatFiles=${chatFiles.length}, files=[${chatFiles.slice(0, 5).join(", ")}]`,
      );

      const indexFiles = files.filter((f: string) => f.startsWith("chat_idx_"));
      record(
        "TC-CHAT-030-idx",
        "对话索引 KV 文件已创建",
        indexFiles.length >= 1,
        `indexFiles=[${indexFiles.join(", ")}]`,
      );
    } else {
      record("TC-CHAT-030-kv", "KV 文件目录存在", false, `dir=${kvDir}`);
    }
  }

  // TC-AGENT-types: Verify type definitions exist
  {
    let pass = false;
    try {
      const typesPath = path.resolve("src/modules/agent/agent.types.ts");
      const content = fs.readFileSync(typesPath, "utf-8");
      pass =
        content.includes("UserProfile") &&
        content.includes("MemoryEntry") &&
        content.includes("DailyEpisode") &&
        content.includes("AgentContext");
      record("TC-AGENT-types", "Agent 类型定义完整", pass, "");
    } catch (e) {
      record("TC-AGENT-types", "Agent 类型定义", false, `${e}`);
    }
  }

  // TC-AGENT-services: Verify service modules exist
  {
    const services = [
      "profile.service.ts",
      "memory.service.ts",
      "episode.service.ts",
      "context-builder.ts",
    ];
    const agentDir = path.resolve("src/modules/agent");
    const allExist = services.every((s) =>
      fs.existsSync(path.join(agentDir, s)),
    );
    record(
      "TC-AGENT-services",
      "Agent 服务模块文件完整",
      allExist,
      `checked=[${services.join(", ")}]`,
    );
  }

  // TC-AGENT-barrel: Verify barrel export
  {
    let pass = false;
    try {
      const indexPath = path.resolve("src/modules/agent/index.ts");
      const content = fs.readFileSync(indexPath, "utf-8");
      pass =
        content.includes("buildAgentContext") &&
        content.includes("ProfileService") &&
        content.includes("MemoryService") &&
        content.includes("EpisodeService");
      record("TC-AGENT-barrel", "Agent barrel export 完整", pass, "");
    } catch (e) {
      record("TC-AGENT-barrel", "Agent barrel export", false, `${e}`);
    }
  }
}

// ========== 3. Chat UI Structure Tests ==========

async function testChatUI() {
  console.log("\n🖥️ 对话 UI 结构");

  const fs = await import("fs");
  const path = await import("path");

  const uiFiles = [
    "src/modules/chat/components/message-bubble.tsx",
    "src/modules/chat/components/message-list.tsx",
    "src/modules/chat/components/chat-input.tsx",
    "src/modules/chat/components/session-list.tsx",
    "src/modules/chat/use-chat.ts",
    "src/app/(app)/chat/page.tsx",
  ];

  for (const file of uiFiles) {
    const fullPath = path.resolve(file);
    const exists = fs.existsSync(fullPath);
    record(
      `TC-UI-${path.basename(file, path.extname(file))}`,
      `${path.basename(file)} 存在`,
      exists,
      `path=${file}`,
    );
  }

  // TC-CHAT-050: Bottom nav includes chat tab
  {
    let pass = false;
    try {
      const navPath = path.resolve("src/shared/components/layout/bottom-nav.tsx");
      const content = fs.readFileSync(navPath, "utf-8");
      pass = content.includes('"/chat"') && content.includes('"对话"');
      record("TC-CHAT-050", "底部导航包含对话 Tab", pass, "");
    } catch (e) {
      record("TC-CHAT-050", "底部导航包含对话 Tab", false, `${e}`);
    }
  }

  // Session title auto-rename
  if (sessionId) {
    const { data } = await api("/api/chat");
    const sessions = data as unknown as Record<string, unknown>[];
    if (Array.isArray(sessions)) {
      const target = sessions.find((s) => s.sessionId === sessionId);
      const title = target?.title as string;
      const pass = !!title && title !== "新对话";
      record(
        "TC-CHAT-title",
        "发送第一条消息后自动重命名会话标题",
        pass,
        `title="${title}"`,
      );
    }
  }
}

// ========== MAIN ==========

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Med-Recallix Phase 9 自动化验证");
  console.log("  AI 对话 + Agent 记忆系统");
  console.log("═══════════════════════════════════════════");

  try {
    await setup();
    await testChatAPI();
    await testAgentMemory();
    await testChatUI();
  } catch (e) {
    console.error("\n💥 验证过程中发生未捕获异常:", e);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const total = results.length;

  console.log("\n═══════════════════════════════════════════");
  console.log(`  验证结果: ${passed}/${total} 通过, ${failed} 失败`);
  console.log("═══════════════════════════════════════════");

  if (failed > 0) {
    console.log("\n❌ 失败用例:");
    results
      .filter((r) => !r.pass)
      .forEach((r) => {
        console.log(`   ${r.id}: ${r.name}`);
        console.log(`      → ${r.detail}`);
      });
  }

  console.log(
    "\n📋 以下用例需要手动验证（UI/交互相关）:",
  );
  console.log("   TC-CHAT-001: 发送消息并收到 AI 回复（UI 流式展示）");
  console.log("   TC-CHAT-002: 流式输出效果（打字效果）");
  console.log("   TC-CHAT-003: 多轮对话保持上下文");
  console.log("   TC-CHAT-011: 切换历史对话");
  console.log("   TC-CHAT-021: AI 伙伴主动提醒复习（需要有逾期知识点）");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
