import { Component, JSX, Show, createSignal } from "solid-js";

interface TooltipProps {
  title: string;
  desc: string;
  source?: string;
  placement?: "top" | "bottom";
  children: JSX.Element;
}

export const Tooltip: Component<TooltipProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const handleMouseEnter = () => {
    timeoutId = setTimeout(() => {
      setIsOpen(true);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsOpen(false);
  };

  return (
    <div
      class="tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {props.children}
      <Show when={isOpen()}>
        <div class={`tooltip-popover ${props.placement === "bottom" ? "placement-bottom" : "placement-top"}`}>
          <div class="tooltip-header font-mono">{props.title}</div>
          <div class="tooltip-body">{props.desc}</div>
          <Show when={props.source}>
            <div class="tooltip-source">
              <span class="text-tertiary">Origin: </span>
              <span class="text-primary font-mono">{props.source}</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
