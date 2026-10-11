import { headers } from "next/headers";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  const requestedMode = (await headers()).get("x-qrguitar-auth-mode");
  const initialMode = requestedMode === "register" || requestedMode === "reset" ? requestedMode : "login";
  return <LoginClient initialMode={initialMode} />;
}
