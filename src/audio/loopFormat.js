/**
 * Seconds of wrap-around audio on both sides of a processed loop
 * (scripts/audio/loops.mjs). Players loop from LOOP_PAD to LOOP_PAD + length,
 * so a decoder shift (untrimmed MP3 priming) still lands in continuous audio.
 */
export const LOOP_PAD = 0.25;
