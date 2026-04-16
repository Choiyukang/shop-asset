import { readFileSync, writeFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
const version = pkg.version;

// Cargo.toml 동기화
let cargo = readFileSync("./src-tauri/Cargo.toml", "utf-8");
const updated = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
writeFileSync("./src-tauri/Cargo.toml", updated);

console.log(`[sync-version] v${version} → Cargo.toml`);
