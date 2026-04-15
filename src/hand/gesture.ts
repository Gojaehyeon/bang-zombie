import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_TIP: 20,
} as const;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function dist3(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Finger is "extended" when the tip is farther from the wrist in 3D than the pip.
// Using 3D distance keeps the check valid whether the finger points up the
// image plane or straight at the camera (where 2D projection collapses).
function fingerExtended(
  lm: NormalizedLandmark[],
  tipIdx: number,
  pipIdx: number,
): boolean {
  const wrist = lm[LANDMARK.WRIST];
  return dist3(lm[tipIdx], wrist) > dist3(lm[pipIdx], wrist) * 1.05;
}

function fingerFolded(
  lm: NormalizedLandmark[],
  tipIdx: number,
  mcpIdx: number,
): boolean {
  const wrist = lm[LANDMARK.WRIST];
  return dist3(lm[tipIdx], wrist) < dist3(lm[mcpIdx], wrist) * 1.2;
}

export function isFist(lm: NormalizedLandmark[]): boolean {
  if (lm.length < 21) return false;
  return (
    fingerFolded(lm, LANDMARK.INDEX_TIP, LANDMARK.INDEX_MCP) &&
    fingerFolded(lm, LANDMARK.MIDDLE_TIP, LANDMARK.MIDDLE_MCP) &&
    fingerFolded(lm, LANDMARK.RING_TIP, LANDMARK.RING_MCP) &&
    fingerFolded(lm, LANDMARK.PINKY_TIP, LANDMARK.PINKY_MCP)
  );
}

export function isGunPose(lm: NormalizedLandmark[]): boolean {
  if (lm.length < 21) return false;

  const indexExtended = fingerExtended(lm, LANDMARK.INDEX_TIP, LANDMARK.INDEX_PIP);
  const middleFolded = fingerFolded(lm, LANDMARK.MIDDLE_TIP, LANDMARK.MIDDLE_MCP);
  const ringFolded = fingerFolded(lm, LANDMARK.RING_TIP, LANDMARK.RING_MCP);
  const pinkyFolded = fingerFolded(lm, LANDMARK.PINKY_TIP, LANDMARK.PINKY_MCP);

  // thumb "up": tip Y is above the index MCP on screen — works both for
  // palm-to-camera and index-to-camera orientations.
  const thumbTip = lm[LANDMARK.THUMB_TIP];
  const indexMcp = lm[LANDMARK.INDEX_MCP];
  const thumbUp = thumbTip.y < indexMcp.y + 0.05;

  return indexExtended && middleFolded && ringFolded && pinkyFolded && thumbUp;
}
