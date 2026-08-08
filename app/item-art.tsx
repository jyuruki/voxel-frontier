"use client";

import { useEffect, useRef } from "react";
import { blockForItem, paintBlockItemIcon } from "./game/blocks";
import { BlockId, ItemId } from "./game/types";

function BlockItemArt({ id }: { id: BlockId }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) paintBlockItemIcon(canvas.current, id);
  }, [id]);
  return <canvas ref={canvas} className="item-art__world-texture" width={48} height={48} aria-hidden="true" />;
}

function PickArt({ head }: { head: string }) {
  return <><path d="M8 17C21 6 43 6 56 18l-6 9c-11-7-24-7-35 0z" fill={head} stroke="#172125" strokeWidth="2" /><path d="M31 20l9 5-20 35-9-5z" fill="#8e5939" stroke="#3b2b24" strokeWidth="2" /><path d="M12 16l9-4 5 8-11 7z" fill="#e8edf0" opacity=".55" /></>;
}

function IngotArt({ color, shine }: { color: string; shine: string }) {
  return <><path d="M9 41l10-23h29l8 23-10 12H19z" fill={color} stroke="#182326" strokeWidth="2" /><path d="M20 22h25l5 14H14z" fill={shine} /><path d="M17 41h33" stroke="#fff" strokeOpacity=".55" strokeWidth="3" /></>;
}

function NonBlockItemArt({ item }: { item: ItemId }) {
  if (item.includes("pick")) {
    const head = item === "tool:wood-pick" ? "#b47746"
      : item === "tool:rough-pick" ? "#8f999b"
        : item === "tool:copper-pick" ? "#d88657"
          : item === "tool:iron-pick" ? "#d1d9d7"
            : item === "tool:diamond-pick" ? "#62d9d3"
              : "#72eee2";
    return <PickArt head={head} />;
  }
  if (item.includes("hatchet")) return <><path d="M24 9l27 9-7 21-21-7z" fill={item.includes("wood") ? "#b47746" : "#aab3b2"} stroke="#172125" strokeWidth="2" /><path d="M29 27l9 5-15 29-9-5z" fill="#8d5738" /><path d="M43 19l9-1-4 11z" fill="#eef4f2" opacity=".6" /></>;
  if (item.includes("spade")) return <><path d="M30 5h8v35h-8z" fill="#8d5738" /><path d="M20 38l14-7 14 7-3 17-11 7-11-7z" fill={item.includes("wood") ? "#b47746" : "#aeb8b8"} stroke="#172125" strokeWidth="2" /><path d="M24 4h20v7H24z" fill="#d8a16a" /></>;
  if (item === "tool:wood-club") return <><path d="M38 4l14 8-21 39-10-6z" fill="#9b613a" stroke="#3c2922" strokeWidth="2" /><path d="M12 42l20 11-6 10-20-11z" fill="#68442f" /><path d="M39 12l9 5M35 21l9 5M31 30l9 5" stroke="#e6ad70" strokeWidth="3" /></>;
  if (item.includes("blade") || item.includes("saber")) return <><path d="M43 4l10 9-27 37-11-10z" fill={item.includes("copper") ? "#e89a64" : "#c7d0cf"} stroke="#162125" strokeWidth="2" /><path d="M10 40l20 15-5 7L5 48z" fill="#71503a" /><path d="M12 36l19 17" stroke="#e5a55e" strokeWidth="5" /></>;
  if (item === "tool:stone-spear") return <><path d="M49 4l8 16-16 3z" fill="#b9c0bd" stroke="#172125" strokeWidth="2" /><path d="M44 19l7 6-37 38-7-7z" fill="#9b633e" /></>;
  if (item === "tool:aether-repeater") return <><path d="M6 27l42-14 9 9-8 14-33 7z" fill="#526b7d" stroke="#152126" strokeWidth="2" /><path d="M22 37l12-3 4 26H26z" fill="#754d37" /><path d="M42 17l9 7-9 8-10-8z" fill="#85fff0" /><path d="M8 30h27v7H8z" fill="#dc895e" /></>;
  if (item === "part:coal") return <><path d="M13 20l17-12 22 9 7 22-15 17-24-4-10-17z" fill="#2c3032" stroke="#111719" strokeWidth="3" /><path d="M22 18l9-4 7 5-7 6zM38 35l12-4 3 8-11 8z" fill="#5c6465" /></>;
  if (item === "part:copper-ingot") return <IngotArt color="#d98655" shine="#f4b078" />;
  if (item === "part:iron-ingot") return <IngotArt color="#aeb7b5" shine="#e8efec" />;
  if (item === "part:gold-ingot") return <IngotArt color="#d4a928" shine="#ffe782" />;
  if (item === "part:diamond") return <><path d="M12 23l11-14h20l11 14-22 36z" fill="#65d9d6" stroke="#183136" strokeWidth="2" /><path d="M12 23h42M23 9l9 14 11-14M32 23v36" fill="none" stroke="#d8ffff" strokeWidth="3" /></>;
  if (item === "part:flux-dust") return <><path d="M8 49c9-18 16-27 24-38 7 13 16 25 24 38-15 8-33 8-48 0z" fill="#b94755" stroke="#361f27" strokeWidth="2" /><circle cx="22" cy="43" r="3" fill="#ff9b9b" /><circle cx="38" cy="34" r="4" fill="#ff7c8c" /><circle cx="31" cy="50" r="2" fill="#ffe2c8" /></>;
  if (item === "part:soft-fiber") return <><path d="M10 39c-5-12 7-22 18-16 1-13 21-14 24-2 13 1 15 19 4 25-7 12-38 13-46-7z" fill="#e7e0d6" stroke="#706d6b" strokeWidth="2" /><path d="M18 34c6-7 12 3 18-5s13 2 18-4M17 45c8-6 13 3 21-4" fill="none" stroke="#b7aaa1" strokeWidth="3" /></>;
  if (item === "part:rift-core") return <><path d="M32 3l10 16 15 8-10 13 1 18-16-8-16 8 1-18L7 27l15-8z" fill="#744ba8" stroke="#251b31" strokeWidth="2" /><path d="M32 12l8 18-8 13-8-13z" fill="#f18a5a" /><circle cx="32" cy="30" r="5" fill="#fff1c2" /></>;
  if (item === "part:flux-coil") return <><circle cx="32" cy="32" r="20" fill="none" stroke="#d37a53" strokeWidth="7" /><circle cx="32" cy="32" r="9" fill="#74e9e0" /><path d="M7 32h10M47 32h10" stroke="#ffcf8b" strokeWidth="4" /></>;
  if (item === "part:logic-wafer") return <><rect x="14" y="14" width="36" height="36" rx="3" fill="#4f8c89" stroke="#142426" strokeWidth="2" /><rect x="23" y="23" width="18" height="18" fill="#96fff0" /><path d="M7 21h11M7 32h11M7 43h11M46 21h11M46 32h11M46 43h11" stroke="#d37a53" strokeWidth="3" /></>;
  if (item === "part:gear") return <><path d="M28 5h8l3 9 8-4 7 7-4 8 9 3v8l-9 3 4 8-7 7-8-4-3 9h-8l-3-9-8 4-7-7 4-8-9-3v-8l9-3-4-8 7-7 8 4z" fill="#cf8b59" /><circle cx="32" cy="32" r="10" fill="#263b3f" /></>;
  if (item === "part:moonshard") return <><path d="M33 3l17 20-13 38-21-25z" fill="#7d91d2" stroke="#1f2947" strokeWidth="2" /><path d="M33 3l4 58-10-29z" fill="#cbd6ff" /><path d="M16 36l34-13" stroke="#edf2ff" strokeWidth="3" /></>;
  if (item === "part:carapace") return <><path d="M8 32C14 9 50 8 57 32 51 55 15 57 8 32z" fill="#667f4f" stroke="#263521" strokeWidth="2" /><path d="M32 12v41M14 26h36M16 40h32" stroke="#b0d37b" strokeWidth="3" /></>;
  if (item === "part:cinder-core") return <><path d="M32 3l8 17 14 7-9 13 2 18-15-8-15 8 2-18-9-13 14-7z" fill="#bf4e3f" /><path d="M32 13l10 18-10 11-10-11z" fill="#ffb34d" /></>;
  if (item === "part:feather") return <><path d="M52 7C29 8 14 23 12 51c12-2 27-12 34-25 4-7 6-13 6-19z" fill="#eef2e8" stroke="#46545a" strokeWidth="2" /><path d="M9 58L44 18M17 44l14 1M24 34l13 1M31 24l10 1" fill="none" stroke="#9ba9aa" strokeWidth="3" /></>;
  if (item === "currency:frontier-mark") return <><circle cx="32" cy="32" r="25" fill="#d7a83b" stroke="#493817" strokeWidth="3" /><circle cx="32" cy="32" r="18" fill="#efca63" stroke="#9b7629" strokeWidth="2" /><path d="M32 15l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#fff0a3" stroke="#9d7428" strokeWidth="2" /></>;
  if (item === "ammo:aether-bolt") return <><path d="M6 38l41-22 6 9-41 22z" fill="#8ff9ed" /><path d="M45 11l15 3-7 13z" fill="#c7d4ff" /></>;
  if (item === "food:starfruit") return <><path d="M32 4l8 18 19 1-15 13 5 19-17-10-17 10 5-19L5 23l19-1z" fill="#e785b2" stroke="#5b2c47" strokeWidth="2" /><circle cx="31" cy="30" r="9" fill="#ffd37e" /></>;
  if (item === "food:glowcut") return <><path d="M8 34c8-19 39-23 48-5-3 22-35 30-48 5z" fill="#68aaa0" /><path d="M17 32c10-9 24-10 31-2-5 12-22 16-31 2z" fill="#d0fff3" /></>;
  if (item === "food:pork") return <><path d="M7 35c5-17 25-26 43-17 12 6 7 26-5 33-15 9-34 1-38-16z" fill="#d98d8b" stroke="#552f33" strokeWidth="2" /><path d="M17 31c9-9 24-10 32-2-3 13-20 19-32 2z" fill="#f4bbb1" /><path d="M28 19c5 4 10 3 15 1" fill="none" stroke="#fff0e8" strokeWidth="3" /></>;
  if (item === "food:chicken") return <><path d="M17 18c15-10 33 2 31 17-2 17-22 25-35 15-9-8-6-25 4-32z" fill="#d8a77d" stroke="#56392e" strokeWidth="2" /><path d="M42 17l12-8 4 5-11 12M16 47L7 57" fill="none" stroke="#eee0c8" strokeWidth="5" /><path d="M20 22c8-4 17 1 20 8" fill="none" stroke="#f0c9a3" strokeWidth="3" /></>;
  if (item === "consumable:mender-tonic") return <><path d="M23 8h18v10l7 8v30H16V26l7-8z" fill="#6cc9c0" stroke="#1d4545" strokeWidth="2" /><rect x="24" y="3" width="16" height="9" fill="#d7a66d" /><path d="M32 29v19M23 38h18" stroke="#f4fff6" strokeWidth="5" /></>;
  return <circle cx="32" cy="32" r="22" fill="#8fa0a2" stroke="#1b292c" strokeWidth="3" />;
}

export function ItemArt({ item }: { item: ItemId }) {
  const blockId = blockForItem(item);
  return (
    <span className="item-art">
      {blockId === null
        ? <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><NonBlockItemArt item={item} /></svg>
        : <BlockItemArt id={blockId} />}
    </span>
  );
}
