const SCROLL_POSITION_KEY = "gemineye-scroll-position";

export function saveScrollPosition() {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(SCROLL_POSITION_KEY, window.scrollY.toString());
  }
}

export function restoreScrollPosition() {
  if (typeof window !== "undefined") {
    const position = window.sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (position) {
      window.scrollTo(0, parseInt(position, 10));
    }
  }
}

export function clearScrollPosition() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(SCROLL_POSITION_KEY);
  }
}
