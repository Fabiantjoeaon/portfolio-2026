import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

// Sample these functions from the existing render clock, including in workers.
// No additional ticker or per-frame tween allocation is needed.
export const EASE_CUSTOM_1 = CustomEase.create("customEase1", ".25, .46, .45, .94");
export const EASE_CUSTOM_2 = CustomEase.create("customEase2", ".19, 1, .22, 1");
export const EASE_CUSTOM_3 = CustomEase.create("customEase3", ".77, 0, .175, 1");
export const EASE_CUSTOM_4 = CustomEase.create("customEase4", ".22, 1, .36, 1");
export const EASE_CUSTOM_5 = CustomEase.create("customEase5", ".215, 1.61, .355, 1");

// Shared default for DOM reveals, rules, navigation, and smooth scrolling.
export const CUSTOM_EASE = EASE_CUSTOM_4;

// Page choreography: gentle acceleration with a longer, soft settle.
export const PAGE_EASE = CustomEase.create("pageEase", ".42, 0, .22, 1");
export const timingEase = (name) => gsap.parseEase(name);
