import type { ComponentChildren, ComponentProps } from "preact";
import { Icon, type IconName } from "./Icon";

type Base = Omit<ComponentProps<"button">, "icon">;

export function Button({ variant = "ghost", children, ...rest }: Base & { variant?: "primary" | "ghost" | "danger"; children: ComponentChildren }) {
  return <button type="button" class={`btn btn-${variant}`} {...rest}>{children}</button>;
}

export function IconButton({ label, icon, class: extra, ...rest }: Base & { label: string; icon: IconName }) {
  return (
    <button type="button" class={`icon-btn ${extra ?? ""}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
