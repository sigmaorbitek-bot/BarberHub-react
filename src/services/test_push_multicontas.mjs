// Teste local com mocks (nao acessa Supabase, push real ou rede).
import { strict as assert } from "node:assert";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const origem = path.join(here, "../src/services/pushNotifications.js");
const temporario = path.join(here, "__teste_push_temporario.mjs");
let codigo = await readFile(origem, "utf8");
codigo = codigo.replace('import { supabase } from "./supabase";', "const supabase = globalThis.__supabaseMock;");
codigo = codigo.replace('import.meta.env.VITE_VAPID_PUBLIC_KEY || ""', '"AQIDBA"');
await writeFile(temporario, codigo);

let writes = 0;
let owner = "conta-antiga";
const oldSubscription = {
  endpoint: "https://push.example/old",
  toJSON: () => ({ keys: { p256dh: "p256dh", auth: "auth" } }),
  async unsubscribe() {
    manager.current = null;
    return true;
  },
};
const manager = {
  current: oldSubscription,
  async getSubscription() { return this.current; },
  async subscribe() {
    this.current = {
      endpoint: "https://push.example/new",
      toJSON: () => ({ keys: { p256dh: "key2", auth: "auth2" } }),
      async unsubscribe() { manager.current = null; return true; },
    };
    return this.current;
  },
};
const registration = { pushManager: manager };
const browserNavigator = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120",
  platform: "Win32",
  maxTouchPoints: 0,
  serviceWorker: {
    register: async () => registration,
    ready: Promise.resolve(registration),
  },
};
Object.defineProperty(globalThis, "navigator", { configurable: true, value: browserNavigator });
globalThis.window = {
  Notification: {}, PushManager: {}, atob: (s) => Buffer.from(s, "base64").toString("binary"),
  matchMedia: () => ({ matches: false }), navigator: browserNavigator,
};
globalThis.Notification = { permission: "granted" };
globalThis.__supabaseMock = {
  async rpc(name, args) {
    if (name === "verificar_push_subscription_propria") {
      return { data: args.p_endpoint === "https://push.example/new", error: null };
    }
    if (name === "salvar_push_subscription_v2") {
      writes++;
      owner = "conta-nova";
      return { data: "fake", error: null };
    }
    if (name === "desativar_push_subscription") {
      return { data: null, error: null };
    }
    throw Error(`RPC inesperada: ${name}`);
  },
};

try {
  const { getWebPushStatus, enableWebPush, disableWebPush } = await import(pathToFileURL(temporario).href);
  const antes = await getWebPushStatus();
  assert.equal(antes.active, false, "Assinatura da outra conta nao pode ficar ativa");
  assert.equal(writes, 0, "Abrir a pagina nao deve registrar/transferir inscricao");
  await enableWebPush();
  assert.equal(owner, "conta-nova");
  assert.equal(writes, 1);
  assert.equal(manager.current.endpoint, "https://push.example/new");
  const depois = await getWebPushStatus();
  assert.equal(depois.active, true);
  assert.equal(writes, 1, "Recarregar status nao deve registrar inscricao");
  await disableWebPush();
  assert.equal(manager.current, null);
  console.log("OK: leitura sem transferencia; renovacao somente por clique; desativacao local.");
} finally {
  await unlink(temporario);
}
