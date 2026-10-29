import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { requestWeb, requestWebJson, WebHttpError } from "../http.js";

async function withServer<T>(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (url: string) => Promise<T>
): Promise<T> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("bounded web provider HTTP transport", () => {
  it("sends caller headers/body and parses successful JSON", async () => {
    await withServer(
      async (request, response) => {
        let body = "";
        for await (const chunk of request) body += String(chunk);
        response.end(
          JSON.stringify({
            method: request.method,
            authorized: request.headers.authorization === "Bearer fixture-key",
            input: JSON.parse(body),
          })
        );
      },
      async (url) => {
        expect(
          await requestWebJson(url, {
            method: "POST",
            headers: { Authorization: "Bearer fixture-key" },
            body: '{"query":"test"}',
          })
        ).toEqual({ method: "POST", authorized: true, input: { query: "test" } });
      }
    );
  });

  it("retries transient statuses with a strict attempt cap", async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests++;
        response.statusCode = requests < 3 ? 503 : 200;
        response.end("Done");
      },
      async (url) => {
        expect((await requestWeb(url, { maxAttempts: 20, retryDelayMs: 0 })).body).toBe("Done");
        expect(requests).toBe(3);
      }
    );
  });

  it("does not retry HTTP 400 or expose secrets echoed by the service", async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests++;
        response.statusCode = 400;
        response.end("api_key=fixture-secret Authorization: Bearer fixture-secret");
      },
      async (url) => {
        const error = await requestWeb(`${url}?api_key=fixture-secret`, { maxAttempts: 3 }).catch(
          (cause: WebHttpError) => cause
        );
        expect(error).toMatchObject({ code: "http", status: 400, retryable: false });
        expect(JSON.stringify(error)).not.toContain("fixture-secret");
        expect((error as Error).message).not.toContain("fixture-secret");
        expect(requests).toBe(1);
      }
    );
  });

  it.each([true, false])(
    "bounds advertised and streamed response bodies (length header=%s)",
    async (withLength) => {
      await withServer(
        (_request, response) => {
          if (withLength) response.setHeader("content-length", "200");
          response.end("x".repeat(200));
        },
        async (url) => {
          await expect(requestWeb(url, { maxBytes: 20, maxAttempts: 3 })).rejects.toMatchObject({
            code: "size",
            retryable: false,
          });
        }
      );
    }
  );

  it("applies its deadline while reading a stalled body", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200);
        response.write("partial");
      },
      async (url) => {
        await expect(requestWeb(url, { timeoutMs: 30 })).rejects.toMatchObject({
          code: "timeout",
          retryable: false,
        });
      }
    );
  });

  it("cancels during body reads and before sending a request", async () => {
    const controller = new AbortController();
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests++;
        response.writeHead(200);
        response.write("partial");
        controller.abort();
      },
      async (url) => {
        await expect(
          requestWeb(url, { signal: controller.signal, maxAttempts: 3 })
        ).rejects.toMatchObject({ code: "aborted", retryable: false });
        await expect(requestWeb(url, { signal: controller.signal })).rejects.toMatchObject({
          code: "aborted",
        });
        expect(requests).toBe(1);
      }
    );
  });

  it("includes retry backoff in the same deadline", async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests++;
        response.writeHead(429);
        response.end();
      },
      async (url) => {
        await expect(
          requestWeb(url, { timeoutMs: 30, maxAttempts: 3, retryDelayMs: 1000 })
        ).rejects.toMatchObject({ code: "timeout" });
        expect(requests).toBe(1);
      }
    );
  });

  it("returns manual redirect metadata without forwarding credentials", async () => {
    let requests = 0;
    await withServer(
      (_request, response) => {
        requests++;
        response.writeHead(302, { location: "http://other.example/private" });
        response.end();
      },
      async (url) => {
        const response = await requestWeb(url, {
          headers: { Authorization: "Bearer fixture" },
          redirect: "manual",
        });
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("http://other.example/private");
        expect(response.body).toBe("");
        expect(requests).toBe(1);
      }
    );
  });

  it("redacts malformed JSON and native network errors", async () => {
    await withServer(
      (_request, response) => response.end("secret response body"),
      async (url) => {
        await expect(requestWebJson(url)).rejects.toMatchObject({
          code: "json",
          message: "Web service returned invalid JSON",
        });
      }
    );
    const error = await requestWeb("http://127.0.0.1:1?api_key=fixture-secret").catch(
      (cause: WebHttpError) => cause
    );
    expect(error).toBeInstanceOf(WebHttpError);
    expect((error as Error).message).not.toContain("fixture-secret");
    expect((error as Error).cause).toBeUndefined();
  });
});
