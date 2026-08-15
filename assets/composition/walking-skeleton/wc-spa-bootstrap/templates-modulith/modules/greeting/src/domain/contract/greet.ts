/** Command carrying the name to greet. Commands are plain data. */
export interface GreetCommand {
  readonly name: string;
}

/** A greeting produced by the domain. */
export interface Greeting {
  readonly message: string;
}

/**
 * Driving port for the greet use case. Elements construct a
 * {@link GreetCommand} from DOM input and hand it to this port; the
 * outcome surfaces through the {@link GreetingReadModel}.
 */
export interface Greet {
  execute(command: GreetCommand): void;
}

/** Detaches a listener registered via {@link GreetingReadModel.subscribe}. */
export type Unsubscribe = () => void;

/**
 * Read model over the latest greeting. The subscription is the
 * reactivity: elements subscribe in `connectedCallback`, patch only
 * what changed, and unsubscribe in `disconnectedCallback`.
 */
export interface GreetingReadModel {
  /** The latest greeting, or null before the first command. */
  current(): Greeting | null;
  /** Registers a listener called on every new greeting. */
  subscribe(listener: (greeting: Greeting) => void): Unsubscribe;
}
