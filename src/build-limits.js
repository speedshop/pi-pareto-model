import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const MAX_BUILD_TIME_MS = 10 * 60 * 1000;
export const MAX_GZIP_BYTES = 1_000_000;

export function checkPageSize(...payloads) {
  const bytes = payloads.reduce((total, payload) => total + gzipSync(payload).byteLength, 0);
  if (bytes > MAX_GZIP_BYTES) {
    throw new Error(`Combined page payload compresses to ${bytes.toLocaleString("en-US")} bytes; maximum is ${MAX_GZIP_BYTES.toLocaleString("en-US")} bytes (1 MB, gzip).`);
  }
}

export function runBuild(url, { argv = process.argv.slice(2), timeoutMs = MAX_BUILD_TIME_MS } = {}) {
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== "win32";
    const child = spawn(process.execPath, [fileURLToPath(url), ...argv], { stdio: "inherit", detached: grouped });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (grouped && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") reject(error);
        }
      } else child.kill("SIGKILL");
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`Build exceeded its ${timeoutMs / 1000}-second time limit and was terminated.`));
      else if (code !== 0) reject(new Error(`Build process ${signal ? `was killed by ${signal}` : `exited with code ${code}`}.`));
      else resolve();
    });
  });
}
