import { ItemId } from "./types";

export interface WeaponStats {
  damage: number;
  reach: number;
  cooldown: number;
  knockback: number;
  ammo?: ItemId;
}

const UNARMED: WeaponStats = {
  damage: 2,
  reach: 3.35,
  cooldown: 0.48,
  knockback: 2.2,
};

const WEAPONS: Partial<Record<ItemId, WeaponStats>> = {
  "tool:wood-pick": { damage: 3, reach: 3.4, cooldown: 0.62, knockback: 2.4 },
  "tool:wood-hatchet": { damage: 4, reach: 3.4, cooldown: 0.64, knockback: 2.7 },
  "tool:wood-spade": { damage: 2.5, reach: 3.5, cooldown: 0.58, knockback: 2.3 },
  "tool:wood-club": { damage: 5, reach: 3.65, cooldown: 0.54, knockback: 3.4 },
  "tool:rough-pick": { damage: 4, reach: 3.55, cooldown: 0.55, knockback: 2.7 },
  "tool:copper-pick": { damage: 5, reach: 3.55, cooldown: 0.52, knockback: 2.8 },
  "tool:crystal-pick": { damage: 7, reach: 3.65, cooldown: 0.46, knockback: 3 },
  "tool:hatchet": { damage: 6, reach: 3.45, cooldown: 0.58, knockback: 3.1 },
  "tool:spade": { damage: 3, reach: 3.55, cooldown: 0.52, knockback: 2.7 },
  "tool:blade": { damage: 8, reach: 3.7, cooldown: 0.38, knockback: 3.7 },
  "tool:stone-spear": { damage: 9, reach: 4.8, cooldown: 0.62, knockback: 4.4 },
  "tool:copper-saber": { damage: 13, reach: 4.05, cooldown: 0.42, knockback: 4.8 },
  "tool:aether-repeater": {
    damage: 12,
    reach: 18,
    cooldown: 0.68,
    knockback: 5.8,
    ammo: "ammo:aether-bolt",
  },
};

export function weaponStats(item: ItemId | null): WeaponStats {
  return item ? WEAPONS[item] ?? UNARMED : UNARMED;
}
