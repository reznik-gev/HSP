/**
 * Turns the frames record.guide.ts captured into the guide's GIFs (docs/0146), one set per
 * language in src/guide/media/<lang>/: at 10 frames a second, 800 px wide, with a palette made
 * for each GIF.
 * Needs ffmpeg on the PATH.
 *
 *   node e2e/guide/to-gif.ts      (or `pnpm guide:gifs`, which records first)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FRAMES = "test-results/guide-frames";
const MEDIA = "src/guide/media";

for (const file of readdirSync(FRAMES).filter((f) => f.endsWith(".ffconcat"))) {
  const [, lang, name] = /^(\w+)-(.+)\.ffconcat$/.exec(file)!;
  mkdirSync(join(MEDIA, lang!), { recursive: true });
  const gif = join(MEDIA, lang!, `${name}.gif`);
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-i",
      join(FRAMES, file),
      "-vf",
      "fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
      "-loop",
      "0",
      gif,
    ],
    { stdio: "inherit" },
  );
  console.log(`${gif}: ${Math.round(statSync(gif).size / 1024)} KB`);
}
