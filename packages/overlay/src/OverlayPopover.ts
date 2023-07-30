/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
import {
    firstFocusableIn,
    firstFocusableSlottedIn,
} from '@spectrum-web-components/shared/src/first-focusable-in.js';
import { ReactiveElement } from 'lit';
import { VirtualTrigger } from './VirtualTrigger.js';
import {
    Constructor,
    OpenableElement,
    OverlayOpenCloseDetail,
} from './overlay-types.js';
import {
    BeforetoggleClosedEvent,
    BeforetoggleOpenEvent,
    guaranteedAllTransitionend,
    overlayTimer,
} from './AbstractOverlay.js';
import type { AbstractOverlay } from './AbstractOverlay.js';

function nextFrame(): Promise<void> {
    return new Promise((res) => requestAnimationFrame(() => res()));
}

export function OverlayPopover<T extends Constructor<AbstractOverlay>>(
    constructor: T
): T & Constructor<ReactiveElement> {
    class OverlayWithPopover extends constructor {
        protected override async managePopoverOpen(): Promise<void> {
            const targetOpenState = this.open;
            if (this.open !== targetOpenState) {
                return;
            }
            await this.manageDelay(targetOpenState);
            if (this.open !== targetOpenState) {
                return;
            }
            await this.ensureOnDOM(targetOpenState);
            if (this.open !== targetOpenState) {
                return;
            }
            const focusEl = await this.makeTransition(targetOpenState);
            if (this.open !== targetOpenState) {
                return;
            }
            await this.applyFocus(targetOpenState, focusEl);
        }

        private async manageDelay(targetOpenState: boolean): Promise<void> {
            if (targetOpenState === false || targetOpenState !== this.open) {
                overlayTimer.close(this);
                return;
            }
            if (this.delayed) {
                const cancelled = await overlayTimer.openTimer(this);
                if (cancelled) {
                    this.open = !targetOpenState;
                }
            }
        }

        private async shouldHidePopover(
            targetOpenState: boolean
        ): Promise<void> {
            if (targetOpenState && this.open !== targetOpenState) {
                return;
            }
            // When in a parent Overlay, this Overlay may need to position itself
            // while closing in due to the parent _also_ closing which means the
            // location can no longer rely on "top layer over transform" math.
            await this.placementController.resetOverlayPosition();
        }

        private async shouldShowPopover(
            targetOpenState: boolean
        ): Promise<void> {
            let popoverOpen = false;
            try {
                popoverOpen = this.dialogEl.matches(':popover-open');
                // eslint-disable-next-line no-empty
            } catch (error) {}
            let open = false;
            try {
                open = this.dialogEl.matches(':open');
                // eslint-disable-next-line no-empty
            } catch (error) {}
            if (
                targetOpenState &&
                this.open === targetOpenState &&
                !popoverOpen &&
                !open &&
                this.isConnected
            ) {
                this.dialogEl.showPopover();
                await this.managePosition();
            }
        }

        private async ensureOnDOM(targetOpenState: boolean): Promise<void> {
            await nextFrame();
            await this.shouldHidePopover(targetOpenState);
            await this.shouldShowPopover(targetOpenState);
            await nextFrame();
        }

        private async makeTransition(
            targetOpenState: boolean
        ): Promise<HTMLElement | null> {
            if (this.open !== targetOpenState) {
                return null;
            }
            let focusEl = null as HTMLElement | null;
            const start = (el: OpenableElement, index: number) => (): void => {
                if (typeof el.open !== 'undefined') {
                    el.open = targetOpenState;
                }
                if (index === 0) {
                    const event = targetOpenState
                        ? BeforetoggleOpenEvent
                        : BeforetoggleClosedEvent;
                    this.dispatchEvent(new event());
                }
                if (!targetOpenState) {
                    return;
                }
                focusEl = focusEl || firstFocusableIn(el);
                if (focusEl) {
                    return;
                }
                const childSlots = el.querySelectorAll('slot');
                childSlots.forEach((slot) => {
                    if (!focusEl) {
                        focusEl = firstFocusableSlottedIn(slot);
                    }
                });
            };
            const finish =
                (el: OpenableElement, index: number) =>
                async (): Promise<void> => {
                    if (this.open !== targetOpenState) {
                        return;
                    }
                    const eventName = targetOpenState
                        ? 'sp-opened'
                        : 'sp-closed';
                    this.isVisible = this.isVisible && targetOpenState;
                    if (index > 0) {
                        el.dispatchEvent(
                            new CustomEvent<OverlayOpenCloseDetail>(eventName, {
                                bubbles: false,
                                composed: false,
                                detail: { interaction: this.type },
                            })
                        );
                        return;
                    }
                    const reportChange = async (): Promise<void> => {
                        if (this.open !== targetOpenState) {
                            return;
                        }
                        await nextFrame();
                        const hasVirtualTrigger =
                            this.triggerElement instanceof VirtualTrigger;
                        this.dispatchEvent(
                            new Event(eventName, {
                                bubbles: hasVirtualTrigger,
                                composed: hasVirtualTrigger,
                            })
                        );
                        el.dispatchEvent(
                            new Event(eventName, {
                                bubbles: false,
                                composed: false,
                            })
                        );
                        if (this.triggerElement && !hasVirtualTrigger) {
                            (this.triggerElement as HTMLElement).dispatchEvent(
                                new CustomEvent<OverlayOpenCloseDetail>(
                                    eventName,
                                    {
                                        bubbles: true,
                                        composed: true,
                                        detail: { interaction: this.type },
                                    }
                                )
                            );
                        }
                    };
                    if (this.open !== targetOpenState) {
                        return;
                    }
                    let popoverOpen = false;
                    try {
                        popoverOpen = this.dialogEl.matches(':popover-open');
                        // eslint-disable-next-line no-empty
                    } catch (error) {}
                    let open = false;
                    try {
                        open = this.dialogEl.matches(':open');
                        // eslint-disable-next-line no-empty
                    } catch (error) {}
                    if (
                        targetOpenState !== true &&
                        (popoverOpen || open) &&
                        this.isConnected
                    ) {
                        this.dialogEl.addEventListener(
                            'beforetoggle',
                            () => {
                                reportChange();
                            },
                            { once: true }
                        );
                        this.dialogEl.hidePopover();
                    } else {
                        reportChange();
                    }
                };
            this.elements.forEach((el, index) => {
                guaranteedAllTransitionend(
                    el,
                    start(el, index),
                    finish(el, index)
                );
            });
            return focusEl;
        }

        private async applyFocus(
            targetOpenState: boolean,
            focusEl: HTMLElement | null
        ): Promise<void> {
            // Do not move focus when explicitly told not to
            // and when the Overlay is a "hint"
            if (this.receivesFocus === 'false' || this.type === 'hint') {
                return;
            }

            await nextFrame();
            await nextFrame();
            if (targetOpenState === this.open && !this.open) {
                if (
                    // Only return focus when the trigger is not "virtual"
                    this.triggerElement &&
                    !(this.triggerElement instanceof VirtualTrigger)
                ) {
                    if (
                        this.contains(
                            (this.getRootNode() as Document).activeElement
                        )
                    ) {
                        this.triggerElement.focus();
                    }
                }
                return;
            }

            focusEl?.focus();
        }
    }
    return OverlayWithPopover;
}
