use futures::Stream;
use tokio::sync::{broadcast, RwLock};

pub struct AOVec<T> {
    vec: RwLock<Vec<T>>,
    watch_sink: broadcast::Sender<usize>,
}

impl<T: Clone> AOVec<T> {
    pub fn new() -> Self {
        let (watch_sink, _) = broadcast::channel(16);
        Self {
            vec: RwLock::new(vec![]),
            watch_sink,
        }
    }

    pub async fn push(&self, t: T) -> usize {
        let mut lock = self.vec.write().await;
        lock.push(t);
        let _ = self.watch_sink.send(lock.len()); // Ignore error when there's no open receivers.
        lock.len()
    }

    pub async fn watch(&self) -> impl Stream<Item = usize> {
        use futures::StreamExt;
        // There's a race condition here. All offsets should get covered, but not necessarily exactly once, or in the right order.
        let subscription = self
            .watch_sink
            .subscribe()
            .into_stream()
            .filter_map(|r| async { r.ok() });

        let initial_offset = self.vec.read().await.len();

        futures::stream::once(futures::future::ready(initial_offset)).chain(subscription)
    }

    pub async fn take(&self, count: usize) -> Vec<T> {
        // I could probably avoid the clone here by using a deque.
        self.vec.read().await.iter().take(count).cloned().collect()
    }
}
