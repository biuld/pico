import { picoConfig } from "../config";

picoConfig.register({
  key: "codexBinary",
  default: "codex",
  validate: (v) => typeof v === "string" ? undefined : "must be a string",
  description: "Path to the Codex CLI binary",
});

picoConfig.register({
  key: "model",
  default: undefined,
  validate: (v) => v === undefined || typeof v === "string" ? undefined : "must be a string",
  description: "Default model to use for turns",
});

picoConfig.register({
  key: "modelProvider",
  default: undefined,
  validate: (v) => v === undefined || typeof v === "string" ? undefined : "must be a string",
  description: "Default model provider to use for turns",
});

picoConfig.register({
  key: "approvalPolicy",
  default: undefined,
  validate: (v) => v === undefined || typeof v === "string" ? undefined : "must be a string",
  description: "Approval policy override",
});

picoConfig.register({
  key: "sandbox",
  default: undefined,
  validate: () => undefined,
  description: "Sandbox configuration",
});

picoConfig.register({
  key: "personality",
  default: undefined,
  validate: (v) => v === undefined || typeof v === "string" ? undefined : "must be a string",
  description: "Developer personality override",
});

picoConfig.register({
  key: "developerInstructions",
  default: undefined,
  validate: (v) => v === undefined || typeof v === "string" ? undefined : "must be a string",
  description: "Custom developer instructions",
});
