import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

/* ── Shared rules (used by both endpoints) ─────────────── */

const HIFDH_RULES = `Rules:
- Student name: {{studentName}}
- Student's position at START of this week: Page {{currentPage}}, Line {{currentLine}}
- The program runs Mon–Fri (5 school days)
- "Memorization" (also called "sabaq") = new memorization lesson
- "RMV" = recently memorized verses review
- "Review" = older material review
- A "successful day" means all 3 tasks (memorization, RMV, review) were completed
- Teachers often say things like "did all 3 every day" (meaning memorization+RMV+review Mon–Fri), "missed review on Wednesday", "only came 4 days", "strong week", "struggled with RMV". They may still use the word "sabaq" instead of "memorization" — treat them as the same task.
- If the teacher says something like "completed everything" or "perfect week" without specifying days, assume all tasks completed all 5 days
- If the teacher mentions lines or pages but not both, infer the other: 15 lines = 1 page. Compute current_page from start position + lines memorized if not explicitly stated.
- week_rating must be one of: "excellent", "strong", "steady", "needs_improvement", "difficult_week" — match the teacher's language to the closest option
- If the teacher mentions a student was absent certain days, mark those in days_absent
- If the teacher says "only came N days", mark the last (5-N) days as absent
- teacher_notes: any qualitative observations the teacher mentioned (e.g., "seemed distracted", "mashallah great focus")
- rmv_amount: if the teacher mentions how much RMV they did (e.g., "last 5 pages", "reviewed last 10 pages")
- review_amount: if the teacher mentions how much review they did (e.g., "1 juz", "reviewed juz 30")`;

/* ── One-shot parse endpoint (legacy) ──────────────────── */

const PARSE_SYSTEM_PROMPT = `You are a data extraction assistant for a Quran hifdh (memorization) program tracker.
A teacher is describing a student's weekly performance in natural language.
Extract the following structured fields from their description.

If a field is not mentioned or cannot be inferred, set it to null — do NOT guess.

Respond ONLY with a JSON object, no other text:

{
  "memorization_lines": number or null,
  "current_page": number or null,
  "current_line": number or null,
  "daily_tasks": {
    "mon": { "memorization": bool or null, "rmv": bool or null, "review": bool or null },
    "tue": { "memorization": bool or null, "rmv": bool or null, "review": bool or null },
    "wed": { "memorization": bool or null, "rmv": bool or null, "review": bool or null },
    "thu": { "memorization": bool or null, "rmv": bool or null, "review": bool or null },
    "fri": { "memorization": bool or null, "rmv": bool or null, "review": bool or null }
  },
  "days_absent": { "mon": bool, "tue": bool, "wed": bool, "thu": bool, "fri": bool } or null,
  "week_rating": string or null,
  "teacher_notes": string or null,
  "rmv_amount": string or null,
  "review_amount": string or null
}

${HIFDH_RULES}`;

router.post("/ai/parse-entry", requireAuth, async (req, res) => {
  const { studentName, currentPage, currentLine, teacherInput } = req.body;

  if (!teacherInput || typeof teacherInput !== "string") {
    res.status(400).json({ error: "teacherInput is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = PARSE_SYSTEM_PROMPT
    .replace("{{studentName}}", studentName ?? "Student")
    .replace("{{currentPage}}", String(currentPage ?? 1))
    .replace("{{currentLine}}", String(currentLine ?? 1));

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: teacherInput }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      res.status(500).json({ error: "No text response from AI" });
      return;
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);
    res.json(parsed);
  } catch (err) {
    console.error("[AI Parse Error]", err);
    const message = err instanceof Error ? err.message : "AI parsing failed";
    res.status(500).json({ error: message });
  }
});

/* ── Conversational chat endpoint (SSE) ────────────────── */

const CHAT_SYSTEM_PROMPT = `You are a friendly, efficient assistant helping a Quran hifdh (memorization) teacher log a student's weekly performance.

Your job: have a short, natural conversation to gather the student's weekly data. Be warm and concise — 1-2 sentences per reply.

When the teacher tells you information, immediately call the update_entry_fields tool with whatever fields you can extract. You can call it multiple times as you learn more.

After acknowledging what they said, naturally ask about any important missing fields:
- How many new lines they memorized this week
- Their daily tasks (memorization, RMV, review) for each day Mon–Fri
- Whether they were absent any days
- How the week went overall (for the rating)
- Any notes about the student

When you have enough information to fill the form (at minimum: memorization lines and a general sense of the week), call update_entry_fields with ready_to_save: true.

Do NOT ask about every single field — if the teacher gives a general overview like "great week, did everything", fill in the blanks with reasonable defaults and mark ready.

${HIFDH_RULES}`;

const UPDATE_ENTRY_TOOL: Anthropic.Messages.Tool = {
  name: "update_entry_fields",
  description: "Update the weekly entry form with extracted values. Call this whenever you learn new information from the teacher. Only include fields you are confident about — omit fields you don't know yet.",
  input_schema: {
    type: "object" as const,
    properties: {
      memorization_lines: { type: "number", description: "New lines memorized this week" },
      current_page: { type: "number", description: "Current mushaf page (1-604)" },
      current_line: { type: "number", description: "Current line on the page (1-15)" },
      daily_tasks: {
        type: "object",
        description: "Daily task completion for Mon-Fri",
        properties: {
          mon: { type: "object", properties: { memorization: { type: "boolean" }, rmv: { type: "boolean" }, review: { type: "boolean" } } },
          tue: { type: "object", properties: { memorization: { type: "boolean" }, rmv: { type: "boolean" }, review: { type: "boolean" } } },
          wed: { type: "object", properties: { memorization: { type: "boolean" }, rmv: { type: "boolean" }, review: { type: "boolean" } } },
          thu: { type: "object", properties: { memorization: { type: "boolean" }, rmv: { type: "boolean" }, review: { type: "boolean" } } },
          fri: { type: "object", properties: { memorization: { type: "boolean" }, rmv: { type: "boolean" }, review: { type: "boolean" } } },
        },
      },
      days_absent: {
        type: "object",
        description: "Which days the student was absent",
        properties: {
          mon: { type: "boolean" }, tue: { type: "boolean" }, wed: { type: "boolean" },
          thu: { type: "boolean" }, fri: { type: "boolean" },
        },
      },
      week_rating: {
        type: "string",
        enum: ["excellent", "strong", "steady", "needs_improvement", "difficult_week"],
        description: "Overall week rating",
      },
      teacher_notes: { type: "string", description: "Qualitative observations" },
      rmv_amount: { type: "string", description: "How much RMV was done daily (e.g. 'last 5 pages')" },
      review_amount: { type: "string", description: "How much review was done daily (e.g. '1 juz')" },
      ready_to_save: { type: "boolean", description: "Set true when enough info is gathered to save the entry" },
    },
  },
};

function sseWrite(res: import("express").Response, event: string, data: unknown) {
  const payload = JSON.stringify(data);
  if (event !== "text") console.log("[SSE] event=%s data=%s", event, payload.slice(0, 200));
  res.write(`event: ${event}\ndata: ${payload}\n\n`);
}

router.post("/ai/chat", requireAuth, async (req, res) => {
  const { studentName, currentPage, currentLine, messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const client = new Anthropic({ apiKey });

  const systemPrompt = CHAT_SYSTEM_PROMPT
    .replace("{{studentName}}", studentName ?? "Student")
    .replace("{{currentPage}}", String(currentPage ?? 1))
    .replace("{{currentLine}}", String(currentLine ?? 1));

  // Filter messages to valid Anthropic format — must start with user, alternate roles
  const rawMessages: { role: string; content: string }[] = messages;
  // Drop leading assistant messages (e.g. synthetic greeting) so first message is "user"
  const firstUserIdx = rawMessages.findIndex((m) => m.role === "user");
  const trimmed = firstUserIdx >= 0 ? rawMessages.slice(firstUserIdx) : rawMessages;
  const apiMessages: Anthropic.Messages.MessageParam[] = trimmed.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  console.log("[AI Chat] %d messages, first role: %s", apiMessages.length, apiMessages[0]?.role);

  try {
    // First API call — may produce text + tool_use
    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: apiMessages,
      tools: [UPDATE_ENTRY_TOOL],
    });

    let assistantText = "";
    let toolUseBlock: { id: string; input: Record<string, unknown> } | null = null;

    stream.on("text", (text) => {
      assistantText += text;
      sseWrite(res, "text", { text });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream.on("inputJson" as any, () => {
      // tool input is accumulated; we'll read it from the final message
    });

    const finalMessage = await stream.finalMessage();

    // Check for tool use in the response
    for (const block of finalMessage.content) {
      if (block.type === "tool_use" && block.name === "update_entry_fields") {
        toolUseBlock = { id: block.id, input: block.input as Record<string, unknown> };
        sseWrite(res, "extraction", toolUseBlock.input);
      }
    }

    // If tool was called, send tool result back and get follow-up text
    if (toolUseBlock) {
      // Tell client to discard pre-tool text and start fresh
      sseWrite(res, "text_clear", {});

      const followUpMessages: Anthropic.Messages.MessageParam[] = [
        ...apiMessages,
        { role: "assistant", content: finalMessage.content },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUseBlock.id,
              content: "Fields updated successfully.",
            },
          ],
        },
      ];

      const followUpStream = client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        system: systemPrompt,
        messages: followUpMessages,
        tools: [UPDATE_ENTRY_TOOL],
      });

      let followUpText = "";

      followUpStream.on("text", (text) => {
        followUpText += text;
        sseWrite(res, "text", { text });
      });

      const followUpFinal = await followUpStream.finalMessage();

      // Check for additional tool calls in follow-up
      for (const block of followUpFinal.content) {
        if (block.type === "tool_use" && block.name === "update_entry_fields") {
          sseWrite(res, "extraction", block.input);
        }
      }

      assistantText = followUpText; // Replace, don't append — client got text_clear
    }

    sseWrite(res, "done", { text: assistantText });
    res.end();
  } catch (err) {
    console.error("[AI Chat Error]", err);
    sseWrite(res, "error", { error: err instanceof Error ? err.message : "AI chat failed" });
    res.end();
  }
});

export default router;
