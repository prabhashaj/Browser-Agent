/**
 * src/services/demoAgent.ts
 *
 * Legacy demo-only animation driver. NOT connected to real runs.
 * Kept for reference/E2E screenshot tests. Not imported by any real flow.
 *
 * @deprecated Use useRunSession (real backend) instead.
 */

export const USE_DEMO = false; // Set to true only for local demo screenshots

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export type DemoScenario = "flight" | "food" | "products";

interface DemoStep {
  target: string;
  operation: string;
  elementIndex: number;
  durationMs: number;
}

const scenarios: Record<DemoScenario, { title: string; url: string; steps: DemoStep[] }> = {
  flight: {
    title: "Book a flight to Dubai",
    url: "https://flights.google.com",
    steps: [
      { target: "Open flight search", operation: "CLICK", elementIndex: 3, durationMs: 800 },
      { target: "Enter destination Dubai", operation: "TYPE", elementIndex: 14, durationMs: 600 },
      { target: "Choose travel dates", operation: "SELECT", elementIndex: 18, durationMs: 900 },
      {
        target: "Compare the best fares",
        operation: "SCROLL_DOWN",
        elementIndex: 27,
        durationMs: 700,
      },
      { target: "Select Emirates nonstop", operation: "CLICK", elementIndex: 31, durationMs: 500 },
    ],
  },
  food: {
    title: "Order a margherita pizza",
    url: "https://food.pilot.demo",
    steps: [
      { target: "Find nearby pizza", operation: "TYPE", elementIndex: 8, durationMs: 700 },
      { target: "Open Piccolo Forno", operation: "CLICK", elementIndex: 12, durationMs: 600 },
      { target: "Choose margherita pizza", operation: "CLICK", elementIndex: 19, durationMs: 800 },
      { target: "Review the basket", operation: "CLICK", elementIndex: 24, durationMs: 500 },
      { target: "Prepare the order", operation: "WAIT", elementIndex: 29, durationMs: 1200 },
    ],
  },
  products: {
    title: "Compare laptops under $1,000",
    url: "https://search.pilot.demo",
    steps: [
      { target: "Search trusted retailers", operation: "TYPE", elementIndex: 5, durationMs: 600 },
      { target: "Open product results", operation: "CLICK", elementIndex: 11, durationMs: 700 },
      {
        target: "Compare specifications",
        operation: "SCROLL_DOWN",
        elementIndex: 17,
        durationMs: 800,
      },
      { target: "Check review summaries", operation: "CLICK", elementIndex: 26, durationMs: 600 },
      { target: "Rank the best options", operation: "DONE", elementIndex: 33, durationMs: 400 },
    ],
  },
};

export function detectScenario(text: string): DemoScenario {
  if (/pizza|food|margherita|order/i.test(text)) return "food";
  if (/laptop|product|compare|under \$?1000|buy/i.test(text)) return "products";
  return "flight";
}

export function getScenario(scenario: DemoScenario) {
  return scenarios[scenario];
}

/** Runs a demo animation loop (for testing/screenshots only). */
export async function runDemoAnimation(
  scenario: DemoScenario,
  onStep: (step: DemoStep, index: number) => void,
): Promise<void> {
  const data = scenarios[scenario];
  for (const [i, step] of data.steps.entries()) {
    onStep(step, i);
    await delay(step.durationMs);
  }
}
