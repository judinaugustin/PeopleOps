import { randomUUID } from "node:crypto";
export function jsonError(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message, requestId: randomUUID() } },
    { status },
  );
}
export async function readJson(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new Error("CONTENT_TYPE");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32_000) throw new Error("TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("BAD_JSON");
  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32_000) {
        await reader.cancel();
        throw new Error("TOO_LARGE");
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_LARGE") throw error;
    throw new Error("BAD_JSON");
  }
}
export function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
