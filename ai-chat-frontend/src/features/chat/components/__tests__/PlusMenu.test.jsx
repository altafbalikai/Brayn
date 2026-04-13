import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PlusMenu from "../PlusMenu";

vi.mock("../../../webSearch/WebSearchToggle", () => ({
  default: () => <button type="button">Mock Web Search Toggle</button>,
}));

vi.mock("../../../persona/PersonaSwitcher", () => ({
  PersonaSwitcher: ({ conversationId }) => (
    <button type="button">Mock Persona {conversationId}</button>
  ),
}));

describe("PlusMenu", () => {
  const mockRect = (element, rect) => {
    Object.defineProperty(element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: rect.left,
        y: rect.top,
        width: rect.width ?? 36,
        height: rect.height ?? 36,
        right: rect.right ?? rect.left + (rect.width ?? 36),
        bottom: rect.bottom ?? rect.top + (rect.height ?? 36),
        left: rect.left,
        top: rect.top,
        toJSON: () => ({}),
      }),
    });
  };

  it("opens the popover and renders both tools", () => {
    render(<PlusMenu conversationId="conv-123" />);

    const trigger = screen.getByRole("button", {
      name: /open composer tools/i,
    });
    mockRect(trigger, { left: 120, top: 500, bottom: 536 });

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("dialog", { name: /composer tools/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Web Search")).toBeInTheDocument();
    expect(screen.getByText("Use Style")).toBeInTheDocument();
    expect(screen.getByText("Mock Web Search Toggle")).toBeInTheDocument();
    expect(screen.getByText("Mock Persona conv-123")).toBeInTheDocument();
  });

  it("toggles closed when the button is clicked again", () => {
    render(<PlusMenu conversationId="conv-123" />);

    const trigger = screen.getByRole("button", {
      name: /open composer tools/i,
    });
    mockRect(trigger, { left: 120, top: 500, bottom: 536 });

    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: /composer tools/i }),
    ).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(
      screen.queryByRole("dialog", { name: /composer tools/i }),
    ).not.toBeInTheDocument();
  });

  it("closes when the user clicks outside", () => {
    render(
      <div>
        <PlusMenu conversationId="conv-123" />
        <button type="button">Outside</button>
      </div>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /open composer tools/i,
      }),
    );

    expect(
      screen.getByRole("dialog", { name: /composer tools/i }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));

    expect(
      screen.queryByRole("dialog", { name: /composer tools/i }),
    ).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<PlusMenu conversationId="conv-123" />);

    const trigger = screen.getByRole("button", {
      name: /open composer tools/i,
    });
    mockRect(trigger, { left: 120, top: 500, bottom: 536 });

    fireEvent.click(trigger);

    expect(
      screen.getByRole("dialog", { name: /composer tools/i }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: /composer tools/i }),
    ).not.toBeInTheDocument();
  });

  it("matches the selector pattern and opens below when there is space", () => {
    render(<PlusMenu conversationId="conv-123" />);

    const trigger = screen.getByRole("button", {
      name: /open composer tools/i,
    });
    mockRect(trigger, { left: 96, top: 200, bottom: 236 });

    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: /composer tools/i })).toHaveStyle(
      {
        top: "242px",
        left: "96px",
        transform: "translateY(0)",
      },
    );
  });

  it("matches the selector pattern and opens above when space is tight", () => {
    render(<PlusMenu conversationId="conv-123" />);

    const trigger = screen.getByRole("button", {
      name: /open composer tools/i,
    });
    mockRect(trigger, { left: 80, top: 240, bottom: 276 });

    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 320,
    });

    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: /composer tools/i })).toHaveStyle(
      {
        top: "232px",
        left: "80px",
        transform: "translateY(-100%)",
      },
    );

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalHeight,
    });
  });
});
