import { EventDispatcher } from "three";
import { component } from "./component";

/**
 * @description: no operate, for event.preventDefault、event.stopPropagation
 */
const noOperate = () => {};

/**
 * @description: Virtual HTMLElement for web worker
 * @extends EventDispatcher
 */
class VirtualElement extends component(EventDispatcher) {
  constructor() {
    super();

    this.ownerDocument = this;

    this.top = 0;
    this.left = 0;
    this.width = 1000;
    this.height = 1000;
    this.style = {};
    this.releasePointerCapture = noOperate;
  }

  get clientWidth() {
    return Math.round(this.width);
  }

  get clientHeight() {
    return Math.round(this.height);
  }

  setPointerCapture() {
    //no operate
  }

  onResize({ width, height }) {
    this.setSize(width, height);
  }

  getRootNode() {
    return this;
  }
  getBoundingClientRect() {
    return {
      top: this.top,
      left: this.left,
      width: this.width,
      height: this.height,
      right: this.left + this.width,
      bottom: this.top + this.height,
    };
  }

  focus() {
    //no operate
  }

  setSize(width, height) {
    this.height = height;
    this.width = width;
  }

  /**
   * @description: override dispatchEvent
   * @param {{type:string,[key:string]:any}} event
   */
  dispatchEvent(event) {
    if (event.type === "resize") {
      this.left = event.left;
      this.top = event.top;
      this.width = event.width;
      this.height = event.height;
      //return
    }

    event.preventDefault = noOperate;
    event.stopPropagation = noOperate;

    super.dispatchEvent(event);
  }
}

export default new VirtualElement();
