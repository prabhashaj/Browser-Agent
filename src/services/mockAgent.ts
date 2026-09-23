import type { AgentEvent, AgentService, AgentStep, BrowserTab, ResultKind } from "@/types/pilot";

export const USE_MOCK = true;
const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const browserWords = /\b(book|order|buy|search|find|check|open|go to|reserve)\b/i;

const scenarios: Record<ResultKind, { title: string; url: string; steps: [string, AgentStep["operation"], number][] }> = {
  flight: { title: "Book a flight to Dubai", url: "https://flights.google.com", steps: [["Open flight search", "CLICK", 3], ["Enter destination Dubai", "TYPE", 14], ["Choose travel dates", "SELECT", 18], ["Compare the best fares", "SCROLL_DOWN", 27], ["Select Emirates nonstop", "CLICK", 31]] },
  food: { title: "Order a margherita pizza", url: "https://food.pilot.demo", steps: [["Find nearby pizza", "TYPE", 8], ["Open Piccolo Forno", "CLICK", 12], ["Choose margherita pizza", "CLICK", 19], ["Review the basket", "CLICK", 24], ["Prepare the order", "WAIT", 29]] },
  products: { title: "Compare laptops under $1,000", url: "https://search.pilot.demo", steps: [["Search trusted retailers", "TYPE", 5], ["Open product results", "CLICK", 11], ["Compare specifications", "SCROLL_DOWN", 17], ["Check review summaries", "CLICK", 26], ["Rank the best options", "DONE", 33]] },
};

class MockAgentService implements AgentService {
  private stopped = false;
  private approvalResolver: (() => void) | null = null;
  private paused = false;

  async *sendMessage(text: string): AsyncGenerator<AgentEvent> {
    this.stopped = false;
    if (!browserWords.test(text)) {
      const reply = "I’m here. I can help you think something through, or take care of a browser task when you’re ready.";
      for (const word of reply.split(" ")) { if (this.stopped) return; await delay(45); yield { type: "message_delta", delta: `${word} ` }; }
      yield { type: "message_done" }; return;
    }
    const scenario: ResultKind = /pizza|food|margherita|order/i.test(text) ? "food" : /laptop|product|compare|under \$?1000|buy/i.test(text) ? "products" : "flight";
    const data = scenarios[scenario];
    const taskId = `task-${Date.now()}`;
    const steps: AgentStep[] = data.steps.map(([target, operation, elementIndex], index) => ({ id: `${taskId}-${index}`, index: index + 1, operation, target, elementIndex, status: "pending" }));
    yield { type: "task_started", task: { id: taskId, title: data.title, status: "planning", progress: 4, startedAt: Date.now(), scenario, currentAction: "Planning a safe route" } };
    await delay(450); yield { type: "plan", steps };
    const tab: BrowserTab = { id: `tab-${scenario}`, title: scenario === "flight" ? "Flights" : scenario === "food" ? "Piccolo Forno" : "Laptop research", url: data.url, page: scenario === "flight" ? "flights" : scenario === "food" ? "food" : "search", loading: true };
    yield { type: "browser_navigate", tab };
    await delay(500); yield { type: "browser_frame", page: tab.page };
    for (const [index, step] of steps.entries()) {
      if (this.stopped) return;
      while (this.paused) await delay(100);
      yield { type: "step_started", stepId: step.id, action: step.target };
      yield { type: "element_highlight", index: step.elementIndex ?? 1 };
      yield { type: "cursor_move", x: 24 + ((index * 17) % 58), y: 25 + ((index * 13) % 50) };
      await delay(650);
      if (index === 2) yield { type: "browser_frame", page: scenario === "products" ? "shopping" : scenario === "food" ? "checkout" : "flights" };
      yield { type: "step_finished", stepId: step.id };
    }
    const amount = scenario === "flight" ? "$842.00" : scenario === "food" ? "$24.80" : null;
    const request = { id: `approve-${taskId}`, title: scenario === "flight" ? "Book this flight?" : scenario === "food" ? "Place this order?" : "Finish product shortlist?", summary: scenario === "flight" ? "Emirates · New York to Dubai · Economy" : scenario === "food" ? "1× Margherita pizza · delivery included" : "Save the three shortlisted laptops", ...(amount ? { amount } : {}) };
    yield { type: "approval_required", request };
    await new Promise<void>((resolve) => { this.approvalResolver = resolve; });
    if (this.stopped) return;
    yield { type: "browser_frame", page: "complete" };
    await delay(500);
    const message = scenario === "flight" ? "Your Emirates flight is ready. I’ve kept the booking details together below." : scenario === "food" ? "Your margherita pizza order is confirmed and arriving in about 28 minutes." : "I compared the strongest options and shortlisted three standouts under your budget.";
    yield { type: "task_finished", result: scenario, message };
  }
  async startVoice() { await delay(80); }
  stop() { this.stopped = true; this.approvalResolver?.(); this.approvalResolver = null; }
  approve(_id: string) { this.approvalResolver?.(); this.approvalResolver = null; }
  provideSecret(_id: string) { this.approvalResolver?.(); this.approvalResolver = null; }
  takeOver() { this.paused = true; }
  resume() { this.paused = false; }
}

export const agentService: AgentService = new MockAgentService();