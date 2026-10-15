/**
 * Autosave (docs/0089 choice 3): about a second after the last change, everything in the
 * store's outbox goes to the server as one changeset (docs/0081). One request at a time; what
 * piles up meanwhile goes in the next one.
 *
 * Refusals: a stale draft or a rejected change makes the editor reload the draft; a lost lock
 * pauses saving and keeps the changes for Retry; a network failure retries every few seconds.
 */
import { createStore } from "zustand/vanilla";

import { api } from "@/api/client";
import { asProblem, type Problem, problemSlug } from "@/api/problems";
import type { EditorStore } from "@/editor/core/store";

export const SAVE_DELAY_MS = 1000;
export const RETRY_MS = 5000;

export type SaveStatus = "saved" | "pending" | "saving" | "offline" | "paused";

export interface SaveState {
  status: SaveStatus;
  /** The draft's number, once there is a draft. */
  version: number | null;
}

export interface AutosaveEvents {
  /** The draft changed elsewhere (409 stale-revision): reload it. */
  onStale(): void;
  /** Someone took the lock, or it expired: saving waits for the lock again. */
  onLockLost(): void;
  /** The server refused the change (e.g. a broken rule): reload the draft and say why. */
  onRejected(problem: Problem | null): void;
}

export class Autosave {
  readonly state = createStore<SaveState>()(() => ({ status: "saved", version: null }));
  private revision: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending: Promise<void> | null = null;
  private paused = false;
  private stopped = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly store: EditorStore,
    private readonly floorId: string,
    /** The draft revision the document was loaded at; 0 when there's no draft yet. */
    base: { revision: number; version: number | null },
    private readonly events: AutosaveEvents,
  ) {
    this.revision = base.revision;
    this.state.setState({ version: base.version });
    this.unsubscribe = store.subscribe((s, before) => {
      if (s.outbox.length && s.outbox !== before.outbox) this.schedule(SAVE_DELAY_MS);
    });
  }

  private set(status: SaveStatus): void {
    this.state.setState({ status });
  }

  private schedule(delay: number): void {
    if (this.stopped || this.paused) return;
    if (this.state.getState().status !== "offline") this.set("pending");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  /** Sends whatever is waiting now; resolves once it's saved (or couldn't be). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.sending) await this.sending;
    if (this.stopped || this.paused || !this.store.getState().outbox.length) return;
    this.sending = this.send().finally(() => (this.sending = null));
    await this.sending;
  }

  private async send(): Promise<void> {
    const ops = this.store.getState().takeOutbox();
    this.set("saving");
    let result;
    try {
      result = await api.POST("/api/v1/floors/{floor_id}/draft/changesets", {
        params: { path: { floor_id: this.floorId } },
        body: { base_revision: this.revision, ops: ops as never },
      });
    } catch {
      this.store.getState().returnToOutbox(ops);
      this.set("offline");
      this.schedule(RETRY_MS);
      return;
    }
    if (this.stopped) return;
    const { data, error, response } = result;
    if (data) {
      this.revision = data.revision;
      this.state.setState({ version: data.version });
      if (this.store.getState().outbox.length) this.schedule(SAVE_DELAY_MS);
      else this.set("saved");
      return;
    }
    const problem = asProblem(error);
    const slug = problemSlug(problem);
    if (response.status === 423 || slug === "lock-required") {
      this.store.getState().returnToOutbox(ops);
      this.pause();
      this.events.onLockLost();
    } else if (slug === "stale-revision") {
      this.stop();
      this.events.onStale();
    } else if (response.status >= 500) {
      this.store.getState().returnToOutbox(ops);
      this.set("offline");
      this.schedule(RETRY_MS);
    } else {
      this.stop();
      this.events.onRejected(problem);
    }
  }

  /** Stops sending (the lock is gone) but keeps what's waiting. */
  pause(): void {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.set("paused");
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.store.getState().outbox.length) this.schedule(0);
    else this.set("saved");
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
  }
}
