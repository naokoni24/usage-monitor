// Vitest runs outside Next's RSC bundler, so the real `server-only` package's
// default export (which unconditionally throws) would break every test that
// imports server-side lib code. This no-op shim replaces it in tests only
// (see vitest.config.ts resolve.alias) - production builds still use the real
// package via Next's bundler.
export {};
