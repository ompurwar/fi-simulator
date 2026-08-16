/**
 * Topic guardrails for the in-app assistant — a cheap, deterministic gate that
 * runs BEFORE the LLM: blocks clear-cut off-topic requests (coding, other
 * domains, out-of-context arithmetic) at zero token cost. Everything else is
 * "allow" and the system prompt is the final judge for borderline cases.
 */

export type TopicVerdict = { decision: "allow" } | { decision: "block"; reason: string };

const SMALL_TALK =
  /^(hi|hii+|hello|hey|yo|good (morning|afternoon|evening)|thanks|thank you|thanku|bye|goodbye|who are you|what can you do|what do you do|how (do|does) (you|this) work|help|namaste|hii)\b/;

// Code / software-engineering requests.
const CODE_RE =
  /(write|show|fix|debug|review|explain|generate|build).{0,40}(code|function|script|class|bug|regex|sql|query|algorithm|program|api|endpoint|component|test)\b|javascript|typescript|\bpython\b|\bjava\b|\bc\+\+|csharp|dotnet|react|vue|angular|node\.?js|next\.?js|docker|kubernetes|k8s|terraform|git\b|html\b|\bcss\b|webpack|npm\b|yarn\b|regex|linux|windows server|deploy|compile|syntax/;

// Clearly unrelated everyday domains.
const DOMAIN_RE =
  /cook|recipe|food blog|movie|film|football|cricket|hockey|tennis|olympic|who (is|was|won)|capital of|history of|geography|translate|translation|poem|poetry|song|lyrics|weather in|news about|celebrity|politics|religion|space|universe|math olympiad|essay on/;

// Plan-adjacent words that make arithmetic acceptable (it relates to their data).
const PLAN_CONTEXT_RE =
  /plan|salary|income|expense|rent|loan|interest|emi|invest|corpus|runway|fdp|hike|inflation|sip|tax|net.?worth|account|budget|\bfd\b|insurance|retire|saving|expenditure|wallet|grow|rate|percent|amount|month|year|₹|rs\.?|salary|bonus|side hustle|cashflow|balance/;

// Pure arithmetic expressions (+, *, / — NOT "-" so ranges like 10-20% pass).
const MATH_RE = /\d[\d,]*\s*[+*\/]\s*[\d,]*\d/;
const MATH_WORD_RE = /(calculate|solve|what is \d+ (plus|times|divided by)|sum of \d+|multiply \d+)/;

/** Classify a user message before it reaches the LLM. */
export function classifyTopic(message: string): TopicVerdict {
  const text = message.trim().toLowerCase();
  if (!text) return { decision: "allow" };

  if (SMALL_TALK.test(text)) return { decision: "allow" };

  if (CODE_RE.test(text)) {
    return { decision: "block", reason: "coding" };
  }

  if (DOMAIN_RE.test(text)) {
    return { decision: "block", reason: "out_of_context" };
  }

  const planAdjacent = PLAN_CONTEXT_RE.test(text);
  if ((MATH_RE.test(text) || MATH_WORD_RE.test(text)) && !planAdjacent) {
    return { decision: "block", reason: "out_of_context_calculation" };
  }

  return { decision: "allow" };
}

export const OFF_TOPIC_MESSAGES: Record<string, string> = {
  coding:
    "I can't help with code or software questions — I'm your financial planning assistant. I can help with your runway, cashflows, loans, net worth, or a what-if simulation for your plan.",
  out_of_context:
    "That's outside what I can help with — I'm your financial planning assistant. Ask me about your plans, income, expenses, loans, net worth or a what-if scenario.",
  out_of_context_calculation:
    "I only work with numbers from your financial plan — I won't do standalone calculations. Ask me something like 'what's my runway?' or 'what if my rent rises 10%?'.",
};
