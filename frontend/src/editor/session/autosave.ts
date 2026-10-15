/**
 * Autosave (docs/0089 choice 3): about a second after the last change, the store's pending
 * changes go to the server one changeset each, oldest first (docs/0081). One change per
 * changeset means a refusal names exactly the change to take back (docs/0090).
 *
 * Refusals: a stale draft makes the editor reload it; a refused change is taken back (the
 * later ones stay) and reported; a lost lock pauses saving and keeps the changes for Retry; a
 * network failure retries every few seconds.
 */
import { createStore } from "zustand/vanilla";

import { api } from "@/api/client";
import { asProblem, type Problem, problemSlug } from "@/api/problems";
import type { EditorStore, PendingChange } from "@/editor/core/store";

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
  /** The server refused a change (e.g. a broken rule); it has been taken back already. */
  onRejected(problem: Problem | null, change: PendingChange, dropped: PendingChange[]): void;
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
      if (s.pending.length > before.pending.length) this.schedule(SAVE_DELAY_MS);
    });
  }

  /** The draft revision everything so far was saved at (publish needs it, docs/0082). */
  get savedRevision(): number {
    return this.revision;
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
    this.sending = this.sendAll().finally(() => (this.sending = null));
    await this.sending;
  }

  private async sendAll(): Promise<void> {
    while (!this.stopped && !this.paused && this.store.getState().pending.length) {
      if (!(await this.sendFirst())) return;
    }
    if (!this.stopped && !this.paused) this.set("saved");
  }

  /** Sends the oldest pending change; returns whether to go on with the next one. */
  private async sendFirst(): Promise<boolean> {
    const change = this.store.getState().pending[0]!;
    this.set("saving");
    let result;
    try {
      result = await api.POST("/api/v1/floors/{floor_id}/draft/changesets", {
        params: { path: { floor_id: this.floorId } },
        body: { base_revision: this.revision, ops: change.ops as never },
      });
    } catch {
      this.set("offline");
      this.schedule(RETRY_MS);
      return false;
    }
    if (this.stopped) return false;
    const { data, error, response } = result;
    if (data) {
      this.revision = data.revision;
      this.state.setState({ version: data.version });
      this.store.getState().confirmFirst();
      return true;
    }
    const problem = asProblem(error);
    const slug = problemSlug(problem);
    if (response.status === 423 || slug === "lock-required") {
      this.pause();
      this.events.onLockLost();
      return false;
    }
    if (slug === "stale-revision") {
      this.stop();
      this.events.onStale();
      return false;
    }
    if (response.status >= 500) {
      this.set("offline");
      this.schedule(RETRY_MS);
      return false;
    }
    const taken = this.store.getState().rejectFirst();
    if (taken) this.events.onRejected(problem, taken.rejected, taken.dropped);
    return true;
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
    if (this.store.getState().pending.length) this.schedule(0);
    else this.set("saved");
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
  }
}
