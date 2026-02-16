import { miningMode } from "./mining/mode.js";
import { AnkoreModeRegistry } from "./registry.js";

const modeRegistry = new AnkoreModeRegistry();
modeRegistry.registerMany([miningMode]);

export { modeRegistry };
