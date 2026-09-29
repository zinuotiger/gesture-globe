import { defaults, type AppConfig } from '../config/index.ts';
export type ExternalError =
  | 'UNCONFIGURED'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE';
export type ExternalReply =
  | Readonly<{ ok: true; data: unknown; source: string; fetchedAt: string }>
  | Readonly<{
      ok: false;
      error: ExternalError;
      source: string | null;
      fetchedAt: string;
    }>;
export interface JsonClient {
  request(
    parameters: Readonly<Record<string, string>>,
    signal: AbortSignal,
  ): Promise<ExternalReply>;
}
class ResponseError extends Error {
  constructor(readonly code: ExternalError) {
    super(code);
  }
}

/** Endpoint is trusted composition configuration, never part of a tool call. */
export class ExternalJsonClient implements JsonClient {
  private readonly endpoint: URL;
  constructor(
    endpoint: string,
    private readonly config: Readonly<AppConfig> = defaults,
  ) {
    const url = new URL(endpoint);
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      )
    )
      throw new TypeError(
        'Expected explicit credential-free HTTPS or loopback endpoint',
      );
    this.endpoint = url;
  }
  async request(
    parameters: Readonly<Record<string, string>>,
    signal: AbortSignal,
  ): Promise<ExternalReply> {
    const source = this.endpoint.href;
    const failure = (error: ExternalError): ExternalReply => ({
      ok: false,
      error,
      source,
      fetchedAt: new Date().toISOString(),
    });
    if (signal.aborted) return failure('CANCELLED');
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.agent.requestTimeoutMs);
    try {
      const url = new URL(source);
      for (const [key, value] of Object.entries(parameters))
        url.searchParams.set(key, value);
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ResponseError(
          response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR',
        );
      }
      if (
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .includes('application/json') ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new ResponseError('INVALID_RESPONSE');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let bytes = 0,
        text = '';
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > this.config.agent.maxResponseBytes)
            throw new ResponseError('INVALID_RESPONSE');
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
        const data: unknown = JSON.parse(text);
        return { ok: true, data, source, fetchedAt: new Date().toISOString() };
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error instanceof ResponseError
          ? error
          : new ResponseError('INVALID_RESPONSE');
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      return failure(
        timedOut
          ? 'TIMEOUT'
          : signal.aborted
            ? 'CANCELLED'
            : error instanceof ResponseError
              ? error.code
              : 'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
}
