/** Route horizontal gestures from the whole document to its active database. */
export function bindDatabasePageScroll(viewport: HTMLElement): () => void {
  const surface = viewport.ownerDocument;
  const overflows = () => viewport.scrollWidth > viewport.clientWidth + 1;
  const scroll = (delta: number) => {
    viewport.scrollLeft = Math.max(
      0,
      Math.min(
        viewport.scrollWidth - viewport.clientWidth,
        viewport.scrollLeft + delta,
      ),
    );
  };
  const wheel = (event: WheelEvent) => {
    // Ctrl-wheel is also how trackpads report pinch-to-zoom.
    if (event.ctrlKey || event.defaultPrevented || !overflows()) return;
    const delta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
    if (!delta || (!event.shiftKey && Math.abs(event.deltaY) > Math.abs(delta)))
      return;
    // Gestures inside the table use the browser's native scrolling pipeline.
    if (
      event.target instanceof Node &&
      viewport.contains(event.target) &&
      !event.shiftKey
    )
      return;
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? viewport.clientWidth
          : 1;
    event.preventDefault();
    scroll(delta * unit);
  };

  let gesture: {
    x: number;
    y: number;
    lastX: number;
    axis: "pending" | "x" | "y";
  } | null = null;
  const touchStart = (event: TouchEvent) => {
    const touch =
      event.touches.length === 1 && overflows() ? event.touches[0] : null;
    gesture = touch
      ? {
          x: touch.clientX,
          y: touch.clientY,
          lastX: touch.clientX,
          axis: "pending",
        }
      : null;
  };
  const touchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1 || !overflows()) {
      gesture = null;
      return;
    }
    if (!gesture || event.defaultPrevented) return;
    const touch = event.touches[0];
    if (gesture.axis === "pending") {
      const dx = Math.abs(touch.clientX - gesture.x);
      const dy = Math.abs(touch.clientY - gesture.y);
      if (Math.max(dx, dy) < 8) return;
      gesture.axis = dx > dy ? "x" : "y";
    }
    if (gesture.axis !== "x") return;
    event.preventDefault();
    scroll(gesture.lastX - touch.clientX);
    gesture.lastX = touch.clientX;
  };
  const touchEnd = () => {
    gesture = null;
  };

  surface.addEventListener("wheel", wheel, { capture: true, passive: false });
  surface.addEventListener("touchstart", touchStart, {
    capture: true,
    passive: true,
  });
  surface.addEventListener("touchmove", touchMove, {
    capture: true,
    passive: false,
  });
  surface.addEventListener("touchend", touchEnd, true);
  surface.addEventListener("touchcancel", touchEnd, true);
  return () => {
    surface.removeEventListener("wheel", wheel, true);
    surface.removeEventListener("touchstart", touchStart, true);
    surface.removeEventListener("touchmove", touchMove, true);
    surface.removeEventListener("touchend", touchEnd, true);
    surface.removeEventListener("touchcancel", touchEnd, true);
  };
}
