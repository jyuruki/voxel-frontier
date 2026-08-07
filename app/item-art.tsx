import { BLOCKS, blockForItem } from "./game/blocks";
import { BlockId, ItemId } from "./game/types";

interface BlockArt {
  mark: string;
  accent: string;
  texture: "grain" | "ore" | "brick" | "circuit" | "organic" | "glass" | "wave" | "crystal";
}

const BLOCK_ART: Record<BlockId, BlockArt> = {
  [BlockId.Air]: { mark: "", accent: "#ffffff", texture: "glass" },
  [BlockId.Turf]: { mark: "〽", accent: "#c8ef70", texture: "organic" },
  [BlockId.Soil]: { mark: "••", accent: "#b9865b", texture: "grain" },
  [BlockId.Stone]: { mark: "⌁", accent: "#b7bdc0", texture: "grain" },
  [BlockId.Sand]: { mark: "∴", accent: "#fff0ad", texture: "grain" },
  [BlockId.Snow]: { mark: "✦", accent: "#ffffff", texture: "crystal" },
  [BlockId.Water]: { mark: "≈", accent: "#b8efff", texture: "wave" },
  [BlockId.EmberwoodLog]: { mark: "◎", accent: "#e99a53", texture: "grain" },
  [BlockId.EmberwoodLeaves]: { mark: "✣", accent: "#9bd16e", texture: "organic" },
  [BlockId.CoalOre]: { mark: "◆", accent: "#202426", texture: "ore" },
  [BlockId.CopperOre]: { mark: "●", accent: "#f5a269", texture: "ore" },
  [BlockId.AetherCrystal]: { mark: "◇", accent: "#b8ffff", texture: "crystal" },
  [BlockId.EmberwoodPlanks]: { mark: "≡", accent: "#f0b56c", texture: "grain" },
  [BlockId.StoneBrick]: { mark: "▦", accent: "#c2c6c3", texture: "brick" },
  [BlockId.Glass]: { mark: "╱", accent: "#e8ffff", texture: "glass" },
  [BlockId.Workbench]: { mark: "T", accent: "#ffd083", texture: "grain" },
  [BlockId.FluxWire]: { mark: "┼", accent: "#ff8b66", texture: "circuit" },
  [BlockId.Toggle]: { mark: "↥", accent: "#ffe087", texture: "circuit" },
  [BlockId.FluxLamp]: { mark: "☼", accent: "#fff49a", texture: "circuit" },
  [BlockId.ThermalGenerator]: { mark: "G", accent: "#ff9a5c", texture: "circuit" },
  [BlockId.FluxCell]: { mark: "▰", accent: "#77d8ff", texture: "circuit" },
  [BlockId.BoreDrill]: { mark: "▼", accent: "#dce6e8", texture: "circuit" },
  [BlockId.Conveyor]: { mark: "≫", accent: "#77d9dd", texture: "circuit" },
  [BlockId.ArcFurnace]: { mark: "♨", accent: "#ffbd66", texture: "circuit" },
  [BlockId.Fabricator]: { mark: "F", accent: "#8cf0d5", texture: "circuit" },
  [BlockId.Ram]: { mark: "⇥", accent: "#d9d5e3", texture: "circuit" },
  [BlockId.ProximitySensor]: { mark: "◉", accent: "#c8beff", texture: "circuit" },
  [BlockId.AndGate]: { mark: "&", accent: "#8de4ff", texture: "circuit" },
  [BlockId.OrGate]: { mark: "≥", accent: "#9de4c4", texture: "circuit" },
  [BlockId.NotGate]: { mark: "!", accent: "#ddbdff", texture: "circuit" },
  [BlockId.DelayGate]: { mark: "◷", accent: "#ffb6df", texture: "circuit" },
  [BlockId.Hopper]: { mark: "▽", accent: "#aec0bc", texture: "circuit" },
  [BlockId.Crate]: { mark: "×", accent: "#dfaa68", texture: "grain" },
  [BlockId.GlowRod]: { mark: "│", accent: "#fff09a", texture: "circuit" },
  [BlockId.Basalt]: { mark: "▥", accent: "#777487", texture: "brick" },
  [BlockId.Ice]: { mark: "❄", accent: "#dcf8ff", texture: "crystal" },
  [BlockId.Clay]: { mark: "≋", accent: "#c2d0d2", texture: "wave" },
  [BlockId.SunCactus]: { mark: "‡", accent: "#b5e47a", texture: "organic" },
  [BlockId.StarBloom]: { mark: "✿", accent: "#ffd0ec", texture: "organic" },
  [BlockId.Bedrock]: { mark: "▣", accent: "#5e6870", texture: "ore" },
  [BlockId.CopperBlock]: { mark: "▤", accent: "#ffc08d", texture: "brick" },
  [BlockId.Cinnabar]: { mark: "▲", accent: "#ff8273", texture: "ore" },
  [BlockId.SulfurStone]: { mark: "S", accent: "#fff47a", texture: "ore" },
  [BlockId.MoonshardOre]: { mark: "✧", accent: "#a9baff", texture: "ore" },
  [BlockId.Mossstone]: { mark: "♧", accent: "#a9cd80", texture: "organic" },
  [BlockId.RuinStone]: { mark: "⌂", accent: "#d6cdbd", texture: "brick" },
  [BlockId.RelicCache]: { mark: "⌘", accent: "#ffd27f", texture: "grain" },
  [BlockId.Thornvine]: { mark: "ϟ", accent: "#b6d568", texture: "organic" },
  [BlockId.MoonshardBlock]: { mark: "✦", accent: "#d5dcff", texture: "crystal" },
  [BlockId.WayfinderBrazier]: { mark: "♨", accent: "#fff09a", texture: "circuit" },
  [BlockId.AshGlass]: { mark: "◩", accent: "#e2eef0", texture: "glass" },
};

function darker(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * factor)));
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
}

function BlockItemArt({ id }: { id: BlockId }) {
  const definition = BLOCKS[id];
  const art = BLOCK_ART[id];
  const color = definition.color;
  const left = darker(color, 0.72);
  const right = darker(color, 0.54);
  const textureLines = art.texture === "brick"
    ? <><path d="M13 31h38M18 41h35M31 24v7M23 31v10M42 31v10" /><path d="M14 35l17 10 20-12" /></>
    : art.texture === "grain"
      ? <><path d="M16 29c8 4 19 2 31-2M15 36c10 5 24 3 36-2M22 22l-2 22M43 20l2 20" /><circle cx="25" cy="35" r="1.8" /></>
      : art.texture === "ore"
        ? <><path d="M19 27l5-3 4 4-3 5-5-1zM39 34l5-2 3 4-4 5-5-2zM30 42l3-3 4 2-1 4z" /></>
        : art.texture === "circuit"
          ? <><path d="M14 34h10l4-5h10l4 5h9M25 34v10M42 34v8" /><circle cx="25" cy="44" r="2" /><circle cx="42" cy="42" r="2" /></>
          : art.texture === "organic"
            ? <><path d="M17 41c3-11 9-17 17-20M29 44c2-9 7-15 17-19M23 32l-6-4M36 31l8-6" /><circle cx="20" cy="40" r="2" /></>
            : art.texture === "wave"
              ? <><path d="M15 30c5-4 9 4 14 0s9 4 14 0 8 3 10 1M14 39c6-4 10 4 15 0s9 4 14 0 7 2 9 1" /></>
              : art.texture === "crystal"
                ? <><path d="M25 23l7-5 8 10-7 16-10-9zM32 18v26M23 35l17-7" /></>
                : <><path d="M17 40L43 21M29 46l20-20" /></>;
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M8 20L32 7l24 13-24 14z" fill={color} stroke="#eafff7" strokeOpacity=".38" strokeWidth="1.4" />
      <path d="M8 20l24 14v24L8 44z" fill={left} stroke="#071416" strokeOpacity=".45" strokeWidth="1.4" />
      <path d="M56 20L32 34v24l24-14z" fill={right} stroke="#071416" strokeOpacity=".5" strokeWidth="1.4" />
      <g fill="none" stroke={art.accent} strokeWidth="2" strokeLinecap="square" opacity=".8">{textureLines}</g>
      <text x="42" y="47" textAnchor="middle" fill={art.accent} fontSize="16" fontWeight="900" fontFamily="system-ui, sans-serif">{art.mark}</text>
      <path d="M13 20L32 10l9 5-19 10z" fill="#fff" opacity=".13" />
    </svg>
  );
}

function PickArt({ head }: { head: string }) {
  return <><path d="M18 13c11-7 24-7 34 2l-4 7c-7-5-16-7-23-3z" fill={head} /><path d="M30 19l8 4-17 34-8-4z" fill="#9a603c" /><path d="M17 13l7 2-3 8-8-4z" fill={darker(head, .62)} /></>;
}

function NonBlockItemArt({ item }: { item: ItemId }) {
  if (item === "tool:rough-pick") return <PickArt head="#8f999b" />;
  if (item === "tool:copper-pick") return <PickArt head="#d88657" />;
  if (item === "tool:crystal-pick") return <PickArt head="#72eee2" />;
  if (item === "tool:hatchet") return <><path d="M25 10l25 8-6 20-19-6z" fill="#90999a" /><path d="M29 26l8 4-14 29-8-4z" fill="#a9693f" /><path d="M43 19l7-1-3 10z" fill="#dce3df" /></>;
  if (item === "tool:spade") return <><path d="M31 8h7v31h-7z" fill="#a9683f" /><path d="M22 37l13-5 13 5-3 17-10 6-10-6z" fill="#9ea9aa" /><path d="M26 6h17v6H26z" fill="#d6a777" /></>;
  if (item === "tool:blade") return <><path d="M42 6l8 8-25 34-9-9z" fill="#c0c9c9" /><path d="M12 42l10 10-5 7L7 49z" fill="#a46842" /><path d="M14 36l15 15-5 5-15-15z" fill="#d19a58" /></>;
  if (item === "tool:stone-spear") return <><path d="M50 5l5 14-13 2z" fill="#aeb6b4" /><path d="M45 18l5 5-34 36-6-6z" fill="#a56840" /><path d="M17 47l6 6-8 6-5-6z" fill="#745037" /></>;
  if (item === "tool:copper-saber") return <><path d="M44 5l8 7-25 36-9-8z" fill="#ec9b66" /><path d="M13 39l18 14-4 6-18-14z" fill="#6f4934" /><path d="M10 43l8 7-7 9-7-8z" fill="#c3824f" /></>;
  if (item === "tool:aether-repeater") return <><path d="M8 27l39-13 8 8-7 12-31 7z" fill="#536b7c" /><path d="M22 35l11-2 4 23H26z" fill="#744e38" /><path d="M42 17l8 7-8 7-9-7z" fill="#85fff0" /><path d="M10 29h23v6H10z" fill="#d9875c" /></>;
  if (item === "part:copper-ingot") return <><path d="M12 39l10-20h28l7 20-9 12H19z" fill="#d98655" /><path d="M22 23h25l4 12H17z" fill="#f4b078" /></>;
  if (item === "part:flux-coil") return <><circle cx="32" cy="32" r="20" fill="none" stroke="#d37a53" strokeWidth="7" /><circle cx="32" cy="32" r="9" fill="#74e9e0" /><path d="M8 32h9M47 32h9" stroke="#ffcf8b" strokeWidth="4" /></>;
  if (item === "part:logic-wafer") return <><rect x="15" y="15" width="34" height="34" rx="3" fill="#4f8c89" /><rect x="23" y="23" width="18" height="18" fill="#96fff0" /><path d="M9 21h10M9 32h10M9 43h10M45 21h10M45 32h10M45 43h10" stroke="#d37a53" strokeWidth="3" /></>;
  if (item === "part:gear") return <><path d="M28 6h8l3 9 8-4 6 6-4 8 9 3v8l-9 3 4 8-6 6-8-4-3 9h-8l-3-9-8 4-6-6 4-8-9-3v-8l9-3-4-8 6-6 8 4z" fill="#cf8b59" /><circle cx="32" cy="32" r="10" fill="#263b3f" /></>;
  if (item === "part:moonshard") return <><path d="M33 4l16 19-12 36-20-23z" fill="#7d91d2" /><path d="M33 4l4 55-10-27z" fill="#cbd6ff" /><path d="M17 36l32-13" stroke="#e9f0ff" strokeWidth="3" /></>;
  if (item === "part:carapace") return <><path d="M9 32C14 11 49 8 56 32 51 54 16 57 9 32z" fill="#667f4f" /><path d="M32 13v39M15 26h34M17 40h30" stroke="#b0d37b" strokeWidth="3" /><circle cx="32" cy="32" r="7" fill="#40513a" /></>;
  if (item === "part:cinder-core") return <><path d="M32 4l8 16 13 7-9 12 2 17-14-7-14 7 2-17-9-12 13-7z" fill="#bf4e3f" /><path d="M32 14l9 17-9 10-9-10z" fill="#ffb34d" /></>;
  if (item === "ammo:aether-bolt") return <><path d="M8 37l38-20 5 8-38 20z" fill="#8ff9ed" /><path d="M44 12l14 3-7 12z" fill="#c7d4ff" /><path d="M8 35l8 1-4 8z" fill="#d9875c" /></>;
  if (item === "food:starfruit") return <><path d="M32 5l7 17 18 1-14 12 5 18-16-10-16 10 5-18L7 23l18-1z" fill="#e785b2" /><circle cx="30" cy="29" r="10" fill="#ffd37e" /></>;
  if (item === "food:glowcut") return <><path d="M9 34c7-18 37-22 46-5-3 21-33 29-46 5z" fill="#68aaa0" /><path d="M18 32c9-8 22-9 29-2-5 11-21 15-29 2z" fill="#d0fff3" /><circle cx="47" cy="27" r="4" fill="#ffcf7f" /></>;
  if (item === "consumable:mender-tonic") return <><path d="M24 8h16v10l7 8v28H17V26l7-8z" fill="#6cc9c0" /><rect x="25" y="4" width="14" height="8" fill="#d7a66d" /><path d="M32 29v17M24 37h16" stroke="#f4fff6" strokeWidth="5" /></>;
  return <circle cx="32" cy="32" r="21" fill="#8fa0a2" />;
}

export function ItemArt({ item }: { item: ItemId }) {
  const blockId = blockForItem(item);
  return (
    <span className="item-art">
      {blockId === null ? (
        <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><NonBlockItemArt item={item} /></svg>
      ) : <BlockItemArt id={blockId} />}
    </span>
  );
}
