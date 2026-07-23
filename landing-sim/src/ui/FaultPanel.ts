import { FAULT_CATALOG, isFaultId } from "../sim/faults";
import type { LandingWorld } from "../sim/world";

export class FaultPanel {
  constructor(
    private readonly container: HTMLElement,
    private readonly world: LandingWorld,
    private readonly onChange: () => void,
  ) {
    this.mount();
  }

  private mount(): void {
    this.container.replaceChildren();
    for (const fault of FAULT_CATALOG) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fault-btn";
      button.dataset.faultId = fault.id;
      button.title = fault.description;

      const label = document.createElement("span");
      label.textContent = fault.label;
      const detail = document.createElement("small");
      detail.textContent = fault.description;
      button.append(label, detail);

      button.addEventListener("click", () => {
        const id = button.dataset.faultId;
        if (!id || !isFaultId(id)) return;
        this.world.toggleFault(id);
        this.render();
        this.onChange();
      });
      this.container.append(button);
    }
    this.render();
  }

  render(): void {
    for (const button of this.container.querySelectorAll<HTMLButtonElement>(".fault-btn")) {
      const id = button.dataset.faultId;
      if (!id || !isFaultId(id)) continue;
      const active = this.world.state.faults[id];
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }
}
