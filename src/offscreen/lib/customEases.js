import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { easingDefinitions } from '@/shared/timings';

gsap.registerPlugin(CustomEase);

const registered = Object.fromEntries(easingDefinitions.map(({ name, curve }) => [
  name,
  curve ? CustomEase.create(name, curve) : gsap.parseEase(name),
]));

// Sample these functions from the existing render clock, including in workers.
// No additional ticker or per-frame tween allocation is needed.
export const EASE_CUSTOM_1 = registered.customEase1;
export const EASE_CUSTOM_2 = registered.customEase2;
export const EASE_CUSTOM_3 = registered.customEase3;
export const EASE_CUSTOM_4 = registered.customEase4;
export const EASE_CUSTOM_5 = registered.customEase5;

// Shared default for DOM reveals, rules, navigation, and smooth scrolling.
export const CUSTOM_EASE = EASE_CUSTOM_4;

// Page choreography: gentle acceleration with a longer, soft settle.
export const PAGE_EASE = registered.pageEase;
export const timingEase = (name) => gsap.parseEase(name);
