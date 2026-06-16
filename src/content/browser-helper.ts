/**
 * A safe wrapper around the extension's browser/chrome namespace
 * to prevent uncaught "Extension context invalidated" errors after an extension reload.
 */
const g = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : {} as any);
const rawBrowser = g.browser || g.chrome;

export const browser = rawBrowser ? new Proxy(rawBrowser, {
  get(target, prop) {
    if (prop === "runtime") {
      const runtime = target.runtime;
      if (!runtime) return undefined;
      return new Proxy(runtime, {
        get(rTarget, rProp) {
          if (rProp === "sendMessage") {
            return (...args: any[]) => {
              try {
                if (!rTarget || !rTarget.id) {
                  return Promise.reject(new Error("Extension context invalidated"));
                }
                return rTarget.sendMessage(...(args as [any])).catch((err: any) => {
                  if (err && err.message && err.message.includes("Extension context invalidated")) {
                    return { error: "Extension context invalidated" };
                  }
                  throw err;
                });
              } catch (e) {
                return Promise.reject(e);
              }
            };
          }
          return Reflect.get(rTarget, rProp);
        }
      });
    }
    return Reflect.get(target, prop);
  }
}) : undefined as any;
