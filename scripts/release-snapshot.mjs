import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function createReleaseSnapshot(repo, sha, projectLink, { includeGitMetadata = false } = {}) {
  if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error("Invalid release commit.");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qrguitar-release-"));
  try {
    if (includeGitMetadata) {
      // A fresh exact-commit checkout supplies genuine CLI Git metadata without
      // copying working files, ignored secrets, hooks or the source Git config.
      const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: repo, encoding: "utf8" }).trim();
      if (remote !== "https://github.com/imzman89/qrguitar-platform-live.git") throw new Error("Unexpected QRguitar release remote.");
      const hooks = path.join(directory, ".git", "disabled-hooks");
      const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=" + hooks, ...args], { cwd: directory, encoding: "utf8", stdio: "pipe" }).trim();
      git("init", "--quiet", "--template=");
      fs.mkdirSync(hooks);
      git("config", "core.hooksPath", hooks);
      git("fetch", "--quiet", "--no-tags", "--depth=1", path.resolve(repo), sha);
      git("checkout", "--quiet", "--detach", sha);
      git("remote", "add", "origin", remote);
      const expectedTree = execFileSync("git", ["rev-parse", sha + "^{tree}"], { cwd: repo, encoding: "utf8" }).trim();
      if (git("rev-parse", "HEAD") !== sha || git("rev-parse", "HEAD^{tree}") !== expectedTree) throw new Error("Release snapshot source mismatch.");
      fs.mkdirSync(path.join(directory, ".git", "info"), { recursive: true });
      fs.appendFileSync(path.join(directory, ".git", "info", "exclude"), "\n/.vercel/\n");
      if (git("status", "--porcelain", "--untracked-files=all")) throw new Error("Release snapshot is not clean.");
    } else {
      const archive = path.join(directory, "source.tar");
      execFileSync("git", ["archive", "--format=tar", "--output=" + archive, sha], { cwd: repo, stdio: "pipe" });
      execFileSync("tar", ["-xf", archive, "-C", directory], { stdio: "pipe" });
      fs.unlinkSync(archive);
    }
    if (projectLink !== undefined) {
      fs.mkdirSync(path.join(directory, ".vercel"), {recursive:true});
      fs.writeFileSync(path.join(directory, ".vercel/project.json"), projectLink);
    }
    return directory;
  } catch (error) { cleanupReleaseSnapshot(directory); throw error; }
}
function verifiedSnapshotPath(directory) {
  const absolute = path.resolve(directory);
  if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith("qrguitar-release-")) {
    throw new Error("Refusing to remove an unexpected release directory.");
  }
  const entry = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) throw new Error("Refusing to remove an unexpected release directory.");
  return absolute;
}
export function removeReleaseSnapshot(directory) {
  const absolute = verifiedSnapshotPath(directory);
  fs.rmSync(absolute, { recursive:true, force:true, maxRetries:3, retryDelay:200 });
}
export function cleanupReleaseSnapshot(directory, { remove = removeReleaseSnapshot, warn = console.warn } = {}) {
  let absolute;
  try {
    absolute = verifiedSnapshotPath(directory);
    remove(absolute);
    return true;
  } catch {
    warn(absolute
      ? "Release snapshot cleanup did not finish. Retained directory: " + absolute
      : "Release snapshot cleanup was skipped because its path failed safety validation.");
    return false;
  }
}
