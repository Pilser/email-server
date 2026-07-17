export function subscribeToHub(): EventSource {
  return new EventSource('/api/realtime/subscribe');
}
