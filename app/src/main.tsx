import { render } from "preact";
import "./app.css";
import { App } from "./app";
import { openDb } from "./db/idb";
import { createRepos } from "./db/repos";
import { configurePdfjs } from "./reader/pdf";
import { loadSettings } from "./settings";
import { initDesktop } from "./platform/desktop";
import { registerServiceWorker } from "./platform/pwa";

configurePdfjs(new URL("./pdfjs/", document.baseURI).href);
const repos = createRepos(await openDb());
await loadSettings(repos.settings);
navigator.storage?.persist?.().catch(() => {});
render(<App repos={repos} />, document.getElementById("root")!);
initDesktop(repos);
registerServiceWorker();
