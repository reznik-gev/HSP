/**
 * A catalog item seen from above, at true proportions (docs/0095): a box, a cylinder or an L.
 * The L keeps the full width along the back and the full depth on the start side, with the
 * front-end quarter cut away. Drawn as geometry, so it never mirrors in Hebrew.
 */
import { cn } from "@/lib/utils";

export interface PreviewShape {
  shape: string;
  width_mm: number;
  depth_mm: number;
  color: string | null;
}

export function ItemPreview({
  item,
  className,
  label,
}: {
  item: PreviewShape;
  className?: string;
  /** Read out by screen readers; the thumbnails in a list leave it out. */
  label?: string;
}) {
  const w = item.width_mm;
  const d = item.depth_mm;
  const pad = Math.max(w, d) * 0.08;
  const fill = item.color ?? "#d6d3d1"; // the plan's fallback for items without a colour
  const common = {
    fill,
    stroke: "var(--plan-object-stroke)",
    strokeWidth: 1,
    vectorEffect: "non-scaling-stroke" as const,
  };
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${d + 2 * pad}`}
      direction="ltr"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", className)}
    >
      {item.shape === "cylinder" ? (
        <ellipse {...common} cx={w / 2} cy={d / 2} rx={w / 2} ry={d / 2} />
      ) : item.shape === "l_shape" ? (
        <polygon
          {...common}
          points={`0,0 ${w},0 ${w},${d / 2} ${w / 2},${d / 2} ${w / 2},${d} 0,${d}`}
        />
      ) : (
        <rect {...common} width={w} height={d} />
      )}
    </svg>
  );
}
