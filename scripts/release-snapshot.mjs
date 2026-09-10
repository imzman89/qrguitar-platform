import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function createReleaseSnapshot(repo, sha, projectLink) {
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("Invalid release commit.");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qrguitar-release-"));
  try {
    const archive = path.join(directory, "source.tar");
    execFileSync("git", ["archive", "--format=tar", "--output=" + archive, sha], { cwd: repo, stdio: "pipe" });
    execFileSync("tar", ["-xf", archive, "-C", directory], { stdio: "pipe" });
    fs.unlinkSync(archive);
    fs.mkdirSync(path.join(directory, ".vercel"), {recursive:true});
    fs.writeFileSync(path.join(directory, ".vercel/project.json"), projectLink);
    return directory;
  } catch (error) { removeReleaseSnapshot(directory); throw error; }
}
export function removeReleaseSnapshot(directory) {
  const absolute = path.resolve(directory);
  if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith("qrguitar-release-") ||
      fs.lstatSync(absolute).isSymbolicLink()) throw new Error("Refusing to remove an unexpected release directory.");
  fs.rmSync(absolute, { recursive:true, force:true });
}
