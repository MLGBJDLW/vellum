import { KeychainStore } from "./src/credentials/stores/keychain-store.js";
const store = new KeychainStore();
const avail = await store.isAvailable();
console.log("Keychain available:", avail);
const result = await store.get("google");
console.log("Result:", result);
