/**
 * Emergency Kill-Switch: Immediate system shutdown capability.
 *
 * Allows users to instantly disable all automated trading, bot execution,
 * and signal generation. Critical for EU AI Act compliance and operational
 * safety — users must be able to stop the AI system at any time.
 */

export type KillSwitchState = "active" | "killed";

export interface KillSwitch {
  /** Current state. */
  state: KillSwitchState;
  /** Timestamp when kill was activated (null if active). */
  killedAt: Date | null;
  /** Reason for kill (optional). */
  reason: string;
  /** Who activated the kill (user/system). */
  activatedBy: string;
}

const globalKillSwitch: KillSwitch = {
  state: "active",
  killedAt: null,
  reason: "",
  activatedBy: "",
};

/**
 * Activate the emergency kill-switch. Stops all automated trading immediately.
 */
export function activateKillSwitch(reason: string, activatedBy: string = "user"): KillSwitch {
  globalKillSwitch.state = "killed";
  globalKillSwitch.killedAt = new Date();
  globalKillSwitch.reason = reason;
  globalKillSwitch.activatedBy = activatedBy;
  return { ...globalKillSwitch };
}

/**
 * Deactivate the kill-switch and restore normal operation.
 */
export function deactivateKillSwitch(): KillSwitch {
  globalKillSwitch.state = "active";
  globalKillSwitch.killedAt = null;
  globalKillSwitch.reason = "";
  globalKillSwitch.activatedBy = "";
  return { ...globalKillSwitch };
}

/**
 * Check if the system is currently killed.
 */
export function isSystemKilled(): boolean {
  return globalKillSwitch.state === "killed";
}

/**
 * Get current kill-switch state.
 */
export function getKillSwitchState(): KillSwitch {
  return { ...globalKillSwitch };
}
