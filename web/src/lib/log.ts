/*
  Tiny structured logger. One JSON line per event on stdout.
  Never pass secrets in `data`; callers own what they log.
*/

type Level = "info" | "warn" | "error";

type Data = Readonly<Record<string, string | number | boolean | null>>;

function write(level: Level, event: string, data: Data = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  process.stdout.write(`${line}\n`);
}

export const log = {
  info: (event: string, data?: Data): void => write("info", event, data),
  warn: (event: string, data?: Data): void => write("warn", event, data),
  error: (event: string, data?: Data): void => write("error", event, data),
};
