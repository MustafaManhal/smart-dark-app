import { expect, test } from "vitest";
import { rangeFor, readPageText } from "../../app/src/readaloud/pageText";

function layer(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

test("joins spans and line breaks into readable text", () => {
  const t = readPageText(layer('<span>Hello</span><span> world.</span><br><span>Next line</span><div class="endOfContent"></div>'));
  expect(t.text).toBe("Hello world.\nNext line");
});

test("a range maps back onto the right text nodes", () => {
  const div = layer("<span>Alpha beta.</span><br><span>Gamma delta.</span>");
  const t = readPageText(div);
  const start = t.text.indexOf("beta");
  const end = t.text.indexOf("Gamma") + "Gamma".length;
  const r = rangeFor(t, start, end)!;
  expect(r.toString()).toBe("beta.Gamma");
});

test("words split across spans stay joined", () => {
  expect(readPageText(layer("<span>Quart</span><span>erly report</span>")).text).toBe("Quarterly report");
});
