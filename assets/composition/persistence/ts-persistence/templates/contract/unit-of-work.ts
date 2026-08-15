/**
 * The transactional boundary as a domain concept — a secondary port
 * shaped as a Unit of Work. Handlers wrap the state-changing work of
 * one command in {@link UnitOfWork.inTransaction} so every port
 * touched inside the block commits or rolls back together. How
 * atomicity is achieved (a database transaction, a session) is an
 * adapter concern behind this interface — the domain only decides
 * where the boundary sits.
 */
export interface UnitOfWork {
  /**
   * Runs `work` as one atomic unit: committed when the promise
   * resolves, rolled back when it rejects. Resolves with the block's
   * result; rejections propagate unchanged after rollback.
   */
  inTransaction<T>(work: () => Promise<T>): Promise<T>;
}
