import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, test } from "vitest";
import { AdjustControls, adjustLabel } from "../../app/src/reader/AdjustControls";
import { pageBackground } from "../../app/src/reader/renderer";
import { adjustValues, saveSetting, settings } from "../../app/src/settings";

const root = document.createElement("div");
document.body.append(root);
const button = (name: string) => root.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const slider = (id: string) => root.querySelector<HTMLInputElement>(`#adjust-${id}`)!;
const shown = (id: string) => root.querySelector(`#adjust-${id}-value`)!.textContent;

afterEach(() => {
  act(() => render(null, root));
  saveSetting("adjBrightness", 100);
  saveSetting("adjContrast", 100);
  saveSetting("adjSepia", 0);
  saveSetting("adjGrayscale", 0);
});

test("values are shown as the distance from the default", () => {
  expect(adjustLabel("brightness", 100)).toBe("Off");
  expect(adjustLabel("brightness", 90)).toBe("−10");
  expect(adjustLabel("contrast", 105)).toBe("+5");
  expect(adjustLabel("sepia", 50)).toBe("+50");
  expect(adjustLabel("grayscale", 0)).toBe("Off");
});

test("defaults leave the pages as they are", () => {
  expect(adjustValues()).toEqual({ brightness: 100, contrast: 100, sepia: 0, grayscale: 0 });
  expect(pageBackground({ pageStyle: "original", darkTheme: "dark", imageMode: "smart", adjust: adjustValues() })).toBe("rgb(255 255 255)");
  expect(pageBackground({ pageStyle: "dark", darkTheme: "dark", imageMode: "smart" })).toBe("rgb(30 31 34)");
});

test("brightness is for text, so the paper color stays; the other sliders change the paper", () => {
  const dim = { brightness: 50, contrast: 100, sepia: 0, grayscale: 0 };
  expect(pageBackground({ pageStyle: "original", darkTheme: "dark", imageMode: "smart", adjust: dim })).toBe("rgb(255 255 255)");
  expect(pageBackground({ pageStyle: "dark", darkTheme: "dark", imageMode: "smart", adjust: dim })).toBe("rgb(30 31 34)");
  const warm = { brightness: 50, contrast: 100, sepia: 100, grayscale: 0 };
  expect(pageBackground({ pageStyle: "original", darkTheme: "dark", imageMode: "smart", adjust: warm })).toBe("rgb(255 255 239)");
  const flat = { brightness: 100, contrast: 50, sepia: 0, grayscale: 0 };
  expect(pageBackground({ pageStyle: "original", darkTheme: "dark", imageMode: "smart", adjust: flat })).toBe("rgb(191 191 191)");
});

test("buttons step by 5, stop at the ends, and Reset brings the defaults back", () => {
  act(() => render(<AdjustControls />, root));
  expect(root.textContent).not.toContain("Reset adjustments");
  act(() => button("Raise contrast").click());
  expect(settings.adjContrast.value).toBe(105);
  expect(shown("contrast")).toBe("+5");
  act(() => button("Lower brightness").click());
  act(() => button("Lower brightness").click());
  expect(settings.adjBrightness.value).toBe(90);
  expect(shown("brightness")).toBe("−10");
  expect(button("Less sepia").disabled).toBe(true);

  act(() => saveSetting("adjGrayscale", 100));
  expect(button("More grayscale").disabled).toBe(true);
  expect(slider("grayscale").getAttribute("aria-valuetext")).toBe("+100");

  const reset = [...root.querySelectorAll("button")].find((b) => b.textContent === "Reset adjustments")!;
  act(() => reset.click());
  expect(adjustValues()).toEqual({ brightness: 100, contrast: 100, sepia: 0, grayscale: 0 });
  expect(shown("brightness")).toBe("Off");
});

test("dragging a slider shows the number at once and saves on release", () => {
  act(() => render(<AdjustControls />, root));
  const sepia = slider("sepia");
  act(() => {
    sepia.value = "50";
    sepia.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(shown("sepia")).toBe("+50");
  expect(settings.adjSepia.value).toBe(0);
  act(() => {
    sepia.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(settings.adjSepia.value).toBe(50);
  expect(shown("sepia")).toBe("+50");
});
