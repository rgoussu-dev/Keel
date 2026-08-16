/** Command carrying the visitor to record. Commands are plain data. */
export interface SignCommand {
  readonly visitor: string;
}

/** What the guestbook recorded: who signed, and how they were welcomed. */
export interface Entry {
  readonly visitor: string;
  readonly welcome: string;
}

/**
 * The driven port through which this context obtains the words it
 * records.
 *
 * Declared in **guestbook's** vocabulary, and that is the point: this
 * context asks for a welcome and does not know — must not know — that
 * another bounded context composes greetings. Which one does is a
 * fact of the gateway under `src/infra/` and of the assembly, and of
 * nowhere else.
 */
export interface Welcome {
  /** The words to record for `visitor`, or null if none could be had. */
  welcomeFor(visitor: string): string | null;
}

/** Driving port for the sign use case. */
export interface Sign {
  execute(command: SignCommand): void;
}

/** Detaches a listener registered via {@link EntriesReadModel.subscribe}. */
export type Unsubscribe = () => void;

/** Read model over the guestbook's entries. */
export interface EntriesReadModel {
  /** The latest entry, or null before the first signing. */
  latest(): Entry | null;
  /** Registers a listener called on every new entry. */
  subscribe(listener: (entry: Entry) => void): Unsubscribe;
}
