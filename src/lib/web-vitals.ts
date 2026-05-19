import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";

function shouldReportMetric(value: number) {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return false;
  }
  // Ignore implausible values usually caused by background/dev-tab timing artifacts.
  if (value > 60000) {
    return false;
  }
  return true;
}

export function initWebVitals() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;

  onCLS(({ value }) => {
    if (!shouldReportMetric(value)) return;
    if (value > 0.1) {
      console.warn("[CLS]", "Cumulative Layout Shift:", value.toFixed(3));
    }
  });

  onINP(({ value }) => {
    if (!shouldReportMetric(value)) return;
    if (value > 100) {
      console.warn("[INP]", "Interaction to Next Paint:", value.toFixed(0), "ms");
    }
  });

  onFCP(({ value }) => {
    if (!shouldReportMetric(value)) return;
    console.debug("[FCP]", "First Contentful Paint:", value.toFixed(0), "ms");
  });

  onLCP(({ value }) => {
    if (!shouldReportMetric(value)) return;
    if (value > 2500) {
      console.warn("[LCP]", "Largest Contentful Paint:", value.toFixed(0), "ms");
    }
  });

  onTTFB(({ value }) => {
    if (!shouldReportMetric(value)) return;
    console.debug("[TTFB]", "Time to First Byte:", value.toFixed(0), "ms");
  });
}
