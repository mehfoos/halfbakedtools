// The browser security policy (Content-Security-Policy) for the tool page. Pure data.
// It tells the browser to refuse any connection from this page to another site, and any form submission.
// So even if a library tried to send a file somewhere, the browser would block it.
//  - 'self' = this site only (static files; it has no way of receiving uploads).
//  - blob: and data: = content created inside the page (previews, downloads), not network addresses.
//  - 'unsafe-inline' = the site's own inline scripts and styles written into the page when it is built.
//  - 'wasm-unsafe-eval' = lets the PDF reader's image decoders (WebAssembly files served by this site) run.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "form-action 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
].join("; ");
