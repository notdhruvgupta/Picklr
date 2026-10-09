import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const HOLES = [
  [68, 62],
  [107, 59],
  [53, 93],
  [90, 90],
  [127, 90],
  [70, 124],
  [110, 121],
];

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f5c45" }}>
        <div style={{ position: "relative", width: 124, height: 124, borderRadius: 62, background: "#d6f04a", display: "flex" }}>
          {HOLES.map(([x, y]) => (
            <div
              key={`${x}-${y}`}
              style={{ position: "absolute", left: x - 28 - 9, top: y - 28 - 9, width: 18, height: 18, borderRadius: 9, background: "rgba(29,42,0,0.55)" }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
