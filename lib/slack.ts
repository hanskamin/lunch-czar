/**
 * Slack posting. Two supported setups (either works):
 *   SLACK_BOT_TOKEN + SLACK_CHANNEL  — bot token (xoxb-…), channel name or ID
 *   SLACK_WEBHOOK_URL                — incoming webhook wired to #atx-lunch
 * `@here` is sent as the literal `<!here>` mention.
 */

export interface SlackResult {
  ok: boolean;
  error?: string;
}

export function slackConfigured(): boolean {
  return Boolean(
    process.env.SLACK_WEBHOOK_URL ||
      (process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL),
  );
}

export function slackChannelLabel(): string {
  return process.env.SLACK_CHANNEL || "#atx-lunch";
}

export async function postToSlack(text: string): Promise<SlackResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL;
  const webhook = process.env.SLACK_WEBHOOK_URL;

  try {
    if (token && channel) {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ channel, text, unfurl_links: false }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) return { ok: false, error: `Slack: ${body.error}` };
      return { ok: true };
    }
    if (webhook) {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return { ok: false, error: `Slack webhook: HTTP ${res.status}` };
      return { ok: true };
    }
    return {
      ok: false,
      error:
        "Slack is not configured. Set SLACK_BOT_TOKEN + SLACK_CHANNEL (or SLACK_WEBHOOK_URL) in .env.local.",
    };
  } catch (e) {
    return { ok: false, error: `Slack: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── Message templates: Dina's exact ritual ───────────────────── */

export function announceMessage(restaurantName: string, deadline: Date, groupOrderUrl: string): string {
  const time = formatTime(deadline);
  return `<!here> today's lunch will be ${restaurantName}, please get in your order by ${time}\n${groupOrderUrl}`;
}

export function lastCallMessage(): string {
  return "<!here> last call for orders";
}

export function arrivedMessage(): string {
  return "<!here> lunch has arrived, come get it";
}

export function formatTime(d: Date): string {
  return d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
}
