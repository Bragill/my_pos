const { Readable } = require('node:stream');
const { Buffer } = require('node:buffer');

/**
 * Cloudflare Worker Fetch <-> Express.js Adapter
 * Converts standard Web Request to Express (req, res) and returns Web Response.
 */
function createExpressHandler(app) {
  return async function handleFetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Read request body if present
    let bodyBuffer = Buffer.alloc(0);
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
      try {
        const arrayBuf = await request.arrayBuffer();
        bodyBuffer = Buffer.from(arrayBuf);
      } catch (err) {
        console.warn('[Adapter] Failed to read request body:', err.message);
      }
    }

    // 2. Create stream-compatible req
    const req = Readable.from(bodyBuffer.length > 0 ? [bodyBuffer] : []);
    req.method = request.method;
    req.url = url.pathname + url.search;
    req.originalUrl = req.url;
    req.baseUrl = '';
    req.path = url.pathname;
    req.query = Object.fromEntries(url.searchParams.entries());
    
    // Headers
    req.headers = {};
    req.rawHeaders = [];
    for (const [key, value] of request.headers.entries()) {
      const lowerKey = key.toLowerCase();
      req.headers[lowerKey] = value;
      req.rawHeaders.push(key, value);
    }

    const clientIp = request.headers.get('cf-connecting-ip') || 
                     request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                     '127.0.0.1';

    req.connection = {
      remoteAddress: clientIp,
      encrypted: url.protocol === 'https:',
    };
    req.socket = req.connection;
    req.httpVersion = '1.1';
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;

    // Attach Cloudflare env and ctx for handlers that need it
    req.env = env;
    req.ctx = ctx;
    req.rawBody = bodyBuffer.toString('utf8');

    // 3. Create res
    const resHeaders = new Headers();
    const chunks = [];

    return new Promise((resolve) => {
      let resolved = false;

      const finishResponse = (statusCode, statusMessage) => {
        if (resolved) return;
        resolved = true;

        const combined = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
        const isEmptyBody = statusCode === 204 || statusCode === 304 || request.method === 'HEAD';

        const finalResponse = new Response(isEmptyBody ? null : combined, {
          status: statusCode || 200,
          statusText: statusMessage || undefined,
          headers: resHeaders,
        });

        resolve(finalResponse);
      };

      const res = {
        statusCode: 200,
        statusMessage: '',
        headersSent: false,

        setHeader(name, value) {
          if (Array.isArray(value)) {
            resHeaders.delete(name);
            for (const v of value) {
              resHeaders.append(name, String(v));
            }
          } else {
            resHeaders.set(name, String(value));
          }
          return this;
        },

        getHeader(name) {
          return resHeaders.get(name);
        },

        getHeaders() {
          return Object.fromEntries(resHeaders.entries());
        },

        getHeaderNames() {
          return Array.from(resHeaders.keys());
        },

        hasHeader(name) {
          return resHeaders.has(name);
        },

        removeHeader(name) {
          resHeaders.delete(name);
          return this;
        },

        writeHead(statusCode, statusMessage, headers) {
          let hdrs = headers;
          let msg = statusMessage;
          if (typeof msg === 'object' && !hdrs) {
            hdrs = msg;
            msg = undefined;
          }
          this.statusCode = statusCode;
          if (msg) this.statusMessage = msg;
          if (hdrs) {
            for (const [k, v] of Object.entries(hdrs)) {
              this.setHeader(k, v);
            }
          }
          this.headersSent = true;
          return this;
        },

        write(chunk, encoding) {
          if (chunk) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk));
          }
          return true;
        },

        end(chunk, encoding) {
          if (chunk) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk));
          }
          this.headersSent = true;
          finishResponse(this.statusCode, this.statusMessage);
          return this;
        },

        on(event, handler) {
          // No-op or event listener stub for finish/close
          return this;
        },
        once(event, handler) {
          return this;
        },
        emit(event) {
          return true;
        },
      };

      try {
        app(req, res);
      } catch (err) {
        console.error('[Adapter] Uncaught app error:', err);
        finishResponse(500, 'Internal Server Error');
      }
    });
  };
}

module.exports = { createExpressHandler };
