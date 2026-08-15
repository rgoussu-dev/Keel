//! Shared plumbing that belongs to no bounded context.
//!
//! Anything in here is, by construction, something every module may
//! depend on — so the bar for adding to it is high. A type earns its
//! place when it has no owner: `BoxFuture` is a spelling, not a
//! domain concept, and a clock belongs to nobody. Business vocabulary
//! never does, however tempting the reuse: the moment `platform` owns
//! a domain type, every module has a legal edge to it and the walls
//! that `modules/` buys are gone.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};
use std::thread::{self, Thread};

/// The return type every asynchronous port declares.
///
/// This alias exists because `async fn` in a trait is **not
/// dyn-compatible**: a trait declaring one cannot be used as `dyn
/// Trait`, so the moment an adapter is wired behind `Arc<dyn Port>`
/// at an assembly point — which is how every port here is wired — the
/// project stops compiling. Returning a boxed future keeps the trait
/// object-safe at the cost of one allocation per call, which is the
/// right trade for a port crossing a hexagon boundary.
///
/// Write ports as:
///
/// ```ignore
/// fn fetch(&self, id: &str) -> BoxFuture<'_, Result<Thing, Error>>;
/// ```
///
/// and implement them with the [`boxed!`] macro.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Wraps an async block in the shape [`BoxFuture`] wants.
///
/// `boxed! { … }` is `Box::pin(async move { … })`. Inside the block
/// `.await` works normally, so an implementation reads like an
/// ordinary async fn body.
#[macro_export]
macro_rules! boxed {
    ($($body:tt)*) => {
        ::std::boxed::Box::pin(async move { $($body)* })
    };
}

struct ThreadWaker(Thread);

impl Wake for ThreadWaker {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

/// Drives `future` to completion on the calling thread.
///
/// Two callers need this and neither wants a runtime dependency: a
/// **synchronous deployment unit** (the CLI has no reactor, but its
/// ports are still async because the ports do not know who assembles
/// them), and **tests** of any async port, which would otherwise each
/// pull in a runtime to await two lines.
///
/// It parks rather than spins, so a future that genuinely pends costs
/// nothing while it waits. A unit that is already async — anything
/// on tokio — should await directly instead of calling this.
pub fn block_on<T>(future: BoxFuture<'_, T>) -> T {
    let mut future = future;
    let waker = Waker::from(Arc::new(ThreadWaker(thread::current())));
    let mut cx = Context::from_waker(&waker);
    loop {
        match future.as_mut().poll(&mut cx) {
            Poll::Ready(value) => return value,
            Poll::Pending => thread::park(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_on_returns_the_future_value() {
        let f: BoxFuture<'_, u8> = boxed! { 42 };

        assert_eq!(block_on(f), 42);
    }

    #[test]
    fn a_boxfuture_port_is_dyn_compatible() {
        // The property this whole module exists for: a trait
        // returning BoxFuture can be held as `dyn`. Declaring
        // `async fn answer` instead makes this line stop compiling.
        trait Port: Send + Sync {
            fn answer(&self) -> BoxFuture<'_, u8>;
        }
        struct Impl;
        impl Port for Impl {
            fn answer(&self) -> BoxFuture<'_, u8> {
                boxed! { 7 }
            }
        }

        let port: Arc<dyn Port> = Arc::new(Impl);

        assert_eq!(block_on(port.answer()), 7);
    }
}
