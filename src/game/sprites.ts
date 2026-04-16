import playerUrl from "../player.png";
import normalUrl from "../normal_zombie.png";
import runnerUrl from "../run_zombie.png";
import tankUrl from "../tank_zombie.png";

export type Sprites = {
  player: HTMLImageElement;
  normal: HTMLImageElement;
  runner: HTMLImageElement;
  tank: HTMLImageElement;
};

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function loadSprites(): Promise<Sprites> {
  const [player, normal, runner, tank] = await Promise.all([
    loadImg(playerUrl),
    loadImg(normalUrl),
    loadImg(runnerUrl),
    loadImg(tankUrl),
  ]);
  return { player, normal, runner, tank };
}
