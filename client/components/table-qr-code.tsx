import { encodeQR } from "@paulmillr/qr";

/**
 * One table's guest-ordering QR code, drawn as SVG.
 *
 * SVG RATHER THAN CANVAS, because the output of this component is paper. A
 * canvas is rasterised at the device pixel ratio of whatever machine happened
 * to open the page, and a code that is crisp on a retina laptop can print soft
 * from the same file on a different one. A path has no resolution to get wrong.
 *
 * ONE `<path>`, NOT ONE RECT PER MODULE. A version-3 code is roughly a thousand
 * dark modules and a sheet carries twenty of them; drawn as rects that is
 * ~20,000 DOM nodes for a page whose entire job is to be printed once. Each row
 * is folded into horizontal runs and emitted as one subpath, which is also what
 * makes the rendered geometry readable back out of the DOM by the round-trip
 * test.
 *
 * `shape-rendering="crispEdges"` turns off anti-aliasing: a QR module is a
 * decision, not a shade, and a half-grey edge is what a scanner has to guess
 * about.
 *
 * The code is drawn in `currentColor`, so it inherits the ground it is placed
 * on and no colour value enters this file.
 */
export function TableQrCode({
  value,
  title,
  className,
}: {
  /** The exact string encoded. Anything else printed here is dead paper. */
  value: string;
  /** Accessible name — a QR code is an image of a URL, not decoration. */
  title: string;
  className?: string;
}) {
  const matrix = encodeQR(value, "raw");
  const size = matrix.length;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
    >
      <path d={pathForMatrix(matrix)} fill="currentColor" />
    </svg>
  );
}

/**
 * Fold each row of dark modules into horizontal runs, one subpath per run.
 *
 * Kept exported-adjacent and deliberately simple: the test reverses exactly
 * this format to rebuild the matrix and hand it to the decoder, so the two
 * have to agree about what a run looks like.
 */
function pathForMatrix(matrix: boolean[][]): string {
  const parts: string[] = [];

  for (let y = 0; y < matrix.length; y += 1) {
    const row = matrix[y];
    let runStart: number | null = null;

    for (let x = 0; x <= row.length; x += 1) {
      const dark = x < row.length && row[x];
      if (dark && runStart === null) {
        runStart = x;
      } else if (!dark && runStart !== null) {
        parts.push(`M${runStart} ${y}h${x - runStart}v1h-${x - runStart}z`);
        runStart = null;
      }
    }
  }

  return parts.join("");
}
