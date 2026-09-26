/** Holds the currently hovered target; `set` reports whether it changed. */
export class HoverChange {
  constructor(initial = null) {
    this.value = initial;
  }

  set(value) {
    if (value === this.value) return false;
    this.value = value;
    return true;
  }
}
