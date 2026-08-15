import {
  DomainError,
  err,
  type Command,
  type Handler,
  type Mediator,
  type Result,
  type ResultOf,
} from './kernel.ts';

/**
 * The one dispatch seam: probes each handler's `supports` type guard
 * and routes to the single match. Handlers self-declare; nothing
 * injects a map keyed by command kind.
 *
 * It sits in `platform/kernel` rather than inside a context because
 * no context owns dispatch — every module contributes handlers to it,
 * and the assembly is what puts them together.
 */
export function createRegistryMediator(handlers: readonly Handler[]): Mediator {
  return {
    dispatch<C extends Command>(command: C): Promise<Result<ResultOf<C>>> {
      const handler = handlers.find((h) => h.supports(command));
      if (!handler) {
        return Promise.resolve(
          err(
            new DomainError(`no handler supports command '${command.kind}'`, 'kernel.no-handler'),
          ),
        );
      }
      return handler.handle(command) as Promise<Result<ResultOf<C>>>;
    },
  };
}
