import Renderer from "@/offscreen/renderer";

import * as Comlink from "comlink";
import virtualElement from "@/offscreen/dispatcher/helpers/virtualElement";
import dispatcher from "@/shared/dispatcher.js";
import { store } from "@/offscreen/store.js";
import Site from "@/offscreen/site.js";
import { setQueryString } from "@/offscreen/lib/query.js";

async function initOffscreen(canvas, isWebGPU, search = "") {
  setQueryString(search);

  let success = false;
  try {
    const gl = new Renderer({ canvas, isWebGPU });
    await gl.init();

    new Site({
      gl,
    });
    success = true;
  } catch (error) {
    console.error(error);
  }

  return success;
}

function trigger(event, data) {
  // event.log = true;
  dispatcher.trigger(event, data);

  if (event.name === "resize") {
    virtualElement.setSize(data.width, data.height);
  }

  if (event.name === "scroll") {
    store.scroll = data.progress;
  }

  if (event.fireVirtualEvents) {
    virtualElement.dispatchEvent({
      ...data,
      target: virtualElement,
    });
  }
}

// High-frequency events that originate on the main thread; echoing them back
// through the Comlink proxy would create a MessageChannel per trigger
const MAIN_ORIGIN_EVENTS = new Set([
  "projectVideoFrame", "resize", "scroll", "workerReady", "initDebug",
  "click", "contextmenu", "dblclick", "wheel", "pointerdown", "pointerup",
  "pointerleave", "pointermove", "pointercancel", "lostpointercapture",
  "openProject", "closeProject", "openAbout", "closeAbout", "gotoScene",
  "pageScroll", "navigatePage", "projectGallery", "pageContentExited",
]);

function subscribeToAllEvents(cb) {
  const registeredHandlers = {}; // Store references to handlers

  const eventHandler = (eventName) => {
    if (!registeredHandlers[eventName]) {
      registeredHandlers[eventName] = (eventData) => {
        // If eventData is a Proxy then ignore because it comes from the mainthread
        if (eventData && eventData[Comlink.proxyMarker]) {
          return;
        }

        if (eventName) {
          cb({
            name: eventName,
            // These notifications are data snapshots, not remote objects.
            // Avoid a MessageChannel allocation for every progress/event.
            data: eventData,
          });
        }
      };
    }

    return registeredHandlers[eventName];
  };

  const handleNewEvent = (data) => {
    const { newEvent } = data;
    if (newEvent !== "newEventRegistered" && !MAIN_ORIGIN_EVENTS.has(newEvent)) {
      const handler = eventHandler(newEvent);
      if (!dispatcher.isHandlerRegistered(newEvent, handler)) {
        dispatcher.on(newEvent, handler);
      }
    }
  };

  // Subscribe to the special event for new event registrations
  dispatcher.on("newEventRegistered", handleNewEvent);

  // Subscribe to all existing events
  for (const eventName in dispatcher.listeners) {
    if (MAIN_ORIGIN_EVENTS.has(eventName)) continue;
    const handler = eventHandler(eventName);
    if (!dispatcher.isHandlerRegistered(eventName, handler)) {
      dispatcher.on(eventName, handler);
    }
  }
}

// Usage

const workerApi = {
  initOffscreen,
  trigger,
  subscribeToAllEvents,
};

Comlink.expose(workerApi);
