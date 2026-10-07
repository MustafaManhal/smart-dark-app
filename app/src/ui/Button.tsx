import type { ComponentChildren, ComponentProps } from "preact";
import { Icon, type IconName } from "./Icon";

type Base = Omit<ComponentProps<"button">, "icon">;

export function Button({ variant = "ghost", children, ...rest }: Base & { variant?: "primary" | "ghost" | "danger"; children: ComponentChildren }) {
  return <button type="button" class={`btn btn-${variant}`} {...rest}>{children}</button>;
}

/**
 * A button with an icon. `text` puts a word beside or under the icon: a picture alone leaves people
 * guessing, so the tools of the reader and the places of the app all carry one. `label` stays the full name
 * for screen readers and the tooltip.
 */
export function IconButton({ label, icon, text, class: extra, ...rest }: Base & { label: string; icon: IconName; text?: string }) {
  return (
    <button type="button" class={`icon-btn ${text ? "has-text" : ""} ${extra ?? ""}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
      {text && <span class="btn-text">{text}</span>}
    </button>
  );
}
