# Version 10.1 — Mobile Input Patch

Version 10.1 is a focused mobile-controls patch for Realmworks. It does not change world generation, save keys, room codes, or multiplayer protocol compatibility.

## Fixes

- Pause now renders above the mobile landscape look surface and remains tappable in horizontal orientation.
- Opening a Tinker Bench, chest, machine, merchant, inventory, guide, or pause panel clears movement and held transient actions at the engine boundary. A Place / Use pointer that disappears with the touch controls can no longer remain latched after the panel closes.
- Pointer cancellation and lost pointer capture also release every individual mobile action button.
- Switching apps or hiding the page releases transient controls as well.

## Mobile controls

- Run returns as a separate button beside the movement stick. It reflects toggle-sprint state and still supports hold-to-run when toggle sprint is disabled.
- **Hold the touched block to mine** is enabled by default and can be switched off under Options → Controls & HUD.
- A 360 ms hold ring distinguishes direct mining from ordinary camera look. Moving more than 12 screen pixels cancels the mining gesture and continues looking.
- Direct mining casts through the actual touched screen point. The Attack and Place / Use buttons continue to use the center crosshair.

## Compatibility and validation

- Package version: `0.10.1`
- Save format remains `VF2`; existing Version 10 worlds and browser profiles continue to work.
- Multiplayer protocol remains Version 10.
- The regression suite covers transient action release, sprint preservation/release, touch-to-ray coordinate mapping, drag cancellation, and the intentional-hold delay.
