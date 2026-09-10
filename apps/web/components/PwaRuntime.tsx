"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createInstallController, initialInstallState, isIosInstallDevice } from "../lib/pwa-install";

const PwaContext = createContext({ ...initialInstallState, install: () => {} });
export const usePwaInstall = () => useContext(PwaContext);

export function PwaRuntime({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialInstallState);
  const controller = useRef<ReturnType<typeof createInstallController> | null>(null);

  useEffect(() => {
    if (!window.isSecureContext) return;
    const display = window.matchMedia("(display-mode: standalone)");
    const install = createInstallController({
      listen: (type, listener) => window.addEventListener(type, listener),
      unlisten: (type, listener) => window.removeEventListener(type, listener),
      isStandalone: () => display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      isIos: isIosInstallDevice(navigator)
    }, setState);
    controller.current = install;
    const changed = () => install.refreshDisplayMode();
    display.addEventListener("change", changed);
    // Development hot reload should never be intercepted by a persistent worker.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    }
    return () => {
      install.dispose();
      display.removeEventListener("change", changed);
      if (controller.current === install) controller.current = null;
    };
  }, []);

  return <PwaContext.Provider value={{ ...state, install: () => { void controller.current?.install(); } }}>{children}</PwaContext.Provider>;
}
