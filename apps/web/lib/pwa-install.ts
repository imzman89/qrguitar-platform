export type InstallChoice = { outcome: "accepted" | "dismissed" };
export type BrowserInstallPrompt = Event & {
  prompt: () => Promise<InstallChoice | void>;
  userChoice?: Promise<InstallChoice>;
};
export type InstallState = { canPrompt: boolean; iosInstructions: boolean; installed: boolean; busy: boolean; message: string };
export const initialInstallState: InstallState = { canPrompt: false, iosInstructions: false, installed: false, busy: false, message: "" };

export function isIosInstallDevice(device: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">) {
  return /iPhone|iPad|iPod/i.test(device.userAgent) || (device.platform === "MacIntel" && device.maxTouchPoints > 1);
}

type InstallEnvironment = {
  listen: (type: string, listener: EventListener) => void;
  unlisten: (type: string, listener: EventListener) => void;
  isStandalone: () => boolean;
  isIos: boolean;
};

/** Capturing an install event never prompts; only install(), called by a button, can prompt. */
export function createInstallController(environment: InstallEnvironment, notify: (state: InstallState) => void) {
  let candidate: BrowserInstallPrompt | null = null;
  let installed = environment.isStandalone();
  let busy = false;
  let message = "";
  let disposed = false;
  const publish = () => {
    if (!disposed) notify({ canPrompt: !installed && Boolean(candidate), iosInstructions: !installed && environment.isIos, installed, busy, message });
  };
  const beforeInstall: EventListener = (event) => {
    const prompt = event as BrowserInstallPrompt;
    if (disposed || installed || typeof prompt.prompt !== "function") return;
    event.preventDefault();
    candidate = prompt;
    message = "";
    publish();
  };
  const didInstall: EventListener = () => { installed = true; candidate = null; message = ""; publish(); };
  environment.listen("beforeinstallprompt", beforeInstall);
  environment.listen("appinstalled", didInstall);
  publish();
  return {
    refreshDisplayMode() { installed = installed || environment.isStandalone(); publish(); },
    async install() {
      if (disposed || busy || installed || !candidate) return;
      const prompt = candidate;
      candidate = null; // The event can only be used once; consume synchronously before awaiting.
      busy = true;
      message = "";
      publish();
      try {
        const result = await prompt.prompt();
        if (!result && prompt.userChoice) await prompt.userChoice;
      } catch {
        message = "Your browser could not open installation. You can also use its menu to add QRguitar to your device.";
      } finally { busy = false; publish(); }
    },
    dispose() {
      disposed = true;
      candidate = null;
      environment.unlisten("beforeinstallprompt", beforeInstall);
      environment.unlisten("appinstalled", didInstall);
    }
  };
}
