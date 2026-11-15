import { describe, expect, it } from "vitest";
import { estimateRateBps, type LinkBudgetOptions } from "./contacts";

const MOON_KM = 384400;
const uncapped = (opts: LinkBudgetOptions = {}) => estimateRateBps(MOON_KM, { ...opts, radioMaxBps: Infinity });

describe("lunar downlink budget", () => {
  it("caps the default lunar link at the 2 Mbps radio limit", () => {
    expect(estimateRateBps(MOON_KM)).toBe(2e6);
  });

  it("gives about 3.011393 Gbps before the cap", () => {
    // Independent SI/dB reference: Gt=30.275196 dBi, Gr=67.303260 dBi,
    // free-space loss=222.629037 dB, Pr=3.944318e-12 W.
    expect(uncapped() / 1e9).toBeCloseTo(3.011393, 5);
  });

  it("returns the power limit when it falls below the radio cap", () => {
    expect(estimateRateBps(MOON_KM, { transmitPowerW: 0.001 })).toBeCloseTo(150569.641, 2);
  });

  it("uses inverse-square distance in kilometres", () => {
    const doubled = estimateRateBps(MOON_KM * 2, { radioMaxBps: Infinity });
    expect(doubled / uncapped()).toBeCloseTo(0.25, 12);
  });

  it.each<[string, LinkBudgetOptions, number]>([
    ["transmitter power", { transmitPowerW: 40 }, 2],
    ["lander diameter squared", { landerDiameterM: 1 }, 4],
    ["DSN diameter squared", { dsnDiameterM: 68 }, 4],
    ["lander efficiency", { landerEfficiency: 0.275 }, 0.5],
    ["DSN efficiency", { dsnEfficiency: 0.3 }, 0.5],
    ["system noise temperature", { systemTemperatureK: 60 }, 0.5],
    ["10 dB required Eb/N0", { requiredEbN0Db: 12 }, 0.1],
    ["10 dB additional margin", { marginDb: 13 }, 0.1],
    ["10 dB additional losses", { otherLossesDb: 12 }, 0.1],
    ["frequency at fixed dish sizes", { frequencyHz: 16.8e9 }, 4],
  ])("scales correctly with %s", (_label, opts, ratio) => {
    expect(uncapped(opts) / uncapped()).toBeCloseTo(ratio, 12);
  });

  it.each([0, 1e6])("honours a radio limit of %f bits/s", (radioMaxBps) => {
    expect(estimateRateBps(MOON_KM, { radioMaxBps })).toBe(radioMaxBps);
  });

  it.each<LinkBudgetOptions>([{ transmitPowerW: 0 }, { landerEfficiency: 0 }, { dsnEfficiency: 0 }])("returns zero for a zero-gain or unpowered link (%j)", (opts) => {
    expect(uncapped(opts)).toBe(0);
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid distance %s", (distance) => {
    expect(() => estimateRateBps(distance)).toThrow(RangeError);
  });

  it.each<LinkBudgetOptions>([
    { frequencyHz: 0 },
    { systemTemperatureK: 0 },
    { landerDiameterM: 0 },
    { dsnDiameterM: -1 },
    { landerEfficiency: 1.1 },
    { dsnEfficiency: -0.1 },
    { transmitPowerW: -1 },
    { requiredEbN0Db: NaN },
    { marginDb: Infinity },
    { otherLossesDb: NaN },
    { radioMaxBps: -1 },
    { radioMaxBps: NaN },
  ])("rejects invalid link parameters (%j)", (opts) => {
    expect(() => estimateRateBps(MOON_KM, opts)).toThrow(RangeError);
  });
});
