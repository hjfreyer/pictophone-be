use std::pin::Pin;

use futures::Stream;
use log::trace;

pub mod aovec;

pub struct TracedValue<T>(T, String);

impl<T> TracedValue<T> {
    pub fn new(t: T, msg: String) -> Self {
        trace!("{} BEGIN", msg);
        Self(t, msg)
    }
}

impl<T> Drop for TracedValue<T> {
    fn drop(&mut self) {
        trace!("{} END", self.1)
    }
}

impl<T: Stream> Stream for TracedValue<T> {
    type Item = T::Item;

    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        unsafe { self.map_unchecked_mut(|s| &mut s.0) }.poll_next(cx)
    }
}

pub fn end_after_error<Ok, Err>(
    stream: impl Stream<Item = Result<Ok, Err>>,
) -> impl Stream<Item = Result<Ok, Err>> {
    use futures::StreamExt;
    let mut error_passed = false;
    stream.take_while(move |res| {
        futures::future::ready({
            if error_passed {
                false
            } else {
                match res {
                    Ok(_) => true,
                    Err(_) => {
                        error_passed = true;
                        true
                    }
                }
            }
        })
    })
}
