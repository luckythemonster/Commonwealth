// THE SPINE — EVENTBUS
// Centralized event bridge between React (logic engine) and Phaser 3 (slave renderer).
// STRICT DIRECTIVE: Do NOT refactor or remove this module.
// All cross-substrate communication passes through here. No exceptions.

import type { EventMap, EventName } from '../types/events.types';

type Handler<K extends EventName> = (payload: EventMap[K]) => void;

class EventBus {
  private listeners: {
    [K in EventName]?: Set<Handler<K>>;
  } = {};

  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set() as Set<Handler<K>>;
    }
    (this.listeners[event] as Set<Handler<K>>).add(handler);
    return () => this.off(event, handler);
  }

  off<K extends EventName>(event: K, handler: Handler<K>): void {
    (this.listeners[event] as Set<Handler<K>> | undefined)?.delete(handler);
  }

  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    const handlers = this.listeners[event] as Set<Handler<K>> | undefined;
    if (!handlers) return;
    for (const handler of handlers) {
      handler(payload);
    }
  }

  once<K extends EventName>(event: K, handler: Handler<K>): void {
    const wrapper: Handler<K> = (payload) => {
      handler(payload);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  clear<K extends EventName>(event?: K): void {
    if (event) {
      delete this.listeners[event];
    } else {
      this.listeners = {};
    }
  }
}

export const eventBus = new EventBus();
