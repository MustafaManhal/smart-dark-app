import { render } from "preact";
import { act } from "preact/test-utils";
import { expect, test, vi } from "vitest";
import { IconButton } from "../../app/src/ui/Button";
import { Sheet } from "../../app/src/ui/Sheet";

test("IconButton has an accessible name and fires onClick", () => {
  const root = document.createElement("div");
  const onClick = vi.fn();
  render(<IconButton label="Back" icon="back" onClick={onClick} />, root);
  const button = root.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe("Back");
  button.click();
  expect(onClick).toHaveBeenCalledOnce();
});

test("Sheet renders only when open and closes on Escape", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const onClose = vi.fn();
  render(<Sheet open={false} title="Contents" onClose={onClose}>x</Sheet>, root);
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  act(() => render(<Sheet open title="Contents" onClose={onClose}>x</Sheet>, root));
  expect(root.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Contents");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(onClose).toHaveBeenCalledOnce();
});
