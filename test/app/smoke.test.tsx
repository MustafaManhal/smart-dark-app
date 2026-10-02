// @vitest-environment node
import { expect, test } from "vitest";
import { openDb } from "../../app/src/db/idb";
import { createRepos } from "../../app/src/db/repos";
import { loadSettings, saveSetting, settings } from "../../app/src/settings";

test("settings load saved values and persist changes", async () => {
  const repos = createRepos(await openDb("settings-test"));
  await repos.settings.set("pageStyle", "sepia");
  await loadSettings(repos.settings);
  expect(settings.pageStyle.value).toBe("sepia");
  expect(settings.darkTheme.value).toBe("dark");
  saveSetting("imageMode", "keep");
  await new Promise((r) => setTimeout(r, 10));
  expect(await repos.settings.get("imageMode", "smart")).toBe("keep");
});
