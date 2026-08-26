import { describe, expect, it } from "vitest";
import { restoreBoardScroll } from "./board-scroll";

describe("restoreBoardScroll", () => {
  it("restores a preserved horizontal position", () => {
    const node = { clientWidth: 500, scrollLeft: 0, scrollWidth: 1_500 };

    restoreBoardScroll(node, { current: 420 });

    expect(node.scrollLeft).toBe(420);
  });

  it("clamps the position while keeping the requested value for later content", () => {
    const position = { current: 700 };
    const node = { clientWidth: 500, scrollLeft: 0, scrollWidth: 900 };

    restoreBoardScroll(node, position);

    expect(node.scrollLeft).toBe(400);
    expect(position.current).toBe(700);
  });

  it("does not rewrite an effectively identical position", () => {
    let writes = 0;
    const node = {
      clientWidth: 500,
      scrollWidth: 1_500,
      get scrollLeft() {
        return 419.5;
      },
      set scrollLeft(_value: number) {
        writes += 1;
      },
    };

    restoreBoardScroll(node, { current: 420 });

    expect(writes).toBe(0);
  });
});
