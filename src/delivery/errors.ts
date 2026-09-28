/** Delivery failures never embed source URLs or request headers. */
export class DeliveryError extends Error {
  override readonly name = "DeliveryError";
}
