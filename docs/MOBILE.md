I didn't get a separate description of the tile wall, so this is based on what the Cursor plan showed: the Grid works out pointerTile from the pointer, hovering a project tile plays its video and lights up the scene, and Site.onClick opens whichever project is hovered.

The least invasive fix is to keep the hover system and give it a fake pointer on mobile. Right now the pointer decides which tile is "hovered". On mobile, a fixed point at the center of the screen takes that role, and the user moves the wall under it.

How it works on mobile

Drag to pan. Swiping moves the camera across the wall, with some inertia. When you let go, it snaps so the nearest project tile lands in the center.
The center tile is the hovered tile. Feed the screen center into the existing \_updatePointer() as if it were the mouse. The video, the scene lighting up and the audio all go through the code that already exists, with no second code path.
Tap to open. Tapping the tile in the center opens the project. Tapping a different tile first pans it to the center, so it plays its video, and a second tap opens it. You always see the lit-up preview before going to the project page, which is what you wanted.
Short delay before previewing. Only start the video and light-up once a tile has been centered for about 250 to 400 ms, or once the snap has finished. Otherwise, swiping across the wall starts and stops videos on every tile.

Fixing "too many tiles"

On mobile, move the camera closer so only about 3 to 4 columns are visible and the tiles are big enough to tap. You don't have to change the grid itself.
Snap only to project tiles and skip the filler ones. Your existing layout then works like a carousel on mobile.
Optionally, lock panning to one axis, or run a single horizontal row of projects through the wall. That turns it into a simple swipe list without changing the visuals.

Things that trip up mobile specifically

Detect by capability, not screen width. Use matchMedia('(hover: none) and (pointer: coarse)'), so an iPad with a trackpad still gets the hover behavior.
Video. Videos need muted playsinline. Preload only the centered tile and its neighbours, use lower-resolution versions on mobile, and pause everything that isn't centered. iOS limits how many videos can play at once.
Show the title and a hint. On desktop the cursor makes it obvious what you're about to open. On mobile, add a small title and "Tap to open" label under the centered tile.
A tap is not a hover. Mobile browsers send fake mouse events after a tap. Make sure a tap doesn't both set the hover and trigger the click in one go, or the preview gets skipped.
Performance. Cap the pixel density at 1.5 to 2 on mobile, since the wall plus video plus the light-up effect is heavy.
Audio. Your tile-hover click sound should fire when the centered tile changes, and since that goes through the same hover code it will happen on its own. Throttle it, because snapping can pass several tiles quickly.

What changes in the code

An input adapter: on touch devices, send the screen center (instead of the pointer) into Grid.
Drag-to-pan with inertia and snapping for the camera.
A mobile camera distance setting.
onClick gets "tap on a tile that isn't centered → pan to it; tap on the centered tile → open".
