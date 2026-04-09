import { existsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { LAUNCHD_PLIST_PATH } from "@/lib/paths";

export async function uninstallServiceCommand(): Promise<void> {
  const uid = process.getuid ? process.getuid() : 501;
  const domain = `gui/${uid}`;

  if (existsSync(LAUNCHD_PLIST_PATH)) {
    const bootout = spawnSync(
      "launchctl",
      ["bootout", domain, LAUNCHD_PLIST_PATH],
      { stdio: "inherit" },
    );
    if (bootout.status !== 0 && bootout.status !== 36 /* already unloaded */) {
      console.warn(`launchctl bootout exited with status ${bootout.status}`);
    }
    unlinkSync(LAUNCHD_PLIST_PATH);
    console.log(`Removed ${LAUNCHD_PLIST_PATH}`);
  } else {
    console.log("No launchd plist found — nothing to uninstall.");
  }

  console.log("✓ Service uninstalled.");
}
