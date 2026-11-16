import { describe, expect, it } from "vitest";
import { firstColorMap } from "./colorMaps";

// A fake image loader: records the paths asked for and fails the ones listed.
function loader(failing: string[] = []) {
  const asked: string[] = [];
  const load = async (path: string) => {
    asked.push(path);
    if (failing.includes(path)) throw new Error(`Couldn't load ${path}`);
    return `image:${path}`;
  };
  return { asked, load };
}

const color = { file: "moon_color_8k.jpg", preview: "moon_color_1k.jpg" };
const quiet = () => {};

describe("first colour map", () => {
  it("starts with the preview and leaves the full map for later", async () => {
    const { asked, load } = loader();
    expect(await firstColorMap(color, load, quiet)).toEqual({ image: "image:moon_color_1k.jpg", full: "moon_color_8k.jpg" });
    expect(asked).toEqual(["moon_color_1k.jpg"]);
  });

  it("falls back to the full map when the preview fails, and doesn't ask for it again later", async () => {
    const { asked, load } = loader(["moon_color_1k.jpg"]);
    expect(await firstColorMap(color, load, quiet)).toEqual({ image: "image:moon_color_8k.jpg", full: null });
    expect(asked).toEqual(["moon_color_1k.jpg", "moon_color_8k.jpg"]);
  });

  it("loads the full map straight away when there is no preview", async () => {
    const { asked, load } = loader();
    expect(await firstColorMap({ file: "moon_color_8k.jpg" }, load, quiet)).toEqual({ image: "image:moon_color_8k.jpg", full: null });
    expect(asked).toEqual(["moon_color_8k.jpg"]);
  });

  it("fails only when neither map loads", async () => {
    const { load } = loader(["moon_color_1k.jpg", "moon_color_8k.jpg"]);
    await expect(firstColorMap(color, load, quiet)).rejects.toThrow("moon_color_8k.jpg");
  });
});
