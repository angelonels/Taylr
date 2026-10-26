// Browser promises can outlive a wedged renderer. Attach rejection handlers
// immediately and bound the caller's wait; late browser failures stay observed.
export async function within(work, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded ${milliseconds}ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
