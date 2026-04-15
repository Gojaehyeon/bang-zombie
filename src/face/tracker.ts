import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
}

export function readBlinkScore(
  blendshapes: ReadonlyArray<{ categoryName: string; score: number }>,
): number {
  let left = 0;
  let right = 0;
  for (const c of blendshapes) {
    if (c.categoryName === "eyeBlinkLeft") left = c.score;
    else if (c.categoryName === "eyeBlinkRight") right = c.score;
  }
  return Math.max(left, right);
}
